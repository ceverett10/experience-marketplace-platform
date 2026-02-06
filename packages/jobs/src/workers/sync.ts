/**
 * Sync Workers
 * Handles Holibob supplier and product synchronization jobs
 */

import { Job } from 'bullmq';
import type { JobResult, SupplierSyncPayload, ProductSyncPayload } from '../types/index.js';
import { syncSuppliersFromHolibob } from '../services/supplier-sync.js';
import { syncProductsFromHolibob, syncProductsForSupplier } from '../services/product-sync.js';

/**
 * Supplier Sync Worker
 * Discovers and syncs supplier data from Holibob API
 */
export async function handleSupplierSync(job: Job<SupplierSyncPayload>): Promise<JobResult> {
  const { forceSync = false, maxCities, maxProductsPerCity } = job.data;

  try {
    console.log('[Supplier Sync Worker] Starting supplier sync job...');
    console.log(`[Supplier Sync Worker] Options: forceSync=${forceSync}`);

    const result = await syncSuppliersFromHolibob();

    if (!result.success) {
      console.warn(
        `[Supplier Sync Worker] Completed with errors: ${result.errors.length} errors`
      );
    }

    return {
      success: result.success,
      message: `Supplier sync complete: ${result.suppliersDiscovered} discovered, ${result.suppliersCreated} created, ${result.suppliersUpdated} updated`,
      data: {
        suppliersDiscovered: result.suppliersDiscovered,
        suppliersCreated: result.suppliersCreated,
        suppliersUpdated: result.suppliersUpdated,
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
      console.warn(
        `[Product Sync Worker] Completed with errors: ${result.errors.length} errors`
      );
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
