export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { prisma } from '@/lib/prisma';
import {
  createRedisConnection,
  circuitBreakers,
  getScheduledJobs,
} from '@experience-marketplace/jobs';

const redisConnection = createRedisConnection();

const QUEUE_NAMES = ['content', 'seo', 'gsc', 'site', 'domain', 'analytics', 'abtest'];

/**
 * GET /api/operations/dashboard
 * Returns system health overview, queue stats, recent failures, and scheduled jobs
 */
export async function GET(): Promise<NextResponse> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    // Fetch BullMQ queue stats, DB stats, and circuit breakers in parallel
    const [queueStats, dbStats, recentFailures, circuitBreakerStatus, scheduledJobs] =
      await Promise.all([
        // BullMQ live queue stats
        Promise.all(
          QUEUE_NAMES.map(async (name) => {
            const queue = new Queue(name, { connection: redisConnection });
            const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
              queue.getWaitingCount(),
              queue.getActiveCount(),
              queue.getCompletedCount(),
              queue.getFailedCount(),
              queue.getDelayedCount(),
              queue.isPaused(),
            ]);
            return { name, waiting, active, completed, failed, delayed, paused: isPaused };
          })
        ),

        // Database job stats
        Promise.all([
          // Active jobs right now
          prisma.job.count({ where: { status: 'RUNNING' } }),
          // Completed today
          prisma.job.count({
            where: { status: 'COMPLETED', completedAt: { gte: todayStart } },
          }),
          // Failed today
          prisma.job.count({
            where: { status: 'FAILED', updatedAt: { gte: todayStart } },
          }),
          // Total completed in last 24h (for success rate)
          prisma.job.count({
            where: { status: 'COMPLETED', completedAt: { gte: last24h } },
          }),
          // Total failed in last 24h
          prisma.job.count({
            where: { status: 'FAILED', updatedAt: { gte: last24h } },
          }),
          // Average duration of completed jobs in last 24h
          prisma.job.findMany({
            where: {
              status: 'COMPLETED',
              completedAt: { gte: last24h },
              startedAt: { not: null },
            },
            select: { startedAt: true, completedAt: true },
            take: 100,
            orderBy: { completedAt: 'desc' },
          }),
          // Completed in last hour (throughput)
          prisma.job.count({
            where: { status: 'COMPLETED', completedAt: { gte: lastHour } },
          }),
        ]),

        // Recent failures
        prisma.job.findMany({
          where: { status: 'FAILED' },
          select: {
            id: true,
            type: true,
            error: true,
            attempts: true,
            updatedAt: true,
            site: { select: { name: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),

        // Circuit breaker states
        circuitBreakers.getAllStatus(),

        // Scheduled jobs info
        getScheduledJobs(),
      ]);

    const [activeNow, completedToday, failedToday, completed24h, failed24h, durationJobs, completedLastHour] = dbStats;

    // Compute average duration
    let avgDurationMs = 0;
    if (durationJobs.length > 0) {
      const totalDuration = durationJobs.reduce((sum, j) => {
        if (j.startedAt && j.completedAt) {
          return sum + (j.completedAt.getTime() - j.startedAt.getTime());
        }
        return sum;
      }, 0);
      avgDurationMs = Math.round(totalDuration / durationJobs.length);
    }

    // Compute success rate
    const total24h = completed24h + failed24h;
    const successRate = total24h > 0 ? Math.round((completed24h / total24h) * 100) : 100;

    // Compute queue totals
    const queueTotals = queueStats.reduce(
      (acc, q) => ({
        waiting: acc.waiting + q.waiting,
        active: acc.active + q.active,
        completed: acc.completed + q.completed,
        failed: acc.failed + q.failed,
        delayed: acc.delayed + q.delayed,
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
    );

    // Determine system health
    const openCircuits = Object.values(circuitBreakerStatus).filter(
      (s) => s.state === 'OPEN'
    ).length;
    let health: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (failedToday > 50 || openCircuits > 1) health = 'critical';
    else if (failedToday > 10 || openCircuits > 0 || successRate < 90) health = 'degraded';

    // Get last run times for scheduled jobs
    const scheduledJobsWithHistory = await Promise.all(
      scheduledJobs.map(async (sj) => {
        const jobType = sj.jobType.replace(' (deep)', '');
        const lastRun = await prisma.job.findFirst({
          where: { type: jobType as any },
          orderBy: { createdAt: 'desc' },
          select: {
            status: true,
            createdAt: true,
            startedAt: true,
            completedAt: true,
          },
        });

        return {
          ...sj,
          lastRun: lastRun
            ? {
                status: lastRun.status,
                createdAt: lastRun.createdAt.toISOString(),
                completedAt: lastRun.completedAt?.toISOString() || null,
              }
            : null,
        };
      })
    );

    return NextResponse.json({
      health,
      metrics: {
        activeNow,
        completedToday,
        failedToday,
        successRate,
        avgDurationMs,
        throughputPerHour: completedLastHour,
      },
      queues: queueStats.map((q) => ({
        ...q,
        health: q.paused
          ? 'paused'
          : q.failed > 10
            ? 'critical'
            : q.waiting > 100
              ? 'warning'
              : 'healthy',
      })),
      queueTotals,
      recentFailures: recentFailures.map((f) => ({
        id: f.id,
        type: f.type,
        error: f.error ? f.error.substring(0, 200) : null,
        attempts: f.attempts,
        siteName: f.site?.name || null,
        failedAt: f.updatedAt.toISOString(),
      })),
      scheduledJobs: scheduledJobsWithHistory,
      circuitBreakers: circuitBreakerStatus,
    });
  } catch (error) {
    console.error('[API] Error fetching operations dashboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch operations dashboard' },
      { status: 500 }
    );
  }
}
