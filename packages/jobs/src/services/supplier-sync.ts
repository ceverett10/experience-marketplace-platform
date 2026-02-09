/**
 * Supplier Sync Service
 * Syncs supplier/provider data from Holibob API to local database
 *
 * APPROACH:
 * Since we don't have access to the Provider List endpoint (FORBIDDEN),
 * we discover providers by fetching all products and extracting unique providers.
 * This gives us provider id and name, which we can then sync to our database.
 *
 * NOTE: Holibob's Provider type only exposes id and name fields.
 * Additional data (productCount, rating, etc.) is populated by Product Sync.
 */

import { prisma } from '@experience-marketplace/database';
import { createHolibobClient, type ProviderWithCount } from '@experience-marketplace/holibob-api';

export interface SupplierSyncResult {
  success: boolean;
  suppliersDiscovered: number;
  suppliersCreated: number;
  suppliersUpdated: number;
  errors: string[];
  duration: number;
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
 *
 * Uses the efficient providerTree approach to discover all providers
 * with their product counts in a single API call.
 */
export async function syncSuppliersFromHolibob(): Promise<SupplierSyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log('[Supplier Sync] Starting provider discovery from Holibob...');

  const client = getHolibobClient();

  try {
    // Step 1: Get all providers with product counts using providerTree
    console.log('[Supplier Sync] Fetching providers with product counts...');
    const providers = await client.getAllProvidersWithCounts();

    console.log(`[Supplier Sync] Discovered ${providers.length} providers`);

    // Step 2: Upsert providers to database as suppliers
    console.log('[Supplier Sync] Upserting providers to database...');

    let created = 0;
    let updated = 0;
    const existingSlugs = new Set<string>();

    // Get all existing slugs first
    const existingSuppliers = await prisma.supplier.findMany({
      select: { slug: true },
    });
    existingSuppliers.forEach((s) => existingSlugs.add(s.slug));

    for (const provider of providers) {
      try {
        await upsertProvider(provider, existingSlugs);

        // Check if it was created or updated by checking timestamps after upsert
        const dbSupplier = await prisma.supplier.findUnique({
          where: { holibobSupplierId: provider.id },
          select: { createdAt: true, updatedAt: true },
        });

        if (dbSupplier) {
          const wasCreated = dbSupplier.createdAt.getTime() === dbSupplier.updatedAt.getTime();
          if (wasCreated) {
            created++;
          } else {
            updated++;
          }
        }
      } catch (upsertError) {
        const errorMsg = `Error upserting provider "${provider.name}": ${
          upsertError instanceof Error ? upsertError.message : String(upsertError)
        }`;
        console.error(`[Supplier Sync] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Supplier Sync] Complete. Discovered: ${providers.length}, Created: ${created}, Updated: ${updated}, Errors: ${errors.length}, Duration: ${duration}ms`
    );

    return {
      success: errors.length === 0,
      suppliersDiscovered: providers.length,
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
      suppliersDiscovered: 0,
      suppliersCreated: 0,
      suppliersUpdated: 0,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Upsert a single provider to the database
 *
 * Uses ProviderWithCount which includes productCount from providerTree.
 * Additional fields (rating, cities, categories, etc.) are populated by Product Sync.
 */
async function upsertProvider(
  provider: ProviderWithCount,
  existingSlugs: Set<string>
): Promise<void> {
  const slug = await generateUniqueSlug(provider.name, provider.id, existingSlugs);
  existingSlugs.add(slug);

  // Update name, productCount (from providerTree), and lastSyncedAt
  const supplierData = {
    name: provider.name,
    slug,
    productCount: provider.productCount, // Now available from providerTree!
    lastSyncedAt: new Date(),
  };

  await prisma.supplier.upsert({
    where: { holibobSupplierId: provider.id },
    create: {
      holibobSupplierId: provider.id,
      ...supplierData,
      // Initialize with empty arrays/nulls - Product Sync will populate
      cities: [],
      categories: [],
      rating: null,
      reviewCount: 0,
      priceRangeMin: null,
      priceRangeMax: null,
      priceCurrency: 'GBP',
    },
    update: supplierData,
  });
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
