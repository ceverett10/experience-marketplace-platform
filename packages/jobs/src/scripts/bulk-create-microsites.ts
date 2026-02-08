#!/usr/bin/env npx tsx
/**
 * Bulk Create Microsites for Holibob Providers
 *
 * This script creates microsites for suppliers based on their product count:
 * - MARKETPLACE: 51+ products (highest priority)
 * - CATALOG: 2-50 products
 * - PRODUCT_SPOTLIGHT: 1 product (lowest priority)
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/bulk-create-microsites.ts [options]
 *
 * Options:
 *   --layout=MARKETPLACE|CATALOG|SPOTLIGHT  Only create microsites for this layout type
 *   --limit=N                                Limit to N microsites
 *   --dry-run                                Show what would be created without creating
 *   --sync-first                             Run supplier sync before creating microsites
 */

import 'dotenv/config';
import { prisma, MicrositeLayoutType } from '@experience-marketplace/database';
import { createHolibobClient } from '@experience-marketplace/holibob-api';
import { handleMicrositeCreate } from '../workers/microsite.js';
import { syncSuppliersFromHolibob } from '../services/supplier-sync.js';

const PARENT_DOMAIN = 'experiencess.com';

// Rate limiting: wait between creations to avoid overwhelming AI services
const DELAY_BETWEEN_CREATES_MS = 2000;

// Layout type thresholds
const LAYOUT_THRESHOLDS = {
  MARKETPLACE: { min: 51, max: Infinity },
  CATALOG: { min: 2, max: 50 },
  PRODUCT_SPOTLIGHT: { min: 1, max: 1 },
};

interface CreateOptions {
  layoutFilter?: 'MARKETPLACE' | 'CATALOG' | 'PRODUCT_SPOTLIGHT';
  limit?: number;
  dryRun?: boolean;
  syncFirst?: boolean;
}

// Parse command line arguments
function parseArgs(): CreateOptions {
  const args = process.argv.slice(2);
  const options: CreateOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--layout=')) {
      const layout = arg.replace('--layout=', '').toUpperCase();
      if (layout === 'MARKETPLACE' || layout === 'CATALOG') {
        options.layoutFilter = layout;
      } else if (layout === 'SPOTLIGHT' || layout === 'PRODUCT_SPOTLIGHT') {
        options.layoutFilter = 'PRODUCT_SPOTLIGHT';
      }
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.replace('--limit=', ''), 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--sync-first') {
      options.syncFirst = true;
    }
  }

  return options;
}

// Fake job wrapper to call the worker directly
function createFakeJob<T>(data: T) {
  return {
    data,
    id: `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'MICROSITE_CREATE',
    attemptsMade: 0,
    timestamp: Date.now(),
  } as any;
}

// Delay helper
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Determine layout type from product count
function getLayoutType(productCount: number): MicrositeLayoutType {
  if (productCount >= 51) return 'MARKETPLACE';
  if (productCount >= 2) return 'CATALOG';
  return 'PRODUCT_SPOTLIGHT';
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(80));
  console.log('BULK MICROSITE CREATION');
  console.log('='.repeat(80));
  console.log(`Options:`, options);
  console.log('');

  // Step 1: Optionally sync suppliers first
  if (options.syncFirst) {
    console.log('Step 1: Syncing suppliers from Holibob...\n');
    const syncResult = await syncSuppliersFromHolibob();
    console.log(`Sync complete: ${syncResult.suppliersDiscovered} discovered, ${syncResult.suppliersCreated} created, ${syncResult.suppliersUpdated} updated`);
    console.log('');
  }

  // Step 2: Get suppliers that need microsites
  console.log('Step 2: Finding suppliers without microsites...\n');

  // Build product count filter based on layout type
  let productCountFilter: { gte?: number; lte?: number } = {};
  if (options.layoutFilter) {
    const threshold = LAYOUT_THRESHOLDS[options.layoutFilter];
    productCountFilter = {
      gte: threshold.min,
      ...(threshold.max !== Infinity ? { lte: threshold.max } : {}),
    };
    console.log(`Filtering for ${options.layoutFilter}: ${threshold.min}-${threshold.max === Infinity ? '∞' : threshold.max} products`);
  }

  // Find suppliers without microsites, ordered by product count (highest first)
  const suppliers = await prisma.supplier.findMany({
    where: {
      microsite: null, // No microsite yet
      NOT: {
        holibobSupplierId: { startsWith: 'city-' }, // Exclude fake city IDs
      },
      productCount: Object.keys(productCountFilter).length > 0 ? productCountFilter : undefined,
    },
    orderBy: { productCount: 'desc' },
    take: options.limit,
    select: {
      id: true,
      holibobSupplierId: true,
      name: true,
      slug: true,
      productCount: true,
      rating: true,
      cities: true,
      categories: true,
    },
  });

  console.log(`Found ${suppliers.length} suppliers without microsites\n`);

  // Group by layout type for summary
  const byLayout = {
    MARKETPLACE: suppliers.filter((s) => s.productCount >= 51),
    CATALOG: suppliers.filter((s) => s.productCount >= 2 && s.productCount < 51),
    PRODUCT_SPOTLIGHT: suppliers.filter((s) => s.productCount === 1),
  };

  console.log('Distribution:');
  console.log(`  MARKETPLACE (51+ products):     ${byLayout.MARKETPLACE.length}`);
  console.log(`  CATALOG (2-50 products):        ${byLayout.CATALOG.length}`);
  console.log(`  PRODUCT_SPOTLIGHT (1 product):  ${byLayout.PRODUCT_SPOTLIGHT.length}`);
  console.log('');

  // Show top 10 suppliers
  console.log('Top 10 suppliers to process:');
  const top10 = suppliers.slice(0, 10);
  top10.forEach((s, i) => {
    const layout = getLayoutType(s.productCount);
    console.log(`  ${i + 1}. ${s.name} (${s.productCount} products) -> ${layout}`);
  });
  console.log('');

  if (options.dryRun) {
    console.log('DRY RUN - No microsites will be created');
    console.log(`Would create ${suppliers.length} microsites`);
    await prisma.$disconnect();
    return;
  }

  // Step 3: Create microsites
  console.log('Step 3: Creating microsites...\n');

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: Array<{ name: string; error: string }> = [];

  for (const [i, supplier] of suppliers.entries()) {
    const layout = getLayoutType(supplier.productCount);

    console.log(`[${i + 1}/${suppliers.length}] ${supplier.name} (${supplier.productCount} products) -> ${layout}`);

    try {
      const result = await handleMicrositeCreate(
        createFakeJob({
          supplierId: supplier.id,
          parentDomain: PARENT_DOMAIN,
        })
      );

      if (result.success) {
        if (result.data?.['recovered']) {
          console.log(`  SKIPPED: Microsite already exists`);
          skipped++;
        } else {
          console.log(`  CREATED: ${result.data?.['fullDomain']}`);
          created++;

          // Update the microsite with correct layout type and cached product count
          if (result.data?.['micrositeId']) {
            await prisma.micrositeConfig.update({
              where: { id: result.data['micrositeId'] as string },
              data: {
                layoutType: layout,
                cachedProductCount: supplier.productCount,
                productCountUpdatedAt: new Date(),
              },
            });
            console.log(`  Updated layout: ${layout}`);
          }
        }
      } else {
        console.log(`  ERROR: ${result.error}`);
        errors++;
        errorDetails.push({ name: supplier.name, error: result.error || 'Unknown error' });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  EXCEPTION: ${errorMsg}`);
      errors++;
      errorDetails.push({ name: supplier.name, error: errorMsg });
    }

    // Rate limiting
    if (i < suppliers.length - 1) {
      await delay(DELAY_BETWEEN_CREATES_MS);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Created:  ${created}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  console.log(`Total:    ${suppliers.length}`);

  if (errorDetails.length > 0) {
    console.log('\nErrors:');
    for (const err of errorDetails.slice(0, 10)) {
      console.log(`  - ${err.name}: ${err.error}`);
    }
    if (errorDetails.length > 10) {
      console.log(`  ... and ${errorDetails.length - 10} more`);
    }
  }

  // Show created microsites
  console.log('\n\nRecently Created Microsites:');
  const recentMicrosites = await prisma.micrositeConfig.findMany({
    where: {
      parentDomain: PARENT_DOMAIN,
      supplierId: { not: null },
    },
    include: {
      supplier: { select: { name: true, productCount: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  for (const ms of recentMicrosites) {
    console.log(`  ${ms.fullDomain} (${ms.layoutType}, ${ms.supplier?.productCount} products)`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
