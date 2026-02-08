/**
 * Sync Workers
 * Handles Holibob supplier and product synchronization jobs
 * Automatically creates microsites for eligible new suppliers
 */

import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import type { JobResult, SupplierSyncPayload, ProductSyncPayload } from '../types/index.js';
import { syncSuppliersFromHolibob } from '../services/supplier-sync.js';
import { syncProductsFromHolibob, syncProductsForSupplier } from '../services/product-sync.js';
import { canExecuteAutonomousOperation } from '../services/pause-control.js';
import { addJob } from '../queues/index.js';

// Microsite creation thresholds
const PARENT_DOMAIN = 'experiencess.com';
const MIN_PRODUCTS_FOR_MICROSITE = 2;
const MIN_RATING_FOR_MICROSITE = 4.0;

/**
 * Supplier Sync Worker
 * Discovers and syncs supplier data from Holibob API
 * Automatically queues microsite creation for eligible new suppliers
 */
export async function handleSupplierSync(job: Job<SupplierSyncPayload>): Promise<JobResult> {
  const { forceSync = false } = job.data;

  try {
    console.log('[Supplier Sync Worker] Starting supplier sync job...');
    console.log(`[Supplier Sync Worker] Options: forceSync=${forceSync}`);

    // Check if autonomous operations are allowed
    const canProceed = await canExecuteAutonomousOperation({
      feature: 'enableSiteCreation',
    });

    if (!canProceed.allowed) {
      console.log(`[Supplier Sync Worker] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'Supplier sync is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    // Get existing supplier IDs before sync
    const existingSupplierIds = new Set(
      (await prisma.supplier.findMany({ select: { holibobSupplierId: true } })).map(
        (s) => s.holibobSupplierId
      )
    );

    const result = await syncSuppliersFromHolibob();

    if (!result.success) {
      console.warn(`[Supplier Sync Worker] Completed with errors: ${result.errors.length} errors`);
    }

    // Find newly created suppliers eligible for microsites
    let micrositesQueued = 0;
    if (result.suppliersCreated > 0) {
      const eligibleNewSuppliers = await prisma.supplier.findMany({
        where: {
          holibobSupplierId: { notIn: Array.from(existingSupplierIds) },
          productCount: { gte: MIN_PRODUCTS_FOR_MICROSITE },
          rating: { gte: MIN_RATING_FOR_MICROSITE },
          NOT: { holibobSupplierId: { startsWith: 'city-' } },
        },
        select: {
          id: true,
          name: true,
          productCount: true,
          rating: true,
        },
      });

      console.log(
        `[Supplier Sync Worker] Found ${eligibleNewSuppliers.length} eligible new suppliers for microsites`
      );

      for (const supplier of eligibleNewSuppliers) {
        // Check if microsite already exists
        const existingMicrosite = await prisma.micrositeConfig.findFirst({
          where: { supplierId: supplier.id },
        });

        if (!existingMicrosite) {
          try {
            await addJob('MICROSITE_CREATE' as any, {
              supplierId: supplier.id,
              parentDomain: PARENT_DOMAIN,
            });
            micrositesQueued++;
            console.log(`[Supplier Sync Worker] Queued microsite for: ${supplier.name}`);
          } catch (queueError) {
            console.error(
              `[Supplier Sync Worker] Failed to queue microsite for ${supplier.name}:`,
              queueError
            );
          }
        }
      }
    }

    return {
      success: result.success,
      message: `Supplier sync complete: ${result.suppliersDiscovered} discovered, ${result.suppliersCreated} created, ${result.suppliersUpdated} updated, ${micrositesQueued} microsites queued`,
      data: {
        suppliersDiscovered: result.suppliersDiscovered,
        suppliersCreated: result.suppliersCreated,
        suppliersUpdated: result.suppliersUpdated,
        micrositesQueued,
        errorCount: result.errors.length,
        duration: result.duration,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Supplier Sync Worker] Fatal error:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during supplier sync',
      timestamp: new Date(),
    };
  }
}

/**
 * Product Sync Worker
 * Syncs product data for suppliers in the database
 */
export async function handleProductSync(job: Job<ProductSyncPayload>): Promise<JobResult> {
  const {
    supplierIds,
    maxProductsPerSupplier = 100,
    forceSync = false,
    staleSyncThresholdHours = 24,
  } = job.data;

  try {
    console.log('[Product Sync Worker] Starting product sync job...');
    console.log(
      `[Product Sync Worker] Options: supplierIds=${supplierIds?.length ?? 'all'}, forceSync=${forceSync}`
    );

    const result = await syncProductsFromHolibob({
      supplierIds,
      maxProductsPerSupplier,
      forceSync,
      staleSyncThresholdHours,
    });

    if (!result.success) {
      console.warn(`[Product Sync Worker] Completed with errors: ${result.errors.length} errors`);
    }

    return {
      success: result.success,
      message: `Product sync complete: ${result.productsDiscovered} discovered, ${result.productsCreated} created, ${result.productsUpdated} updated`,
      data: {
        suppliersProcessed: result.suppliersProcessed,
        productsDiscovered: result.productsDiscovered,
        productsCreated: result.productsCreated,
        productsUpdated: result.productsUpdated,
        errorCount: result.errors.length,
        duration: result.duration,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Product Sync Worker] Fatal error:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during product sync',
      timestamp: new Date(),
    };
  }
}

/**
 * Incremental Supplier Sync Worker
 * Syncs only suppliers that haven't been updated recently
 */
export async function handleSupplierSyncIncremental(
  job: Job<SupplierSyncPayload>
): Promise<JobResult> {
  // For incremental sync, we use the same function but it will only
  // process suppliers not recently synced
  return handleSupplierSync(job);
}

/**
 * Incremental Product Sync Worker
 * Syncs only products for suppliers that haven't been updated recently
 */
export async function handleProductSyncIncremental(
  job: Job<ProductSyncPayload>
): Promise<JobResult> {
  // For incremental sync, we ensure forceSync is false
  const modifiedJobData: ProductSyncPayload = {
    ...job.data,
    forceSync: false,
    staleSyncThresholdHours: job.data.staleSyncThresholdHours ?? 24,
  };

  const modifiedJob = {
    ...job,
    data: modifiedJobData,
  } as Job<ProductSyncPayload>;

  return handleProductSync(modifiedJob);
}
