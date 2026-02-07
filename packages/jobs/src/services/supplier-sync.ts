/**
 * Supplier Sync Service
 * Syncs supplier data from Holibob API to local database
 * Suppliers are discovered via products - each product has supplierId/supplierName
 */

import { prisma } from '@experience-marketplace/database';
import { createHolibobClient, type Product } from '@experience-marketplace/holibob-api';
import { createBulkSyncRateLimiter } from '../utils/rate-limiter.js';

export interface SupplierSyncResult {
  success: boolean;
  suppliersDiscovered: number;
  suppliersCreated: number;
  suppliersUpdated: number;
  errors: string[];
  duration: number;
}

interface DiscoveredSupplier {
  holibobSupplierId: string;
  name: string;
  cities: Set<string>;
  categories: Set<string>;
  productCount: number;
  totalRating: number;
  ratedProductCount: number;
  totalReviews: number;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
}

/**
 * Generate a URL-safe slug from a name
 * Handles collision detection by appending a suffix if needed
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100); // Limit length
}

/**
 * Generate a unique slug with collision handling
 */
async function generateUniqueSlug(
  name: string,
  holibobSupplierId: string,
  existingSlugs: Set<string>
): Promise<string> {
  let baseSlug = generateSlug(name);

  // If slug is empty (e.g., name was all special chars), use supplier ID
  if (!baseSlug) {
    baseSlug = `supplier-${holibobSupplierId}`;
  }

  let slug = baseSlug;
  let suffix = 1;

  // Check against in-memory set first (faster for bulk operations)
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;

    // Prevent infinite loops
    if (suffix > 1000) {
      slug = `${baseSlug}-${holibobSupplierId.substring(0, 8)}`;
      break;
    }
  }

  // Verify against database as well
  const dbExists = await prisma.supplier.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (dbExists) {
    slug = `${baseSlug}-${holibobSupplierId.substring(0, 8)}`;
  }

  return slug;
}

/**
 * Create Holibob client from environment variables
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

  return createHolibobClient({
    apiUrl,
    partnerId,
    apiKey,
    apiSecret,
  });
}

/**
 * Sync suppliers from Holibob API
 * Discovers suppliers by scanning products across city/category combinations
 */
export async function syncSuppliersFromHolibob(): Promise<SupplierSyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log('[Supplier Sync] Starting supplier discovery from Holibob...');

  const client = getHolibobClient();
  const rateLimiter = createBulkSyncRateLimiter();

  // Track discovered suppliers
  const supplierMap = new Map<string, DiscoveredSupplier>();

  try {
    // Use a hardcoded list of major cities since Places API is unreliable
    // These cover the main markets for Holibob's inventory
    const majorCities = [
      'London', 'Paris', 'Barcelona', 'Rome', 'Amsterdam',
      'Berlin', 'Madrid', 'Lisbon', 'Prague', 'Vienna',
      'Edinburgh', 'Dublin', 'Athens', 'Florence', 'Venice',
      'Munich', 'Brussels', 'Copenhagen', 'Stockholm', 'Budapest',
      'New York', 'Los Angeles', 'Miami', 'San Francisco', 'Las Vegas',
      'Sydney', 'Melbourne', 'Tokyo', 'Singapore', 'Hong Kong',
      'Dubai', 'Bangkok', 'Bali', 'Cape Town', 'Reykjavik',
    ];

    console.log(`[Supplier Sync] Scanning ${majorCities.length} cities for products...`);

    for (const city of majorCities) {
      try {
        await rateLimiter.wait();

        // Discover products for this city (Holibob max is 20 per request)
        const response = await client.discoverProducts(
          { freeText: city, currency: 'GBP' },
          { pageSize: 20 }
        );

        console.log(
          `[Supplier Sync] City "${city}": found ${response.products.length} products`
        );

        // Extract supplier information from products
        for (const product of response.products) {
          aggregateSupplierFromProduct(supplierMap, product, city);
        }

        await rateLimiter.waitBetweenBatches();
      } catch (cityError) {
        const errorMsg = `Error scanning city "${city}": ${
          cityError instanceof Error ? cityError.message : String(cityError)
        }`;
        console.error(`[Supplier Sync] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(`[Supplier Sync] Discovered ${supplierMap.size} unique suppliers`);

    // Step 3: Upsert suppliers to database
    console.log('[Supplier Sync] Upserting suppliers to database...');

    let created = 0;
    let updated = 0;
    const existingSlugs = new Set<string>();

    // Get all existing slugs first
    const existingSuppliers = await prisma.supplier.findMany({
      select: { slug: true },
    });
    existingSuppliers.forEach((s) => existingSlugs.add(s.slug));

    for (const [holibobId, supplier] of supplierMap) {
      try {
        const slug = await generateUniqueSlug(supplier.name, holibobId, existingSlugs);
        existingSlugs.add(slug);

        const averageRating =
          supplier.ratedProductCount > 0
            ? supplier.totalRating / supplier.ratedProductCount
            : null;

        const supplierData = {
          name: supplier.name,
          slug,
          productCount: supplier.productCount,
          cities: Array.from(supplier.cities),
          categories: Array.from(supplier.categories),
          rating: averageRating,
          reviewCount: supplier.totalReviews,
          priceRangeMin: supplier.minPrice ?? null,
          priceRangeMax: supplier.maxPrice ?? null,
          priceCurrency: supplier.currency ?? 'GBP',
          lastSyncedAt: new Date(),
        };

        const result = await prisma.supplier.upsert({
          where: { holibobSupplierId: holibobId },
          create: {
            holibobSupplierId: holibobId,
            ...supplierData,
          },
          update: supplierData,
        });

        // Check if it was created or updated
        const wasCreated =
          result.createdAt.getTime() === result.updatedAt.getTime();
        if (wasCreated) {
          created++;
        } else {
          updated++;
        }
      } catch (upsertError) {
        const errorMsg = `Error upserting supplier "${supplier.name}": ${
          upsertError instanceof Error ? upsertError.message : String(upsertError)
        }`;
        console.error(`[Supplier Sync] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Supplier Sync] Complete. Discovered: ${supplierMap.size}, Created: ${created}, Updated: ${updated}, Errors: ${errors.length}, Duration: ${duration}ms`
    );

    return {
      success: errors.length === 0,
      suppliersDiscovered: supplierMap.size,
      suppliersCreated: created,
      suppliersUpdated: updated,
      errors,
      duration,
    };
  } catch (error) {
    const errorMsg = `Fatal error during supplier sync: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(`[Supplier Sync] ${errorMsg}`);
    errors.push(errorMsg);

    return {
      success: false,
      suppliersDiscovered: supplierMap.size,
      suppliersCreated: 0,
      suppliersUpdated: 0,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Aggregate supplier data from a product
 * Products contain provider field with id/name (Holibob's term for operator/supplier)
 * Falls back to legacy supplierId/supplierName if provider is not available
 */
function aggregateSupplierFromProduct(
  supplierMap: Map<string, DiscoveredSupplier>,
  product: Product,
  cityName?: string
): void {
  // Get provider info - prefer provider field, fall back to legacy fields
  const providerId = product.provider?.id || product.supplierId;
  const providerName = product.provider?.name || product.supplierName;

  // Skip products without provider/supplier information
  if (!providerId || !providerName) {
    return;
  }

  const supplierId = providerId;
  const existing = supplierMap.get(supplierId);

  if (existing) {
    // Update existing supplier aggregate
    existing.productCount++;

    if (cityName) {
      existing.cities.add(cityName);
    }

    // Extract category from product
    const categories = product.categoryList?.nodes || product.categories || [];
    for (const cat of categories) {
      if (cat.name) {
        existing.categories.add(cat.name);
      }
    }

    // Update rating aggregate
    if (product.reviewRating || product.rating) {
      const rating = product.reviewRating ?? product.rating ?? 0;
      if (rating > 0) {
        existing.totalRating += rating;
        existing.ratedProductCount++;
      }
    }

    // Update review count
    if (product.reviewCount) {
      existing.totalReviews += product.reviewCount;
    }

    // Update price range
    const price = product.guidePrice ?? product.priceFrom;
    if (price != null) {
      if (existing.minPrice == null || price < existing.minPrice) {
        existing.minPrice = price;
      }
      if (existing.maxPrice == null || price > existing.maxPrice) {
        existing.maxPrice = price;
      }
    }
  } else {
    // Create new supplier entry
    const cities = new Set<string>();
    if (cityName) {
      cities.add(cityName);
    }

    const categories = new Set<string>();
    const productCategories = product.categoryList?.nodes || product.categories || [];
    for (const cat of productCategories) {
      if (cat.name) {
        categories.add(cat.name);
      }
    }

    const rating = product.reviewRating ?? product.rating ?? 0;
    const price = product.guidePrice ?? product.priceFrom;

    supplierMap.set(supplierId, {
      holibobSupplierId: supplierId,
      name: providerName,
      cities,
      categories,
      productCount: 1,
      totalRating: rating > 0 ? rating : 0,
      ratedProductCount: rating > 0 ? 1 : 0,
      totalReviews: product.reviewCount || 0,
      minPrice: price ?? undefined,
      maxPrice: price ?? undefined,
      currency: product.guidePriceCurrency ?? product.priceCurrency ?? 'GBP',
    });
  }
}

/**
 * Get sync status for all suppliers
 */
export async function getSupplierSyncStatus(): Promise<{
  totalSuppliers: number;
  lastSyncedAt: Date | null;
  suppliersNeedingSync: number;
}> {
  const [totalSuppliers, lastSynced, needingSync] = await Promise.all([
    prisma.supplier.count(),
    prisma.supplier.findFirst({
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    }),
    prisma.supplier.count({
      where: {
        OR: [
          { lastSyncedAt: null },
          {
            lastSyncedAt: {
              lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // More than 24 hours ago
            },
          },
        ],
      },
    }),
  ]);

  return {
    totalSuppliers,
    lastSyncedAt: lastSynced?.lastSyncedAt ?? null,
    suppliersNeedingSync: needingSync,
  };
}

export default syncSuppliersFromHolibob;
