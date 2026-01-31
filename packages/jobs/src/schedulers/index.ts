import { scheduleJob, queueRegistry } from '../queues';

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

  // Performance Analysis - Daily at 3 AM
  await scheduleJob(
    'SEO_ANALYZE',
    {
      siteId: 'all',
      fullSiteAudit: false,
    },
    '0 3 * * *' // Daily at 3 AM
  );
  console.log('[Scheduler] ✓ SEO Analysis - Daily at 3 AM');

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

  console.log('[Scheduler] All scheduled jobs initialized successfully');
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
      description: 'Site SEO analysis - Daily at 3 AM',
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
  ];
}
