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
} from '@experience-marketplace/jobs';
import type { JobType } from '@experience-marketplace/database';

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

/**
 * Content Queue Worker
 * Handles: CONTENT_GENERATE, CONTENT_OPTIMIZE, CONTENT_REVIEW
 */
const contentWorker = new Worker(
  QUEUE_NAMES.CONTENT,
  async (job: Job) => {
    console.log(`[Content Worker] Processing ${job.name} job ${job.id}`);

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
  workerOptions
);

/**
 * SEO Queue Worker
 * Handles: SEO_ANALYZE, SEO_OPPORTUNITY_SCAN
 */
const seoWorker = new Worker(
  QUEUE_NAMES.SEO,
  async (job: Job) => {
    console.log(`[SEO Worker] Processing ${job.name} job ${job.id}`);

    switch (job.name as JobType) {
      case 'SEO_ANALYZE':
        console.log('[SEO Worker] SEO analysis not yet implemented');
        return { success: true, message: 'SEO analysis placeholder', timestamp: new Date() };
      case 'SEO_OPPORTUNITY_SCAN':
        return await handleOpportunityScan(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  workerOptions
);

/**
 * GSC Queue Worker
 * Handles: GSC_SYNC
 */
const gscWorker = new Worker(
  QUEUE_NAMES.GSC,
  async (job: Job) => {
    console.log(`[GSC Worker] Processing ${job.name} job ${job.id}`);

    switch (job.name as JobType) {
      case 'GSC_SYNC':
        return await handleGscSync(job);
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
  worker.on('completed', (job) => {
    console.log(`✓ Job ${job.id} (${job.name}) completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`✗ Job ${job?.id} (${job?.name}) failed:`, err.message);
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

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  try {
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

// Set up scheduled jobs after a short delay to ensure workers are ready
setTimeout(() => {
  setupScheduledJobs().catch(console.error);
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
