/**
 * Product Sync Service
 * Syncs product data from Holibob API for suppliers in the database
 *
 * NEW APPROACH (correct):
 * Uses the Product List endpoint filtered by Provider ID to get ALL products
 * for each provider directly. This is the correct approach for microsites.
 *
 * OLD APPROACH (deprecated):
 * Used Product Discovery with city search and filtered by supplierId - this was
 * unreliable and missed many products.
 *
 * NOTE: Marketplaces still use Product Discovery for search (location/date/activity based).
 * This sync is specifically for populating microsite product catalogs.
 */

import { prisma, Prisma } from '@experience-marketplace/database';
import {
  createHolibobClient,
  type Product as HolibobProduct,
} from '@experience-marketplace/holibob-api';

export interface ProductSyncResult {
  success: boolean;
  suppliersProcessed: number;
  productsDiscovered: number;
  productsCreated: number;
  productsUpdated: number;
  errors: string[];
  duration: number;
}

export interface ProductSyncOptions {
  /** Specific supplier IDs to sync (if not provided, syncs all) */
  supplierIds?: string[];
  /** Maximum products per supplier to sync (default: no limit) */
  maxProductsPerSupplier?: number;
  /** Force sync even if recently synced */
  forceSync?: boolean;
  /** Only sync products older than this many hours */
  staleSyncThresholdHours?: number;
}

/**
 * Generate a URL-safe slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 150); // Limit length
}

/**
 * Generate a unique slug with collision handling
 */
async function generateUniqueSlug(
  title: string,
  holibobProductId: string,
  existingSlugs: Set<string>
): Promise<string> {
  let baseSlug = generateSlug(title);

  // If slug is empty, use product ID
  if (!baseSlug) {
    baseSlug = `product-${holibobProductId}`;
  }

  let slug = baseSlug;
  let suffix = 1;

  // Check against in-memory set first (faster for bulk operations)
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;

    // Prevent infinite loops
    if (suffix > 1000) {
      slug = `${baseSlug}-${holibobProductId.substring(0, 8)}`;
      break;
    }
  }

  // Verify against database as well
  const dbExists = await prisma.product.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (dbExists) {
    slug = `${baseSlug}-${holibobProductId.substring(0, 8)}`;
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
 * Sync products from Holibob API using Product List by Provider endpoint
 *
 * This is the CORRECT approach for microsites:
 * - Uses Product List filtered by Provider ID to get ALL products directly
 * - Much simpler and more reliable than Product Discovery approach
 * - Gets complete product list for each provider
 */
export async function syncProductsFromHolibob(
  options: ProductSyncOptions = {}
): Promise<ProductSyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  const {
    supplierIds,
    maxProductsPerSupplier,
    forceSync = false,
    staleSyncThresholdHours = 24,
  } = options;

  console.log(
    '[Product Sync] Starting product sync from Holibob using Product List by Provider...'
  );

  const client = getHolibobClient();

  let suppliersProcessed = 0;
  let productsDiscovered = 0;
  let productsCreated = 0;
  let productsUpdated = 0;

  try {
    // Get suppliers to sync
    const staleThreshold = new Date(Date.now() - staleSyncThresholdHours * 60 * 60 * 1000);

    const whereClause = supplierIds?.length
      ? { id: { in: supplierIds } }
      : forceSync
        ? {}
        : {
            OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleThreshold } }],
          };

    const suppliers = await prisma.supplier.findMany({
      where: whereClause,
      orderBy: { productCount: 'desc' },
      select: {
        id: true,
        holibobSupplierId: true,
        name: true,
      },
    });

    console.log(`[Product Sync] Found ${suppliers.length} suppliers to sync`);

    // Pre-load existing product slugs for collision detection
    const existingProducts = await prisma.product.findMany({
      select: { slug: true },
    });
    const existingSlugs = new Set(existingProducts.map((p) => p.slug));

    for (const supplier of suppliers) {
      try {
        console.log(
          `[Product Sync] Fetching products for supplier "${supplier.name}" (${supplier.holibobSupplierId})...`
        );

        // Use Product List by Provider endpoint - the CORRECT approach
        const products = await client.getAllProductsByProvider(supplier.holibobSupplierId);

        // Apply max products limit if specified
        const productsToSync = maxProductsPerSupplier
          ? products.slice(0, maxProductsPerSupplier)
          : products;

        console.log(
          `[Product Sync] Fetched ${products.length} products for "${supplier.name}" (syncing ${productsToSync.length})`
        );

        productsDiscovered += productsToSync.length;

        // Track cities and categories for this supplier
        const supplierCities = new Set<string>();
        const supplierCategories = new Set<string>();
        let minPrice: number | null = null;
        let maxPrice: number | null = null;

        // Upsert products
        for (const product of productsToSync) {
          try {
            const result = await upsertProduct(product, supplier.id, existingSlugs);

            if (result.created) {
              productsCreated++;
            } else {
              productsUpdated++;
            }

            // Aggregate supplier data from products
            if (product.place?.name) {
              supplierCities.add(product.place.name);
            }
            if (product.categoryList?.nodes) {
              for (const cat of product.categoryList.nodes) {
                if (cat.name) {
                  supplierCategories.add(cat.name);
                }
              }
            }
            const price = product.guidePrice ?? product.priceFrom;
            if (price != null) {
              if (minPrice === null || price < minPrice) minPrice = price;
              if (maxPrice === null || price > maxPrice) maxPrice = price;
            }
          } catch (productError) {
            const errorMsg = `Error upserting product "${product.name}": ${
              productError instanceof Error ? productError.message : String(productError)
            }`;
            console.error(`[Product Sync] ${errorMsg}`);
            errors.push(errorMsg);
          }
        }

        // Update supplier with aggregated data from products
        await prisma.supplier.update({
          where: { id: supplier.id },
          data: {
            lastSyncedAt: new Date(),
            productCount: productsToSync.length,
            cities: Array.from(supplierCities),
            categories: Array.from(supplierCategories),
            priceRangeMin: minPrice,
            priceRangeMax: maxPrice,
          },
        });

        suppliersProcessed++;
      } catch (supplierError) {
        const errorMsg = `Error processing supplier "${supplier.name}": ${
          supplierError instanceof Error ? supplierError.message : String(supplierError)
        }`;
        console.error(`[Product Sync] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Product Sync] Complete. Suppliers: ${suppliersProcessed}, Products: ${productsDiscovered} (${productsCreated} created, ${productsUpdated} updated), Errors: ${errors.length}, Duration: ${duration}ms`
    );

    return {
      success: errors.length === 0,
      suppliersProcessed,
      productsDiscovered,
      productsCreated,
      productsUpdated,
      errors,
      duration,
    };
  } catch (error) {
    const errorMsg = `Fatal error during product sync: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(`[Product Sync] ${errorMsg}`);
    errors.push(errorMsg);

    return {
      success: false,
      suppliersProcessed,
      productsDiscovered,
      productsCreated,
      productsUpdated,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Upsert a product to the database
 */
async function upsertProduct(
  product: HolibobProduct,
  supplierId: string,
  existingSlugs: Set<string>
): Promise<{ created: boolean }> {
  const slug = await generateUniqueSlug(product.name, product.id, existingSlugs);
  existingSlugs.add(slug);

  // Extract categories and tags
  const categories: string[] = [];
  const tags: string[] = [];

  if (product.categoryList?.nodes) {
    for (const cat of product.categoryList.nodes) {
      if (cat.name) {
        categories.push(cat.name);
      }
    }
  }

  if (product.categories) {
    for (const cat of product.categories) {
      if (cat.name && !categories.includes(cat.name)) {
        categories.push(cat.name);
      }
    }
  }

  if (product.tags) {
    tags.push(...product.tags);
  }

  // Extract images
  const images: string[] = [];
  const primaryImageUrl =
    product.primaryImageUrl ?? product.imageUrl ?? product.imageList?.[0]?.url ?? null;

  if (product.imageList) {
    for (const img of product.imageList) {
      if (img.url) {
        images.push(img.url);
      }
    }
  }

  // Extract location from startPlace or place
  const city = product.place?.name ?? null;
  const coordinates = product.startPlace?.geoCoordinate
    ? {
        lat: product.startPlace.geoCoordinate.latitude,
        lng: product.startPlace.geoCoordinate.longitude,
      }
    : null;

  // Format duration
  let duration: string | null = null;
  if (product.maxDuration) {
    // maxDuration is in minutes
    const hours = Math.floor(product.maxDuration / 60);
    const mins = product.maxDuration % 60;
    if (hours > 0 && mins > 0) {
      duration = `${hours}h ${mins}m`;
    } else if (hours > 0) {
      duration = `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      duration = `${mins} minutes`;
    }
  } else if (product.durationText) {
    duration = product.durationText;
  }

  const productData = {
    slug,
    title: product.name,
    description: product.description ?? null,
    shortDescription: product.shortDescription ?? null,
    priceFrom: product.guidePrice ?? product.priceFrom ?? null,
    currency: product.guidePriceCurrency ?? product.priceCurrency ?? 'GBP',
    duration,
    city,
    country: null, // Not directly available in product response
    // Prisma requires special handling for nullable JSON fields
    coordinates: coordinates ?? Prisma.JsonNull,
    rating: product.reviewRating ?? product.rating ?? null,
    reviewCount: product.reviewCount ?? 0,
    primaryImageUrl,
    images: images.length > 0 ? images : Prisma.JsonNull,
    categories,
    tags,
    supplierId,
    lastSyncedAt: new Date(),
  };

  // Check if product exists to determine if this is create or update
  const existingProduct = await prisma.product.findUnique({
    where: { holibobProductId: product.id },
    select: { id: true, createdAt: true },
  });

  const result = await prisma.product.upsert({
    where: { holibobProductId: product.id },
    create: {
      holibobProductId: product.id,
      ...productData,
    },
    update: productData,
  });

  return {
    created: existingProduct === null,
  };
}

/**
 * Sync products for a single supplier
 */
export async function syncProductsForSupplier(supplierId: string): Promise<ProductSyncResult> {
  return syncProductsFromHolibob({
    supplierIds: [supplierId],
    forceSync: true,
  });
}

/**
 * Get product sync status
 */
export async function getProductSyncStatus(): Promise<{
  totalProducts: number;
  lastSyncedAt: Date | null;
  productsNeedingSync: number;
  productsBySupplier: { supplierId: string; supplierName: string; productCount: number }[];
}> {
  const [totalProducts, lastSynced, needingSync, bySupplier] = await Promise.all([
    prisma.product.count(),
    prisma.product.findFirst({
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    }),
    prisma.product.count({
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
    prisma.supplier.findMany({
      select: {
        id: true,
        name: true,
        productCount: true,
      },
      orderBy: { productCount: 'desc' },
      take: 20,
    }),
  ]);

  return {
    totalProducts,
    lastSyncedAt: lastSynced?.lastSyncedAt ?? null,
    productsNeedingSync: needingSync,
    productsBySupplier: bySupplier.map((s) => ({
      supplierId: s.id,
      supplierName: s.name,
      productCount: s.productCount,
    })),
  };
}

export default syncProductsFromHolibob;
