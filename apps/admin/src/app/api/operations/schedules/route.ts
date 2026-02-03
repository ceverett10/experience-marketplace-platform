export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getScheduledJobs, addJob } from '@experience-marketplace/jobs';

/**
 * GET /api/operations/schedules
 * Returns all scheduled jobs with execution history
 */
export async function GET(): Promise<NextResponse> {
  try {
    const scheduledJobs = getScheduledJobs();

    // For each scheduled job, get execution history
    const jobsWithHistory = await Promise.all(
      scheduledJobs.map(async (sj) => {
        // Handle "SEO_ANALYZE (deep)" style names
        const jobType = sj.jobType.replace(' (deep)', '');

        // Get last 10 executions of this job type
        const executions = await prisma.job.findMany({
          where: { type: jobType as any },
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

        const lastExecution = executions[0] || null;

        return {
          jobType: sj.jobType,
          schedule: sj.schedule,
          description: sj.description,
          lastExecution: lastExecution
            ? {
                id: lastExecution.id,
                status: lastExecution.status,
                error: lastExecution.error
                  ? lastExecution.error.substring(0, 200)
                  : null,
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
              e.startedAt && e.completedAt
                ? e.completedAt.getTime() - e.startedAt.getTime()
                : null,
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
      SEO_OPPORTUNITY_SCAN: { forceRescan: false },
      SEO_ANALYZE: { siteId: 'all', fullSiteAudit: false, triggerOptimizations: true },
      METRICS_AGGREGATE: { aggregationType: 'daily' },
      PERFORMANCE_REPORT: { reportType: 'weekly' },
      ABTEST_REBALANCE: { abTestId: 'all', algorithm: 'thompson_sampling' },
    };

    // Clean job type name (remove " (deep)" suffix)
    const cleanType = jobType.replace(' (deep)', '');

    const payload = defaultPayloads[cleanType];
    if (!payload) {
      return NextResponse.json(
        { error: `Cannot trigger job type: ${jobType}` },
        { status: 400 }
      );
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
