/**
 * Site Roadmap Service
 * Creates and manages the task roadmap for getting a site live
 */

import { prisma, JobType, DomainStatus, SiteStatus } from '@experience-marketplace/database';
import { addJob } from '../queues/index.js';

/**
 * Process all sites' roadmaps autonomously
 * This is called on a schedule to automatically progress sites through their lifecycle
 */
export async function processAllSiteRoadmaps(): Promise<{
  sitesProcessed: number;
  tasksQueued: number;
  errors: string[];
}> {
  console.log('[Autonomous Roadmap] Starting automatic roadmap processing...');

  // Find all sites that:
  // 1. Are not paused (autonomousProcessesPaused = false)
  // 2. Are not in a terminal state (ACTIVE status means fully launched)
  const sites = await prisma.site.findMany({
    where: {
      autonomousProcessesPaused: false,
      status: {
        notIn: [SiteStatus.PAUSED], // Allow processing for all non-paused sites
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  console.log(`[Autonomous Roadmap] Found ${sites.length} sites to process`);

  let totalTasksQueued = 0;
  const errors: string[] = [];

  for (const site of sites) {
    try {
      const result = await executeNextTasks(site.id);

      if (result.queued.length > 0) {
        console.log(
          `[Autonomous Roadmap] Site "${site.name}": Queued ${result.queued.length} task(s): ${result.queued.join(', ')}`
        );
        totalTasksQueued += result.queued.length;
      }

      if (result.requeued.length > 0) {
        console.log(
          `[Autonomous Roadmap] Site "${site.name}": Cleaned up ${result.requeued.length} invalid job(s)`
        );
      }
    } catch (error) {
      const errorMsg = `Site ${site.id} (${site.name}): ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[Autonomous Roadmap] Error:`, errorMsg);
      errors.push(errorMsg);
    }
  }

  console.log(
    `[Autonomous Roadmap] Complete. Processed ${sites.length} sites, queued ${totalTasksQueued} tasks, ${errors.length} errors`
  );

  return {
    sitesProcessed: sites.length,
    tasksQueued: totalTasksQueued,
    errors,
  };
}

/**
 * Artifact validation - verify that actual database artifacts exist for completed tasks
 * This prevents showing tasks as "complete" when the job record exists but no actual work was done
 */
async function validateTaskArtifacts(
  siteId: string
): Promise<Record<JobType, { valid: boolean; reason?: string }>> {
  // Fetch all relevant artifacts for the site
  const [contentCount, domains, site] = await Promise.all([
    prisma.content.count({ where: { siteId, isAiGenerated: true } }),
    prisma.domain.findMany({ where: { siteId } }),
    prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        primaryDomain: true,
        gscVerified: true,
        gscPropertyUrl: true,
        gscLastSyncedAt: true,
        seoConfig: true,
      },
    }),
  ]);

  const activeDomains = domains.filter((d) => d.status === DomainStatus.ACTIVE);
  const verifiedDomains = domains.filter((d) => d.verifiedAt !== null);
  const sslEnabledDomains = domains.filter((d) => d.sslEnabled);
  const gscConfigured = !!site?.gscPropertyUrl;
  const gscVerified = !!site?.gscVerified;

  return {
    SITE_CREATE: {
      valid: !!site,
      reason: site ? undefined : 'Site record not found',
    },
    CONTENT_GENERATE: {
      valid: contentCount > 0,
      reason: contentCount > 0 ? undefined : 'No AI-generated content found',
    },
    CONTENT_OPTIMIZE: {
      valid: contentCount > 0, // Optimized content replaces original
      reason: contentCount > 0 ? undefined : 'No content to optimize',
    },
    CONTENT_REVIEW: {
      valid: contentCount > 0,
      reason: contentCount > 0 ? undefined : 'No content to review',
    },
    DOMAIN_REGISTER: {
      valid: domains.length > 0,
      reason: domains.length > 0 ? undefined : 'No domain registered for site',
    },
    DOMAIN_VERIFY: {
      valid: verifiedDomains.length > 0,
      reason: verifiedDomains.length > 0 ? undefined : 'No verified domains found',
    },
    SSL_PROVISION: {
      valid: sslEnabledDomains.length > 0,
      reason: sslEnabledDomains.length > 0 ? undefined : 'No domains with SSL enabled',
    },
    GSC_SETUP: {
      valid: gscConfigured,
      reason: gscConfigured ? undefined : 'No GSC property URL configured',
    },
    GSC_VERIFY: {
      valid: gscVerified,
      reason: gscVerified ? undefined : 'GSC not verified',
    },
    GSC_SYNC: {
      valid: gscVerified, // Sync requires verified GSC
      reason: gscVerified ? undefined : 'GSC not ready for sync',
    },
    GA4_SETUP: {
      valid: !!(site?.seoConfig as any)?.gaMeasurementId,
      reason: (site?.seoConfig as any)?.gaMeasurementId ? undefined : 'No GA4 measurement ID configured',
    },
    SITE_DEPLOY: {
      valid: !!site?.primaryDomain && activeDomains.length > 0,
      reason:
        site?.primaryDomain && activeDomains.length > 0
          ? undefined
          : 'Site not deployed (no active domain)',
    },
    SEO_ANALYZE: {
      valid: true, // Analytics tasks don't create persistent artifacts
    },
    SEO_OPPORTUNITY_SCAN: {
      valid: true,
    },
    SEO_OPPORTUNITY_OPTIMIZE: {
      valid: true,
    },
    METRICS_AGGREGATE: {
      valid: true,
    },
    PERFORMANCE_REPORT: {
      valid: true,
    },
    ABTEST_ANALYZE: {
      valid: true,
    },
    ABTEST_REBALANCE: {
      valid: true,
    },
    LINK_OPPORTUNITY_SCAN: {
      valid: true,
    },
    LINK_BACKLINK_MONITOR: {
      valid: true,
    },
    LINK_OUTREACH_GENERATE: {
      valid: true,
    },
    LINK_ASSET_GENERATE: {
      valid: true,
    },
  };
}

/**
 * Site lifecycle phases and their tasks
 */
export const SITE_LIFECYCLE_PHASES = {
  setup: {
    name: 'Site Setup',
    description: 'Creating site structure and brand identity',
    tasks: ['SITE_CREATE'] as JobType[],
  },
  content: {
    name: 'Content Creation',
    description: 'Generating and optimizing site content',
    tasks: ['CONTENT_GENERATE', 'CONTENT_OPTIMIZE', 'CONTENT_REVIEW'] as JobType[],
  },
  domain: {
    name: 'Domain & SSL',
    description: 'Registering domain and setting up SSL',
    tasks: ['DOMAIN_REGISTER', 'DOMAIN_VERIFY', 'SSL_PROVISION'] as JobType[],
  },
  seo: {
    name: 'SEO & Analytics',
    description: 'Setting up Google Search Console, Analytics, and SEO',
    tasks: ['GSC_SETUP', 'GSC_VERIFY', 'GA4_SETUP', 'GSC_SYNC'] as JobType[],
  },
  launch: {
    name: 'Site Launch',
    description: 'Deploying site to production',
    tasks: ['SITE_DEPLOY'] as JobType[],
  },
  optimization: {
    name: 'Ongoing Optimization',
    description: 'Continuous content and performance optimization',
    tasks: ['SEO_ANALYZE', 'SEO_OPPORTUNITY_SCAN', 'SEO_OPPORTUNITY_OPTIMIZE', 'ABTEST_ANALYZE', 'METRICS_AGGREGATE'] as JobType[],
  },
};

/**
 * Task descriptions for user-friendly display
 */
export const TASK_DESCRIPTIONS: Record<JobType, { label: string; description: string }> = {
  SITE_CREATE: { label: 'Create Site', description: 'Set up site structure and brand identity' },
  CONTENT_GENERATE: { label: 'Generate Content', description: 'Write homepage and key pages using AI' },
  CONTENT_OPTIMIZE: { label: 'Optimize Content', description: 'Improve content for SEO and conversions' },
  CONTENT_REVIEW: { label: 'Review Content', description: 'Quality check all generated content' },
  DOMAIN_REGISTER: { label: 'Register Domain', description: 'Purchase and configure domain name' },
  DOMAIN_VERIFY: { label: 'Verify Domain', description: 'Confirm domain ownership and DNS settings' },
  SSL_PROVISION: { label: 'Setup SSL', description: 'Install security certificate for HTTPS' },
  GSC_SETUP: { label: 'Setup Search Console', description: 'Add site to Google Search Console' },
  GSC_VERIFY: { label: 'Verify Search Console', description: 'Verify site ownership in GSC' },
  GA4_SETUP: { label: 'Setup Google Analytics', description: 'Create GA4 property and tracking' },
  GSC_SYNC: { label: 'Sync Search Data', description: 'Import search performance data' },
  SEO_ANALYZE: { label: 'Analyze SEO', description: 'Check and improve search optimization' },
  SEO_OPPORTUNITY_SCAN: { label: 'Scan Opportunities', description: 'Find new keyword opportunities' },
  SEO_OPPORTUNITY_OPTIMIZE: { label: 'Optimize Opportunities', description: 'Recursive AI optimization for SEO' },
  SITE_DEPLOY: { label: 'Deploy Site', description: 'Publish site to the web' },
  METRICS_AGGREGATE: { label: 'Collect Metrics', description: 'Gather performance analytics' },
  PERFORMANCE_REPORT: { label: 'Generate Report', description: 'Create performance summary' },
  ABTEST_ANALYZE: { label: 'Analyze Tests', description: 'Evaluate A/B test results' },
  ABTEST_REBALANCE: { label: 'Optimize Traffic', description: 'Adjust A/B test traffic allocation' },
  LINK_OPPORTUNITY_SCAN: { label: 'Scan Link Opportunities', description: 'Analyze competitor backlinks for link building' },
  LINK_BACKLINK_MONITOR: { label: 'Monitor Backlinks', description: 'Check existing backlinks and discover new ones' },
  LINK_OUTREACH_GENERATE: { label: 'Generate Outreach', description: 'Create personalized outreach emails' },
  LINK_ASSET_GENERATE: { label: 'Create Link Asset', description: 'Generate link-attracting content' },
};

/**
 * Initialize the full roadmap of tasks for a new site
 * Creates PENDING job records for all lifecycle tasks
 */
export async function initializeSiteRoadmap(siteId: string): Promise<void> {
  console.log(`[Site Roadmap] Initializing roadmap for site ${siteId}`);

  // Get all planned tasks in order
  const plannedTasks: { type: JobType; priority: number }[] = [
    // Phase 1: Setup (already queued by site creation)
    // SITE_CREATE is queued when opportunity is actioned

    // Phase 2: Content
    { type: 'CONTENT_GENERATE', priority: 3 },
    { type: 'CONTENT_OPTIMIZE', priority: 4 },
    { type: 'CONTENT_REVIEW', priority: 5 },

    // Phase 3: Domain
    { type: 'DOMAIN_REGISTER', priority: 3 },
    { type: 'DOMAIN_VERIFY', priority: 4 },
    { type: 'SSL_PROVISION', priority: 5 },

    // Phase 4: SEO & Analytics
    { type: 'GSC_SETUP', priority: 4 },
    { type: 'GSC_VERIFY', priority: 5 },
    { type: 'GA4_SETUP', priority: 5 },

    // Phase 5: Launch
    { type: 'SITE_DEPLOY', priority: 2 },

    // Phase 6: Ongoing (scheduled after launch)
    { type: 'SEO_ANALYZE', priority: 6 },
    { type: 'SEO_OPPORTUNITY_SCAN', priority: 7 },
    { type: 'SEO_OPPORTUNITY_OPTIMIZE', priority: 8 },
    { type: 'METRICS_AGGREGATE', priority: 9 },
  ];

  // Create pending job records for tasks that don't already exist
  for (const task of plannedTasks) {
    // Check if job already exists for this site and type
    const existingJob = await prisma.job.findFirst({
      where: {
        siteId,
        type: task.type,
      },
    });

    if (!existingJob) {
      await prisma.job.create({
        data: {
          type: task.type,
          queue: 'planned', // Special queue for planned/not-yet-queued jobs
          payload: { siteId, planned: true },
          status: 'PENDING',
          priority: task.priority,
          siteId,
        },
      });
      console.log(`[Site Roadmap] Created planned task: ${task.type}`);
    }
  }

  console.log(`[Site Roadmap] Roadmap initialized for site ${siteId}`);
}

/**
 * Get the roadmap status for a site
 * Returns all tasks organized by phase with their current status
 * IMPORTANT: Validates that actual artifacts exist before showing tasks as complete
 */
export async function getSiteRoadmap(siteId: string) {
  const [jobs, artifactValidation] = await Promise.all([
    prisma.job.findMany({
      where: { siteId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    }),
    validateTaskArtifacts(siteId),
  ]);

  // Group jobs by phase
  const phases = Object.entries(SITE_LIFECYCLE_PHASES).map(([key, phase]) => {
    const phaseTasks = phase.tasks.map((taskType) => {
      const job = jobs.find((j) => j.type === taskType);
      const taskInfo = TASK_DESCRIPTIONS[taskType];
      const validation = artifactValidation[taskType];

      // Determine effective status:
      // - If job says COMPLETED but artifact doesn't exist, mark as INVALID
      // - This catches legacy jobs that were marked complete without actual work
      let effectiveStatus = job?.status || 'PLANNED';
      let validationError: string | undefined;

      if (job?.status === 'COMPLETED' && !validation.valid) {
        effectiveStatus = 'INVALID';
        validationError = validation.reason;
        console.warn(
          `[Roadmap] Task ${taskType} marked COMPLETED but artifact validation failed: ${validation.reason}`
        );
      }

      return {
        type: taskType,
        label: taskInfo.label,
        description: taskInfo.description,
        status: effectiveStatus,
        validationError,
        job: job
          ? {
              id: job.id,
              status: job.status,
              startedAt: job.startedAt,
              completedAt: job.completedAt,
              error: job.error,
              attempts: job.attempts,
            }
          : null,
      };
    });

    // Calculate phase status (INVALID counts as failed for phase calculation)
    const completedTasks = phaseTasks.filter((t) => t.status === 'COMPLETED').length;
    const failedTasks = phaseTasks.filter(
      (t) => t.status === 'FAILED' || t.status === 'INVALID'
    ).length;
    const runningTasks = phaseTasks.filter((t) => t.status === 'RUNNING').length;
    const totalTasks = phaseTasks.length;

    let phaseStatus: 'pending' | 'in_progress' | 'completed' | 'failed' = 'pending';
    if (failedTasks > 0) phaseStatus = 'failed';
    else if (completedTasks === totalTasks) phaseStatus = 'completed';
    else if (runningTasks > 0 || completedTasks > 0) phaseStatus = 'in_progress';

    return {
      key,
      name: phase.name,
      description: phase.description,
      status: phaseStatus,
      progress: {
        completed: completedTasks,
        total: totalTasks,
        percentage: Math.round((completedTasks / totalTasks) * 100),
      },
      tasks: phaseTasks,
    };
  });

  // Calculate overall progress (only count truly completed tasks)
  const allTasks = phases.flatMap((p) => p.tasks);
  const completedCount = allTasks.filter((t) => t.status === 'COMPLETED').length;
  const invalidCount = allTasks.filter((t) => t.status === 'INVALID').length;
  const totalCount = allTasks.length;

  return {
    siteId,
    phases,
    overall: {
      completed: completedCount,
      total: totalCount,
      percentage: Math.round((completedCount / totalCount) * 100),
      invalidTasks: invalidCount,
    },
  };
}

/**
 * Task dependencies - which tasks must be completed before others can start
 */
const TASK_DEPENDENCIES: Partial<Record<JobType, JobType[]>> = {
  CONTENT_OPTIMIZE: ['CONTENT_GENERATE'],
  CONTENT_REVIEW: ['CONTENT_OPTIMIZE'],
  DOMAIN_VERIFY: ['DOMAIN_REGISTER'],
  SSL_PROVISION: ['DOMAIN_VERIFY'],
  GSC_VERIFY: ['GSC_SETUP'],
  GSC_SYNC: ['GSC_VERIFY'],
  SITE_DEPLOY: ['CONTENT_REVIEW', 'SSL_PROVISION'],
  SEO_ANALYZE: ['SITE_DEPLOY'],
  SEO_OPPORTUNITY_SCAN: ['SEO_ANALYZE'],
  SEO_OPPORTUNITY_OPTIMIZE: ['SEO_OPPORTUNITY_SCAN'],
  METRICS_AGGREGATE: ['SITE_DEPLOY'],
};

/**
 * Get payload for a specific job type
 */
function getJobPayload(siteId: string, jobType: JobType): Record<string, unknown> {
  const basePayload = { siteId };

  switch (jobType) {
    case 'CONTENT_GENERATE':
      return { ...basePayload, contentType: 'destination' };
    case 'CONTENT_OPTIMIZE':
      return { ...basePayload, optimizationType: 'seo' };
    case 'CONTENT_REVIEW':
      return { ...basePayload, reviewType: 'quality' };
    case 'DOMAIN_REGISTER':
      return { ...basePayload, registrar: 'cloudflare', autoRenew: true };
    case 'DOMAIN_VERIFY':
      return { ...basePayload };
    case 'SSL_PROVISION':
      return { ...basePayload };
    case 'GSC_SETUP':
      return { ...basePayload };
    case 'GSC_VERIFY':
      return { ...basePayload };
    case 'GSC_SYNC':
      return { ...basePayload };
    case 'GA4_SETUP':
      return { ...basePayload };
    case 'SITE_DEPLOY':
      return { ...basePayload, environment: 'staging' };
    case 'SEO_ANALYZE':
      return { ...basePayload };
    case 'METRICS_AGGREGATE':
      return { ...basePayload, aggregationType: 'daily' };
    default:
      return basePayload;
  }
}

/**
 * Execute the next pending tasks for a site
 * Respects task dependencies and phase order
 * Also re-queues tasks that are marked COMPLETED but have no artifacts
 */
export async function executeNextTasks(siteId: string): Promise<{
  queued: string[];
  skipped: string[];
  blocked: string[];
  requeued: string[];
  message: string;
}> {
  console.log(`[Site Roadmap] Executing next tasks for site ${siteId}`);

  // Get all jobs and validate artifacts
  const [jobs, artifactValidation] = await Promise.all([
    prisma.job.findMany({ where: { siteId } }),
    validateTaskArtifacts(siteId),
  ]);

  // Build set of truly completed jobs (both status AND artifact exist)
  const completedJobs = new Set(
    jobs
      .filter((j) => j.status === 'COMPLETED' && artifactValidation[j.type]?.valid)
      .map((j) => j.type)
  );

  // Jobs marked completed but without artifacts (need re-run)
  const invalidCompletedJobs = jobs.filter(
    (j) => j.status === 'COMPLETED' && !artifactValidation[j.type]?.valid
  );

  const runningOrPendingJobs = new Set(
    jobs.filter((j) => ['RUNNING', 'PENDING', 'SCHEDULED'].includes(j.status)).map((j) => j.type)
  );

  const queued: string[] = [];
  const skipped: string[] = [];
  const blocked: string[] = [];
  const requeued: string[] = [];

  // First, handle invalid completed jobs - delete them so they can be re-queued
  for (const invalidJob of invalidCompletedJobs) {
    console.log(
      `[Site Roadmap] Found invalid completed job ${invalidJob.type} - artifact missing: ${artifactValidation[invalidJob.type]?.reason}`
    );
    await prisma.job.delete({ where: { id: invalidJob.id } });
    requeued.push(`${invalidJob.type} (${artifactValidation[invalidJob.type]?.reason})`);
  }

  // Define execution order (respecting phases)
  const executionOrder: JobType[] = [
    'CONTENT_GENERATE',
    'DOMAIN_REGISTER',
    'CONTENT_OPTIMIZE',
    'DOMAIN_VERIFY',
    'CONTENT_REVIEW',
    'SSL_PROVISION',
    'GSC_SETUP',
    'GSC_VERIFY',
    'GA4_SETUP',
    'GSC_SYNC',
    'SITE_DEPLOY',
    'SEO_ANALYZE',
    'SEO_OPPORTUNITY_SCAN',
    'SEO_OPPORTUNITY_OPTIMIZE',
    'METRICS_AGGREGATE',
  ];

  for (const jobType of executionOrder) {
    // Skip if already completed (with valid artifact)
    if (completedJobs.has(jobType)) {
      skipped.push(jobType);
      continue;
    }

    // Skip if already running or pending
    if (runningOrPendingJobs.has(jobType)) {
      skipped.push(jobType);
      continue;
    }

    // Check dependencies (only against truly completed jobs with artifacts)
    const dependencies = TASK_DEPENDENCIES[jobType] || [];
    const unmetDependencies = dependencies.filter((dep) => !completedJobs.has(dep));

    if (unmetDependencies.length > 0) {
      blocked.push(`${jobType} (waiting for: ${unmetDependencies.join(', ')})`);
      continue;
    }

    // Queue this job
    try {
      const payload = getJobPayload(siteId, jobType);

      // Delete the placeholder job if it exists
      const placeholderJob = jobs.find((j) => j.type === jobType && j.queue === 'planned');
      if (placeholderJob) {
        await prisma.job.delete({ where: { id: placeholderJob.id } });
      }

      // Queue the actual job
      await addJob(jobType, payload);
      queued.push(jobType);
      console.log(`[Site Roadmap] Queued job: ${jobType}`);
    } catch (error) {
      console.error(`[Site Roadmap] Failed to queue ${jobType}:`, error);
      blocked.push(`${jobType} (error: ${error instanceof Error ? error.message : 'unknown'})`);
    }
  }

  const messages: string[] = [];
  if (requeued.length > 0) {
    messages.push(`Cleaned up ${requeued.length} invalid job(s)`);
  }
  if (queued.length > 0) {
    messages.push(`Queued ${queued.length} task(s) for execution`);
  }
  if (messages.length === 0) {
    if (blocked.length > 0) {
      messages.push('No tasks could be queued - check blocked tasks for dependencies');
    } else {
      messages.push('All tasks are already completed or in progress');
    }
  }

  return { queued, skipped, blocked, requeued, message: messages.join('. ') };
}
