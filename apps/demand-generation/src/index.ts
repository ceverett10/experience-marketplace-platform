/**
 * Demand Generation Service - Background Worker
 *
 * Autonomous background worker service for:
 * - SEO opportunity identification
 * - Content generation and optimization
 * - Google Search Console data sync
 * - Performance analytics
 * - A/B test management
 */

import { Worker, Job } from 'bullmq';
import {
  createRedisConnection,
  QUEUE_NAMES,
  initializeScheduledJobs,
  getScheduledJobs,
  handleContentGenerate,
  handleContentOptimize,
  handleContentReview,
  handleGscSync,
  handleGscSetup,
  handleOpportunityScan,
  handleSiteCreate,
  handleSiteDeploy,
  handleDomainRegister,
  handleDomainVerify,
  handleSslProvision,
  handleMetricsAggregate,
  handlePerformanceReport,
  handleABTestAnalyze,
  handleABTestRebalance,
  processAllSiteRoadmaps,
  // SEO recursive optimization handlers
  handleSEOAudit,
  handleRecursiveOptimize,
  handleBatchOptimize,
  handleWeeklyAuditScheduler,
} from '@experience-marketplace/jobs';
import { prisma, JobStatus } from '@experience-marketplace/database';
import type { JobType } from '@experience-marketplace/database';

/**
 * Update job status in the database
 */
async function updateJobStatus(
  job: Job,
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING',
  result?: object,
  error?: string
) {
  const dbJobId = (job.data as { dbJobId?: string }).dbJobId;
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

// Environment configuration
const PORT = process.env['PORT'] || 3002;
const NODE_ENV = process.env['NODE_ENV'] || 'development';

console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 Demand Generation Service                             ║
║  Autonomous Background Worker for Content & SEO           ║
╚═══════════════════════════════════════════════════════════╝
`);

console.log(`Environment: ${NODE_ENV}`);
console.log(`Port: ${PORT}`);

// Initialize Redis connection
const connection = createRedisConnection();

// Worker configuration
const workerOptions = {
  connection,
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
};

// Content worker needs lower concurrency to avoid Anthropic API rate limits
// (4,000 output tokens/minute limit on basic tier)
const contentWorkerOptions = {
  connection,
  concurrency: 1, // Process one content job at a time to stay within rate limits
  limiter: {
    max: 2,
    duration: 60000, // Max 2 jobs per minute
  },
};

/**
 * Content Queue Worker
 * Handles: CONTENT_GENERATE, CONTENT_OPTIMIZE, CONTENT_REVIEW
 */
const contentWorker = new Worker(
  QUEUE_NAMES.CONTENT,
  async (job: Job) => {
    console.log(`[Content Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'CONTENT_GENERATE':
        return await handleContentGenerate(job);
      case 'CONTENT_OPTIMIZE':
        return await handleContentOptimize(job);
      case 'CONTENT_REVIEW':
        return await handleContentReview(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  contentWorkerOptions // Use lower concurrency to respect Anthropic API rate limits
);

/**
 * SEO Queue Worker
 * Handles: SEO_ANALYZE, SEO_OPPORTUNITY_SCAN, SEO_OPPORTUNITY_OPTIMIZE
 * Also handles recursive SEO optimization jobs: audit, recursive_optimize, batch_optimize, weekly_scheduler
 */
const seoWorker = new Worker(
  QUEUE_NAMES.SEO,
  async (job: Job) => {
    console.log(`[SEO Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType | string) {
      case 'SEO_ANALYZE':
        // Use the health audit for SEO analysis
        return await handleSEOAudit(job);
      case 'SEO_OPPORTUNITY_SCAN':
        return await handleOpportunityScan(job);
      case 'SEO_OPPORTUNITY_OPTIMIZE':
        // Recursive optimization with learning
        return await handleRecursiveOptimize(job);
      // Custom job names for the recursive SEO system
      case 'audit':
        return await handleSEOAudit(job);
      case 'recursive_optimize':
        return await handleRecursiveOptimize(job);
      case 'batch_optimize':
        return await handleBatchOptimize(job);
      case 'weekly_scheduler':
        return await handleWeeklyAuditScheduler(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  workerOptions
);

/**
 * GSC Queue Worker
 * Handles: GSC_SYNC, GSC_SETUP, GSC_VERIFY
 */
const gscWorker = new Worker(
  QUEUE_NAMES.GSC,
  async (job: Job) => {
    console.log(`[GSC Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'GSC_SYNC':
        return await handleGscSync(job);
      case 'GSC_SETUP':
      case 'GSC_VERIFY':
        return await handleGscSetup(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  workerOptions
);

/**
 * Site Management Queue Worker
 * Handles: SITE_CREATE, SITE_DEPLOY
 */
const siteWorker = new Worker(
  QUEUE_NAMES.SITE,
  async (job: Job) => {
    console.log(`[Site Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'SITE_CREATE':
        return await handleSiteCreate(job);
      case 'SITE_DEPLOY':
        return await handleSiteDeploy(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  workerOptions
);

/**
 * Domain Management Queue Worker
 * Handles: DOMAIN_REGISTER, DOMAIN_VERIFY, SSL_PROVISION
 */
const domainWorker = new Worker(
  QUEUE_NAMES.DOMAIN,
  async (job: Job) => {
    console.log(`[Domain Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'DOMAIN_REGISTER':
        return await handleDomainRegister(job);
      case 'DOMAIN_VERIFY':
        return await handleDomainVerify(job);
      case 'SSL_PROVISION':
        return await handleSslProvision(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  workerOptions
);

/**
 * Analytics Queue Worker
 * Handles: METRICS_AGGREGATE, PERFORMANCE_REPORT
 */
const analyticsWorker = new Worker(
  QUEUE_NAMES.ANALYTICS,
  async (job: Job) => {
    console.log(`[Analytics Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'METRICS_AGGREGATE':
        return await handleMetricsAggregate(job);
      case 'PERFORMANCE_REPORT':
        return await handlePerformanceReport(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  workerOptions
);

/**
 * A/B Testing Queue Worker
 * Handles: ABTEST_ANALYZE, ABTEST_REBALANCE
 */
const abtestWorker = new Worker(
  QUEUE_NAMES.ABTEST,
  async (job: Job) => {
    console.log(`[A/B Test Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'ABTEST_ANALYZE':
        return await handleABTestAnalyze(job);
      case 'ABTEST_REBALANCE':
        return await handleABTestRebalance(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  workerOptions
);

// Worker event handlers
const workers = [
  contentWorker,
  seoWorker,
  gscWorker,
  siteWorker,
  domainWorker,
  analyticsWorker,
  abtestWorker,
];

workers.forEach((worker) => {
  worker.on('completed', async (job, result) => {
    console.log(`✓ Job ${job.id} (${job.name}) completed successfully`);
    await updateJobStatus(job, 'COMPLETED', result as object);
  });

  worker.on('failed', async (job, err) => {
    console.error(`✗ Job ${job?.id} (${job?.name}) failed:`, err.message);
    if (job) {
      // Check if job will be retried
      const willRetry = job.attemptsMade < (job.opts.attempts || 3);
      await updateJobStatus(job, willRetry ? 'RETRYING' : 'FAILED', undefined, err.message);
    }
  });

  worker.on('error', (err) => {
    console.error(`Worker error:`, err);
  });
});

// Initialize scheduled jobs
async function setupScheduledJobs() {
  try {
    await initializeScheduledJobs();
    console.log('\n✓ Scheduled jobs initialized\n');

    // Log schedule
    const schedule = getScheduledJobs();
    console.log('📅 Job Schedule:');
    schedule.forEach((job) => {
      console.log(`   ${job.jobType.padEnd(25)} ${job.schedule.padEnd(15)} ${job.description}`);
    });
    console.log('');
  } catch (error) {
    console.error('Failed to initialize scheduled jobs:', error);
  }
}

// Autonomous roadmap processing interval (in milliseconds)
// Process all site roadmaps every 5 minutes to automatically progress tasks
const ROADMAP_PROCESS_INTERVAL = 5 * 60 * 1000; // 5 minutes
let roadmapProcessorInterval: NodeJS.Timeout | null = null;

async function startAutonomousRoadmapProcessor() {
  console.log(`\n🤖 Starting autonomous roadmap processor (every ${ROADMAP_PROCESS_INTERVAL / 60000} minutes)`);

  // Run immediately on startup
  try {
    const result = await processAllSiteRoadmaps();
    console.log(
      `   Initial run: ${result.sitesProcessed} sites processed, ${result.tasksQueued} tasks queued`
    );
  } catch (error) {
    console.error('   Initial roadmap processing failed:', error);
  }

  // Then run on interval
  roadmapProcessorInterval = setInterval(async () => {
    try {
      const result = await processAllSiteRoadmaps();
      if (result.tasksQueued > 0 || result.errors.length > 0) {
        console.log(
          `[Autonomous] Processed ${result.sitesProcessed} sites, queued ${result.tasksQueued} tasks` +
            (result.errors.length > 0 ? `, ${result.errors.length} errors` : '')
        );
      }
    } catch (error) {
      console.error('[Autonomous] Roadmap processing error:', error);
    }
  }, ROADMAP_PROCESS_INTERVAL);

  console.log('   ✓ Autonomous roadmap processor started\n');
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  try {
    // Stop autonomous roadmap processor
    if (roadmapProcessorInterval) {
      clearInterval(roadmapProcessorInterval);
      console.log('✓ Autonomous roadmap processor stopped');
    }

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

// Startup
console.log('Workers initialized:');
console.log('  ✓ Content Worker (content generation, optimization, review)');
console.log('  ✓ SEO Worker (opportunity scan, SEO analysis)');
console.log('  ✓ GSC Worker (Google Search Console sync)');
console.log('  ✓ Site Worker (site creation, deployment)');
console.log('  ✓ Domain Worker (domain registration, verification, SSL)');
console.log('  ✓ Analytics Worker (metrics aggregation, reports)');
console.log('  ✓ A/B Test Worker (test analysis, rebalancing)');
console.log('');

// Set up scheduled jobs and autonomous processor after a short delay to ensure workers are ready
setTimeout(async () => {
  await setupScheduledJobs().catch(console.error);
  await startAutonomousRoadmapProcessor().catch(console.error);
}, 2000);

console.log('🎯 Demand Generation Service is running and ready to process jobs\n');

// Keep the process alive
process.stdin.resume();

export {
  contentWorker,
  seoWorker,
  gscWorker,
  siteWorker,
  domainWorker,
  analyticsWorker,
  abtestWorker,
};
