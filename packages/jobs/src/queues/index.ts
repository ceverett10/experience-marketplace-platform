import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';
import type { JobType } from '@experience-marketplace/database';
import { prisma } from '@experience-marketplace/database';
import { QUEUE_NAMES, QueueName, JobPayload, JobOptions, JOB_TYPE_TO_QUEUE } from '../types';

/**
 * Redis connection configuration
 */
export function createRedisConnection(): IORedis {
  const redisUrl =
    process.env['REDIS_URL'] || process.env['REDIS_TLS_URL'] || 'redis://localhost:6379';

  const usesTls = redisUrl.includes('rediss://');

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Heroku Redis requires TLS with self-signed certificate support
    tls: usesTls ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * Queue registry - singleton instance of all queues
 */
class QueueRegistry {
  private queues: Map<QueueName, Queue> = new Map();
  private connection: IORedis;

  constructor() {
    this.connection = createRedisConnection();
  }

  /**
   * Get or create a queue
   */
  getQueue(queueName: QueueName): Queue {
    if (!this.queues.has(queueName)) {
      const queueOptions: QueueOptions = {
        connection: this.connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 500, // Keep last 500 failed jobs
        },
      };

      const queue = new Queue(queueName, queueOptions);
      this.queues.set(queueName, queue);
    }

    return this.queues.get(queueName)!;
  }

  /**
   * Add a job to the appropriate queue based on job type
   * Also creates a database record to track job status
   */
  async addJob(jobType: JobType, payload: JobPayload, options?: JobOptions): Promise<string> {
    const queueName = JOB_TYPE_TO_QUEUE[jobType];
    const queue = this.getQueue(queueName);

    // Extract siteId from payload if available
    const siteId = (payload as { siteId?: string }).siteId || null;

    // Create database record for job tracking
    const dbJob = await prisma.job.create({
      data: {
        type: jobType,
        queue: queueName,
        payload: payload as object,
        status: options?.delay ? 'SCHEDULED' : 'PENDING',
        priority: options?.priority || 5,
        maxAttempts: options?.attempts || 3,
        siteId,
        scheduledFor: options?.delay ? new Date(Date.now() + options.delay) : null,
      },
    });

    // Add to BullMQ queue with database job ID as reference
    const job = await queue.add(
      jobType,
      { ...payload, dbJobId: dbJob.id },
      {
        priority: options?.priority,
        delay: options?.delay,
        attempts: options?.attempts,
        backoff: options?.backoff,
        removeOnComplete: options?.removeOnComplete,
        removeOnFail: options?.removeOnFail,
      }
    );

    // Update database record with BullMQ job ID
    await prisma.job.update({
      where: { id: dbJob.id },
      data: { idempotencyKey: job.id },
    });

    return dbJob.id;
  }

  /**
   * Schedule a recurring job
   */
  async scheduleJob(
    jobType: JobType,
    payload: JobPayload,
    cronExpression: string,
    options?: JobOptions
  ): Promise<void> {
    const queueName = JOB_TYPE_TO_QUEUE[jobType];
    const queue = this.getQueue(queueName);

    await queue.add(jobType, payload, {
      repeat: {
        pattern: cronExpression,
      },
      priority: options?.priority,
      attempts: options?.attempts,
      backoff: options?.backoff,
    });
  }

  /**
   * Remove all repeatable jobs of a specific type
   */
  async removeRepeatableJob(jobType: JobType, cronExpression: string): Promise<void> {
    const queueName = JOB_TYPE_TO_QUEUE[jobType];
    const queue = this.getQueue(queueName);

    await queue.removeRepeatable(jobType, {
      pattern: cronExpression,
    });
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(queueName: QueueName) {
    const queue = this.getQueue(queueName);

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Get all queue metrics
   */
  async getAllQueueMetrics() {
    const metrics = await Promise.all(
      Object.values(QUEUE_NAMES).map((queueName) => this.getQueueMetrics(queueName))
    );
    return metrics;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: QueueName): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: QueueName): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
  }

  /**
   * Drain a queue (remove all jobs)
   */
  async drainQueue(queueName: QueueName): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.drain();
  }

  /**
   * Close all queues and Redis connection
   */
  async close(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));
    await this.connection.quit();
  }
}

// Export singleton instance
export const queueRegistry = new QueueRegistry();

// Export convenience functions
export const addJob = queueRegistry.addJob.bind(queueRegistry);
export const scheduleJob = queueRegistry.scheduleJob.bind(queueRegistry);
export const getQueueMetrics = queueRegistry.getQueueMetrics.bind(queueRegistry);
export const getAllQueueMetrics = queueRegistry.getAllQueueMetrics.bind(queueRegistry);

/**
 * Get a queue by name
 * Useful for workers that need to add jobs to other queues
 */
export function getJobQueue(queueName: QueueName): Queue {
  return queueRegistry.getQueue(queueName);
}
