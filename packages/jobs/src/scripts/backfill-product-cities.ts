/**
 * Backfill product city data from the Holibob API.
 *
 * The productList endpoint returns `place.cityName` and `place.countryName`
 * on the ProductPlace type. This script pages through all products and
 * updates the local database with city/country data.
 *
 * Memory-optimized: processes one page at a time instead of loading all
 * 400k+ products into memory.
 *
 * Usage:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/backfill-product-cities.js --dry-run'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/backfill-product-cities.js --apply'
 */
import { prisma } from '@experience-marketplace/database';
import { GraphQLClient, gql } from 'graphql-request';

const PRODUCT_LIST_PAGE_QUERY = gql`
  query ProductListPage($pageSize: Int, $page: Int) {
    productList(pageSize: $pageSize, page: $page) {
      recordCount
      nextPage
      nodes {
        id
        place {
          cityId
          cityName
          countryName
        }
      }
    }
  }
`;

interface PageResult {
  productList: {
    recordCount: number;
    nextPage: number | null;
    nodes: Array<{
      id: string;
      place?: { cityId?: string; cityName?: string; countryName?: string };
    }>;
  };
}

function createGraphQLClient(): GraphQLClient {
  const apiUrl = process.env['HOLIBOB_API_URL'] ?? '';
  const apiKey = process.env['HOLIBOB_API_KEY'] ?? '';
  const partnerId = process.env['HOLIBOB_PARTNER_ID'] ?? '';

  return new GraphQLClient(apiUrl, {
    headers: {
      'X-API-Key': apiKey,
      'X-Partner-Id': partnerId,
      'Content-Type': 'application/json',
    },
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

  // Load products without city from local DB
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

  // Process products page by page to avoid memory issues (414k+ products)
  const gqlClient = createGraphQLClient();
  console.info('[Backfill] Fetching products from Holibob API page by page...');

  const cityCounts = new Map<string, number>();
  let totalFetched = 0;
  let missingCity = 0;
  let matchedCount = 0;
  let updated = 0;
  let page = 1;
  let hasMore = true;
  const PAGE_SIZE = 500;
  const BATCH_SIZE = 100;

  while (hasMore) {
    const response = await gqlClient.request<PageResult>(PRODUCT_LIST_PAGE_QUERY, {
      pageSize: PAGE_SIZE,
      page,
    });

    const result = response.productList;
    totalFetched += result.nodes.length;

    // Process this page immediately — don't accumulate
    const pageBatch: Array<{ localId: string; city: string; country: string | null }> = [];

    for (const product of result.nodes) {
      const cityName = product.place?.cityName;
      if (!cityName) {
        missingCity++;
        continue;
      }
      if (!localProductMap.has(product.id)) continue;

      pageBatch.push({
        localId: localProductMap.get(product.id)!,
        city: cityName,
        country: product.place?.countryName ?? null,
      });
      cityCounts.set(cityName, (cityCounts.get(cityName) ?? 0) + 1);
    }

    matchedCount += pageBatch.length;

    // Apply updates for this page immediately (if not dry run)
    if (!dryRun && pageBatch.length > 0) {
      for (let i = 0; i < pageBatch.length; i += BATCH_SIZE) {
        const batch = pageBatch.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(
          batch.map((u) =>
            prisma.product.update({
              where: { id: u.localId },
              data: { city: u.city, country: u.country },
            })
          )
        );
        updated += batch.length;
      }
    }

    hasMore = result.nextPage != null && result.nextPage > page;
    page++;

    if (page % 50 === 0 || !hasMore) {
      console.info(
        `[Backfill] Page ${page - 1} — ${totalFetched}/${result.recordCount} fetched, ${matchedCount} matched`
      );
    }

    // Safety limit
    if (page > 1000) {
      console.warn('[Backfill] Stopped at page 1000 (safety limit)');
      break;
    }
  }

  console.info(`\n[Backfill] Fetched ${totalFetched} products total`);
  console.info(`[Backfill] Matched ${matchedCount} products to city names`);
  console.info(`[Backfill] ${missingCity} products had no cityName in API response`);

  // Show top cities
  const topCities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  console.info('\nTop 30 cities by product count:');
  for (const [city, count] of topCities) {
    console.info(`  ${count.toString().padStart(6)} - ${city}`);
  }

  if (dryRun) {
    console.info(`\n[Backfill] DRY RUN — would update ${matchedCount} products`);
    process.exit(0);
  }

  // Update supplier cities aggregation
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
