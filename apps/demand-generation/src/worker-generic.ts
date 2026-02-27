/**
 * Generic Worker Process — Configuration-driven queue selection
 *
 * Reads WORKER_QUEUES env var (comma-separated) to decide which queues to process.
 * Per-queue concurrency via CONCURRENCY_{QUEUE_NAME} env vars (default: 2).
 * Scheduler/roadmap gated by ENABLE_SCHEDULER=true.
 *
 * This enables flexible horizontal scaling:
 *   WORKER_QUEUES=content,seo CONCURRENCY_CONTENT=5 → content+seo worker
 *   WORKER_QUEUES=sync,ads → heavy worker
 *   WORKER_QUEUES=site,domain,gsc ENABLE_SCHEDULER=true → infra worker
 */

import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  queueRegistry,
  // Content fanout services
  generateDailyBlogPostsForAllSitesAndMicrosites,
  generateDailyContent,
  refreshMicrositeContent,
  runMetaTitleMaintenance,
  refreshAllCollections,
  resubmitMicrositeSitemapsToGSC,
  // Content handlers
  handleContentGenerate,
  handleContentOptimize,
  handleContentReview,
  // SEO handlers
  handleOpportunityScan,
  handleOpportunityOptimize,
  handleSEOAudit,
  handleAutoOptimize,
  handleRecursiveOptimize,
  handleBatchOptimize,
  handleWeeklyAuditScheduler,
  // Analytics handlers
  handleMetricsAggregate,
  handlePerformanceReport,
  handleGA4Setup,
  handleGA4DailySync,
  handleRefreshAnalyticsViews,
  handleMicrositeGscSync,
  handleMicrositeAnalyticsSync,
  handleMicrositeGA4Sync,
  // A/B Test handlers
  handleABTestAnalyze,
  handleABTestRebalance,
  // Sync handlers
  handleSupplierSync,
  handleSupplierSyncIncremental,
  handleProductSync,
  handleProductSyncIncremental,
  handleBulkProductSync,
  handleKeywordEnrichment,
  handleSupplierEnrich,
  // Ads handlers
  handlePaidKeywordScan,
  handleAdCampaignSync,
  handleAdPerformanceReport,
  handleAdBudgetOptimizer,
  handleBiddingEngineRun,
  handleAdConversionUpload,
  handleAdPlatformIdsSync,
  handleAdCreativeRefresh,
  handleAdSearchTermHarvest,
  // Microsite handlers
  handleMicrositeCreate,
  handleMicrositeBrandGenerate,
  handleMicrositeContentGenerate,
  handleMicrositePublish,
  handleMicrositeArchive,
  handleMicrositeHealthCheck,
  handleMicrositeHomepageEnrich,
  // Social handlers
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
  // Site/Domain/GSC handlers
  handleSiteCreate,
  handleSiteDeploy,
  handleDomainRegister,
  handleDomainVerify,
  handleSslProvision,
  handleGscSetup,
  handleGscVerify,
  handleGscSync,
  // Scheduler + roadmap
  initializeScheduledJobs,
  processAllSiteRoadmaps,
  detectStuckTasks,
  cleanAllQueues,
  runPipelineHealthCheck,
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

// ── Queue Processor Registry ──────────────────────────────────────────
// Maps queue name → async job processor function
type JobProcessor = (job: Job) => Promise<unknown>;

const QUEUE_PROCESSORS: Record<string, Record<string, JobProcessor>> = {
  [QUEUE_NAMES.CONTENT]: {
    CONTENT_GENERATE: (job) => handleContentGenerate(job),
    CONTENT_OPTIMIZE: (job) => handleContentOptimize(job),
    CONTENT_REVIEW: (job) => handleContentReview(job),
    MICROSITE_CONTENT_GENERATE: (job) => handleMicrositeContentGenerate(job),
    CONTENT_BLOG_FANOUT: () => generateDailyBlogPostsForAllSitesAndMicrosites(),
    CONTENT_FAQ_FANOUT: () => generateDailyContent('faq_hub'),
    CONTENT_REFRESH_FANOUT: () => generateDailyContent('content_refresh'),
    CONTENT_DESTINATION_FANOUT: () => generateDailyContent('destination_landing'),
    CONTENT_COMPARISON_FANOUT: () => generateDailyContent('comparison'),
    CONTENT_SEASONAL_FANOUT: () => generateDailyContent('seasonal_event'),
    CONTENT_GUIDES_FANOUT: () => generateDailyContent('local_guide'),
    META_TITLE_MAINTENANCE: () => runMetaTitleMaintenance(),
    MICROSITE_CONTENT_REFRESH: () => refreshMicrositeContent(),
    COLLECTION_REFRESH: () => refreshAllCollections(),
  },
  [QUEUE_NAMES.SEO]: {
    SEO_ANALYZE: (job) => handleSEOAudit(job),
    SEO_AUTO_OPTIMIZE: (job) => handleAutoOptimize(job),
    SEO_OPPORTUNITY_SCAN: (job) => handleOpportunityScan(job),
    SEO_OPPORTUNITY_OPTIMIZE: (job) => handleOpportunityOptimize(job),
    audit: (job) => handleSEOAudit(job),
    recursive_optimize: (job) => handleRecursiveOptimize(job),
    batch_optimize: (job) => handleBatchOptimize(job),
    weekly_scheduler: (job) => handleWeeklyAuditScheduler(job),
    LINK_OPPORTUNITY_SCAN: (job) => handleLinkOpportunityScan(job),
    LINK_BACKLINK_MONITOR: (job) => handleLinkBacklinkMonitor(job),
    LINK_OUTREACH_GENERATE: (job) => handleLinkOutreachGenerate(job),
    LINK_ASSET_GENERATE: (job) => handleLinkAssetGenerate(job),
    CROSS_SITE_LINK_ENRICHMENT: (job) => handleCrossSiteLinkEnrichment(job),
    LINK_COMPETITOR_DISCOVERY: (job) => handleLinkCompetitorDiscovery(job),
    LINK_BROKEN_LINK_SCAN: (job) => handleLinkBrokenLinkScan(job),
    LINK_CONTENT_GAP_ANALYSIS: (job) => handleLinkContentGapAnalysis(job),
  },
  [QUEUE_NAMES.ANALYTICS]: {
    METRICS_AGGREGATE: (job) => handleMetricsAggregate(job),
    PERFORMANCE_REPORT: (job) => handlePerformanceReport(job),
    GA4_SETUP: (job) => handleGA4Setup(job),
    GA4_DAILY_SYNC: (job) => handleGA4DailySync(job),
    REFRESH_ANALYTICS_VIEWS: (job) => handleRefreshAnalyticsViews(job),
    MICROSITE_GSC_SYNC: (job) => handleMicrositeGscSync(job),
    MICROSITE_ANALYTICS_SYNC: (job) => handleMicrositeAnalyticsSync(job),
    MICROSITE_GA4_SYNC: (job) => handleMicrositeGA4Sync(job),
  },
  [QUEUE_NAMES.ABTEST]: {
    ABTEST_ANALYZE: (job) => handleABTestAnalyze(job),
    ABTEST_REBALANCE: (job) => handleABTestRebalance(job),
  },
  [QUEUE_NAMES.SYNC]: {
    SUPPLIER_SYNC: (job) => handleSupplierSync(job),
    SUPPLIER_SYNC_INCREMENTAL: (job) => handleSupplierSyncIncremental(job),
    PRODUCT_SYNC: (job) => handleProductSync(job),
    PRODUCT_SYNC_INCREMENTAL: (job) => handleProductSyncIncremental(job),
    BULK_PRODUCT_SYNC: (job) => handleBulkProductSync(job),
    KEYWORD_ENRICHMENT: (job) => handleKeywordEnrichment(job),
    SUPPLIER_ENRICH: (job) => handleSupplierEnrich(job),
  },
  [QUEUE_NAMES.ADS]: {
    PAID_KEYWORD_SCAN: (job) => handlePaidKeywordScan(job),
    AD_CAMPAIGN_SYNC: (job) => handleAdCampaignSync(job),
    AD_PERFORMANCE_REPORT: (job) => handleAdPerformanceReport(job),
    AD_BUDGET_OPTIMIZER: (job) => handleAdBudgetOptimizer(job),
    BIDDING_ENGINE_RUN: (job) => handleBiddingEngineRun(job),
    AD_CONVERSION_UPLOAD: (job) => handleAdConversionUpload(job),
    AD_PLATFORM_IDS_SYNC: (job) => handleAdPlatformIdsSync(job),
    AD_CREATIVE_REFRESH: (job) => handleAdCreativeRefresh(job),
    AD_SEARCH_TERM_HARVEST: (job) => handleAdSearchTermHarvest(job),
  },
  [QUEUE_NAMES.MICROSITE]: {
    MICROSITE_CREATE: (job) => handleMicrositeCreate(job),
    MICROSITE_BRAND_GENERATE: (job) => handleMicrositeBrandGenerate(job),
    MICROSITE_PUBLISH: (job) => handleMicrositePublish(job),
    MICROSITE_ARCHIVE: (job) => handleMicrositeArchive(job),
    MICROSITE_HEALTH_CHECK: (job) => handleMicrositeHealthCheck(job),
    MICROSITE_HOMEPAGE_ENRICH: (job) => handleMicrositeHomepageEnrich(job),
    MICROSITE_SITEMAP_RESUBMIT: () => resubmitMicrositeSitemapsToGSC(),
  },
  [QUEUE_NAMES.SOCIAL]: {
    SOCIAL_DAILY_POSTING: (job) => handleSocialDailyPosting(job),
    SOCIAL_POST_GENERATE: (job) => handleSocialPostGenerate(job),
    SOCIAL_POST_PUBLISH: (job) => handleSocialPostPublish(job),
  },
  [QUEUE_NAMES.SITE]: {
    SITE_CREATE: (job) => handleSiteCreate(job),
    SITE_DEPLOY: (job) => handleSiteDeploy(job),
    PIPELINE_HEALTH_CHECK: () => runPipelineHealthCheck(),
    REDIS_QUEUE_CLEANUP: () => cleanAllQueues(),
  },
  [QUEUE_NAMES.DOMAIN]: {
    DOMAIN_REGISTER: (job) => handleDomainRegister(job),
    DOMAIN_VERIFY: (job) => handleDomainVerify(job),
    SSL_PROVISION: (job) => handleSslProvision(job),
  },
  [QUEUE_NAMES.GSC]: {
    GSC_SETUP: (job) => handleGscSetup(job),
    GSC_VERIFY: (job) => handleGscVerify(job),
    GSC_SYNC: (job) => handleGscSync(job),
  },
};

// ── Configuration ────────────────────────────────────────────────────
const requestedQueues = (process.env['WORKER_QUEUES'] || '')
  .split(',')
  .map((q) => q.trim())
  .filter(Boolean);

if (requestedQueues.length === 0) {
  console.error('WORKER_QUEUES env var is required (comma-separated queue names)');
  console.error('Available queues:', Object.keys(QUEUE_PROCESSORS).join(', '));
  process.exit(1);
}

const enableScheduler = process.env['ENABLE_SCHEDULER'] === 'true';
const DEFAULT_CONCURRENCY = 2;

// ── Worker Creation ──────────────────────────────────────────────────
const connection = createConnection();
const workers: Worker[] = [];
const workerDescriptions: string[] = [];

for (const queueName of requestedQueues) {
  const processors = QUEUE_PROCESSORS[queueName];
  if (!processors) {
    console.error(`Unknown queue: ${queueName}`);
    console.error('Available queues:', Object.keys(QUEUE_PROCESSORS).join(', '));
    process.exit(1);
  }

  const envKey = `CONCURRENCY_${queueName.toUpperCase()}`;
  const concurrency = parseInt(process.env[envKey] || String(DEFAULT_CONCURRENCY), 10);

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      console.log(`[${queueName}] Processing ${job.name} job ${job.id}`);
      await updateJobStatus(job, 'RUNNING');

      const handler = processors[job.name];
      if (!handler) {
        throw new Error(`Unknown job type: ${job.name} in queue ${queueName}`);
      }
      return await handler(job);
    },
    makeWorkerOptions(connection, queueName, concurrency)
  );

  workers.push(worker);
  workerDescriptions.push(`${queueName} (concurrency ${concurrency})`);
}

// ── Scheduler (optional) ─────────────────────────────────────────────
let roadmapProcessorInterval: NodeJS.Timeout | null = null;

if (enableScheduler) {
  initializeScheduledJobs().then(() => {
    console.log('Scheduled jobs initialized');
  });

  const ROADMAP_PROCESS_INTERVAL = 5 * 60 * 1000;
  roadmapProcessorInterval = setInterval(async () => {
    try {
      const result = await processAllSiteRoadmaps();
      if (result.tasksQueued > 0 || result.errors.length > 0) {
        console.log(
          `[Roadmap] Processed ${result.sitesProcessed} sites, queued ${result.tasksQueued}, errors: ${result.errors.length}`
        );
      }
    } catch (error) {
      console.error('[Roadmap] Processing failed:', error);
    }
  }, ROADMAP_PROCESS_INTERVAL);

  // Stuck task detector (every 10 minutes)
  setInterval(
    async () => {
      try {
        await detectStuckTasks();
      } catch (error) {
        console.error('[StuckTasks] Detection failed:', error);
      }
    },
    10 * 60 * 1000
  );
}

// ── Setup ────────────────────────────────────────────────────────────
setupWorkerEvents(workers, connection);
startMemoryMonitoring(connection);
setupGracefulShutdown(workers, connection, () => {
  if (roadmapProcessorInterval) clearInterval(roadmapProcessorInterval);
});

logBanner('Generic Worker Process', workerDescriptions);
if (enableScheduler) {
  console.log('Scheduler: ENABLED');
}
console.log('Worker is running and ready to process jobs\n');
process.stdin.resume();

export { workers };
