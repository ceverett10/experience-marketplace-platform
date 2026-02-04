/**
 * Self-Healing Stuck Task Detector
 *
 * Identifies jobs that have been PENDING or RUNNING for too long, cleans up
 * both the DB record and the orphaned BullMQ entry, then lets the roadmap
 * processor re-queue them naturally on its next cycle.
 *
 * Previously, the detector only marked jobs as FAILED — but that left orphaned
 * BullMQ entries in Redis and caused a snowball of duplicate failures as the
 * roadmap kept re-queuing the same task type. Now the detector fully cleans up
 * both sides (DB + BullMQ) so the system can start fresh.
 *
 * A per-(siteId, jobType) counter prevents infinite loops: after
 * MAX_STUCK_RETRIES consecutive stuck detections, the job is permanently
 * marked FAILED with a clear error.
 */

import { prisma } from '@experience-marketplace/database';
import type { QueueName } from '../types';
import { removeJob } from '../queues/index.js';
import { errorTracking } from '../errors/tracking';

/** Jobs PENDING (not in 'planned' queue) for longer than this are considered stuck */
const PENDING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Jobs RUNNING for longer than this are considered stuck (worker may have crashed) */
const RUNNING_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

/** After this many consecutive stuck detections for the same (siteId, jobType), give up */
const MAX_STUCK_RETRIES = 3;

/**
 * In-memory counter for consecutive stuck detections.
 * Key format: "siteId:jobType". Resets when a job of that type completes successfully.
 * Persists across detector runs but resets on worker restart — that's intentional,
 * since a worker restart is itself a recovery action.
 */
const stuckCounts = new Map<string, number>();

/** Get the stuck count key for a job */
function stuckKey(siteId: string | null, jobType: string): string {
  return `${siteId || 'global'}:${jobType}`;
}

/** Increment and return new stuck count */
function incrementStuckCount(siteId: string | null, jobType: string): number {
  const key = stuckKey(siteId, jobType);
  const count = (stuckCounts.get(key) || 0) + 1;
  stuckCounts.set(key, count);
  return count;
}

/** Reset stuck count (called externally when a job succeeds) */
export function resetStuckCount(siteId: string | null, jobType: string): void {
  stuckCounts.delete(stuckKey(siteId, jobType));
}

/** Clear all stuck counts (for testing) */
export function clearAllStuckCounts(): void {
  stuckCounts.clear();
}

/**
 * Parse idempotencyKey into queue name and BullMQ job ID.
 * Format: "{queueName}:{bullmqJobId}"
 */
function parseIdempotencyKey(key: string | null): { queueName: string; bullmqJobId: string } | null {
  if (!key) return null;
  const colonIdx = key.indexOf(':');
  if (colonIdx === -1) return null;
  return {
    queueName: key.substring(0, colonIdx),
    bullmqJobId: key.substring(colonIdx + 1),
  };
}

/**
 * Clean up a stuck job: remove BullMQ entry + delete DB record.
 * Returns true if the job was cleaned up, false if it hit the retry limit.
 */
async function healStuckJob(job: {
  id: string;
  type: string;
  siteId: string | null;
  queue: string;
  idempotencyKey: string | null;
}, state: 'PENDING' | 'RUNNING', ageMinutes: number): Promise<'healed' | 'permanently_failed'> {
  const count = incrementStuckCount(job.siteId, job.type);

  if (count > MAX_STUCK_RETRIES) {
    // Exceeded retry limit — mark as permanently failed
    console.error(
      `[Stuck Detector] ${job.type} (${job.id}) has been stuck ${count} times — permanently marking as FAILED`
    );

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error: `Stuck in ${state} state ${count} times (${ageMinutes}m). Exceeded max retries (${MAX_STUCK_RETRIES}). Requires manual intervention.`,
        completedAt: new Date(),
      },
    });

    await errorTracking.logError({
      jobId: job.id,
      jobType: job.type,
      siteId: job.siteId || undefined,
      errorName: 'StuckTaskPermanentFailure',
      errorMessage: `Job stuck ${count} times, permanently failed`,
      errorCategory: 'STUCK_TASK',
      errorSeverity: 'CRITICAL',
      retryable: false,
      attemptsMade: count,
      context: { queue: job.queue, ageMinutes, stuckCount: count },
      timestamp: new Date(),
    });

    return 'permanently_failed';
  }

  // Self-heal: remove BullMQ entry + delete DB record
  // The roadmap processor will re-queue on its next cycle.
  const parsed = parseIdempotencyKey(job.idempotencyKey);
  if (parsed) {
    const removed = await removeJob(parsed.queueName as QueueName, parsed.bullmqJobId);
    if (removed) {
      console.log(
        `[Stuck Detector] Removed BullMQ entry ${parsed.queueName}:${parsed.bullmqJobId} for ${job.type}`
      );
    }
  }

  // Delete the DB record so roadmap processor can create a fresh one
  await prisma.job.delete({ where: { id: job.id } });

  console.log(
    `[Stuck Detector] Healed ${state} job ${job.type} (${job.id}) — stuck for ${ageMinutes}m, attempt ${count}/${MAX_STUCK_RETRIES}`
  );

  await errorTracking.logError({
    jobId: job.id,
    jobType: job.type,
    siteId: job.siteId || undefined,
    errorName: 'StuckTaskHealed',
    errorMessage: `Job stuck in ${state} for ${ageMinutes}m — cleaned up (attempt ${count}/${MAX_STUCK_RETRIES})`,
    errorCategory: 'STUCK_TASK',
    errorSeverity: count >= 2 ? 'HIGH' : 'MEDIUM',
    retryable: true,
    attemptsMade: count,
    context: { queue: job.queue, ageMinutes, stuckCount: count },
    timestamp: new Date(),
  });

  return 'healed';
}

/**
 * Detect and heal stuck tasks.
 * Called periodically alongside the roadmap processor.
 */
export async function detectStuckTasks(): Promise<{
  healed: number;
  permanentlyFailed: number;
  details: string[];
}> {
  const details: string[] = [];
  let healed = 0;
  let permanentlyFailed = 0;

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
      idempotencyKey: true,
    },
    take: 50, // Process in batches
  });

  for (const job of stuckPending) {
    const ageMinutes = Math.round((now.getTime() - job.createdAt.getTime()) / 60_000);
    const detail = `PENDING ${job.type} (${job.id}) stuck ${ageMinutes}m`;
    details.push(detail);

    const result = await healStuckJob(job, 'PENDING', ageMinutes);
    if (result === 'healed') healed++;
    else permanentlyFailed++;
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
      idempotencyKey: true,
    },
    take: 50,
  });

  for (const job of stuckRunning) {
    const startedAt = job.startedAt || now;
    const ageMinutes = Math.round((now.getTime() - startedAt.getTime()) / 60_000);
    const detail = `RUNNING ${job.type} (${job.id}) stuck ${ageMinutes}m`;
    details.push(detail);

    const result = await healStuckJob(job, 'RUNNING', ageMinutes);
    if (result === 'healed') healed++;
    else permanentlyFailed++;
  }

  return { healed, permanentlyFailed, details };
}
