/**
 * Demand Generation Service - Background Worker
 *
 * Autonomous background worker service for:
 * - SEO opportunity identification
 * - Content generation and optimization
 * - Google Search Console data sync
 * - Performance analytics
 * - A/B test management
 */

import { Worker, type Job } from 'bullmq';
import {
  createRedisConnection,
  QUEUE_NAMES,
  getQueueTimeout,
  queueRegistry,
  initializeScheduledJobs,
  getScheduledJobs,
  // Content fanout services (called by BullMQ repeatable handlers)
  generateDailyBlogPostsForAllSitesAndMicrosites,
  generateDailyContent,
  refreshMicrositeContent,
  runMetaTitleMaintenance,
  refreshAllCollections,
  resubmitMicrositeSitemapsToGSC,
  runPipelineHealthCheck,
  // Worker handlers
  handleContentGenerate,
  handleContentOptimize,
  handleContentReview,
  handleGscSync,
  handleGscSetup,
  handleGscVerify,
  handleOpportunityScan,
  handleOpportunityOptimize,
  handleSiteCreate,
  handleSiteDeploy,
  handleDomainRegister,
  handleDomainVerify,
  handleSslProvision,
  handleMetricsAggregate,
  handlePerformanceReport,
  handleGA4Setup,
  handleGA4DailySync,
  handleRefreshAnalyticsViews,
  handleMicrositeGscSync,
  handleMicrositeAnalyticsSync,
  handleMicrositeGA4Sync,
  handleABTestAnalyze,
  handleABTestRebalance,
  processAllSiteRoadmaps,
  detectStuckTasks,
  resetStuckCount,
  // SEO recursive optimization handlers
  handleSEOAudit,
  handleAutoOptimize,
  handleRecursiveOptimize,
  handleBatchOptimize,
  handleWeeklyAuditScheduler,
  // Holibob sync handlers
  handleSupplierSync,
  handleSupplierSyncIncremental,
  handleProductSync,
  handleProductSyncIncremental,
  handleBulkProductSync,
  // Microsite handlers
  handleMicrositeCreate,
  handleMicrositeBrandGenerate,
  handleMicrositeContentGenerate,
  handleMicrositePublish,
  handleMicrositeArchive,
  handleMicrositeHealthCheck,
  handleMicrositeHomepageEnrich,
  // Social media handlers
  handleSocialDailyPosting,
  handleSocialPostGenerate,
  handleSocialPostPublish,
  // Link building handlers
  handleLinkOpportunityScan,
  handleLinkBacklinkMonitor,
  handleLinkOutreachGenerate,
  handleLinkAssetGenerate,
  handleCrossSiteLinkEnrichment,
  handleLinkCompetitorDiscovery,
  handleLinkBrokenLinkScan,
  handleLinkContentGapAnalysis,
  // Paid traffic handlers
  handlePaidKeywordScan,
  handleAdCampaignSync,
  handleAdPerformanceReport,
  handleAdBudgetOptimizer,
  handleBiddingEngineRun,
  handleKeywordEnrichment,
  handleAdConversionUpload,
  handleAdPlatformIdsSync,
  handleAdCreativeRefresh,
} from '@experience-marketplace/jobs';
import { prisma, type JobStatus } from '@experience-marketplace/database';
import type { JobType } from '@experience-marketplace/database';

/**
 * Update job status in the database.
 * For repeatable/cron jobs (created by scheduleJob()), auto-creates a DB record
 * on the first RUNNING status update so the admin dashboard can track them.
 */
async function updateJobStatus(
  job: Job,
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING',
  result?: object,
  error?: string
) {
  let dbJobId = (job.data as { dbJobId?: string }).dbJobId;

  // For repeatable/cron jobs that don't have a DB record, create one when they start
  if (!dbJobId && status === 'RUNNING') {
    try {
      const dbJob = await prisma.job.create({
        data: {
          type: job.name as JobType,
          queue: 'scheduled',
          payload: job.data as object,
          status: 'RUNNING' as JobStatus,
          startedAt: new Date(),
          attempts: job.attemptsMade,
        },
      });
      dbJobId = dbJob.id;
      // Persist dbJobId so completed/failed event handlers can find it
      await job.updateData({ ...job.data, dbJobId });
    } catch (err) {
      console.error(`Failed to create DB record for scheduled job ${job.name}:`, err);
      return;
    }
  }

  if (!dbJobId) return;

  try {
    const updateData: {
      status: JobStatus;
      attempts: number;
      result?: object;
      error?: string;
      startedAt?: Date;
      completedAt?: Date;
    } = {
      status: status as JobStatus,
      attempts: job.attemptsMade,
    };

    if (status === 'RUNNING') {
      updateData.startedAt = new Date();
    }

    if (status === 'COMPLETED' || status === 'FAILED') {
      updateData.completedAt = new Date();
    }

    if (result) {
      updateData.result = result;
    }

    if (error) {
      updateData.error = error;
    }

    await prisma.job.update({
      where: { id: dbJobId },
      data: updateData,
    });
  } catch (err) {
    console.error(`Failed to update job ${dbJobId} status:`, err);
  }
}

// Environment configuration
const PORT = process.env['PORT'] || 3002;
const NODE_ENV = process.env['NODE_ENV'] || 'development';

console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 Demand Generation Service                             ║
║  Autonomous Background Worker for Content & SEO           ║
╚═══════════════════════════════════════════════════════════╝
`);

console.log(`Environment: ${NODE_ENV}`);
console.log(`Port: ${PORT}`);

// Initialize Redis connection
const connection = createRedisConnection();

// ── Observability: Memory & Redis monitoring ──────────────────────────
const MEMORY_LOG_INTERVAL = 60_000; // Log every 60 seconds
const REDIS_MEMORY_LOG_INTERVAL = 30 * 60_000; // Log Redis memory every 30 minutes

setInterval(() => {
  const usage = process.memoryUsage();
  const heapMB = Math.round(usage.heapUsed / 1024 / 1024);
  const rssMB = Math.round(usage.rss / 1024 / 1024);
  const level = heapMB > 800 ? 'CRITICAL' : heapMB > 600 ? 'WARN' : 'INFO';
  console.log(`[MEMORY ${level}] heap=${heapMB}MB rss=${rssMB}MB`);
}, MEMORY_LOG_INTERVAL);

setInterval(async () => {
  try {
    const info = await connection.info('memory');
    const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim() ?? 'unknown';
    const maxMemory = info.match(/maxmemory_human:(.+)/)?.[1]?.trim() ?? 'unknown';
    console.log(`[REDIS] memory=${usedMemory} max=${maxMemory}`);
  } catch {
    // Redis may be temporarily unavailable
  }
}, REDIS_MEMORY_LOG_INTERVAL);

/**
 * Per-queue worker configuration.
 * Concurrency is set per queue to prevent external API saturation.
 * lockDuration must exceed the queue timeout so jobs aren't marked stalled while still running.
 * stalledInterval is how often BullMQ checks for stalled jobs.
 */
function makeWorkerOptions(queueName: string, concurrency: number) {
  const timeout = getQueueTimeout(queueName as any);
  return {
    connection,
    concurrency,
    // Lock must be longer than the job timeout so BullMQ doesn't reclaim active jobs
    lockDuration: timeout + 60_000,
    // Check for stalled jobs every 30 seconds
    stalledInterval: 30_000,
    // Cap event streams to prevent unbounded Redis memory growth (matches Queue config)
    metrics: { maxDataPoints: 200 },
  };
}

/**
 * Content Queue Worker
 * Handles: CONTENT_GENERATE, CONTENT_OPTIMIZE, CONTENT_REVIEW
 */
const contentWorker = new Worker(
  QUEUE_NAMES.CONTENT,
  async (job: Job) => {
    console.log(`[Content Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType | string) {
      case 'CONTENT_GENERATE':
        return await handleContentGenerate(job);
      case 'CONTENT_OPTIMIZE':
        return await handleContentOptimize(job);
      case 'CONTENT_REVIEW':
        return await handleContentReview(job);
      case 'MICROSITE_CONTENT_GENERATE':
        return await handleMicrositeContentGenerate(job);
      // Content fanout handlers (BullMQ repeatable cron, replacing setInterval)
      case 'CONTENT_BLOG_FANOUT':
        return await generateDailyBlogPostsForAllSitesAndMicrosites();
      case 'CONTENT_FAQ_FANOUT':
        return await generateDailyContent('faq_hub');
      case 'CONTENT_REFRESH_FANOUT':
        return await generateDailyContent('content_refresh');
      case 'CONTENT_DESTINATION_FANOUT':
        return await generateDailyContent('destination_landing');
      case 'CONTENT_COMPARISON_FANOUT':
        return await generateDailyContent('comparison');
      case 'CONTENT_SEASONAL_FANOUT':
        return await generateDailyContent('seasonal_event');
      case 'CONTENT_GUIDES_FANOUT':
        return await generateDailyContent('local_guide');
      // Maintenance handlers (BullMQ repeatable cron, replacing setInterval)
      case 'META_TITLE_MAINTENANCE':
        return await runMetaTitleMaintenance();
      case 'MICROSITE_CONTENT_REFRESH':
        return await refreshMicrositeContent();
      case 'COLLECTION_REFRESH':
        return await refreshAllCollections();
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(QUEUE_NAMES.CONTENT, 3) // Bumped from 1→3 to clear blog DRAFT backlog (~864 jobs/day vs 288)
);

/**
 * SEO Queue Worker
 * Handles: SEO_ANALYZE, SEO_OPPORTUNITY_SCAN, SEO_OPPORTUNITY_OPTIMIZE
 * Also handles recursive SEO optimization jobs: audit, recursive_optimize, batch_optimize, weekly_scheduler
 */
const seoWorker = new Worker(
  QUEUE_NAMES.SEO,
  async (job: Job) => {
    console.log(`[SEO Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType | string) {
      case 'SEO_ANALYZE':
        // Use the health audit for SEO analysis
        return await handleSEOAudit(job);
      case 'SEO_AUTO_OPTIMIZE':
        // Auto-fix common SEO issues (metadata, structured data, etc.)
        return await handleAutoOptimize(job);
      case 'SEO_OPPORTUNITY_SCAN':
        return await handleOpportunityScan(job);
      case 'SEO_OPPORTUNITY_OPTIMIZE':
        // Multi-mode opportunity optimizer (5-iteration recursive AI optimization)
        return await handleOpportunityOptimize(job);
      // Custom job names for the recursive SEO system
      case 'audit':
        return await handleSEOAudit(job);
      case 'recursive_optimize':
        return await handleRecursiveOptimize(job);
      case 'batch_optimize':
        return await handleBatchOptimize(job);
      case 'weekly_scheduler':
        return await handleWeeklyAuditScheduler(job);
      // Link building handlers
      case 'LINK_OPPORTUNITY_SCAN':
        return await handleLinkOpportunityScan(job);
      case 'LINK_BACKLINK_MONITOR':
        return await handleLinkBacklinkMonitor(job);
      case 'LINK_OUTREACH_GENERATE':
        return await handleLinkOutreachGenerate(job);
      case 'LINK_ASSET_GENERATE':
        return await handleLinkAssetGenerate(job);
      case 'CROSS_SITE_LINK_ENRICHMENT':
        return await handleCrossSiteLinkEnrichment(job);
      case 'LINK_COMPETITOR_DISCOVERY':
        return await handleLinkCompetitorDiscovery(job);
      case 'LINK_BROKEN_LINK_SCAN':
        return await handleLinkBrokenLinkScan(job);
      case 'LINK_CONTENT_GAP_ANALYSIS':
        return await handleLinkContentGapAnalysis(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(QUEUE_NAMES.SEO, 3) // Moderate: external API + DB
);

/**
 * GSC Queue Worker
 * Handles: GSC_SYNC, GSC_SETUP, GSC_VERIFY
 */
const gscWorker = new Worker(
  QUEUE_NAMES.GSC,
  async (job: Job) => {
    console.log(`[GSC Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'GSC_SYNC':
        return await handleGscSync(job);
      case 'GSC_SETUP':
        return await handleGscSetup(job);
      case 'GSC_VERIFY':
        return await handleGscVerify(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(QUEUE_NAMES.GSC, 2) // Low: Google API rate limits
);

/**
 * Site Management Queue Worker
 * Handles: SITE_CREATE, SITE_DEPLOY
 */
const siteWorker = new Worker(
  QUEUE_NAMES.SITE,
  async (job: Job) => {
    console.log(`[Site Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType | string) {
      case 'SITE_CREATE':
        return await handleSiteCreate(job);
      case 'SITE_DEPLOY':
        return await handleSiteDeploy(job);
      // Infrastructure fanout handlers (BullMQ repeatable cron, replacing setInterval)
      case 'PIPELINE_HEALTH_CHECK':
        return await runPipelineHealthCheck();
      case 'REDIS_QUEUE_CLEANUP':
        return await queueRegistry.cleanAllQueues();
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(QUEUE_NAMES.SITE, 2) // Low: heavy multi-step with external APIs
);

/**
 * Domain Management Queue Worker
 * Handles: DOMAIN_REGISTER, DOMAIN_VERIFY, SSL_PROVISION
 */
const domainWorker = new Worker(
  QUEUE_NAMES.DOMAIN,
  async (job: Job) => {
    console.log(`[Domain Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'DOMAIN_REGISTER':
        return await handleDomainRegister(job);
      case 'DOMAIN_VERIFY':
        return await handleDomainVerify(job);
      case 'SSL_PROVISION':
        return await handleSslProvision(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(QUEUE_NAMES.DOMAIN, 2) // Low: Cloudflare API rate limits
);

/**
 * Analytics Queue Worker
 * Handles: METRICS_AGGREGATE, PERFORMANCE_REPORT, GA4_SETUP
 */
const analyticsWorker = new Worker(
  QUEUE_NAMES.ANALYTICS,
  async (job: Job) => {
    console.log(`[Analytics Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'METRICS_AGGREGATE':
        return await handleMetricsAggregate(job);
      case 'PERFORMANCE_REPORT':
        return await handlePerformanceReport(job);
      case 'GA4_SETUP':
        return await handleGA4Setup(job);
      case 'GA4_DAILY_SYNC':
        return await handleGA4DailySync(job);
      case 'REFRESH_ANALYTICS_VIEWS':
        return await handleRefreshAnalyticsViews(job);
      case 'MICROSITE_GSC_SYNC':
        return await handleMicrositeGscSync(job);
      case 'MICROSITE_ANALYTICS_SYNC':
        return await handleMicrositeAnalyticsSync(job);
      case 'MICROSITE_GA4_SYNC':
        return await handleMicrositeGA4Sync(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(QUEUE_NAMES.ANALYTICS, 3) // Moderate: mix of DB and external API
);

/**
 * A/B Testing Queue Worker
 * Handles: ABTEST_ANALYZE, ABTEST_REBALANCE
 */
const abtestWorker = new Worker(
  QUEUE_NAMES.ABTEST,
  async (job: Job) => {
    console.log(`[A/B Test Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'ABTEST_ANALYZE':
        return await handleABTestAnalyze(job);
      case 'ABTEST_REBALANCE':
        return await handleABTestRebalance(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(QUEUE_NAMES.ABTEST, 5) // Higher: mostly DB operations
);

/**
 * Microsite Queue Worker
 * Handles: MICROSITE_CREATE, MICROSITE_BRAND_GENERATE, MICROSITE_PUBLISH, MICROSITE_ARCHIVE, MICROSITE_HEALTH_CHECK
 */
const micrositeWorker = new Worker(
  QUEUE_NAMES.MICROSITE,
  async (job: Job) => {
    console.log(`[Microsite Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType | string) {
      case 'MICROSITE_CREATE':
        return await handleMicrositeCreate(job);
      case 'MICROSITE_BRAND_GENERATE':
        return await handleMicrositeBrandGenerate(job);
      case 'MICROSITE_PUBLISH':
        return await handleMicrositePublish(job);
      case 'MICROSITE_ARCHIVE':
        return await handleMicrositeArchive(job);
      case 'MICROSITE_HEALTH_CHECK':
        return await handleMicrositeHealthCheck(job);
      case 'MICROSITE_HOMEPAGE_ENRICH':
        return await handleMicrositeHomepageEnrich(job);
      // Sitemap resubmit fanout (BullMQ repeatable cron, replacing setInterval)
      case 'MICROSITE_SITEMAP_RESUBMIT':
        return await resubmitMicrositeSitemapsToGSC();
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(QUEUE_NAMES.MICROSITE, 2) // Low: brand generation uses AI
);

/**
 * Holibob Sync Queue Worker
 * Handles: SUPPLIER_SYNC, SUPPLIER_SYNC_INCREMENTAL, PRODUCT_SYNC, PRODUCT_SYNC_INCREMENTAL, BULK_PRODUCT_SYNC, KEYWORD_ENRICHMENT
 */
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
  makeWorkerOptions(QUEUE_NAMES.SYNC, 1) // Low: long-running Holibob API sync jobs
);

/**
 * Social Media Queue Worker
 * Handles: SOCIAL_DAILY_POSTING, SOCIAL_POST_GENERATE, SOCIAL_POST_PUBLISH
 */
const socialWorker = new Worker(
  QUEUE_NAMES.SOCIAL,
  async (job: Job) => {
    console.log(`[Social Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'SOCIAL_DAILY_POSTING':
        return await handleSocialDailyPosting(job);
      case 'SOCIAL_POST_GENERATE':
        return await handleSocialPostGenerate(job);
      case 'SOCIAL_POST_PUBLISH':
        return await handleSocialPostPublish(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(QUEUE_NAMES.SOCIAL, 2) // Low: external API rate limits
);

/**
 * Ads/Paid Traffic Queue Worker
 * Handles: PAID_KEYWORD_SCAN, AD_CAMPAIGN_SYNC, AD_PERFORMANCE_REPORT, AD_BUDGET_OPTIMIZER
 */
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
  makeWorkerOptions(QUEUE_NAMES.ADS, 1) // Strict: all ad API calls share rate limits & credentials
);

// Worker event handlers
const workers = [
  contentWorker,
  seoWorker,
  gscWorker,
  siteWorker,
  domainWorker,
  analyticsWorker,
  abtestWorker,
  micrositeWorker,
  syncWorker,
  socialWorker,
  adsWorker,
];

workers.forEach((worker) => {
  worker.on('completed', async (job, result) => {
    console.log(`✓ Job ${job.id} (${job.name}) completed successfully`);
    await updateJobStatus(job, 'COMPLETED', result as object);
    // Reset stuck counter on success so the task gets full retries next time
    const siteId = (job.data as { siteId?: string }).siteId || null;
    resetStuckCount(siteId, job.name);
  });

  worker.on('failed', async (job, err) => {
    console.error(`✗ Job ${job?.id} (${job?.name}) failed:`, err.message);
    if (job) {
      // Check if job will be retried
      const willRetry = job.attemptsMade < (job.opts.attempts || 3);
      await updateJobStatus(job, willRetry ? 'RETRYING' : 'FAILED', undefined, err.message);
    }
  });

  worker.on('error', (err) => {
    console.error(`Worker error:`, err);
  });
});

// Initialize scheduled jobs
async function setupScheduledJobs() {
  try {
    await initializeScheduledJobs();
    console.log('\n✓ Scheduled jobs initialized\n');

    // Log schedule
    const schedule = getScheduledJobs();
    console.log('📅 Job Schedule:');
    schedule.forEach((job) => {
      console.log(`   ${job.jobType.padEnd(25)} ${job.schedule.padEnd(15)} ${job.description}`);
    });
    console.log('');
  } catch (error) {
    console.error('Failed to initialize scheduled jobs:', error);
  }
}

// Autonomous roadmap processing interval (in milliseconds)
// Process all site roadmaps every 5 minutes to automatically progress tasks
const ROADMAP_PROCESS_INTERVAL = 5 * 60 * 1000; // 5 minutes
let roadmapProcessorInterval: NodeJS.Timeout | null = null;

async function startAutonomousRoadmapProcessor() {
  console.log(
    `\n🤖 Starting autonomous roadmap processor (every ${ROADMAP_PROCESS_INTERVAL / 60000} minutes)`
  );

  // Run immediately on startup
  try {
    const result = await processAllSiteRoadmaps();
    console.log(
      `   Initial run: ${result.sitesProcessed} sites processed, ${result.tasksQueued} tasks queued`
    );
  } catch (error) {
    console.error('   Initial roadmap processing failed:', error);
  }

  // Then run on interval
  roadmapProcessorInterval = setInterval(async () => {
    try {
      const result = await processAllSiteRoadmaps();
      if (result.tasksQueued > 0 || result.errors.length > 0) {
        console.log(
          `[Autonomous] Processed ${result.sitesProcessed} sites, queued ${result.tasksQueued} tasks` +
            (result.errors.length > 0 ? `, ${result.errors.length} errors` : '')
        );
      }
    } catch (error) {
      console.error('[Autonomous] Roadmap processing error:', error);
    }

    // Run self-healing stuck-task detector alongside each roadmap pass
    try {
      const stuckResult = await detectStuckTasks();
      if (stuckResult.healed > 0 || stuckResult.permanentlyFailed > 0) {
        console.log(
          `[Stuck Detector] Healed ${stuckResult.healed}, permanently failed ${stuckResult.permanentlyFailed}`
        );
      }
    } catch (error) {
      console.error('[Stuck Detector] Error:', error);
    }
  }, ROADMAP_PROCESS_INTERVAL);

  console.log('   ✓ Autonomous roadmap processor started\n');
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  try {
    // Stop autonomous roadmap processor
    if (roadmapProcessorInterval) {
      clearInterval(roadmapProcessorInterval);
      console.log('✓ Autonomous roadmap processor stopped');
    }

    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    console.log('✓ All workers closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Startup
console.log('Workers initialized:');
console.log('  ✓ Content Worker (content generation, optimization, review, microsite content)');
console.log('  ✓ SEO Worker (opportunity scan, SEO analysis)');
console.log('  ✓ GSC Worker (Google Search Console sync)');
console.log('  ✓ Site Worker (site creation, deployment)');
console.log('  ✓ Domain Worker (domain registration, verification, SSL)');
console.log('  ✓ Analytics Worker (metrics aggregation, reports, GA4 sync, microsite analytics)');
console.log('  ✓ A/B Test Worker (test analysis, rebalancing)');
console.log('  ✓ Microsite Worker (microsite creation, branding, publishing)');
console.log('  ✓ Sync Worker (Holibob supplier and product sync)');
console.log('  ✓ Social Worker (social media posting - Pinterest, Facebook, Twitter)');
console.log('  ✓ Ads Worker (paid keyword scanning, campaign sync, budget optimization)');
console.log('');

// Set up scheduled jobs and autonomous processor after a short delay to ensure workers are ready
setTimeout(async () => {
  await setupScheduledJobs().catch(console.error);
  await startAutonomousRoadmapProcessor().catch(console.error);
}, 2000);

console.log('🎯 Demand Generation Service is running and ready to process jobs\n');

// Keep the process alive
process.stdin.resume();

export {
  contentWorker,
  seoWorker,
  gscWorker,
  siteWorker,
  domainWorker,
  analyticsWorker,
  abtestWorker,
  micrositeWorker,
  syncWorker,
  adsWorker,
};
