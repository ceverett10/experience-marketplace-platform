import { scheduleJob, queueRegistry } from '../queues';
import { generateDailyBlogPostsForAllSites } from '../services/daily-blog-generator.js';
import {
  generateDailyContent,
  ContentGenerationType,
} from '../services/daily-content-generator.js';
import { runMetaTitleMaintenance } from '../services/meta-title-maintenance.js';

// Track intervals for cleanup
let dailyContentInterval: NodeJS.Timeout | null = null;
let metaTitleMaintenanceInterval: NodeJS.Timeout | null = null;

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
        const isCorrectDay =
          schedule.dayOfWeek === undefined || schedule.dayOfWeek === currentDow;

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
      // Use existing blog generator
      const results = await generateDailyBlogPostsForAllSites();
      const postsQueued = results.filter((r) => r.postQueued).length;
      console.log(
        `[Scheduler] ${schedule.description} complete: ${postsQueued} posts queued across ${results.length} sites`
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
            const result = await runMetaTitleMaintenance();
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
      description: 'Generate 1 blog post per site daily for SEO authority',
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
  ];
}
