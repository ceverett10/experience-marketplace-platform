/**
 * Site Roadmap Service
 * Creates and manages the task roadmap for getting a site live
 */

import { prisma, JobType } from '@experience-marketplace/database';

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
    name: 'SEO Configuration',
    description: 'Setting up Google Search Console and SEO',
    tasks: ['GSC_SETUP', 'GSC_VERIFY', 'GSC_SYNC'] as JobType[],
  },
  launch: {
    name: 'Site Launch',
    description: 'Deploying site to production',
    tasks: ['SITE_DEPLOY'] as JobType[],
  },
  optimization: {
    name: 'Ongoing Optimization',
    description: 'Continuous content and performance optimization',
    tasks: ['SEO_ANALYZE', 'ABTEST_ANALYZE', 'METRICS_AGGREGATE'] as JobType[],
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
  GSC_SYNC: { label: 'Sync Search Data', description: 'Import search performance data' },
  SEO_ANALYZE: { label: 'Analyze SEO', description: 'Check and improve search optimization' },
  SEO_OPPORTUNITY_SCAN: { label: 'Scan Opportunities', description: 'Find new keyword opportunities' },
  SITE_DEPLOY: { label: 'Deploy Site', description: 'Publish site to the web' },
  METRICS_AGGREGATE: { label: 'Collect Metrics', description: 'Gather performance analytics' },
  PERFORMANCE_REPORT: { label: 'Generate Report', description: 'Create performance summary' },
  ABTEST_ANALYZE: { label: 'Analyze Tests', description: 'Evaluate A/B test results' },
  ABTEST_REBALANCE: { label: 'Optimize Traffic', description: 'Adjust A/B test traffic allocation' },
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

    // Phase 4: SEO
    { type: 'GSC_SETUP', priority: 4 },
    { type: 'GSC_VERIFY', priority: 5 },

    // Phase 5: Launch
    { type: 'SITE_DEPLOY', priority: 2 },

    // Phase 6: Ongoing (scheduled after launch)
    { type: 'SEO_ANALYZE', priority: 6 },
    { type: 'METRICS_AGGREGATE', priority: 7 },
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
 */
export async function getSiteRoadmap(siteId: string) {
  const jobs = await prisma.job.findMany({
    where: { siteId },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  // Group jobs by phase
  const phases = Object.entries(SITE_LIFECYCLE_PHASES).map(([key, phase]) => {
    const phaseTasks = phase.tasks.map((taskType) => {
      const job = jobs.find((j) => j.type === taskType);
      const taskInfo = TASK_DESCRIPTIONS[taskType];

      return {
        type: taskType,
        label: taskInfo.label,
        description: taskInfo.description,
        status: job?.status || 'PLANNED',
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

    // Calculate phase status
    const completedTasks = phaseTasks.filter((t) => t.status === 'COMPLETED').length;
    const failedTasks = phaseTasks.filter((t) => t.status === 'FAILED').length;
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

  // Calculate overall progress
  const allTasks = phases.flatMap((p) => p.tasks);
  const completedCount = allTasks.filter((t) => t.status === 'COMPLETED').length;
  const totalCount = allTasks.length;

  return {
    siteId,
    phases,
    overall: {
      completed: completedCount,
      total: totalCount,
      percentage: Math.round((completedCount / totalCount) * 100),
    },
  };
}
