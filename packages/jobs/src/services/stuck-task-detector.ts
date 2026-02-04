/**
 * Stuck Task Detector
 *
 * Identifies jobs that have been PENDING or RUNNING for too long
 * and marks them as FAILED so the roadmap processor can re-queue them.
 *
 * This prevents the common failure mode where a site's lifecycle gets
 * permanently stuck because a task was queued but never completed.
 */

import { prisma } from '@experience-marketplace/database';
import { errorTracking } from '../errors/tracking';

/** Jobs PENDING (not in 'planned' queue) for longer than this are considered stuck */
const PENDING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Jobs RUNNING for longer than this are considered stuck (worker may have crashed) */
const RUNNING_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Detect and mark stuck tasks.
 * Called periodically alongside the roadmap processor.
 */
export async function detectStuckTasks(): Promise<{
  markedFailed: number;
  details: string[];
}> {
  const details: string[] = [];
  let markedFailed = 0;

  const now = new Date();
  const pendingCutoff = new Date(now.getTime() - PENDING_TIMEOUT_MS);
  const runningCutoff = new Date(now.getTime() - RUNNING_TIMEOUT_MS);

  // Find PENDING jobs that aren't placeholders and have been waiting too long
  const stuckPending = await prisma.job.findMany({
    where: {
      status: 'PENDING',
      queue: { not: 'planned' },
      createdAt: { lt: pendingCutoff },
    },
    select: {
      id: true,
      type: true,
      siteId: true,
      createdAt: true,
      queue: true,
    },
    take: 50, // Process in batches
  });

  for (const job of stuckPending) {
    const ageMinutes = Math.round((now.getTime() - job.createdAt.getTime()) / 60_000);
    const detail = `PENDING job ${job.type} (${job.id}) stuck for ${ageMinutes}m`;
    details.push(detail);
    console.warn(`[Stuck Detector] ${detail}`);

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error: `Stuck in PENDING state for ${ageMinutes} minutes — marked as failed by stuck-task detector`,
        completedAt: now,
      },
    });

    await errorTracking.logError({
      jobId: job.id,
      jobType: job.type,
      siteId: job.siteId || undefined,
      errorName: 'StuckTaskError',
      errorMessage: `Job stuck in PENDING for ${ageMinutes} minutes`,
      errorCategory: 'STUCK_TASK',
      errorSeverity: 'HIGH',
      retryable: true,
      attemptsMade: 0,
      context: { queue: job.queue, ageMinutes },
      timestamp: now,
    });

    markedFailed++;
  }

  // Find RUNNING jobs that have been active too long (worker likely crashed)
  const stuckRunning = await prisma.job.findMany({
    where: {
      status: 'RUNNING',
      startedAt: { lt: runningCutoff },
    },
    select: {
      id: true,
      type: true,
      siteId: true,
      startedAt: true,
      queue: true,
    },
    take: 50,
  });

  for (const job of stuckRunning) {
    const startedAt = job.startedAt || now;
    const ageMinutes = Math.round((now.getTime() - startedAt.getTime()) / 60_000);
    const detail = `RUNNING job ${job.type} (${job.id}) stuck for ${ageMinutes}m`;
    details.push(detail);
    console.warn(`[Stuck Detector] ${detail}`);

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error: `Stuck in RUNNING state for ${ageMinutes} minutes — worker likely crashed. Marked as failed by stuck-task detector`,
        completedAt: now,
      },
    });

    await errorTracking.logError({
      jobId: job.id,
      jobType: job.type,
      siteId: job.siteId || undefined,
      errorName: 'StuckTaskError',
      errorMessage: `Job stuck in RUNNING for ${ageMinutes} minutes (worker crash suspected)`,
      errorCategory: 'STUCK_TASK',
      errorSeverity: 'CRITICAL',
      retryable: true,
      attemptsMade: 0,
      context: { queue: job.queue, ageMinutes },
      timestamp: now,
    });

    markedFailed++;
  }

  return { markedFailed, details };
}
