/**
 * Supplier Enrichment Service
 *
 * Fetches city and category data from the Holibob API for suppliers that have
 * microsites but are missing location data. This is a lightweight alternative
 * to running a full product sync — it only fetches 1 page of products per
 * supplier to extract representative cities and categories.
 *
 * The enriched data powers destination-focused microsite titles:
 * e.g. "Things to Do in Bangkok - Tours & Activities" instead of
 *      "TUI DESTINATION EXPERIENCES (THAILAND) | Book ..."
 */

import { prisma } from '@experience-marketplace/database';
import {
  createHolibobClient,
  type Product as HolibobProduct,
} from '@experience-marketplace/holibob-api';
import { createHolibobRateLimiter } from '../utils/rate-limiter';

// Categories that provide no useful SEO signal for titles
const SKIP_CATEGORIES = new Set([
  'general',
  'private',
  'other',
  'multi-day',
  'full day',
  'half day',
  'car, bus or mini-van',
  'passes',
  'city',
  'natural',
  'iconic',
  'themed',
  'classes',
]);

export interface SupplierEnrichmentOptions {
  /** Specific supplier IDs to enrich (default: all with microsites + empty cities) */
  supplierIds?: string[];
  /** Maximum suppliers to process in this run */
  maxSuppliersPerRun?: number;
  /** Log only, don't write to DB */
  dryRun?: boolean;
  /** Number of products to sample per supplier (default: 50) */
  sampleSize?: number;
}

export interface SupplierEnrichmentResult {
  processed: number;
  enriched: number;
  skipped: number;
  alreadyHadCities: number;
  noProductsFound: number;
  errors: string[];
  duration: number;
  categoryStats: {
    uniqueCategories: number;
    topCategories: Array<{ name: string; count: number }>;
  };
}

/**
 * Create Holibob client from environment variables.
 * Same pattern as product-sync.ts.
 */
function getHolibobClient() {
  const apiUrl = process.env['HOLIBOB_API_URL'];
  const partnerId = process.env['HOLIBOB_PARTNER_ID'];
  const apiKey = process.env['HOLIBOB_API_KEY'];
  const apiSecret = process.env['HOLIBOB_API_SECRET'];

  if (!apiUrl || !partnerId || !apiKey) {
    throw new Error(
      'Missing Holibob API configuration. Required: HOLIBOB_API_URL, HOLIBOB_PARTNER_ID, HOLIBOB_API_KEY'
    );
  }

  return createHolibobClient({ apiUrl, partnerId, apiKey, apiSecret });
}

/**
 * Extract cities and categories from a page of Holibob products.
 * Same extraction logic as product-sync.ts.
 */
function extractFromProducts(products: HolibobProduct[]): {
  cities: string[];
  categories: string[];
} {
  const citySet = new Set<string>();
  const categorySet = new Set<string>();

  for (const product of products) {
    // City extraction: product.place?.name
    if (product.place?.name) {
      citySet.add(product.place.name);
    }

    // Category extraction: product.categoryList?.nodes[]
    if (product.categoryList?.nodes) {
      for (const cat of product.categoryList.nodes) {
        if (cat.name && !SKIP_CATEGORIES.has(cat.name.toLowerCase())) {
          categorySet.add(cat.name);
        }
      }
    }

    // Also check flat categories array (some products use this format)
    if (product.categories) {
      for (const cat of product.categories) {
        if (cat.name && !SKIP_CATEGORIES.has(cat.name.toLowerCase())) {
          categorySet.add(cat.name);
        }
      }
    }
  }

  return {
    cities: Array.from(citySet),
    categories: Array.from(categorySet),
  };
}

/**
 * Enrich supplier location data by fetching products from the Holibob API.
 *
 * For each supplier with a microsite that has empty cities, fetches a sample of
 * products and extracts city names and categories. Updates the Supplier record
 * with the enriched data.
 *
 * Resume-safe: only processes suppliers with empty cities, so re-running
 * automatically skips already-enriched suppliers.
 */
export async function enrichSupplierLocations(
  options?: SupplierEnrichmentOptions
): Promise<SupplierEnrichmentResult> {
  const startTime = Date.now();
  const sampleSize = options?.sampleSize ?? 50;
  const dryRun = options?.dryRun ?? false;
  const errors: string[] = [];
  let processed = 0;
  let enriched = 0;
  let skipped = 0;
  let alreadyHadCities = 0;
  let noProductsFound = 0;

  // Track category frequencies across all suppliers
  const globalCategoryCount = new Map<string, number>();

  const client = getHolibobClient();
  const rateLimiter = createHolibobRateLimiter();

  console.info('[Supplier Enrichment] Starting supplier location enrichment...');
  if (dryRun) console.info('[Supplier Enrichment] DRY RUN — no DB writes');

  // Find suppliers that need enrichment
  const whereClause = options?.supplierIds?.length
    ? { id: { in: options.supplierIds } }
    : {
        // Must have a microsite
        micrositeConfigs: { some: {} },
        // Must have empty cities (the main gap we're filling)
        OR: [{ cities: { isEmpty: true } }, { cities: { equals: [] } }],
      };

  const suppliers = await prisma.supplier.findMany({
    where: whereClause,
    orderBy: { productCount: 'desc' },
    select: {
      id: true,
      holibobSupplierId: true,
      name: true,
      cities: true,
      categories: true,
    },
    ...(options?.maxSuppliersPerRun ? { take: options.maxSuppliersPerRun } : {}),
  });

  console.info(`[Supplier Enrichment] Found ${suppliers.length} suppliers to enrich`);

  for (const supplier of suppliers) {
    try {
      // Skip if already has cities (for targeted re-runs with supplierIds)
      if (supplier.cities.length > 0) {
        alreadyHadCities++;
        continue;
      }

      // Rate limit before API call
      await rateLimiter.wait();

      const response = await client.getProductsByProvider(supplier.holibobSupplierId, {
        pageSize: sampleSize,
        page: 1,
      });

      const products = response.nodes ?? [];
      if (products.length === 0) {
        noProductsFound++;
        processed++;
        continue;
      }

      const { cities, categories } = extractFromProducts(products);

      // Track category frequencies
      for (const cat of categories) {
        globalCategoryCount.set(cat, (globalCategoryCount.get(cat) ?? 0) + 1);
      }

      if (cities.length === 0 && categories.length === 0) {
        skipped++;
        processed++;
        continue;
      }

      if (!dryRun) {
        // Merge with existing categories (don't lose data), but replace empty cities
        const mergedCategories =
          supplier.categories.length > 0
            ? Array.from(new Set([...supplier.categories, ...categories]))
            : categories;

        await prisma.supplier.update({
          where: { id: supplier.id },
          data: {
            cities,
            categories: mergedCategories,
            lastSyncedAt: new Date(),
          },
        });
      }

      enriched++;
      processed++;

      // Progress logging every 100 suppliers
      if (processed % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.info(
          `[Supplier Enrichment] Progress: ${processed}/${suppliers.length} suppliers, ` +
            `${enriched} enriched, ${errors.length} errors, ${elapsed}s elapsed`
        );
      }
    } catch (err) {
      const msg = `Supplier "${supplier.name}" (${supplier.id}): ${
        err instanceof Error ? err.message : String(err)
      }`;
      errors.push(msg);
      console.error(`[Supplier Enrichment] Error: ${msg}`);
      processed++;
    }
  }

  // Build category stats
  const sortedCategories = Array.from(globalCategoryCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const duration = Date.now() - startTime;
  console.info(
    `[Supplier Enrichment] Complete. ` +
      `Processed: ${processed}, Enriched: ${enriched}, Skipped: ${skipped}, ` +
      `No products: ${noProductsFound}, Already had cities: ${alreadyHadCities}, ` +
      `Errors: ${errors.length}, Duration: ${(duration / 1000).toFixed(0)}s`
  );

  return {
    processed,
    enriched,
    skipped,
    alreadyHadCities,
    noProductsFound,
    errors,
    duration,
    categoryStats: {
      uniqueCategories: globalCategoryCount.size,
      topCategories: sortedCategories,
    },
  };
}
