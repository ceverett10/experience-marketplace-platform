/**
 * Backfill product city data from the Holibob API.
 *
 * The GraphQL product list queries previously only fetched `place.cityId`
 * but not `place.name`, so the `city` column on the products table was
 * never populated. This script pages through the Holibob API (which now
 * returns `place.name`) and updates existing product records.
 *
 * Usage:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/backfill-product-cities.js --dry-run'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/backfill-product-cities.js --apply'
 */
import { prisma } from '@experience-marketplace/database';
import { createHolibobClient } from '@experience-marketplace/holibob-api';

const PAGE_SIZE = 500;

function getHolibobClient() {
  return createHolibobClient({
    apiUrl: process.env['HOLIBOB_API_URL'] ?? '',
    partnerId: process.env['HOLIBOB_PARTNER_ID'] ?? '',
    apiKey: process.env['HOLIBOB_API_KEY'] ?? '',
    apiSecret: process.env['HOLIBOB_API_SECRET'] ?? '',
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  if (dryRun) {
    console.info('=== PRODUCT CITY BACKFILL (DRY RUN) ===');
    console.info('Pass --apply to actually update products.\n');
  } else {
    console.info('=== PRODUCT CITY BACKFILL (APPLYING) ===\n');
  }

  const client = getHolibobClient();

  // Build a map of holibobProductId → local product id for products missing city
  console.info('[Backfill] Loading products without city...');
  const productsWithoutCity = await prisma.product.findMany({
    where: { OR: [{ city: null }, { city: '' }] },
    select: { id: true, holibobProductId: true },
  });
  const localProductMap = new Map(productsWithoutCity.map((p) => [p.holibobProductId, p.id]));
  console.info(`[Backfill] ${localProductMap.size} products need city data`);

  if (localProductMap.size === 0) {
    console.info('[Backfill] All products already have city data. Nothing to do.');
    process.exit(0);
  }

  // Page through Holibob API and collect city mappings
  const page = 1;
  let hasMore = true;
  let totalFetched = 0;
  const cityUpdates: Array<{ localId: string; city: string }> = [];
  const cityCounts = new Map<string, number>();

  console.info('[Backfill] Fetching products from Holibob API...');

  while (hasMore) {
    const response = await client.getAllProducts();
    // getAllProducts fetches all pages internally, so we get everything at once
    for (const product of response.nodes) {
      const cityName = product.place?.name;
      if (cityName && localProductMap.has(product.id)) {
        cityUpdates.push({
          localId: localProductMap.get(product.id)!,
          city: cityName,
        });
        cityCounts.set(cityName, (cityCounts.get(cityName) ?? 0) + 1);
      }
    }
    totalFetched = response.nodes.length;
    hasMore = false; // getAllProducts already paginates internally
  }

  console.info(`[Backfill] Fetched ${totalFetched} products from API`);
  console.info(`[Backfill] Found city data for ${cityUpdates.length} products`);

  // Show top cities
  const topCities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  console.info('\nTop 30 cities by product count:');
  for (const [city, count] of topCities) {
    console.info(`  ${count.toString().padStart(6)} - ${city}`);
  }

  if (dryRun) {
    console.info(`\n[Backfill] DRY RUN — would update ${cityUpdates.length} products`);
    process.exit(0);
  }

  // Batch update in groups of 100
  const BATCH_SIZE = 100;
  let updated = 0;

  for (let i = 0; i < cityUpdates.length; i += BATCH_SIZE) {
    const batch = cityUpdates.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((u) =>
        prisma.product.update({
          where: { id: u.localId },
          data: { city: u.city },
        })
      )
    );
    updated += batch.length;
    if (updated % 5000 === 0 || updated === cityUpdates.length) {
      console.info(`[Backfill] Updated ${updated}/${cityUpdates.length} products`);
    }
  }

  // Also update supplier cities aggregation
  console.info('\n[Backfill] Updating supplier city aggregations...');
  const supplierCities = await prisma.$queryRawUnsafe<
    Array<{ supplier_id: string; cities: string[] }>
  >(`
    SELECT p."supplierId" as supplier_id, array_agg(DISTINCT p.city) as cities
    FROM products p
    WHERE p.city IS NOT NULL AND p.city != ''
    GROUP BY p."supplierId"
  `);

  let suppliersUpdated = 0;
  for (const sc of supplierCities) {
    await prisma.supplier.update({
      where: { id: sc.supplier_id },
      data: { cities: sc.cities },
    });
    suppliersUpdated++;
  }

  console.info(`[Backfill] Updated cities for ${suppliersUpdated} suppliers`);
  console.info(`\n=== COMPLETE ===`);
  console.info(`Products updated: ${updated}`);
  console.info(`Suppliers updated: ${suppliersUpdated}`);
  console.info(`Distinct cities: ${cityCounts.size}`);

  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
