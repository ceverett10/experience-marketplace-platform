import { scheduleJob, queueRegistry } from '../queues';
import {
  generateDailyBlogPostsForAllSites,
  generateDailyBlogPostsForAllSitesAndMicrosites,
} from '../services/daily-blog-generator.js';
import {
  generateDailyContent,
  ContentGenerationType,
} from '../services/daily-content-generator.js';
import { runMetaTitleMaintenance } from '../services/meta-title-maintenance.js';
import { refreshAllCollections } from '../services/collection-generator.js';
import { resubmitMicrositeSitemapsToGSC } from '../services/microsite-sitemap-resubmit.js';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic.js';

// Track intervals for cleanup
let dailyContentInterval: NodeJS.Timeout | null = null;
let metaTitleMaintenanceInterval: NodeJS.Timeout | null = null;
let micrositeContentRefreshInterval: NodeJS.Timeout | null = null;
let collectionRefreshInterval: NodeJS.Timeout | null = null;
let sitemapResubmitInterval: NodeJS.Timeout | null = null;
let redisCleanupInterval: NodeJS.Timeout | null = null;

/**
 * Wraps a setInterval job execution with DB tracking so the admin dashboard
 * can display last run time, status, and duration.
 */
async function trackScheduledExecution<T>(
  jobType: string,
  fn: () => Promise<T>
): Promise<T> {
  const { prisma } = await import('@experience-marketplace/database');
  const dbJob = await prisma.job.create({
    data: {
      type: jobType as any,
      queue: 'scheduled',
      payload: {},
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });
  try {
    const result = await fn();
    await prisma.job.update({
      where: { id: dbJob.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        result: (result != null ? result : {}) as any,
      },
    });
    return result;
  } catch (error) {
    await prisma.job.update({
      where: { id: dbJob.id },
      data: { status: 'FAILED', completedAt: new Date(), error: String(error) },
    });
    throw error;
  }
}

/**
 * Calculate the next run time for a cron expression.
 * Supports standard 5-field cron: minute hour dayOfMonth month dayOfWeek
 */
export function getNextCronRun(cron: string): Date {
  const parts = cron.split(' ');
  if (parts.length !== 5) return new Date();

  const [minuteExpr, hourExpr, , , dowExpr] = parts;
  const now = new Date();

  // Parse which minutes are valid
  function parseField(expr: string, max: number): number[] {
    if (expr === '*') return Array.from({ length: max }, (_, i) => i);
    if (expr!.startsWith('*/')) {
      const step = parseInt(expr!.slice(2));
      return Array.from({ length: Math.ceil(max / step) }, (_, i) => i * step);
    }
    return expr!.split(',').map((v) => parseInt(v));
  }

  const validMinutes = parseField(minuteExpr!, 60);
  const validHours = parseField(hourExpr!, 24);
  const validDows = dowExpr === '*' ? [0, 1, 2, 3, 4, 5, 6] : parseField(dowExpr!, 7);

  // Start from next minute and scan forward (max 8 days)
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let i = 0; i < 8 * 24 * 60; i++) {
    if (
      validDows.includes(candidate.getDay()) &&
      validHours.includes(candidate.getHours()) &&
      validMinutes.includes(candidate.getMinutes())
    ) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return now; // fallback
}

/**
 * Initialize scheduled/recurring jobs
 * These jobs run automatically on a schedule
 */
export async function initializeScheduledJobs(): Promise<void> {
  console.log('[Scheduler] Initializing scheduled jobs...');

  // GSC Data Sync - Every 6 hours
  await scheduleJob(
    'GSC_SYNC',
    {
      siteId: 'all', // Special value meaning "sync all sites"
      dimensions: ['query', 'page', 'country', 'device'],
    },
    '0 */6 * * *' // Every 6 hours at :00
  );
  console.log('[Scheduler] ✓ GSC Sync - Every 6 hours');

  // Opportunity Scan - Daily at 2 AM
  await scheduleJob(
    'SEO_OPPORTUNITY_SCAN',
    {
      forceRescan: false,
    },
    '0 2 * * *' // Daily at 2 AM
  );
  console.log('[Scheduler] ✓ Opportunity Scan - Daily at 2 AM');

  // Performance Analysis / SEO Health Audit - Daily at 3 AM
  // This triggers recursive optimization for underperforming pages
  await scheduleJob(
    'SEO_ANALYZE',
    {
      siteId: 'all',
      fullSiteAudit: false,
      triggerOptimizations: true, // Automatically queue optimizations for issues found
    },
    '0 3 * * *' // Daily at 3 AM
  );
  console.log('[Scheduler] ✓ SEO Health Audit - Daily at 3 AM (with auto-optimization)');

  // Weekly Deep SEO Audit - Sundays at 5 AM
  // Forces comprehensive analysis regardless of recent audits
  await scheduleJob(
    'SEO_ANALYZE',
    {
      siteId: 'all',
      fullSiteAudit: true,
      forceAudit: true, // Run even if recently audited
      triggerOptimizations: true,
    },
    '0 5 * * 0' // Sundays at 5 AM
  );
  console.log('[Scheduler] ✓ Weekly Deep SEO Audit - Sundays at 5 AM');

  // Weekly SEO Auto-Optimization - Sundays at 6 AM
  // Automatically fixes common SEO issues (metadata, structured data, etc.)
  await scheduleJob(
    'SEO_AUTO_OPTIMIZE',
    {
      siteId: 'all',
      scope: 'all',
    },
    '0 6 * * 0' // Sundays at 6 AM
  );
  console.log('[Scheduler] ✓ Weekly SEO Auto-Optimization - Sundays at 6 AM');

  // Weekly Meta Title Maintenance - Sundays at 8 AM
  // Ensures all pages have SEO-optimized meta titles
  initializeMetaTitleMaintenanceSchedule();
  console.log('[Scheduler] ✓ Weekly Meta Title Maintenance - Sundays at 8 AM');

  // Metrics Aggregation - Daily at 1 AM
  await scheduleJob(
    'METRICS_AGGREGATE',
    {
      aggregationType: 'daily',
    },
    '0 1 * * *' // Daily at 1 AM
  );
  console.log('[Scheduler] ✓ Metrics Aggregation - Daily at 1 AM');

  // GA4 Daily Sync - Daily at 6 AM (after GA4 has processed previous day)
  // Syncs GA4 traffic data + booking metrics into SiteAnalyticsSnapshot
  await scheduleJob(
    'GA4_DAILY_SYNC' as any,
    {} as any, // Empty payload - uses defaults
    '0 6 * * *' // Daily at 6 AM
  );
  console.log('[Scheduler] ✓ GA4 Daily Sync - Daily at 6 AM');

  // Refresh Analytics Views - Every hour
  // Refreshes materialized views used by analytics dashboard
  await scheduleJob(
    'REFRESH_ANALYTICS_VIEWS' as any,
    {} as any, // Empty payload - uses defaults
    '0 * * * *' // Every hour at :00
  );
  console.log('[Scheduler] ✓ Refresh Analytics Views - Hourly');

  // Microsite GSC Sync - Daily at 7 AM (after GA4 sync)
  await scheduleJob(
    'MICROSITE_GSC_SYNC' as any,
    {} as any, // Empty payload - syncs all active microsites
    '0 7 * * *' // Daily at 7 AM
  );
  console.log('[Scheduler] ✓ Microsite GSC Sync - Daily at 7 AM');

  // Microsite GA4 Sync - Daily at 7:30 AM (after GSC sync, before analytics aggregation)
  await scheduleJob(
    'MICROSITE_GA4_SYNC' as any,
    {} as any, // Empty payload - syncs all active microsites
    '30 7 * * *' // Daily at 7:30 AM
  );
  console.log('[Scheduler] ✓ Microsite GA4 Sync - Daily at 7:30 AM');

  // Microsite Analytics Sync - Daily at 8 AM (after GSC + GA4 sync)
  await scheduleJob(
    'MICROSITE_ANALYTICS_SYNC' as any,
    {} as any, // Empty payload - syncs all active microsites
    '0 8 * * *' // Daily at 8 AM
  );
  console.log('[Scheduler] ✓ Microsite Analytics Sync - Daily at 8 AM');

  // Weekly Performance Report - Every Monday at 9 AM
  await scheduleJob(
    'PERFORMANCE_REPORT',
    {
      reportType: 'weekly',
    },
    '0 9 * * 1' // Mondays at 9 AM
  );
  console.log('[Scheduler] ✓ Weekly Report - Mondays at 9 AM');

  // A/B Test Rebalancing - Every hour
  await scheduleJob(
    'ABTEST_REBALANCE',
    {
      abTestId: 'all', // Special value meaning "all active tests"
      algorithm: 'thompson_sampling',
    },
    '0 * * * *' // Every hour
  );
  console.log('[Scheduler] ✓ A/B Test Rebalancing - Every hour');

  // Link Building - Backlink Monitor - Weekly on Wednesdays at 3 AM
  await scheduleJob(
    'LINK_BACKLINK_MONITOR' as any,
    {
      siteId: 'all',
    },
    '0 3 * * 3' // Wednesdays at 3 AM
  );
  console.log('[Scheduler] ✓ Backlink Monitor - Wednesdays at 3 AM');

  // Link Building - Opportunity Scan - Weekly on Tuesdays at 2 AM
  await scheduleJob(
    'LINK_OPPORTUNITY_SCAN' as any,
    {
      siteId: 'all',
    },
    '0 2 * * 2' // Tuesdays at 2 AM
  );
  console.log('[Scheduler] ✓ Link Opportunity Scan - Tuesdays at 2 AM');

  // Daily Content Generation - Staggered throughout the day
  // Uses setInterval with cron-like scheduling since it doesn't need job queue tracking
  initializeDailyContentSchedule();
  console.log('[Scheduler] ✓ Daily Content Generation Schedule:');
  console.log('[Scheduler]   - FAQ Hubs: 1:30 AM');
  console.log('[Scheduler]   - Content Refresh: 2:30 AM');
  console.log('[Scheduler]   - Daily Blog: 4:00 AM');
  console.log('[Scheduler]   - Destination Landing: 5:30 AM');
  console.log('[Scheduler]   - Comparison Pages: 6:30 AM');
  console.log('[Scheduler]   - Seasonal Content: 7:00 AM');
  console.log('[Scheduler]   - Local Guides: Sundays 4:30 AM');

  // =========================================================================
  // MICROSITE SYSTEM SCHEDULES
  // =========================================================================

  // Holibob Supplier Sync - Daily at 2 AM (before product sync)
  await scheduleJob(
    'SUPPLIER_SYNC' as any,
    {
      forceSync: false, // Only sync stale suppliers
    },
    '0 2 * * *' // Daily at 2 AM
  );
  console.log('[Scheduler] ✓ Supplier Sync - Daily at 2 AM');

  // Holibob Product Sync - Daily at 3:30 AM (after supplier sync)
  await scheduleJob(
    'PRODUCT_SYNC' as any,
    {
      forceSync: false, // Only sync stale products
    },
    '30 3 * * *' // Daily at 3:30 AM
  );
  console.log('[Scheduler] ✓ Product Sync - Daily at 3:30 AM');

  // Microsite Content Refresh - Daily at 6 AM (after syncs complete)
  // Refreshes 1% of microsites per day (rotating)
  initializeMicrositeContentRefreshSchedule();
  console.log('[Scheduler] ✓ Microsite Content Refresh - Daily at 6 AM (1% rotation)');

  // Microsite Health Check - Sundays at 8:30 AM
  await scheduleJob(
    'MICROSITE_HEALTH_CHECK' as any,
    {},
    '30 8 * * 0' // Sundays at 8:30 AM
  );
  console.log('[Scheduler] ✓ Microsite Health Check - Sundays at 8:30 AM');

  // Microsite Sitemap Resubmission to GSC - Sundays at 9 AM
  // Resubmits all active microsite sitemaps to keep Google's crawl queue fresh
  initializeSitemapResubmitSchedule();
  console.log('[Scheduler] ✓ Microsite Sitemap Resubmit - Sundays at 9 AM');

  // Curated Collection Refresh - Daily at 5:30 AM
  // Processes 5% of microsites per day (rotating), spreading load across time
  initializeCollectionRefreshSchedule();
  console.log('[Scheduler] ✓ Collection Refresh - Daily at 5:30 AM (5% rotation)');

  // =========================================================================
  // SOCIAL MEDIA SCHEDULES
  // =========================================================================

  // Social Media Daily Posting - Daily at 5 AM UTC
  // Smart staggered scheduling: groups by shared account, caps at 7/day, timezone-aware
  await scheduleJob(
    'SOCIAL_DAILY_POSTING' as any,
    {} as any,
    '0 5 * * *' // Daily at 5 AM UTC (before any timezone's 9 AM peak)
  );
  console.log('[Scheduler] ✓ Social Daily Posting - Daily at 5 AM UTC (smart staggered)');

  // =========================================================================
  // PAID TRAFFIC SCHEDULES
  // =========================================================================

  // Paid Keyword Scanner — Daily at 3 AM (runs BEFORE bidding engine so new keywords are scored same day)
  // Discovers new low-CPC keyword opportunities from GSC, DataForSEO, Pinterest Ads, Meta, and microsite keywords
  await scheduleJob(
    'PAID_KEYWORD_SCAN' as any,
    { maxCpc: PAID_TRAFFIC_CONFIG.maxCpc, minVolume: PAID_TRAFFIC_CONFIG.minVolume, modes: ['gsc', 'expansion', 'discovery', 'pinterest', 'meta'] },
    '0 3 * * *' // Daily at 3 AM (~$1.10/day via DataForSEO)
  );
  console.log('[Scheduler] ✓ Paid Keyword Scanner - Daily at 3 AM');

  // Bidding Engine Run — Daily at 5 AM (after keyword scanner discovers new keywords)
  // Calculates site profitability, scores keyword opportunities, creates + auto-deploys campaigns
  await scheduleJob(
    'BIDDING_ENGINE_RUN' as any,
    { mode: 'full' },
    '0 5 * * *' // Daily at 5 AM
  );
  console.log('[Scheduler] ✓ Bidding Engine Run - Daily at 5 AM');

  // Ad Campaign Sync — Every 3 hours
  // Syncs performance data from Meta + Google Ads into AdCampaign/AdDailyMetric
  // Also runs alert checks after sync completes
  await scheduleJob(
    'AD_CAMPAIGN_SYNC' as any,
    {},
    '0 */3 * * *' // Every 3 hours
  );
  console.log('[Scheduler] ✓ Ad Campaign Sync - Every 3 hours');

  // Ad Conversion Upload — Every 2 hours
  // Uploads booking conversions to Meta/Google via server-side CAPI
  await scheduleJob(
    'AD_CONVERSION_UPLOAD' as any,
    {},
    '0 */2 * * *' // Every 2 hours
  );
  console.log('[Scheduler] ✓ Ad Conversion Upload - Every 2 hours');

  // Ad Platform IDs Sync — Weekly on Mondays at 2 AM
  // Fetches Meta Pixel + Google Ads conversion action IDs and propagates to all sites/microsites
  await scheduleJob(
    'AD_PLATFORM_IDS_SYNC' as any,
    {},
    '0 2 * * 1' // Mondays at 2 AM
  );
  console.log('[Scheduler] + Ad Platform IDs Sync - Mondays at 2 AM');

  // Ad Performance Report — Daily at 9 AM
  // Portfolio-wide performance analysis: top/under performers, opportunities
  await scheduleJob(
    'AD_PERFORMANCE_REPORT' as any,
    {},
    '0 9 * * *' // Daily at 9 AM
  );
  console.log('[Scheduler] ✓ Ad Performance Report - Daily at 9 AM');

  // Ad Budget Optimizer — Daily at 10 AM (after report)
  // Pauses underperformers, scales up winners, respects budget caps
  await scheduleJob(
    'AD_BUDGET_OPTIMIZER' as any,
    {},
    '0 10 * * *' // Daily at 10 AM
  );
  console.log('[Scheduler] ✓ Ad Budget Optimizer - Daily at 10 AM');

  // =========================================================================
  // MAINTENANCE
  // =========================================================================

  // Redis Queue Cleanup - Every 6 hours
  // Removes old completed/failed jobs to prevent Redis OOM on Mini plan (25 MB)
  initializeRedisCleanupSchedule();
  console.log('[Scheduler] ✓ Redis Queue Cleanup - Every 6 hours');

  console.log('[Scheduler] All scheduled jobs initialized successfully');
}

/**
 * Content generation schedule configuration
 * Each content type runs at a specific time to spread load
 */
interface ContentSchedule {
  type: ContentGenerationType | 'blog';
  hour: number;
  minute: number;
  dayOfWeek?: number; // 0 = Sunday, if undefined runs daily
  description: string;
}

const CONTENT_SCHEDULES: ContentSchedule[] = [
  { type: 'faq_hub', hour: 1, minute: 30, description: 'FAQ Hub Pages' },
  { type: 'content_refresh', hour: 2, minute: 30, description: 'Content Refresh' },
  { type: 'blog', hour: 4, minute: 0, description: 'Daily Blog' },
  { type: 'destination_landing', hour: 5, minute: 30, description: 'Destination Landing' },
  { type: 'comparison', hour: 6, minute: 30, description: 'Comparison Pages' },
  { type: 'seasonal_event', hour: 7, minute: 0, description: 'Seasonal Content' },
  { type: 'local_guide', hour: 4, minute: 30, dayOfWeek: 0, description: 'Local Guides (Weekly)' },
];

// Track which schedules have run today to avoid duplicates
const schedulesRunToday = new Map<string, string>();

/**
 * Initialize daily content generation schedule
 * Runs different content types at staggered times throughout the day
 * This builds site authority through consistent daily content publishing
 */
function initializeDailyContentSchedule(): void {
  // Check every 30 minutes if it's time to generate content
  dailyContentInterval = setInterval(
    async () => {
      const now = new Date();
      const today = now.toISOString().split('T')[0] ?? '';
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentDow = now.getDay();

      for (const schedule of CONTENT_SCHEDULES) {
        // Check if this is the right time (within 30 min window)
        const isCorrectTime =
          currentHour === schedule.hour &&
          currentMinute >= schedule.minute &&
          currentMinute < schedule.minute + 30;

        // Check day of week for weekly schedules
        const isCorrectDay = schedule.dayOfWeek === undefined || schedule.dayOfWeek === currentDow;

        // Check if already run today
        const scheduleKey = `${schedule.type}-${schedule.dayOfWeek ?? 'daily'}`;
        const lastRun = schedulesRunToday.get(scheduleKey);
        const alreadyRunToday = lastRun === today;

        if (isCorrectTime && isCorrectDay && !alreadyRunToday) {
          schedulesRunToday.set(scheduleKey, today);
          await runContentGeneration(schedule);
        }
      }

      // Clear old entries at midnight
      if (currentHour === 0 && currentMinute < 30) {
        schedulesRunToday.clear();
      }
    },
    30 * 60 * 1000 // Check every 30 minutes
  );

  // Also check immediately on startup
  checkAndRunContentSchedules();
}

/**
 * Check and run any content schedules that should have run
 */
async function checkAndRunContentSchedules(): Promise<void> {
  const now = new Date();
  const today = now.toISOString().split('T')[0] ?? '';
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDow = now.getDay();

  for (const schedule of CONTENT_SCHEDULES) {
    // Check if this is the right time (within 30 min window)
    const isCorrectTime =
      currentHour === schedule.hour &&
      currentMinute >= schedule.minute &&
      currentMinute < schedule.minute + 30;

    // Check day of week for weekly schedules
    const isCorrectDay = schedule.dayOfWeek === undefined || schedule.dayOfWeek === currentDow;

    if (isCorrectTime && isCorrectDay) {
      const scheduleKey = `${schedule.type}-${schedule.dayOfWeek ?? 'daily'}`;
      schedulesRunToday.set(scheduleKey, today);
      console.log(`[Scheduler] Running immediate ${schedule.description} check on startup...`);
      await runContentGeneration(schedule);
    }
  }
}

/**
 * Run content generation for a specific schedule
 */
async function runContentGeneration(schedule: ContentSchedule): Promise<void> {
  console.log(`[Scheduler] Starting ${schedule.description} generation...`);

  try {
    if (schedule.type === 'blog') {
      // Use combined blog generator for both sites and microsites
      // Sites: processed sequentially (typically few)
      // Microsites: processed with 5% daily rotation and batch parallelization (scalable)
      const { sites, microsites } = await generateDailyBlogPostsForAllSitesAndMicrosites();
      const sitePostsQueued = sites.filter((r) => r.postQueued).length;
      console.log(
        `[Scheduler] ${schedule.description} complete: ` +
          `${sitePostsQueued} site posts + ${microsites.postsQueued} microsite posts queued ` +
          `(${microsites.processedCount}/${microsites.totalMicrosites} microsites processed)`
      );
    } else {
      // Use new daily content generator
      const results = await generateDailyContent(schedule.type as ContentGenerationType);
      const contentQueued = results.filter((r) => r.queued).length;
      console.log(
        `[Scheduler] ${schedule.description} complete: ${contentQueued} items queued across ${results.length} sites`
      );
    }
  } catch (error) {
    console.error(`[Scheduler] ${schedule.description} generation failed:`, error);
  }
}

/**
 * Initialize weekly meta title maintenance schedule
 * Runs on Sundays at 8 AM to ensure all pages have proper meta titles
 */
function initializeMetaTitleMaintenanceSchedule(): void {
  // Check every hour if it's time to run maintenance
  metaTitleMaintenanceInterval = setInterval(
    async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDow = now.getDay();

      // Run on Sundays at 8 AM
      if (currentDow === 0 && currentHour === 8) {
        const today = now.toISOString().split('T')[0] ?? '';
        const lastRun = schedulesRunToday.get('meta-title-maintenance');

        if (lastRun !== today) {
          schedulesRunToday.set('meta-title-maintenance', today);
          console.log('[Scheduler] Running weekly meta title maintenance...');
          try {
            const result = await trackScheduledExecution('META_TITLE_MAINTENANCE', () =>
              runMetaTitleMaintenance()
            );
            console.log(
              `[Scheduler] Meta title maintenance complete: ${result.pagesFixed}/${result.totalPages} pages fixed`
            );
          } catch (error) {
            console.error('[Scheduler] Meta title maintenance failed:', error);
          }
        }
      }
    },
    60 * 60 * 1000 // Check every hour
  );
}

/**
 * Initialize microsite content refresh schedule
 * Refreshes 1% of active microsites per day (rotating)
 */
function initializeMicrositeContentRefreshSchedule(): void {
  micrositeContentRefreshInterval = setInterval(
    async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const today = now.toISOString().split('T')[0] ?? '';

      // Run at 6 AM
      if (currentHour === 6) {
        const lastRun = schedulesRunToday.get('microsite-content-refresh');
        if (lastRun !== today) {
          schedulesRunToday.set('microsite-content-refresh', today);
          console.log('[Scheduler] Running microsite content refresh...');
          try {
            await trackScheduledExecution('MICROSITE_CONTENT_REFRESH', () =>
              refreshMicrositeContent()
            );
          } catch (error) {
            console.error('[Scheduler] Microsite content refresh failed:', error);
          }
        }
      }
    },
    60 * 60 * 1000 // Check every hour
  );
}

/**
 * Refresh content for a rotating subset of microsites (1% per day)
 */
async function refreshMicrositeContent(): Promise<void> {
  const { prisma } = await import('@experience-marketplace/database');
  const { addJob } = await import('../queues/index.js');

  // Get count of active microsites
  const totalActive = await prisma.micrositeConfig.count({
    where: { status: 'ACTIVE' },
  });

  // Calculate 1% (minimum 1)
  const refreshCount = Math.max(1, Math.floor(totalActive * 0.01));

  // Get microsites ordered by last content update (oldest first)
  const micrositesToRefresh = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { lastContentUpdate: 'asc' },
    take: refreshCount,
    select: { id: true, fullDomain: true },
  });

  console.log(
    `[Scheduler] Refreshing ${micrositesToRefresh.length} of ${totalActive} active microsites`
  );

  for (const ms of micrositesToRefresh) {
    await addJob('MICROSITE_CONTENT_GENERATE' as any, {
      micrositeId: ms.id,
      contentTypes: ['homepage'],
      isRefresh: true,
    });
    console.log(`[Scheduler] Queued content refresh for ${ms.fullDomain}`);
  }
}

/**
 * Initialize curated collection refresh schedule
 * Runs daily at 5:30 AM, processing 5% of microsites per day (rotating)
 * This ensures each microsite gets its collections refreshed every ~20 days
 */
function initializeCollectionRefreshSchedule(): void {
  collectionRefreshInterval = setInterval(
    async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const today = now.toISOString().split('T')[0] ?? '';

      // Run daily at 5:30 AM
      if (currentHour === 5 && currentMinute >= 30 && currentMinute < 60) {
        const lastRun = schedulesRunToday.get('collection-refresh');
        if (lastRun !== today) {
          schedulesRunToday.set('collection-refresh', today);
          console.log('[Scheduler] Running daily curated collection refresh (5% rotation)...');
          try {
            const result = await trackScheduledExecution('COLLECTION_REFRESH', () =>
              refreshAllCollections()
            );
            console.log(
              `[Scheduler] Collection refresh complete: ${result.totalCreated} created, ${result.totalUpdated} updated across ${result.micrositesProcessed}/${result.totalMicrosites} microsites`
            );
          } catch (error) {
            console.error('[Scheduler] Collection refresh failed:', error);
          }
        }
      }
    },
    30 * 60 * 1000 // Check every 30 minutes
  );
}

/**
 * Initialize weekly microsite sitemap resubmission to GSC
 * Runs Sundays at 9 AM to keep Google's crawl queue fresh with latest content
 */
function initializeSitemapResubmitSchedule(): void {
  sitemapResubmitInterval = setInterval(
    async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDow = now.getDay();

      // Run on Sundays at 9 AM
      if (currentDow === 0 && currentHour === 9) {
        const today = now.toISOString().split('T')[0] ?? '';
        const lastRun = schedulesRunToday.get('sitemap-resubmit');

        if (lastRun !== today) {
          schedulesRunToday.set('sitemap-resubmit', today);
          console.log('[Scheduler] Running weekly microsite sitemap resubmission...');
          try {
            const result = await trackScheduledExecution('MICROSITE_SITEMAP_RESUBMIT', () =>
              resubmitMicrositeSitemapsToGSC()
            );
            console.log(
              `[Scheduler] Sitemap resubmission complete: ${result.submitted} submitted, ${result.skipped} skipped, ${result.errors} errors`
            );
          } catch (error) {
            console.error('[Scheduler] Sitemap resubmission failed:', error);
          }
        }
      }
    },
    60 * 60 * 1000 // Check every hour
  );
}

/**
 * Initialize periodic Redis cleanup to prevent OOM.
 * Runs every 6 hours, removing completed jobs older than 1 hour
 * and failed jobs older than 24 hours from all BullMQ queues.
 */
function initializeRedisCleanupSchedule(): void {
  // Run cleanup immediately on startup
  queueRegistry.cleanAllQueues().catch((err) => {
    console.error('[Scheduler] Initial Redis cleanup failed:', err);
  });

  // Then every 6 hours
  redisCleanupInterval = setInterval(
    async () => {
      try {
        await queueRegistry.cleanAllQueues();
      } catch (err) {
        console.error('[Scheduler] Redis cleanup failed:', err);
      }
    },
    6 * 60 * 60 * 1000 // 6 hours
  );
}

/**
 * Remove all scheduled jobs (useful for cleanup or reconfiguration)
 */
export async function removeAllScheduledJobs(): Promise<void> {
  console.log('[Scheduler] Removing all scheduled jobs...');

  await queueRegistry.removeRepeatableJob('GSC_SYNC', '0 */6 * * *');
  await queueRegistry.removeRepeatableJob('SEO_OPPORTUNITY_SCAN', '0 2 * * *');
  await queueRegistry.removeRepeatableJob('SEO_ANALYZE', '0 3 * * *');
  await queueRegistry.removeRepeatableJob('SEO_AUTO_OPTIMIZE', '0 6 * * 0');
  await queueRegistry.removeRepeatableJob('METRICS_AGGREGATE', '0 1 * * *');
  await queueRegistry.removeRepeatableJob('GA4_DAILY_SYNC' as any, '0 6 * * *');
  await queueRegistry.removeRepeatableJob('REFRESH_ANALYTICS_VIEWS' as any, '0 * * * *');
  await queueRegistry.removeRepeatableJob('MICROSITE_GSC_SYNC' as any, '0 7 * * *');
  await queueRegistry.removeRepeatableJob('MICROSITE_GA4_SYNC' as any, '30 7 * * *');
  await queueRegistry.removeRepeatableJob('MICROSITE_ANALYTICS_SYNC' as any, '0 8 * * *');
  await queueRegistry.removeRepeatableJob('PERFORMANCE_REPORT', '0 9 * * 1');
  await queueRegistry.removeRepeatableJob('ABTEST_REBALANCE', '0 * * * *');
  await queueRegistry.removeRepeatableJob('LINK_BACKLINK_MONITOR' as any, '0 3 * * 3');
  await queueRegistry.removeRepeatableJob('LINK_OPPORTUNITY_SCAN' as any, '0 2 * * 2');
  await queueRegistry.removeRepeatableJob('SOCIAL_DAILY_POSTING' as any, '0 5 * * *');

  // Clear daily content interval
  if (dailyContentInterval) {
    clearInterval(dailyContentInterval);
    dailyContentInterval = null;
  }

  // Clear meta title maintenance interval
  if (metaTitleMaintenanceInterval) {
    clearInterval(metaTitleMaintenanceInterval);
    metaTitleMaintenanceInterval = null;
  }

  // Clear microsite content refresh interval
  if (micrositeContentRefreshInterval) {
    clearInterval(micrositeContentRefreshInterval);
    micrositeContentRefreshInterval = null;
  }

  // Clear collection refresh interval
  if (collectionRefreshInterval) {
    clearInterval(collectionRefreshInterval);
    collectionRefreshInterval = null;
  }

  // Clear sitemap resubmit interval
  if (sitemapResubmitInterval) {
    clearInterval(sitemapResubmitInterval);
    sitemapResubmitInterval = null;
  }

  // Clear Redis cleanup interval
  if (redisCleanupInterval) {
    clearInterval(redisCleanupInterval);
    redisCleanupInterval = null;
  }

  // Clear schedule tracking
  schedulesRunToday.clear();

  console.log('[Scheduler] All scheduled jobs removed');
}

/**
 * Get list of all scheduled jobs with their cron patterns
 */
export function getScheduledJobs(): Array<{
  jobType: string;
  schedule: string;
  description: string;
}> {
  return [
    {
      jobType: 'METRICS_AGGREGATE',
      schedule: '0 1 * * *',
      description: 'Aggregate daily performance metrics and detect issues',
    },
    {
      jobType: 'GA4_DAILY_SYNC',
      schedule: '0 6 * * *',
      description: 'Sync GA4 traffic + booking data into SiteAnalyticsSnapshot',
    },
    {
      jobType: 'REFRESH_ANALYTICS_VIEWS',
      schedule: '0 * * * *',
      description: 'Refresh materialized views for analytics dashboard',
    },
    {
      jobType: 'SEO_OPPORTUNITY_SCAN',
      schedule: '0 2 * * *',
      description: 'Scan for new SEO opportunities across all sites',
    },
    {
      jobType: 'SEO_ANALYZE',
      schedule: '0 3 * * *',
      description: 'Daily SEO health audit with auto-optimization',
    },
    {
      jobType: 'DAILY_FAQ_GENERATE',
      schedule: '30 1 * * *',
      description: 'Generate FAQ hub pages from GSC queries and content',
    },
    {
      jobType: 'DAILY_CONTENT_REFRESH',
      schedule: '30 2 * * *',
      description: 'Refresh underperforming content based on SEO health',
    },
    {
      jobType: 'DAILY_BLOG_GENERATE',
      schedule: '0 4 * * *',
      description: 'Generate blog posts for sites (all) and microsites (5% daily rotation)',
    },
    {
      jobType: 'DAILY_DESTINATION_GENERATE',
      schedule: '30 5 * * *',
      description: 'Generate destination landing pages for key locations',
    },
    {
      jobType: 'DAILY_COMPARISON_GENERATE',
      schedule: '30 6 * * *',
      description: 'Generate comparison pages (X vs Y content)',
    },
    {
      jobType: 'DAILY_SEASONAL_GENERATE',
      schedule: '0 7 * * *',
      description: 'Generate seasonal and event-based content',
    },
    {
      jobType: 'WEEKLY_LOCAL_GUIDE_GENERATE',
      schedule: '30 4 * * 0',
      description: 'Generate comprehensive local guides (Sundays)',
    },
    {
      jobType: 'SEO_ANALYZE (deep)',
      schedule: '0 5 * * 0',
      description: 'Comprehensive full-site SEO audit',
    },
    {
      jobType: 'SEO_AUTO_OPTIMIZE',
      schedule: '0 6 * * 0',
      description: 'Auto-fix metadata, structured data, and thin content',
    },
    {
      jobType: 'META_TITLE_MAINTENANCE',
      schedule: '0 8 * * 0',
      description: 'Ensure all pages have SEO-optimized meta titles',
    },
    {
      jobType: 'GSC_SYNC',
      schedule: '0 */6 * * *',
      description: 'Sync Google Search Console data for all sites',
    },
    {
      jobType: 'PERFORMANCE_REPORT',
      schedule: '0 9 * * 1',
      description: 'Generate weekly performance report',
    },
    {
      jobType: 'LINK_OPPORTUNITY_SCAN',
      schedule: '0 2 * * 2',
      description: 'Scan competitor backlinks for link building opportunities',
    },
    {
      jobType: 'LINK_BACKLINK_MONITOR',
      schedule: '0 3 * * 3',
      description: 'Monitor existing backlinks for lost or broken links',
    },
    {
      jobType: 'ABTEST_REBALANCE',
      schedule: '0 * * * *',
      description: 'Rebalance A/B test traffic using Thompson sampling',
    },
    {
      jobType: 'AUTONOMOUS_ROADMAP',
      schedule: '*/5 * * * *',
      description: 'Process site roadmaps and queue next lifecycle tasks',
    },
    // Microsite System
    {
      jobType: 'SUPPLIER_SYNC',
      schedule: '0 2 * * *',
      description: 'Sync suppliers from Holibob API (discovered via products)',
    },
    {
      jobType: 'PRODUCT_SYNC',
      schedule: '30 3 * * *',
      description: 'Sync products from Holibob API to local cache',
    },
    {
      jobType: 'MICROSITE_CONTENT_REFRESH',
      schedule: '0 6 * * *',
      description: 'Refresh 1% of microsite content daily (rotating)',
    },
    {
      jobType: 'MICROSITE_GSC_SYNC',
      schedule: '0 7 * * *',
      description: 'Sync GSC search data for all microsites from parent domain property',
    },
    {
      jobType: 'MICROSITE_GA4_SYNC',
      schedule: '30 7 * * *',
      description: 'Sync GA4 traffic data for all microsites from shared property',
    },
    {
      jobType: 'MICROSITE_ANALYTICS_SYNC',
      schedule: '0 8 * * *',
      description: 'Create daily analytics snapshots for microsites (aggregates GSC data)',
    },
    {
      jobType: 'MICROSITE_HEALTH_CHECK',
      schedule: '30 8 * * 0',
      description: 'Check microsites for issues (missing content, deleted suppliers)',
    },
    {
      jobType: 'MICROSITE_SITEMAP_RESUBMIT',
      schedule: '0 9 * * 0',
      description: 'Resubmit all active microsite sitemaps to GSC (weekly)',
    },
    {
      jobType: 'COLLECTION_REFRESH',
      schedule: '30 5 * * *',
      description: 'Refresh AI-curated collections for 5% of microsites daily (rotating)',
    },
    // Social Media
    {
      jobType: 'SOCIAL_DAILY_POSTING',
      schedule: '0 5 * * *',
      description: 'Smart staggered social posting: 7/day cap, timezone-aware, content rotation',
    },
    // Paid Traffic & Bidding Engine
    {
      jobType: 'PAID_KEYWORD_SCAN',
      schedule: '0 4 * * *',
      description: 'Discover low-CPC keyword opportunities from GSC, DataForSEO, Meta, Pinterest, microsites',
    },
    {
      jobType: 'BIDDING_ENGINE_RUN',
      schedule: '0 3 * * *',
      description: 'Calculate site profitability, score keywords, create ad campaigns',
    },
    {
      jobType: 'AD_CAMPAIGN_SYNC',
      schedule: '0 */3 * * *',
      description: 'Sync Meta + Google Ads performance into AdCampaign/AdDailyMetric + run alert checks',
    },
    {
      jobType: 'AD_CONVERSION_UPLOAD',
      schedule: '0 */2 * * *',
      description: 'Upload booking conversions to Meta/Google via server-side CAPI',
    },
    {
      jobType: 'AD_PERFORMANCE_REPORT',
      schedule: '0 9 * * *',
      description: 'Portfolio-wide ad performance analysis and ROAS reporting',
    },
    {
      jobType: 'AD_BUDGET_OPTIMIZER',
      schedule: '0 10 * * *',
      description: 'Auto-pause underperformers, scale winners, reallocate budget',
    },
    // Maintenance
    {
      jobType: 'REDIS_QUEUE_CLEANUP',
      schedule: '0 */6 * * *',
      description: 'Clean old completed/failed jobs from Redis to prevent OOM (25 MB limit)',
    },
  ];
}
