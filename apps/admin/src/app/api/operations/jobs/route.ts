export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getJobQueue, addJob } from '@experience-marketplace/jobs';

/**
 * GET /api/operations/jobs
 * Returns paginated job list from database with filtering and sorting
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const skip = (page - 1) * limit;

    // Filters
    const status = searchParams.get('status'); // PENDING, RUNNING, COMPLETED, FAILED
    const type = searchParams.get('type');
    const siteId = searchParams.get('siteId');
    const queue = searchParams.get('queue');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const search = searchParams.get('search'); // Search by job ID

    // Sorting
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc';

    // Build where clause
    const where: any = {};
    if (status) {
      if (status.includes(',')) {
        where.status = { in: status.split(',') };
      } else {
        where.status = status;
      }
    }
    if (type) where.type = type;
    if (siteId) where.siteId = siteId;
    if (queue) where.queue = queue;
    if (search) where.id = { contains: search };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    // Build orderBy
    const orderBy: any = {};
    if (['createdAt', 'startedAt', 'completedAt', 'type', 'status', 'priority'].includes(sortBy)) {
      orderBy[sortBy] = sortDir;
    } else {
      orderBy.createdAt = 'desc';
    }

    // Fetch jobs and total count in parallel
    const [jobs, total, stats] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          site: { select: { name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.job.count({ where }),
      // Aggregate stats: single groupBy instead of 4 separate COUNTs
      prisma.job.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ]);

    const statsMap: Record<string, number> = {};
    for (const s of stats) {
      statsMap[s.status] = s._count._all;
    }
    const pending = statsMap['PENDING'] || 0;
    const running = statsMap['RUNNING'] || 0;
    const completed = statsMap['COMPLETED'] || 0;
    const failed = statsMap['FAILED'] || 0;

    return NextResponse.json({
      jobs: jobs.map((j) => {
        const durationMs =
          j.startedAt && j.completedAt
            ? j.completedAt.getTime() - j.startedAt.getTime()
            : j.startedAt && j.status === 'RUNNING'
              ? Date.now() - j.startedAt.getTime()
              : null;

        return {
          id: j.id,
          type: j.type,
          queue: j.queue,
          status: j.status,
          siteId: j.siteId,
          siteName: j.site?.name || null,
          priority: j.priority,
          attempts: j.attempts,
          maxAttempts: j.maxAttempts,
          error: j.error ? j.error.substring(0, 200) : null,
          hasResult: j.result !== null,
          createdAt: j.createdAt.toISOString(),
          startedAt: j.startedAt?.toISOString() || null,
          completedAt: j.completedAt?.toISOString() || null,
          durationMs,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: { pending, running, completed, failed, total },
    });
  } catch (error) {
    console.error('[API] Error fetching jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

/**
 * GET /api/operations/jobs/[id] handled via query param
 * POST /api/operations/jobs — Actions: retry, cancel, bulk-retry
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action, jobId, filter } = body;

    if (action === 'get-detail' && jobId) {
      // Get full job detail including payload, result, and error logs
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          site: { select: { name: true } },
          errorLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      return NextResponse.json({
        id: job.id,
        type: job.type,
        queue: job.queue,
        status: job.status,
        siteId: job.siteId,
        siteName: job.site?.name || null,
        priority: job.priority,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        payload: job.payload,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString() || null,
        completedAt: job.completedAt?.toISOString() || null,
        scheduledFor: job.scheduledFor?.toISOString() || null,
        durationMs:
          job.startedAt && job.completedAt
            ? job.completedAt.getTime() - job.startedAt.getTime()
            : null,
        errorLogs: job.errorLogs.map((e) => ({
          id: e.id,
          errorName: e.errorName,
          errorMessage: e.errorMessage,
          errorCategory: e.errorCategory,
          errorSeverity: e.errorSeverity,
          stackTrace: e.stackTrace,
          context: e.context,
          attemptNumber: e.attemptNumber,
          createdAt: e.createdAt.toISOString(),
        })),
      });
    }

    if (action === 'retry' && jobId) {
      // Re-queue a failed job
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      // Try to retry via BullMQ first
      try {
        const queue = getJobQueue(job.queue as any);
        if (job.idempotencyKey) {
          const bullJob = await queue.getJob(job.idempotencyKey);
          if (bullJob) {
            await bullJob.retry();
            await prisma.job.update({
              where: { id: jobId },
              data: { status: 'PENDING', error: null },
            });
            return NextResponse.json({ success: true, message: `Job ${jobId} retried via queue` });
          }
        }
      } catch {
        // BullMQ retry failed, re-queue as new job
      }

      // Re-queue as new job
      const newJobId = await addJob(job.type as any, job.payload as any);
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'CANCELLED' },
      });

      return NextResponse.json({
        success: true,
        message: `Job ${jobId} re-queued as ${newJobId}`,
        newJobId,
      });
    }

    if (action === 'bulk-retry' && filter) {
      // Re-queue all failed jobs matching the filter
      const where: any = { status: 'FAILED' };
      if (filter.type) where.type = filter.type;
      if (filter.siteId) where.siteId = filter.siteId;
      if (filter.from) where.updatedAt = { gte: new Date(filter.from) };

      const failedJobs = await prisma.job.findMany({
        where,
        take: 100, // Safety limit
      });

      let retried = 0;
      for (const job of failedJobs) {
        try {
          await addJob(job.type as any, job.payload as any);
          await prisma.job.update({
            where: { id: job.id },
            data: { status: 'CANCELLED' },
          });
          retried++;
        } catch {
          // Skip individual failures
        }
      }

      return NextResponse.json({
        success: true,
        message: `${retried} of ${failedJobs.length} failed jobs re-queued`,
        retried,
        total: failedJobs.length,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[API] Error performing job action:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
