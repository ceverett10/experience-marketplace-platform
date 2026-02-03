import { scheduleJob, queueRegistry } from '../queues';
import { generateWeeklyBlogPostsForAllSites } from '../services/weekly-blog-generator.js';

// Track interval for cleanup
let weeklyBlogInterval: NodeJS.Timeout | null = null;

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
  await queueRegistry.removeRepeatableJob('METRICS_AGGREGATE', '0 1 * * *');
  await queueRegistry.removeRepeatableJob('PERFORMANCE_REPORT', '0 9 * * 1');
  await queueRegistry.removeRepeatableJob('ABTEST_REBALANCE', '0 * * * *');

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
      jobType: 'GSC_SYNC',
      schedule: '0 */6 * * *',
      description: 'Google Search Console data sync - Every 6 hours',
    },
    {
      jobType: 'SEO_OPPORTUNITY_SCAN',
      schedule: '0 2 * * *',
      description: 'SEO opportunity identification - Daily at 2 AM',
    },
    {
      jobType: 'SEO_ANALYZE',
      schedule: '0 3 * * *',
      description: 'SEO health audit with auto-optimization - Daily at 3 AM',
    },
    {
      jobType: 'SEO_ANALYZE (deep)',
      schedule: '0 5 * * 0',
      description: 'Comprehensive SEO audit - Sundays at 5 AM',
    },
    {
      jobType: 'METRICS_AGGREGATE',
      schedule: '0 1 * * *',
      description: 'Daily metrics aggregation - Daily at 1 AM',
    },
    {
      jobType: 'PERFORMANCE_REPORT',
      schedule: '0 9 * * 1',
      description: 'Weekly performance report - Mondays at 9 AM',
    },
    {
      jobType: 'ABTEST_REBALANCE',
      schedule: '0 * * * *',
      description: 'A/B test traffic rebalancing - Every hour',
    },
    {
      jobType: 'WEEKLY_BLOG_GENERATE',
      schedule: '0 4 * * 1,4',
      description: 'Weekly blog post generation - Mondays and Thursdays at 4 AM',
    },
  ];
}
