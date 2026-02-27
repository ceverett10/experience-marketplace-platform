import { scheduleJob, queueRegistry } from '../queues';
import type { ContentGenerationType } from '../services/daily-content-generator.js';

/**
 * Calculate the next run time for a cron expression.
 * Supports standard 5-field cron: minute hour dayOfMonth month dayOfWeek
 */
export function getNextCronRun(cron: string): Date {
  const parts = cron.split(' ');
  if (parts.length !== 5) return new Date();

  const [minuteExpr, hourExpr, , , dowExpr] = parts;
  const now = new Date();

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

  return now;
}

/**
 * Content generation schedule configuration (reference for fanout job types)
 */
interface ContentSchedule {
  fanoutJobType: string;
  contentType: ContentGenerationType | 'blog';
  cron: string;
  description: string;
}

const CONTENT_SCHEDULES: ContentSchedule[] = [
  {
    fanoutJobType: 'CONTENT_FAQ_FANOUT',
    contentType: 'faq_hub',
    cron: '30 1 * * *',
    description: 'FAQ Hub Pages',
  },
  {
    fanoutJobType: 'CONTENT_REFRESH_FANOUT',
    contentType: 'content_refresh',
    cron: '30 2 * * *',
    description: 'Content Refresh',
  },
  {
    fanoutJobType: 'CONTENT_BLOG_FANOUT',
    contentType: 'blog',
    cron: '0 4 * * *',
    description: 'Daily Blog',
  },
  {
    fanoutJobType: 'CONTENT_GUIDES_FANOUT',
    contentType: 'local_guide',
    cron: '30 4 * * 0',
    description: 'Local Guides (Weekly)',
  },
  {
    fanoutJobType: 'CONTENT_DESTINATION_FANOUT',
    contentType: 'destination_landing',
    cron: '30 5 * * *',
    description: 'Destination Landing',
  },
  {
    fanoutJobType: 'CONTENT_COMPARISON_FANOUT',
    contentType: 'comparison',
    cron: '30 6 * * *',
    description: 'Comparison Pages',
  },
  {
    fanoutJobType: 'CONTENT_SEASONAL_FANOUT',
    contentType: 'seasonal_event',
    cron: '0 7 * * *',
    description: 'Seasonal Content',
  },
];

/**
 * Refresh content for a rotating subset of microsites (1% per day).
 * Called by the MICROSITE_CONTENT_REFRESH BullMQ repeatable handler.
 */
export async function refreshMicrositeContent(): Promise<void> {
  const { prisma } = await import('@experience-marketplace/database');
  const { addJob } = await import('../queues/index.js');

  const totalActive = await prisma.micrositeConfig.count({
    where: { status: 'ACTIVE' },
  });

  const refreshCount = Math.max(1, Math.floor(totalActive * 0.01));

  const micrositesToRefresh = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { lastContentUpdate: 'asc' },
    take: refreshCount,
    select: { id: true, fullDomain: true },
  });

  console.info(
    `[Scheduler] Refreshing ${micrositesToRefresh.length} of ${totalActive} active microsites`
  );

  for (const ms of micrositesToRefresh) {
    await addJob('MICROSITE_CONTENT_GENERATE' as any, {
      micrositeId: ms.id,
      contentTypes: ['homepage'],
      isRefresh: true,
    });
    console.info(`[Scheduler] Queued content refresh for ${ms.fullDomain}`);
  }
}

/**
 * Initialize scheduled/recurring jobs.
 *
 * ALL schedules use BullMQ repeatable jobs stored in Redis. This means:
 * - Schedules survive dyno restarts (no in-memory state to lose)
 * - No duplicate firing (BullMQ handles dedup via repeatable key)
 * - Exact cron timing (no polling with setInterval)
 */
export async function initializeScheduledJobs(): Promise<void> {
  console.info('[Scheduler] Initializing scheduled jobs...');

  // =========================================================================
  // SEO & ANALYTICS
  // =========================================================================

  await scheduleJob(
    'GSC_SYNC',
    { siteId: 'all', dimensions: ['query', 'page', 'country', 'device'] },
    '0 */6 * * *'
  );
  console.info('[Scheduler] ✓ GSC Sync - Every 6 hours');

  console.info('[Scheduler] ⏸ Opportunity Scan - PAUSED (DataForSEO)');

  await scheduleJob(
    'SEO_ANALYZE',
    { siteId: 'all', fullSiteAudit: false, triggerOptimizations: true },
    '0 3 * * *'
  );
  console.info('[Scheduler] ✓ SEO Health Audit - Daily at 3 AM');

  await scheduleJob(
    'SEO_ANALYZE',
    { siteId: 'all', fullSiteAudit: true, forceAudit: true, triggerOptimizations: true },
    '0 5 * * 0'
  );
  console.info('[Scheduler] ✓ Weekly Deep SEO Audit - Sundays at 5 AM');

  await scheduleJob('SEO_AUTO_OPTIMIZE', { siteId: 'all', scope: 'all' }, '0 4 * * *');
  console.info('[Scheduler] ✓ Daily SEO Auto-Optimization - Daily at 4 AM');

  await scheduleJob('METRICS_AGGREGATE', { aggregationType: 'daily' }, '0 1 * * *');
  console.info('[Scheduler] ✓ Metrics Aggregation - Daily at 1 AM');

  await scheduleJob('GA4_DAILY_SYNC' as any, {} as any, '0 6 * * *');
  console.info('[Scheduler] ✓ GA4 Daily Sync - Daily at 6 AM');

  await scheduleJob('REFRESH_ANALYTICS_VIEWS' as any, {} as any, '0 * * * *');
  console.info('[Scheduler] ✓ Refresh Analytics Views - Hourly');

  await scheduleJob('MICROSITE_GSC_SYNC' as any, {} as any, '0 7 * * *');
  console.info('[Scheduler] ✓ Microsite GSC Sync - Daily at 7 AM');

  await scheduleJob('MICROSITE_GA4_SYNC' as any, {} as any, '30 7 * * *');
  console.info('[Scheduler] ✓ Microsite GA4 Sync - Daily at 7:30 AM');

  await scheduleJob('MICROSITE_ANALYTICS_SYNC' as any, {} as any, '0 8 * * *');
  console.info('[Scheduler] ✓ Microsite Analytics Sync - Daily at 8 AM');

  await scheduleJob('PERFORMANCE_REPORT', { reportType: 'weekly' }, '0 9 * * 1');
  console.info('[Scheduler] ✓ Weekly Report - Mondays at 9 AM');

  await scheduleJob(
    'ABTEST_REBALANCE',
    { abTestId: 'all', algorithm: 'thompson_sampling' },
    '0 * * * *'
  );
  console.info('[Scheduler] ✓ A/B Test Rebalancing - Every hour');

  // =========================================================================
  // LINK BUILDING
  // =========================================================================

  await scheduleJob('LINK_BACKLINK_MONITOR' as any, { siteId: 'all' }, '0 3 1,15 * *');
  console.info('[Scheduler] ✓ Backlink Monitor - 1st & 15th at 3 AM');

  await scheduleJob('LINK_OPPORTUNITY_SCAN' as any, { siteId: 'all' }, '0 2 1 * *');
  console.info('[Scheduler] ✓ Link Opportunity Scan - 1st at 2 AM');

  await scheduleJob(
    'CROSS_SITE_LINK_ENRICHMENT' as any,
    { percentagePerRun: 5 } as any,
    '0 21 * * *'
  );
  console.info('[Scheduler] ✓ Cross-Site Link Enrichment - Daily at 9 PM');

  await scheduleJob('LINK_COMPETITOR_DISCOVERY' as any, { maxSites: 20 } as any, '0 4 1 * *');
  console.info('[Scheduler] ✓ Competitor Discovery - Monthly 1st at 4 AM');

  await scheduleJob('LINK_BROKEN_LINK_SCAN' as any, { maxDomains: 20 } as any, '0 4 15 * *');
  console.info('[Scheduler] ✓ Broken Link Scan - Monthly 15th at 4 AM');

  await scheduleJob('LINK_CONTENT_GAP_ANALYSIS' as any, { maxSites: 10 } as any, '0 4 20 * *');
  console.info('[Scheduler] ✓ Content Gap Analysis - Monthly 20th at 4 AM');

  // =========================================================================
  // CONTENT GENERATION (BullMQ repeatable fanout — replaces setInterval)
  // =========================================================================

  for (const schedule of CONTENT_SCHEDULES) {
    await scheduleJob(schedule.fanoutJobType as any, {} as any, schedule.cron);
    console.info(`[Scheduler] ✓ ${schedule.description} - ${schedule.cron}`);
  }

  await scheduleJob('META_TITLE_MAINTENANCE' as any, {} as any, '0 8 * * 0');
  console.info('[Scheduler] ✓ Weekly Meta Title Maintenance - Sundays at 8 AM');

  // =========================================================================
  // MICROSITE SYSTEM
  // =========================================================================

  await scheduleJob('SUPPLIER_SYNC' as any, { forceSync: false }, '0 2 * * *');
  console.info('[Scheduler] ✓ Supplier Sync - Daily at 2 AM');

  await scheduleJob('PRODUCT_SYNC' as any, { forceSync: false }, '30 3 * * 0');
  console.info('[Scheduler] ✓ Product Sync - Weekly Sundays at 3:30 AM');

  await scheduleJob('MICROSITE_CONTENT_REFRESH' as any, {} as any, '0 6 * * *');
  console.info('[Scheduler] ✓ Microsite Content Refresh - Daily at 6 AM');

  await scheduleJob('MICROSITE_HEALTH_CHECK' as any, {}, '30 8 * * 0');
  console.info('[Scheduler] ✓ Microsite Health Check - Sundays at 8:30 AM');

  await scheduleJob('SUPPLIER_ENRICH' as any, {} as any, '0 1 * * 1');
  console.info('[Scheduler] ✓ Supplier Enrichment - Mondays at 1 AM');

  await scheduleJob('MICROSITE_SITEMAP_RESUBMIT' as any, {} as any, '0 9 * * 0');
  console.info('[Scheduler] ✓ Microsite Sitemap Resubmit - Sundays at 9 AM');

  await scheduleJob('COLLECTION_REFRESH' as any, {} as any, '30 5 * * *');
  console.info('[Scheduler] ✓ Collection Refresh - Daily at 5:30 AM');

  // =========================================================================
  // SOCIAL MEDIA
  // =========================================================================

  await scheduleJob('SOCIAL_DAILY_POSTING' as any, {} as any, '0 5 * * *');
  console.info('[Scheduler] ✓ Social Daily Posting - Daily at 5 AM UTC');

  // =========================================================================
  // PAID TRAFFIC
  // =========================================================================

  const { PAID_TRAFFIC_CONFIG } = await import('../config/paid-traffic.js');

  await scheduleJob(
    'PAID_KEYWORD_SCAN' as any,
    {
      maxCpc: PAID_TRAFFIC_CONFIG.maxCpc,
      minVolume: PAID_TRAFFIC_CONFIG.minVolume,
      modes: ['gsc', 'expansion', 'discovery', 'pinterest', 'meta'],
    },
    '0 3 * * 2'
  );
  console.info('[Scheduler] ✓ Paid Keyword Scanner - Tuesdays at 3 AM');

  console.info('[Scheduler] ⏸ Bidding Engine Run - PAUSED');

  await scheduleJob('AD_CAMPAIGN_SYNC' as any, {}, '0 * * * *');
  console.info('[Scheduler] ✓ Ad Campaign Sync - Hourly');

  await scheduleJob('AD_CONVERSION_UPLOAD' as any, {}, '0 */2 * * *');
  console.info('[Scheduler] ✓ Ad Conversion Upload - Every 2 hours');

  await scheduleJob('AD_PLATFORM_IDS_SYNC' as any, {}, '0 2 * * 1');
  console.info('[Scheduler] + Ad Platform IDs Sync - Mondays at 2 AM');

  await scheduleJob('AD_PERFORMANCE_REPORT' as any, {}, '0 9 * * *');
  console.info('[Scheduler] ✓ Ad Performance Report - Daily at 9 AM');

  await scheduleJob('AD_BUDGET_OPTIMIZER' as any, {}, '0 10 * * *');
  console.info('[Scheduler] ✓ Ad Budget Optimizer - Daily at 10 AM');

  await scheduleJob('AD_CREATIVE_REFRESH' as any, {}, '0 6 * * 3');
  console.info('[Scheduler] ✓ Ad Creative Refresh - Wednesdays at 6 AM');

  await scheduleJob('AD_SEARCH_TERM_HARVEST' as any, {}, '0 4 * * 4');
  console.info('[Scheduler] ✓ Ad Search Term Harvest - Thursdays at 4 AM');

  // =========================================================================
  // MAINTENANCE
  // =========================================================================

  await scheduleJob('PIPELINE_HEALTH_CHECK' as any, {} as any, '0 9 * * *');
  console.info('[Scheduler] ✓ Pipeline Health Check - Daily at 9 AM');

  await scheduleJob('REDIS_QUEUE_CLEANUP' as any, {} as any, '0 * * * *');
  console.info('[Scheduler] ✓ Redis Queue Cleanup - Hourly');

  // Run initial cleanup immediately on startup
  queueRegistry.cleanAllQueues().catch((err) => {
    console.error('[Scheduler] Initial Redis cleanup failed:', err);
  });

  console.info('[Scheduler] All scheduled jobs initialized successfully');
}

/**
 * Remove all scheduled jobs (useful for cleanup or reconfiguration).
 * Removes all BullMQ repeatable jobs.
 */
export async function removeAllScheduledJobs(): Promise<void> {
  console.info('[Scheduler] Removing all scheduled jobs...');

  // SEO & Analytics
  await queueRegistry.removeRepeatableJob('GSC_SYNC', '0 */6 * * *');
  await queueRegistry.removeRepeatableJob('SEO_ANALYZE', '0 3 * * *');
  await queueRegistry.removeRepeatableJob('SEO_ANALYZE', '0 5 * * 0');
  await queueRegistry.removeRepeatableJob('SEO_AUTO_OPTIMIZE', '0 4 * * *');
  await queueRegistry.removeRepeatableJob('METRICS_AGGREGATE', '0 1 * * *');
  await queueRegistry.removeRepeatableJob('GA4_DAILY_SYNC' as any, '0 6 * * *');
  await queueRegistry.removeRepeatableJob('REFRESH_ANALYTICS_VIEWS' as any, '0 * * * *');
  await queueRegistry.removeRepeatableJob('MICROSITE_GSC_SYNC' as any, '0 7 * * *');
  await queueRegistry.removeRepeatableJob('MICROSITE_GA4_SYNC' as any, '30 7 * * *');
  await queueRegistry.removeRepeatableJob('MICROSITE_ANALYTICS_SYNC' as any, '0 8 * * *');
  await queueRegistry.removeRepeatableJob('PERFORMANCE_REPORT', '0 9 * * 1');
  await queueRegistry.removeRepeatableJob('ABTEST_REBALANCE', '0 * * * *');

  // Link building
  await queueRegistry.removeRepeatableJob('LINK_BACKLINK_MONITOR' as any, '0 3 1,15 * *');
  await queueRegistry.removeRepeatableJob('LINK_OPPORTUNITY_SCAN' as any, '0 2 1 * *');
  await queueRegistry.removeRepeatableJob('CROSS_SITE_LINK_ENRICHMENT' as any, '0 21 * * *');
  await queueRegistry.removeRepeatableJob('LINK_COMPETITOR_DISCOVERY' as any, '0 4 1 * *');
  await queueRegistry.removeRepeatableJob('LINK_BROKEN_LINK_SCAN' as any, '0 4 15 * *');
  await queueRegistry.removeRepeatableJob('LINK_CONTENT_GAP_ANALYSIS' as any, '0 4 20 * *');

  // Content fanout
  for (const schedule of CONTENT_SCHEDULES) {
    await queueRegistry.removeRepeatableJob(schedule.fanoutJobType as any, schedule.cron);
  }
  await queueRegistry.removeRepeatableJob('META_TITLE_MAINTENANCE' as any, '0 8 * * 0');

  // Microsite
  await queueRegistry.removeRepeatableJob('SUPPLIER_SYNC' as any, '0 2 * * *');
  await queueRegistry.removeRepeatableJob('PRODUCT_SYNC' as any, '30 3 * * 0');
  await queueRegistry.removeRepeatableJob('MICROSITE_CONTENT_REFRESH' as any, '0 6 * * *');
  await queueRegistry.removeRepeatableJob('MICROSITE_HEALTH_CHECK' as any, '30 8 * * 0');
  await queueRegistry.removeRepeatableJob('MICROSITE_SITEMAP_RESUBMIT' as any, '0 9 * * 0');
  await queueRegistry.removeRepeatableJob('COLLECTION_REFRESH' as any, '30 5 * * *');
  await queueRegistry.removeRepeatableJob('SUPPLIER_ENRICH' as any, '0 1 * * 1');

  // Social
  await queueRegistry.removeRepeatableJob('SOCIAL_DAILY_POSTING' as any, '0 5 * * *');

  // Paid traffic
  await queueRegistry.removeRepeatableJob('PAID_KEYWORD_SCAN' as any, '0 3 * * 2');
  await queueRegistry.removeRepeatableJob('AD_CAMPAIGN_SYNC' as any, '0 * * * *');
  await queueRegistry.removeRepeatableJob('AD_CONVERSION_UPLOAD' as any, '0 */2 * * *');
  await queueRegistry.removeRepeatableJob('AD_PLATFORM_IDS_SYNC' as any, '0 2 * * 1');
  await queueRegistry.removeRepeatableJob('AD_PERFORMANCE_REPORT' as any, '0 9 * * *');
  await queueRegistry.removeRepeatableJob('AD_BUDGET_OPTIMIZER' as any, '0 10 * * *');
  await queueRegistry.removeRepeatableJob('AD_CREATIVE_REFRESH' as any, '0 6 * * 3');
  await queueRegistry.removeRepeatableJob('AD_SEARCH_TERM_HARVEST' as any, '0 4 * * 4');

  // Maintenance
  await queueRegistry.removeRepeatableJob('PIPELINE_HEALTH_CHECK' as any, '0 9 * * *');
  await queueRegistry.removeRepeatableJob('REDIS_QUEUE_CLEANUP' as any, '0 * * * *');

  console.info('[Scheduler] All scheduled jobs removed');
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
      jobType: 'SEO_ANALYZE',
      schedule: '0 3 * * *',
      description: 'Daily SEO health audit with auto-optimization',
    },
    {
      jobType: 'CONTENT_FAQ_FANOUT',
      schedule: '30 1 * * *',
      description: 'Generate FAQ hub pages from GSC queries and content',
    },
    {
      jobType: 'CONTENT_REFRESH_FANOUT',
      schedule: '30 2 * * *',
      description: 'Refresh underperforming content based on SEO health',
    },
    {
      jobType: 'CONTENT_BLOG_FANOUT',
      schedule: '0 4 * * *',
      description: 'Generate blog posts for sites and microsites (5% daily rotation)',
    },
    {
      jobType: 'CONTENT_DESTINATION_FANOUT',
      schedule: '30 5 * * *',
      description: 'Generate destination landing pages for key locations',
    },
    {
      jobType: 'CONTENT_COMPARISON_FANOUT',
      schedule: '30 6 * * *',
      description: 'Generate comparison pages (X vs Y content)',
    },
    {
      jobType: 'CONTENT_SEASONAL_FANOUT',
      schedule: '0 7 * * *',
      description: 'Generate seasonal and event-based content',
    },
    {
      jobType: 'CONTENT_GUIDES_FANOUT',
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
      schedule: '0 4 * * *',
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
      schedule: '0 2 1 * *',
      description: 'Scan competitor backlinks for link building opportunities (monthly)',
    },
    {
      jobType: 'LINK_BACKLINK_MONITOR',
      schedule: '0 3 1,15 * *',
      description: 'Monitor existing backlinks for lost or broken links (biweekly)',
    },
    {
      jobType: 'CROSS_SITE_LINK_ENRICHMENT',
      schedule: '0 21 * * *',
      description: 'Batch inject cross-site links into existing blog posts (5% per day)',
    },
    {
      jobType: 'LINK_COMPETITOR_DISCOVERY',
      schedule: '0 4 1 * *',
      description: 'Discover competitors from SERP data (monthly)',
    },
    {
      jobType: 'LINK_BROKEN_LINK_SCAN',
      schedule: '0 4 15 * *',
      description: 'Scan competitor domains for broken links (monthly)',
    },
    {
      jobType: 'LINK_CONTENT_GAP_ANALYSIS',
      schedule: '0 4 20 * *',
      description: 'Analyze keyword gaps for linkable assets (monthly)',
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
    {
      jobType: 'SUPPLIER_SYNC',
      schedule: '0 2 * * *',
      description: 'Sync suppliers from Holibob API',
    },
    {
      jobType: 'PRODUCT_SYNC',
      schedule: '30 3 * * 0',
      description: 'Weekly incremental product sync from Holibob API',
    },
    {
      jobType: 'MICROSITE_CONTENT_REFRESH',
      schedule: '0 6 * * *',
      description: 'Refresh 1% of microsite content daily (rotating)',
    },
    {
      jobType: 'MICROSITE_GSC_SYNC',
      schedule: '0 7 * * *',
      description: 'Sync GSC search data for all microsites',
    },
    {
      jobType: 'MICROSITE_GA4_SYNC',
      schedule: '30 7 * * *',
      description: 'Sync GA4 traffic data for all microsites',
    },
    {
      jobType: 'MICROSITE_ANALYTICS_SYNC',
      schedule: '0 8 * * *',
      description: 'Create daily analytics snapshots for microsites',
    },
    {
      jobType: 'MICROSITE_HEALTH_CHECK',
      schedule: '30 8 * * 0',
      description: 'Check microsites for issues',
    },
    {
      jobType: 'MICROSITE_SITEMAP_RESUBMIT',
      schedule: '0 9 * * 0',
      description: 'Resubmit all active microsite sitemaps to GSC (weekly)',
    },
    {
      jobType: 'COLLECTION_REFRESH',
      schedule: '30 5 * * *',
      description: 'Refresh AI-curated collections for 5% of microsites daily',
    },
    {
      jobType: 'SOCIAL_DAILY_POSTING',
      schedule: '0 5 * * *',
      description: 'Smart staggered social posting: 7/day cap, timezone-aware',
    },
    {
      jobType: 'PAID_KEYWORD_SCAN',
      schedule: '0 3 * * 2',
      description: 'Discover low-CPC keyword opportunities',
    },
    {
      jobType: 'AD_CAMPAIGN_SYNC',
      schedule: '0 * * * *',
      description: 'Sync Meta + Google Ads performance data',
    },
    {
      jobType: 'AD_CONVERSION_UPLOAD',
      schedule: '0 */2 * * *',
      description: 'Upload booking conversions to Meta/Google via CAPI',
    },
    {
      jobType: 'AD_PERFORMANCE_REPORT',
      schedule: '0 9 * * *',
      description: 'Portfolio-wide ad performance analysis',
    },
    {
      jobType: 'AD_BUDGET_OPTIMIZER',
      schedule: '0 10 * * *',
      description: 'Auto-pause underperformers, scale winners',
    },
    {
      jobType: 'SUPPLIER_ENRICH',
      schedule: '0 1 * * 1',
      description: 'Enrich supplier city/category data from Holibob products (Mondays)',
    },
    {
      jobType: 'PIPELINE_HEALTH_CHECK',
      schedule: '0 9 * * *',
      description: 'Verify integrity of campaign pipeline phases',
    },
    {
      jobType: 'REDIS_QUEUE_CLEANUP',
      schedule: '0 * * * *',
      description: 'Clean old completed/failed jobs from Redis',
    },
  ];
}
