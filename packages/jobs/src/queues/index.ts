import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';
import type { JobType } from '@experience-marketplace/database';
import { prisma } from '@experience-marketplace/database';
import { QUEUE_NAMES, QueueName, JobPayload, JobOptions, JOB_TYPE_TO_QUEUE } from '../types';

/**
 * Per-queue configuration for timeouts, retries, and backoff.
 * Timeouts prevent jobs from hanging indefinitely (e.g., unresponsive external APIs).
 * External-API-heavy queues get more retries with longer backoff.
 */
const QUEUE_CONFIG: Record<QueueName, { timeout: number; attempts: number; backoffDelay: number }> =
  {
    // Content: AI generation via Anthropic — can be slow, needs generous timeout
    [QUEUE_NAMES.CONTENT]: { timeout: 300_000, attempts: 3, backoffDelay: 10_000 },
    // SEO: Mix of DB queries and external API calls
    [QUEUE_NAMES.SEO]: { timeout: 180_000, attempts: 5, backoffDelay: 15_000 },
    // GSC: Google API calls — moderate timeout, retry for transient auth issues
    [QUEUE_NAMES.GSC]: { timeout: 120_000, attempts: 5, backoffDelay: 30_000 },
    // Site: Brand generation + multiple API calls — longest timeout
    [QUEUE_NAMES.SITE]: { timeout: 600_000, attempts: 3, backoffDelay: 10_000 },
    // Domain: Cloudflare registrar API — moderate timeout, extra retries for DNS propagation
    [QUEUE_NAMES.DOMAIN]: { timeout: 180_000, attempts: 5, backoffDelay: 30_000 },
    // Analytics: GA4 API + DB aggregation
    [QUEUE_NAMES.ANALYTICS]: { timeout: 120_000, attempts: 3, backoffDelay: 10_000 },
    // A/B Test: Mostly DB operations — short timeout
    [QUEUE_NAMES.ABTEST]: { timeout: 60_000, attempts: 3, backoffDelay: 5_000 },
    // Sync: Holibob API sync — very long timeout for full catalog sync (4 hours max)
    [QUEUE_NAMES.SYNC]: { timeout: 14_400_000, attempts: 2, backoffDelay: 60_000 },
    // Microsite: Brand generation + content setup — moderate timeout
    [QUEUE_NAMES.MICROSITE]: { timeout: 300_000, attempts: 3, backoffDelay: 15_000 },
    // Social: Caption generation + external API posting
    [QUEUE_NAMES.SOCIAL]: { timeout: 120_000, attempts: 3, backoffDelay: 30_000 },
    // Ads: Campaign sync, budget optimization, and paid keyword scanning with external APIs
    [QUEUE_NAMES.ADS]: { timeout: 300_000, attempts: 3, backoffDelay: 30_000 },
  };

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
      const config = QUEUE_CONFIG[queueName];
      const queueOptions: QueueOptions = {
        connection: this.connection,
        defaultJobOptions: {
          attempts: config.attempts,
          backoff: {
            type: 'exponential',
            delay: config.backoffDelay,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
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
    if (!queueName) {
      throw new Error(`Unknown job type: ${jobType} — no queue mapping found`);
    }
    const queue = this.getQueue(queueName);

    // Extract siteId from payload if available.
    // 'all' is a valid payload sentinel but not a valid FK — treat it as null for the DB record.
    const rawSiteId = (payload as { siteId?: string }).siteId;
    const siteId = rawSiteId && rawSiteId !== 'all' ? rawSiteId : null;

    // Payload validation: most jobs require a siteId.
    // Skip validation when rawSiteId is 'all' (fan-out sentinel handled by the worker),
    // for domain-specific jobs that use domainId instead, or for known site-optional types.
    const siteOptionalTypes: string[] = [
      'DOMAIN_VERIFY',
      'SSL_PROVISION',
      'SEO_OPPORTUNITY_SCAN', // Cross-site scan, no single siteId
      'SEO_OPPORTUNITY_OPTIMIZE', // Cross-site optimization, no single siteId
      'SITE_CREATE', // Creates a new site — siteId doesn't exist yet
      'CONTENT_GENERATE', // Can be triggered by microsites with pageId instead of siteId
      'MICROSITE_CREATE', // Creates a new microsite — uses opportunityId, not siteId
      'MICROSITE_BRAND_GENERATE', // Uses micrositeId, not siteId
      'MICROSITE_PUBLISH', // Uses micrositeId, not siteId
      'MICROSITE_CONTENT_GENERATE', // Microsites use micrositeId, not siteId
      'MICROSITE_HOMEPAGE_ENRICH', // Microsites use micrositeId, not siteId
      'MICROSITE_GSC_SYNC', // Syncs all microsites, no single siteId
      'MICROSITE_ANALYTICS_SYNC', // Syncs all microsites, no single siteId
      'MICROSITE_GA4_SYNC', // Syncs all microsites, no single siteId
      'GA4_DAILY_SYNC', // Syncs all sites, no single siteId
      'REFRESH_ANALYTICS_VIEWS', // System-wide job, no siteId
      'AD_CAMPAIGN_SYNC', // Syncs all campaigns, no single siteId
      'AD_PERFORMANCE_REPORT', // Cross-site reporting, no single siteId
      'AD_BUDGET_OPTIMIZER', // Cross-site optimization, no single siteId
      'SOCIAL_POST_PUBLISH', // Uses socialPostId, not siteId
      'SOCIAL_DAILY_POSTING', // Fan-out job, siteId is optional
      'PAID_KEYWORD_SCAN', // Cross-site keyword discovery, no single siteId
      'BIDDING_ENGINE_RUN', // Portfolio-wide bidding engine, no single siteId
      'KEYWORD_ENRICHMENT', // Bulk keyword extraction from products, no single siteId
      'AD_CONVERSION_UPLOAD', // Uploads conversions to Meta/Google CAPI, no single siteId
      'AD_PLATFORM_IDS_SYNC', // Fetches pixel/conversion IDs from ad platforms, no single siteId
    ];
    if (!siteId && rawSiteId !== 'all' && !siteOptionalTypes.includes(jobType)) {
      const hasDomainId = !!(payload as { domainId?: string }).domainId;
      if (!hasDomainId) {
        throw new Error(
          `Payload validation failed for ${jobType}: missing siteId (and no domainId fallback)`
        );
      }
    }

    // Deduplication: skip if a non-terminal job already exists for the same (siteId, type).
    // This prevents the roadmap processor from creating duplicates when a previous job
    // is still being processed or waiting in the queue.
    // Social jobs are exempt: different platforms share the same job type for the same site.
    const dedupExemptTypes = [
      'SOCIAL_POST_GENERATE',
      'SOCIAL_POST_PUBLISH',
      'SOCIAL_DAILY_POSTING',
    ];
    if (siteId && !dedupExemptTypes.includes(jobType)) {
      const existing = await prisma.job.findFirst({
        where: {
          siteId,
          type: jobType,
          status: { in: ['PENDING', 'RUNNING', 'SCHEDULED', 'RETRYING'] },
          queue: { not: 'planned' },
        },
        select: { id: true, status: true },
      });
      if (existing) {
        console.log(
          `[Queue] Skipping duplicate ${jobType} for site ${siteId} — existing job ${existing.id} is ${existing.status}`
        );
        return existing.id;
      }
    }

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

    // Add to BullMQ queue with database job ID as reference.
    // If BullMQ/Redis fails, clean up the orphaned DB record to prevent zombie PENDING jobs.
    let job;
    try {
      // Only pass per-job overrides that are explicitly set.
      // Passing undefined values would override the queue-level defaults
      // (removeOnComplete: 100, removeOnFail: 500), causing jobs to never be cleaned up.
      const jobOpts: {
        priority?: number;
        delay?: number;
        attempts?: number;
        backoff?: { type: string; delay: number };
        removeOnComplete?: boolean | number;
        removeOnFail?: boolean | number;
      } = {};
      if (options?.priority != null) jobOpts.priority = options.priority;
      if (options?.delay != null) jobOpts.delay = options.delay;
      if (options?.attempts != null) jobOpts.attempts = options.attempts;
      if (options?.backoff != null) jobOpts.backoff = options.backoff;
      if (options?.removeOnComplete != null) jobOpts.removeOnComplete = options.removeOnComplete;
      if (options?.removeOnFail != null) jobOpts.removeOnFail = options.removeOnFail;

      job = await queue.add(jobType, { ...payload, dbJobId: dbJob.id }, jobOpts);
    } catch (redisError) {
      // BullMQ failed (likely Redis connection issue) — delete the orphaned DB record
      console.error(
        `[Queue] BullMQ add failed for ${jobType} (dbJob: ${dbJob.id}), cleaning up DB record:`,
        redisError
      );
      await prisma.job.delete({ where: { id: dbJob.id } }).catch((deleteErr) => {
        console.error(`[Queue] Failed to clean up orphaned DB job ${dbJob.id}:`, deleteErr);
      });
      throw redisError;
    }

    // Update database record with BullMQ job ID
    // Prefix with queue name since BullMQ IDs are only unique per queue, not globally
    await prisma.job.update({
      where: { id: dbJob.id },
      data: { idempotencyKey: `${queueName}:${job.id}` },
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
      removeOnComplete: { age: 3600, count: 50 }, // Keep last 50 or 1 hour
      removeOnFail: { age: 86400, count: 200 }, // Keep last 200 or 24 hours
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
   * Remove a specific BullMQ job by queue name and BullMQ job ID.
   * Used by the stuck-task detector to clean up orphaned queue entries.
   * Returns true if the job was found and removed.
   */
  async removeJob(queueName: QueueName, bullmqJobId: string): Promise<boolean> {
    try {
      const queue = this.getQueue(queueName);
      const job = await queue.getJob(bullmqJobId);
      if (job) {
        await job.remove();
        return true;
      }
      return false;
    } catch (err) {
      console.error(`[Queue] Failed to remove BullMQ job ${bullmqJobId} from ${queueName}:`, err);
      return false;
    }
  }

  /**
   * Clean completed and failed jobs from all queues to free Redis memory.
   * Keeps the most recent jobs per queue for debugging visibility.
   * Returns total number of jobs removed.
   */
  async cleanAllQueues(options?: {
    completedMaxAge?: number; // ms, default 1 hour
    failedMaxAge?: number; // ms, default 24 hours
    batchSize?: number; // max jobs to remove per queue per status, default 5000
  }): Promise<{ removed: number; memoryBefore: string; memoryAfter: string }> {
    const completedMaxAge = options?.completedMaxAge ?? 3_600_000; // 1 hour
    const failedMaxAge = options?.failedMaxAge ?? 86_400_000; // 24 hours
    const batchSize = options?.batchSize ?? 5000;

    const memoryBefore = await this.getRedisMemory();
    let totalRemoved = 0;

    for (const queueName of Object.values(QUEUE_NAMES)) {
      const queue = this.getQueue(queueName);
      try {
        const completed = await queue.clean(completedMaxAge, batchSize, 'completed');
        const failed = await queue.clean(failedMaxAge, batchSize, 'failed');
        const removed = completed.length + failed.length;
        if (removed > 0) {
          console.log(
            `[Queue] Cleaned ${queueName}: ${completed.length} completed, ${failed.length} failed`
          );
        }
        totalRemoved += removed;
      } catch (err) {
        console.error(`[Queue] Failed to clean ${queueName}:`, err);
      }
    }

    const memoryAfter = await this.getRedisMemory();
    console.log(
      `[Queue] Cleanup complete: removed ${totalRemoved} jobs, memory ${memoryBefore} → ${memoryAfter}`
    );
    return { removed: totalRemoved, memoryBefore, memoryAfter };
  }

  /**
   * Get Redis used_memory_human from INFO.
   */
  private async getRedisMemory(): Promise<string> {
    try {
      const info = await this.connection.info('memory');
      return info.match(/used_memory_human:(.+)/)?.[1]?.trim() ?? 'unknown';
    } catch {
      return 'unknown';
    }
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
export const removeJob = queueRegistry.removeJob.bind(queueRegistry);
export const cleanAllQueues = queueRegistry.cleanAllQueues.bind(queueRegistry);

/**
 * Get a queue by name
 * Useful for workers that need to add jobs to other queues
 */
export function getJobQueue(queueName: QueueName): Queue {
  return queueRegistry.getQueue(queueName);
}

/**
 * Get per-queue timeout configuration.
 * Used by worker process to set lockDuration appropriately.
 */
export function getQueueTimeout(queueName: QueueName): number {
  return QUEUE_CONFIG[queueName].timeout;
}
