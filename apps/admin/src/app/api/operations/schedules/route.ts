export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getScheduledJobs, getNextCronRun, addJob } from '@experience-marketplace/jobs';

/**
 * GET /api/operations/schedules
 * Returns all scheduled jobs with execution history and next run times
 */

// Map orchestrator display types to their actual DB-tracked child types.
// Daily content schedules use setInterval to orchestrate, but the actual work
// is tracked as CONTENT_GENERATE jobs via addJob(). Show the most recent run.
const TYPE_ALIASES: Record<string, string> = {
  DAILY_FAQ_GENERATE: 'CONTENT_GENERATE',
  DAILY_CONTENT_REFRESH: 'CONTENT_GENERATE',
  DAILY_BLOG_GENERATE: 'CONTENT_GENERATE',
  DAILY_DESTINATION_GENERATE: 'CONTENT_GENERATE',
  DAILY_COMPARISON_GENERATE: 'CONTENT_GENERATE',
  DAILY_SEASONAL_GENERATE: 'CONTENT_GENERATE',
  WEEKLY_LOCAL_GUIDE_GENERATE: 'CONTENT_GENERATE',
  WEEKLY_BLOG_GENERATE: 'CONTENT_GENERATE',
};

export async function GET(): Promise<NextResponse> {
  try {
    const scheduledJobs = getScheduledJobs();

    // For each scheduled job, get execution history
    const jobsWithHistory = await Promise.all(
      scheduledJobs.map(async (sj) => {
        // Handle "SEO_ANALYZE (deep)" style names
        const jobType = sj.jobType.replace(' (deep)', '');
        // Resolve aliased types to their actual DB type
        const dbType = TYPE_ALIASES[jobType] || jobType;

        let executions: any[] = [];
        try {
          executions = await prisma.job.findMany({
            where: { type: dbType as any },
            select: {
              id: true,
              status: true,
              error: true,
              attempts: true,
              createdAt: true,
              startedAt: true,
              completedAt: true,
              site: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          });
        } catch {
          // Job type may not exist in DB yet, that's ok
        }

        const lastExecution = executions[0] || null;
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isRunning = executions.some(
          (e) => e.status === 'RUNNING' || (e.status === 'PENDING' && e.createdAt > fiveMinutesAgo)
        );
        const nextRun = getNextCronRun(sj.schedule);

        return {
          jobType: sj.jobType,
          schedule: sj.schedule,
          description: sj.description,
          nextRun: nextRun.toISOString(),
          isRunning,
          lastExecution: lastExecution
            ? {
                id: lastExecution.id,
                status: lastExecution.status,
                error: lastExecution.error ? lastExecution.error.substring(0, 200) : null,
                createdAt: lastExecution.createdAt.toISOString(),
                startedAt: lastExecution.startedAt?.toISOString() || null,
                completedAt: lastExecution.completedAt?.toISOString() || null,
                durationMs:
                  lastExecution.startedAt && lastExecution.completedAt
                    ? lastExecution.completedAt.getTime() - lastExecution.startedAt.getTime()
                    : null,
              }
            : null,
          recentHistory: executions.map((e) => ({
            id: e.id,
            status: e.status,
            siteName: e.site?.name || null,
            error: e.error ? e.error.substring(0, 100) : null,
            createdAt: e.createdAt.toISOString(),
            durationMs:
              e.startedAt && e.completedAt ? e.completedAt.getTime() - e.startedAt.getTime() : null,
          })),
        };
      })
    );

    return NextResponse.json({
      schedules: jobsWithHistory,
    });
  } catch (error) {
    console.error('[API] Error fetching schedules:', error);
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
  }
}

/**
 * POST /api/operations/schedules
 * Trigger immediate execution of a scheduled job type
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action, jobType } = body;

    if (action !== 'trigger' || !jobType) {
      return NextResponse.json({ error: 'Missing action or jobType' }, { status: 400 });
    }

    // Map job types to their default payloads
    const defaultPayloads: Record<string, any> = {
      GSC_SYNC: { siteId: 'all', dimensions: ['query', 'page', 'country', 'device'] },
      GA4_DAILY_SYNC: { siteId: 'all' },
      MICROSITE_GSC_SYNC: {},
      MICROSITE_ANALYTICS_SYNC: {},
      REFRESH_ANALYTICS_VIEWS: {},
      SEO_OPPORTUNITY_SCAN: { forceRescan: false },
      SEO_ANALYZE: { siteId: 'all', fullSiteAudit: false, triggerOptimizations: true },
      SEO_AUTO_OPTIMIZE: { siteId: 'all', scope: 'all' },
      METRICS_AGGREGATE: { aggregationType: 'daily' },
      PERFORMANCE_REPORT: { reportType: 'weekly' },
      ABTEST_REBALANCE: { abTestId: 'all', algorithm: 'thompson_sampling' },
      LINK_OPPORTUNITY_SCAN: { siteId: 'all' },
      LINK_BACKLINK_MONITOR: { siteId: 'all' },
      SUPPLIER_SYNC: { forceSync: false },
      PRODUCT_SYNC: { forceSync: false },
      MICROSITE_HEALTH_CHECK: {},
      SOCIAL_DAILY_POSTING: {},
      PAID_KEYWORD_SCAN: { maxCpc: 3.0, minVolume: 100, modes: ['gsc', 'expansion', 'discovery', 'pinterest', 'meta'] },
    };

    // Clean job type name (remove " (deep)" suffix)
    const cleanType = jobType.replace(' (deep)', '');

    // Non-triggerable types (run via setInterval or autonomous processor, not job queue)
    const nonTriggerableTypes = [
      'AUTONOMOUS_ROADMAP',
      'WEEKLY_BLOG_GENERATE',
      'DAILY_FAQ_GENERATE',
      'DAILY_CONTENT_REFRESH',
      'DAILY_BLOG_GENERATE',
      'DAILY_DESTINATION_GENERATE',
      'DAILY_COMPARISON_GENERATE',
      'DAILY_SEASONAL_GENERATE',
      'WEEKLY_LOCAL_GUIDE_GENERATE',
      'META_TITLE_MAINTENANCE',
      'MICROSITE_CONTENT_REFRESH',
      'MICROSITE_SITEMAP_RESUBMIT',
      'COLLECTION_REFRESH',
    ];
    if (nonTriggerableTypes.includes(cleanType)) {
      return NextResponse.json(
        { error: `${jobType} runs automatically and cannot be manually triggered from here` },
        { status: 400 }
      );
    }

    const payload = defaultPayloads[cleanType];
    if (!payload) {
      return NextResponse.json({ error: `Cannot trigger job type: ${jobType}` }, { status: 400 });
    }

    // For deep SEO audit
    if (jobType.includes('deep')) {
      payload.fullSiteAudit = true;
      payload.forceAudit = true;
    }

    const newJobId = await addJob(cleanType as any, payload);

    return NextResponse.json({
      success: true,
      message: `Triggered ${jobType} manually`,
      jobId: newJobId,
    });
  } catch (error) {
    console.error('[API] Error triggering scheduled job:', error);
    return NextResponse.json({ error: 'Failed to trigger job' }, { status: 500 });
  }
}
