/**
 * Worker Heavy Process — Long-running, memory-intensive jobs
 *
 * Handles: Sync (Holibob supplier/product), Ads (Meta campaigns, bidding engine)
 * Dyno: Standard-2X (1GB) — isolated memory for multi-hour jobs
 * Total concurrency: 2
 */

import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  // Holibob sync handlers
  handleSupplierSync,
  handleSupplierSyncIncremental,
  handleProductSync,
  handleProductSyncIncremental,
  handleBulkProductSync,
  handleKeywordEnrichment,
  // Paid traffic handlers
  handlePaidKeywordScan,
  handleAdCampaignSync,
  handleAdPerformanceReport,
  handleAdBudgetOptimizer,
  handleBiddingEngineRun,
  handleAdConversionUpload,
  handleAdPlatformIdsSync,
  handleAdCreativeRefresh,
} from '@experience-marketplace/jobs';
import type { JobType } from '@experience-marketplace/database';
import {
  createConnection,
  updateJobStatus,
  makeWorkerOptions,
  setupWorkerEvents,
  startMemoryMonitoring,
  setupGracefulShutdown,
  logBanner,
} from './worker-common';

const connection = createConnection();

// ── Sync Worker (concurrency 1) ─────────────────────────────────────────
const syncWorker = new Worker(
  QUEUE_NAMES.SYNC,
  async (job: Job) => {
    console.log(`[Sync Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'SUPPLIER_SYNC':
        return await handleSupplierSync(job);
      case 'SUPPLIER_SYNC_INCREMENTAL':
        return await handleSupplierSyncIncremental(job);
      case 'PRODUCT_SYNC':
        return await handleProductSync(job);
      case 'PRODUCT_SYNC_INCREMENTAL':
        return await handleProductSyncIncremental(job);
      case 'BULK_PRODUCT_SYNC':
        return await handleBulkProductSync(job);
      case 'KEYWORD_ENRICHMENT':
        return await handleKeywordEnrichment(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(connection, QUEUE_NAMES.SYNC, 1)
);

// ── Ads Worker (concurrency 1) ──────────────────────────────────────────
const adsWorker = new Worker(
  QUEUE_NAMES.ADS,
  async (job: Job) => {
    console.log(`[Ads Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'PAID_KEYWORD_SCAN':
        return await handlePaidKeywordScan(job);
      case 'AD_CAMPAIGN_SYNC':
        return await handleAdCampaignSync(job);
      case 'AD_PERFORMANCE_REPORT':
        return await handleAdPerformanceReport(job);
      case 'AD_BUDGET_OPTIMIZER':
        return await handleAdBudgetOptimizer(job);
      case 'BIDDING_ENGINE_RUN':
        return await handleBiddingEngineRun(job);
      case 'AD_CONVERSION_UPLOAD':
        return await handleAdConversionUpload(job);
      case 'AD_PLATFORM_IDS_SYNC':
        return await handleAdPlatformIdsSync(job);
      case 'AD_CREATIVE_REFRESH':
        return await handleAdCreativeRefresh(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(connection, QUEUE_NAMES.ADS, 1)
);

// ── Setup ───────────────────────────────────────────────────────────────
const workers = [syncWorker, adsWorker];

setupWorkerEvents(workers, connection);
startMemoryMonitoring(connection);
setupGracefulShutdown(workers, connection);

logBanner('Worker Heavy Process', [
  'Sync (concurrency 1) — Holibob supplier/product sync, keyword enrichment',
  'Ads (concurrency 1) — Meta campaigns, bidding engine, conversion uploads',
]);

console.log('🎯 Worker Heavy is running and ready to process jobs\n');
process.stdin.resume();

export { syncWorker, adsWorker };
