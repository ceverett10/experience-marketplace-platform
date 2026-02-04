import { scheduleJob, queueRegistry } from '../queues';
import { generateWeeklyBlogPostsForAllSites } from '../services/weekly-blog-generator.js';

// Track interval for cleanup
let weeklyBlogInterval: NodeJS.Timeout | null = null;

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

  // Metrics Aggregation - Daily at 1 AM
  await scheduleJob(
    'METRICS_AGGREGATE',
    {
      aggregationType: 'daily',
    },
    '0 1 * * *' // Daily at 1 AM
  );
  console.log('[Scheduler] ✓ Metrics Aggregation - Daily at 1 AM');

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

  // Weekly Blog Generation - Mondays and Thursdays at 4 AM
  // Uses setInterval with cron-like scheduling since it doesn't need job queue tracking
  initializeWeeklyBlogSchedule();
  console.log('[Scheduler] ✓ Weekly Blog Generation - Mon/Thu at 4 AM');

  console.log('[Scheduler] All scheduled jobs initialized successfully');
}

/**
 * Initialize weekly blog generation schedule
 * Runs on Mondays and Thursdays at 4 AM to generate 3-4 blog posts per site
 * This builds site authority through consistent content publishing
 */
function initializeWeeklyBlogSchedule(): void {
  // Check every hour if it's time to generate blog posts
  // Generates on Monday (1) and Thursday (4) at 4 AM
  weeklyBlogInterval = setInterval(
    async () => {
      const now = new Date();
      const day = now.getDay(); // 0 = Sunday, 1 = Monday, 4 = Thursday
      const hour = now.getHours();

      // Run on Monday and Thursday at 4 AM
      if ((day === 1 || day === 4) && hour === 4) {
        console.log('[Scheduler] Starting weekly blog generation...');
        try {
          const results = await generateWeeklyBlogPostsForAllSites();
          const totalPosts = results.reduce((sum, r) => sum + r.postsQueued, 0);
          console.log(
            `[Scheduler] Weekly blog generation complete: ${totalPosts} posts queued across ${results.length} sites`
          );
        } catch (error) {
          console.error('[Scheduler] Weekly blog generation failed:', error);
        }
      }
    },
    60 * 60 * 1000
  ); // Check every hour

  // Also check immediately on startup if it's the right time
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  if ((day === 1 || day === 4) && hour === 4) {
    console.log('[Scheduler] Running immediate weekly blog check on startup...');
    generateWeeklyBlogPostsForAllSites().catch(console.error);
  }
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
  await queueRegistry.removeRepeatableJob('PERFORMANCE_REPORT', '0 9 * * 1');
  await queueRegistry.removeRepeatableJob('ABTEST_REBALANCE', '0 * * * *');
  await queueRegistry.removeRepeatableJob('LINK_BACKLINK_MONITOR' as any, '0 3 * * 3');
  await queueRegistry.removeRepeatableJob('LINK_OPPORTUNITY_SCAN' as any, '0 2 * * 2');

  // Clear weekly blog interval
  if (weeklyBlogInterval) {
    clearInterval(weeklyBlogInterval);
    weeklyBlogInterval = null;
  }

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
      jobType: 'WEEKLY_BLOG_GENERATE',
      schedule: '0 4 * * 1,4',
      description: 'Generate 3-4 blog posts per site for authority building',
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
  ];
}
