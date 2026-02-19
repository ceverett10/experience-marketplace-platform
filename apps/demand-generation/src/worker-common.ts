/**
 * Shared utilities for all worker processes.
 * Extracted from index.ts to support multi-dyno worker separation (Phase 3).
 */

import { Worker, type Job } from 'bullmq';
import {
  createRedisConnection,
  getQueueTimeout,
  resetStuckCount,
} from '@experience-marketplace/jobs';
import { prisma, type JobStatus } from '@experience-marketplace/database';
import type { JobType } from '@experience-marketplace/database';
import type { Redis } from 'ioredis';

/**
 * Create a shared Redis connection for all workers in this process.
 */
export function createConnection(): Redis {
  return createRedisConnection();
}

/**
 * Update job status in the database.
 * For repeatable/cron jobs (created by scheduleJob()), auto-creates a DB record
 * on the first RUNNING status update so the admin dashboard can track them.
 */
export async function updateJobStatus(
  job: Job,
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING',
  result?: object,
  error?: string
) {
  let dbJobId = (job.data as { dbJobId?: string }).dbJobId;

  // For repeatable/cron jobs that don't have a DB record, create one when they start
  if (!dbJobId && status === 'RUNNING') {
    try {
      const dbJob = await prisma.job.create({
        data: {
          type: job.name as JobType,
          queue: 'scheduled',
          payload: job.data as object,
          status: 'RUNNING' as JobStatus,
          startedAt: new Date(),
          attempts: job.attemptsMade,
        },
      });
      dbJobId = dbJob.id;
      // Persist dbJobId so completed/failed event handlers can find it
      await job.updateData({ ...job.data, dbJobId });
    } catch (err) {
      console.error(`Failed to create DB record for scheduled job ${job.name}:`, err);
      return;
    }
  }

  if (!dbJobId) return;

  try {
    const updateData: {
      status: JobStatus;
      attempts: number;
      result?: object;
      error?: string;
      startedAt?: Date;
      completedAt?: Date;
    } = {
      status: status as JobStatus,
      attempts: job.attemptsMade,
    };

    if (status === 'RUNNING') {
      updateData.startedAt = new Date();
    }

    if (status === 'COMPLETED' || status === 'FAILED') {
      updateData.completedAt = new Date();
    }

    if (result) {
      updateData.result = result;
    }

    if (error) {
      updateData.error = error;
    }

    await prisma.job.update({
      where: { id: dbJobId },
      data: updateData,
    });
  } catch (err) {
    console.error(`Failed to update job ${dbJobId} status:`, err);
  }
}

/**
 * Per-queue worker configuration.
 * lockDuration must exceed the queue timeout so jobs aren't marked stalled while still running.
 */
export function makeWorkerOptions(connection: Redis, queueName: string, concurrency: number) {
  const timeout = getQueueTimeout(queueName as any);
  return {
    connection,
    concurrency,
    lockDuration: timeout + 60_000,
    stalledInterval: 30_000,
    metrics: { maxDataPoints: 200 },
  };
}

/**
 * Clear Redis dedup key when a job reaches a terminal state (completed/failed).
 * This allows the same (siteId, jobType) to be queued again in the next cycle.
 */
async function clearDedupKey(connection: Redis, job: Job) {
  const siteId = (job.data as { siteId?: string }).siteId;
  if (siteId && siteId !== 'all') {
    try {
      await connection.del(`dedup:${siteId}:${job.name}`);
    } catch {
      // Non-critical — key will expire via TTL anyway
    }
  }
}

/**
 * Attach completed/failed/error event handlers to workers.
 */
export function setupWorkerEvents(workers: Worker[], connection?: Redis) {
  workers.forEach((worker) => {
    worker.on('completed', async (job, result) => {
      console.log(`✓ Job ${job.id} (${job.name}) completed successfully`);
      await updateJobStatus(job, 'COMPLETED', result as object);
      const siteId = (job.data as { siteId?: string }).siteId || null;
      resetStuckCount(siteId, job.name);
      if (connection) await clearDedupKey(connection, job);
    });

    worker.on('failed', async (job, err) => {
      console.error(`✗ Job ${job?.id} (${job?.name}) failed:`, err.message);
      if (job) {
        const willRetry = job.attemptsMade < (job.opts.attempts || 3);
        await updateJobStatus(job, willRetry ? 'RETRYING' : 'FAILED', undefined, err.message);
        // Only clear dedup on final failure (not retries) so retries don't cause duplicates
        if (!willRetry && connection) await clearDedupKey(connection, job);
      }
    });

    worker.on('error', (err) => {
      console.error(`Worker error:`, err);
    });
  });
}

/**
 * Start memory and Redis monitoring intervals.
 */
export function startMemoryMonitoring(connection: Redis) {
  setInterval(() => {
    const usage = process.memoryUsage();
    const heapMB = Math.round(usage.heapUsed / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    const level = heapMB > 800 ? 'CRITICAL' : heapMB > 600 ? 'WARN' : 'INFO';
    console.log(`[MEMORY ${level}] heap=${heapMB}MB rss=${rssMB}MB`);
  }, 60_000);

  setInterval(async () => {
    try {
      const info = await connection.info('memory');
      const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim() ?? 'unknown';
      const maxMemory = info.match(/maxmemory_human:(.+)/)?.[1]?.trim() ?? 'unknown';
      console.log(`[REDIS] memory=${usedMemory} max=${maxMemory}`);
    } catch {
      // Redis may be temporarily unavailable
    }
  }, 30 * 60_000);
}

/**
 * Graceful shutdown handler for a set of workers.
 */
export function setupGracefulShutdown(workers: Worker[], connection: Redis, cleanup?: () => void) {
  async function shutdown(signal: string) {
    console.log(`\n${signal} received, shutting down gracefully...`);
    try {
      if (cleanup) cleanup();
      await Promise.all(workers.map((w) => w.close()));
      await connection.quit();
      console.log('✓ All workers closed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Log a startup banner for a worker process.
 */
export function logBanner(processName: string, workerNames: string[]) {
  console.log(`\n=== ${processName} ===`);
  console.log(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.log(`Workers:`);
  workerNames.forEach((name) => console.log(`  ✓ ${name}`));
  console.log('');
}
