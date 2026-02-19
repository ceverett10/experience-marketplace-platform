/**
 * Worker Infra Process — Infrastructure management + scheduler
 *
 * Handles: Site, Domain, GSC workers
 * Also runs: BullMQ scheduler (cron repeatables), autonomous roadmap processor
 * Dyno: Standard-1X (512MB) — lightweight
 * Total concurrency: 6
 *
 * Scheduler is gated by ENABLE_SCHEDULER=true env var to prevent
 * duplicate cron registrations when multiple instances run.
 */

import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  queueRegistry,
  initializeScheduledJobs,
  getScheduledJobs,
  runPipelineHealthCheck,
  processAllSiteRoadmaps,
  detectStuckTasks,
  // Worker handlers
  handleGscSync,
  handleGscSetup,
  handleGscVerify,
  handleSiteCreate,
  handleSiteDeploy,
  handleDomainRegister,
  handleDomainVerify,
  handleSslProvision,
} from '@experience-marketplace/jobs';
import type { JobType } from '@experience-marketplace/database';
import {
  createConnection,
  updateJobStatus,
  makeWorkerOptions,
  setupWorkerEvents,
  startMemoryMonitoring,
  setupGracefulShutdown,
  logBanner,
} from './worker-common';

const connection = createConnection();
const ENABLE_SCHEDULER = process.env['ENABLE_SCHEDULER'] === 'true';

// ── GSC Worker (concurrency 2) ──────────────────────────────────────────
const gscWorker = new Worker(
  QUEUE_NAMES.GSC,
  async (job: Job) => {
    console.log(`[GSC Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType) {
      case 'GSC_SYNC':
        return await handleGscSync(job);
      case 'GSC_SETUP':
        return await handleGscSetup(job);
      case 'GSC_VERIFY':
        return await handleGscVerify(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(connection, QUEUE_NAMES.GSC, 2),
);

// ── Site Worker (concurrency 2) ─────────────────────────────────────────
const siteWorker = new Worker(
  QUEUE_NAMES.SITE,
  async (job: Job) => {
    console.log(`[Site Worker] Processing ${job.name} job ${job.id}`);
    await updateJobStatus(job, 'RUNNING');

    switch (job.name as JobType | string) {
      case 'SITE_CREATE':
        return await handleSiteCreate(job);
      case 'SITE_DEPLOY':
        return await handleSiteDeploy(job);
      case 'PIPELINE_HEALTH_CHECK':
        return await runPipelineHealthCheck();
      case 'REDIS_QUEUE_CLEANUP':
        return await queueRegistry.cleanAllQueues();
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  makeWorkerOptions(connection, QUEUE_NAMES.SITE, 2),
);

// ── Domain Worker (concurrency 2) ───────────────────────────────────────
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
  makeWorkerOptions(connection, QUEUE_NAMES.DOMAIN, 2),
);

// ── Setup ───────────────────────────────────────────────────────────────
const workers = [gscWorker, siteWorker, domainWorker];

setupWorkerEvents(workers, connection);
startMemoryMonitoring(connection);

// Autonomous roadmap processing
const ROADMAP_PROCESS_INTERVAL = 5 * 60 * 1000; // 5 minutes
let roadmapProcessorInterval: NodeJS.Timeout | null = null;

async function startAutonomousRoadmapProcessor() {
  console.log(
    `\nStarting autonomous roadmap processor (every ${ROADMAP_PROCESS_INTERVAL / 60000} minutes)`,
  );

  try {
    const result = await processAllSiteRoadmaps();
    console.log(
      `   Initial run: ${result.sitesProcessed} sites processed, ${result.tasksQueued} tasks queued`,
    );
  } catch (error) {
    console.error('   Initial roadmap processing failed:', error);
  }

  roadmapProcessorInterval = setInterval(async () => {
    try {
      const result = await processAllSiteRoadmaps();
      if (result.tasksQueued > 0 || result.errors.length > 0) {
        console.log(
          `[Autonomous] Processed ${result.sitesProcessed} sites, queued ${result.tasksQueued} tasks` +
            (result.errors.length > 0 ? `, ${result.errors.length} errors` : ''),
        );
      }
    } catch (error) {
      console.error('[Autonomous] Roadmap processing error:', error);
    }

    try {
      const stuckResult = await detectStuckTasks();
      if (stuckResult.healed > 0 || stuckResult.permanentlyFailed > 0) {
        console.log(
          `[Stuck Detector] Healed ${stuckResult.healed}, permanently failed ${stuckResult.permanentlyFailed}`,
        );
      }
    } catch (error) {
      console.error('[Stuck Detector] Error:', error);
    }
  }, ROADMAP_PROCESS_INTERVAL);

  console.log('   ✓ Autonomous roadmap processor started\n');
}

setupGracefulShutdown(workers, connection, () => {
  if (roadmapProcessorInterval) {
    clearInterval(roadmapProcessorInterval);
    console.log('✓ Autonomous roadmap processor stopped');
  }
});

const workerNames = [
  'GSC (concurrency 2)',
  'Site (concurrency 2)',
  'Domain (concurrency 2)',
];

if (ENABLE_SCHEDULER) {
  workerNames.push('Scheduler (BullMQ repeatables)');
  workerNames.push('Autonomous Roadmap Processor');
}

logBanner('Worker Infra Process', workerNames);

// Initialize scheduler and roadmap processor if enabled
if (ENABLE_SCHEDULER) {
  setTimeout(async () => {
    try {
      await initializeScheduledJobs();
      console.log('\n✓ Scheduled jobs initialized\n');

      const schedule = getScheduledJobs();
      console.log('Job Schedule:');
      schedule.forEach((job) => {
        console.log(`   ${job.jobType.padEnd(25)} ${job.schedule.padEnd(15)} ${job.description}`);
      });
      console.log('');
    } catch (error) {
      console.error('Failed to initialize scheduled jobs:', error);
    }

    await startAutonomousRoadmapProcessor().catch(console.error);
  }, 2000);
} else {
  console.log('Scheduler disabled (set ENABLE_SCHEDULER=true to enable)\n');
}

console.log('🎯 Worker Infra is running and ready to process jobs\n');
process.stdin.resume();

export { gscWorker, siteWorker, domainWorker };
