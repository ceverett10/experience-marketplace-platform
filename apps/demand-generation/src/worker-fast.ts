/**
 * Worker Fast Process — High-throughput, short-lived jobs
 *
 * Handles: Content, SEO, Analytics, A/B Test, Social, Microsite
 * Dyno: Standard-2X (1GB)
 * Total concurrency: ~20
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
  // Worker handlers
  handleContentGenerate,
  handleContentOptimize,
  handleContentReview,
  handleOpportunityScan,
  handleOpportunityOptimize,
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
  // SEO recursive optimization handlers
  handleSEOAudit,
  handleAutoOptimize,
  handleRecursiveOptimize,
  handleBatchOptimize,
  handleWeeklyAuditScheduler,
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

// ── Content Worker (concurrency 5) ──────────────────────────────────────
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
      // Content fanout handlers (BullMQ repeatable cron)
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
      // Maintenance handlers (BullMQ repeatable cron)
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
  makeWorkerOptions(connection, QUEUE_NAMES.CONTENT, 5)
);

// ── SEO Worker (concurrency 3) ─────────────────────────────────────────
const seoWorker = new Worker(
  QUEUE_NAMES.SEO,
  async (job: Job) => {
    console.log(`[SEO Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType | string) {
      case 'SEO_ANALYZE':
        return await handleSEOAudit(job);
      case 'SEO_AUTO_OPTIMIZE':
        return await handleAutoOptimize(job);
      case 'SEO_OPPORTUNITY_SCAN':
        return await handleOpportunityScan(job);
      case 'SEO_OPPORTUNITY_OPTIMIZE':
        return await handleOpportunityOptimize(job);
      case 'audit':
        return await handleSEOAudit(job);
      case 'recursive_optimize':
        return await handleRecursiveOptimize(job);
      case 'batch_optimize':
        return await handleBatchOptimize(job);
      case 'weekly_scheduler':
        return await handleWeeklyAuditScheduler(job);
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
  makeWorkerOptions(connection, QUEUE_NAMES.SEO, 3)
);

// ── Analytics Worker (concurrency 3) ────────────────────────────────────
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
  makeWorkerOptions(connection, QUEUE_NAMES.ANALYTICS, 3)
);

// ── A/B Test Worker (concurrency 5) ─────────────────────────────────────
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
  makeWorkerOptions(connection, QUEUE_NAMES.ABTEST, 5)
);

// ── Social Worker (concurrency 2) ───────────────────────────────────────
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
  makeWorkerOptions(connection, QUEUE_NAMES.SOCIAL, 2)
);

// ── Microsite Worker (concurrency 2) ────────────────────────────────────
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
      case 'MICROSITE_SITEMAP_RESUBMIT':
        return await resubmitMicrositeSitemapsToGSC();
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(connection, QUEUE_NAMES.MICROSITE, 2)
);

// ── Setup ───────────────────────────────────────────────────────────────
const workers = [
  contentWorker,
  seoWorker,
  analyticsWorker,
  abtestWorker,
  socialWorker,
  micrositeWorker,
];

setupWorkerEvents(workers, connection);
startMemoryMonitoring(connection);
setupGracefulShutdown(workers, connection);

logBanner('Worker Fast Process', [
  'Content (concurrency 5)',
  'SEO (concurrency 3)',
  'Analytics (concurrency 3)',
  'A/B Test (concurrency 5)',
  'Social (concurrency 2)',
  'Microsite (concurrency 2)',
]);

console.log('🎯 Worker Fast is running and ready to process jobs\n');
process.stdin.resume();

export { contentWorker, seoWorker, analyticsWorker, abtestWorker, socialWorker, micrositeWorker };
