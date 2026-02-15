/**
 * Site Roadmap Service
 * Creates and manages the task roadmap for getting a site live
 */

import { prisma, JobType, DomainStatus, SiteStatus } from '@experience-marketplace/database';
import { addJob } from '../queues/index.js';
import { acquireLock } from './distributed-lock.js';

// Lock TTL for roadmap processing — 4 minutes (processor runs every 5 minutes)
const ROADMAP_LOCK_TTL = 4 * 60 * 1000;

/**
 * Process all sites' roadmaps autonomously
 * This is called on a schedule to automatically progress sites through their lifecycle.
 * Uses a distributed lock to prevent multiple worker instances from processing concurrently.
 */
export async function processAllSiteRoadmaps(): Promise<{
  sitesProcessed: number;
  tasksQueued: number;
  errors: string[];
}> {
  // Acquire distributed lock — only one worker instance runs at a time
  const releaseLock = await acquireLock('roadmap-processor', ROADMAP_LOCK_TTL);
  if (!releaseLock) {
    console.log('[Autonomous Roadmap] Skipping — another instance holds the lock');
    return { sitesProcessed: 0, tasksQueued: 0, errors: [] };
  }

  try {
    return await processAllSiteRoadmapsInner();
  } finally {
    await releaseLock();
  }
}

async function processAllSiteRoadmapsInner(): Promise<{
  sitesProcessed: number;
  tasksQueued: number;
  errors: string[];
}> {
  console.log('[Autonomous Roadmap] Starting automatic roadmap processing...');

  // First, clean up orphaned 'planned' queue jobs for ACTIVE/ARCHIVED sites
  // These sites no longer run autonomous processing, so planned jobs would be stuck forever
  const cleanedUp = await prisma.job.deleteMany({
    where: {
      queue: 'planned',
      status: 'PENDING',
      site: {
        status: { in: [SiteStatus.ACTIVE, SiteStatus.PAUSED, SiteStatus.ARCHIVED] },
      },
    },
  });
  if (cleanedUp.count > 0) {
    console.log(
      `[Autonomous Roadmap] Cleaned up ${cleanedUp.count} orphaned planned jobs for ACTIVE/PAUSED/ARCHIVED sites`
    );
  }

  // Find all sites that:
  // 1. Are not paused (autonomousProcessesPaused = false)
  // 2. Are not yet launched (ACTIVE) or in a terminal state (PAUSED, ARCHIVED)
  // Once a site is ACTIVE, the roadmap is complete and ongoing content is handled by the weekly blog generator
  const sites = await prisma.site.findMany({
    where: {
      autonomousProcessesPaused: false,
      status: {
        notIn: [SiteStatus.ACTIVE, SiteStatus.PAUSED, SiteStatus.ARCHIVED],
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
      reason: (site?.seoConfig as any)?.gaMeasurementId
        ? undefined
        : 'No GA4 measurement ID configured',
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
    SEO_AUTO_OPTIMIZE: {
      valid: true, // Auto-optimization doesn't require validation
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

    // Microsite Management (not part of standard site roadmap)
    MICROSITE_CREATE: { valid: true },
    MICROSITE_BRAND_GENERATE: { valid: true },
    MICROSITE_CONTENT_GENERATE: { valid: true },
    MICROSITE_PUBLISH: { valid: true },
    MICROSITE_ARCHIVE: { valid: true },
    MICROSITE_HEALTH_CHECK: { valid: true },
    MICROSITE_HOMEPAGE_ENRICH: { valid: true },

    // Holibob Sync (not part of standard site roadmap)
    SUPPLIER_SYNC: { valid: true },
    SUPPLIER_SYNC_INCREMENTAL: { valid: true },
    PRODUCT_SYNC: { valid: true },
    PRODUCT_SYNC_INCREMENTAL: { valid: true },

    // Analytics (not part of standard site roadmap)
    GA4_DAILY_SYNC: { valid: true },
    REFRESH_ANALYTICS_VIEWS: { valid: true },
    MICROSITE_GSC_SYNC: { valid: true },
    MICROSITE_ANALYTICS_SYNC: { valid: true },
    MICROSITE_GA4_SYNC: { valid: true },

    // Scheduled Maintenance (not part of standard site roadmap)
    META_TITLE_MAINTENANCE: { valid: true },
    MICROSITE_CONTENT_REFRESH: { valid: true },
    MICROSITE_SITEMAP_RESUBMIT: { valid: true },
    COLLECTION_REFRESH: { valid: true },
    AUTONOMOUS_ROADMAP: { valid: true },

    // Social Media (not part of standard site roadmap)
    SOCIAL_POST_GENERATE: { valid: true },
    SOCIAL_POST_PUBLISH: { valid: true },
    SOCIAL_DAILY_POSTING: { valid: true },

    // Paid Traffic Acquisition (not part of standard site roadmap)
    AD_CAMPAIGN_SYNC: { valid: true },
    AD_PERFORMANCE_REPORT: { valid: true },
    AD_BUDGET_OPTIMIZER: { valid: true },
    AD_CONVERSION_UPLOAD: { valid: true },
    PAID_KEYWORD_SCAN: { valid: true },
    BIDDING_ENGINE_RUN: { valid: true },
    KEYWORD_ENRICHMENT: { valid: true },
  };
}

/**
 * Site lifecycle phases and their tasks
 */
export const SITE_LIFECYCLE_PHASES = {
  setup: {
    name: 'Site Setup',
    description: 'Creating site structure and brand identity',
    estimatedMinutes: 2,
    autonomousExplanation:
      'System creates site structure, brand identity, and initial configuration',
    tasks: ['SITE_CREATE'] as JobType[],
  },
  content: {
    name: 'Content Creation',
    description: 'Generating and optimizing site content',
    estimatedMinutes: 15,
    autonomousExplanation: 'AI generates homepage and key pages, then optimizes for SEO',
    tasks: ['CONTENT_GENERATE', 'CONTENT_OPTIMIZE', 'CONTENT_REVIEW'] as JobType[],
  },
  domain: {
    name: 'Domain & SSL',
    description: 'Registering domain and setting up SSL',
    estimatedMinutes: 10,
    autonomousExplanation: 'System registers domain via Cloudflare and provisions SSL certificate',
    tasks: ['DOMAIN_REGISTER', 'DOMAIN_VERIFY', 'SSL_PROVISION'] as JobType[],
  },
  seo: {
    name: 'SEO & Analytics',
    description: 'Setting up Google Search Console, Analytics, and SEO',
    estimatedMinutes: 5,
    autonomousExplanation: 'Connects to Google Search Console and Analytics, imports initial data',
    tasks: ['GSC_SETUP', 'GSC_VERIFY', 'GA4_SETUP', 'GSC_SYNC'] as JobType[],
  },
  launch: {
    name: 'Site Launch',
    description: 'Deploying site to production',
    estimatedMinutes: 3,
    autonomousExplanation: 'Deploys site to production with your custom domain',
    tasks: ['SITE_DEPLOY'] as JobType[],
  },
  optimization: {
    name: 'Ongoing Optimization',
    description: 'Continuous content and performance optimization',
    estimatedMinutes: null, // Ongoing
    autonomousExplanation:
      'System continuously monitors and optimizes SEO, content, and performance',
    tasks: [
      'SEO_ANALYZE',
      'SEO_AUTO_OPTIMIZE',
      'SEO_OPPORTUNITY_SCAN',
      'SEO_OPPORTUNITY_OPTIMIZE',
      'ABTEST_ANALYZE',
      'METRICS_AGGREGATE',
    ] as JobType[],
  },
};

/**
 * Task descriptions for user-friendly display
 */
export const TASK_DESCRIPTIONS: Record<JobType, { label: string; description: string }> = {
  SITE_CREATE: { label: 'Create Site', description: 'Set up site structure and brand identity' },
  CONTENT_GENERATE: {
    label: 'Generate Content',
    description: 'Write homepage and key pages using AI',
  },
  CONTENT_OPTIMIZE: {
    label: 'Optimize Content',
    description: 'Improve content for SEO and conversions',
  },
  CONTENT_REVIEW: { label: 'Review Content', description: 'Quality check all generated content' },
  DOMAIN_REGISTER: { label: 'Register Domain', description: 'Purchase and configure domain name' },
  DOMAIN_VERIFY: {
    label: 'Verify Domain',
    description: 'Confirm domain ownership and DNS settings',
  },
  SSL_PROVISION: { label: 'Setup SSL', description: 'Install security certificate for HTTPS' },
  GSC_SETUP: { label: 'Setup Search Console', description: 'Add site to Google Search Console' },
  GSC_VERIFY: { label: 'Verify Search Console', description: 'Verify site ownership in GSC' },
  GA4_SETUP: { label: 'Setup Google Analytics', description: 'Create GA4 property and tracking' },
  GSC_SYNC: { label: 'Sync Search Data', description: 'Import search performance data' },
  SEO_ANALYZE: { label: 'Analyze SEO', description: 'Check and improve search optimization' },
  SEO_AUTO_OPTIMIZE: {
    label: 'Auto-Optimize SEO',
    description: 'Fix common SEO issues automatically',
  },
  SEO_OPPORTUNITY_SCAN: {
    label: 'Scan Opportunities',
    description: 'Find new keyword opportunities',
  },
  SEO_OPPORTUNITY_OPTIMIZE: {
    label: 'Optimize Opportunities',
    description: 'Recursive AI optimization for SEO',
  },
  SITE_DEPLOY: { label: 'Deploy Site', description: 'Publish site to the web' },
  METRICS_AGGREGATE: { label: 'Collect Metrics', description: 'Gather performance analytics' },
  PERFORMANCE_REPORT: { label: 'Generate Report', description: 'Create performance summary' },
  ABTEST_ANALYZE: { label: 'Analyze Tests', description: 'Evaluate A/B test results' },
  ABTEST_REBALANCE: {
    label: 'Optimize Traffic',
    description: 'Adjust A/B test traffic allocation',
  },
  LINK_OPPORTUNITY_SCAN: {
    label: 'Scan Link Opportunities',
    description: 'Analyze competitor backlinks for link building',
  },
  LINK_BACKLINK_MONITOR: {
    label: 'Monitor Backlinks',
    description: 'Check existing backlinks and discover new ones',
  },
  LINK_OUTREACH_GENERATE: {
    label: 'Generate Outreach',
    description: 'Create personalized outreach emails',
  },
  LINK_ASSET_GENERATE: {
    label: 'Create Link Asset',
    description: 'Generate link-attracting content',
  },

  // Microsite Management
  MICROSITE_CREATE: {
    label: 'Create Microsite',
    description: 'Set up supplier/product microsite',
  },
  MICROSITE_BRAND_GENERATE: {
    label: 'Generate Brand',
    description: 'Create microsite brand identity',
  },
  MICROSITE_CONTENT_GENERATE: {
    label: 'Generate Microsite Content',
    description: 'Create content for microsite pages',
  },
  MICROSITE_PUBLISH: {
    label: 'Publish Microsite',
    description: 'Make microsite publicly accessible',
  },
  MICROSITE_ARCHIVE: {
    label: 'Archive Microsite',
    description: 'Deactivate and archive microsite',
  },
  MICROSITE_HEALTH_CHECK: {
    label: 'Health Check',
    description: 'Verify microsite health and status',
  },
  MICROSITE_HOMEPAGE_ENRICH: {
    label: 'Homepage Enrich',
    description: 'Enrich OPPORTUNITY microsite with rich homepage config',
  },

  // Holibob Sync
  SUPPLIER_SYNC: {
    label: 'Sync Suppliers',
    description: 'Import suppliers from Holibob API',
  },
  SUPPLIER_SYNC_INCREMENTAL: {
    label: 'Incremental Supplier Sync',
    description: 'Update changed suppliers',
  },
  PRODUCT_SYNC: {
    label: 'Sync Products',
    description: 'Import products from Holibob API',
  },
  PRODUCT_SYNC_INCREMENTAL: {
    label: 'Incremental Product Sync',
    description: 'Update changed products',
  },

  // Analytics (scheduled jobs)
  GA4_DAILY_SYNC: {
    label: 'Sync GA4 Data',
    description: 'Import daily analytics from Google Analytics',
  },
  REFRESH_ANALYTICS_VIEWS: {
    label: 'Refresh Analytics Views',
    description: 'Update analytics dashboard views',
  },
  MICROSITE_GSC_SYNC: {
    label: 'Sync Microsite GSC Data',
    description: 'Import search performance data for microsites',
  },
  MICROSITE_ANALYTICS_SYNC: {
    label: 'Sync Microsite Analytics',
    description: 'Create daily analytics snapshots for microsites',
  },
  MICROSITE_GA4_SYNC: {
    label: 'Sync Microsite GA4 Traffic',
    description: 'Sync GA4 traffic data for microsites from shared property',
  },

  // Scheduled Maintenance
  META_TITLE_MAINTENANCE: {
    label: 'Meta Title Maintenance',
    description: 'Ensure all pages have SEO-optimized meta titles',
  },
  MICROSITE_CONTENT_REFRESH: {
    label: 'Refresh Microsite Content',
    description: 'Refresh rotating subset of microsite content',
  },
  MICROSITE_SITEMAP_RESUBMIT: {
    label: 'Resubmit Sitemaps',
    description: 'Resubmit microsite sitemaps to Google Search Console',
  },
  COLLECTION_REFRESH: {
    label: 'Refresh Collections',
    description: 'Refresh AI-curated collections for microsites',
  },
  AUTONOMOUS_ROADMAP: {
    label: 'Process Roadmaps',
    description: 'Process site roadmaps and queue lifecycle tasks',
  },

  // Social Media
  SOCIAL_POST_GENERATE: {
    label: 'Generate Social Post',
    description: 'Generate social media post content for a page',
  },
  SOCIAL_POST_PUBLISH: {
    label: 'Publish Social Post',
    description: 'Publish generated social post to platform',
  },
  SOCIAL_DAILY_POSTING: {
    label: 'Daily Social Posting',
    description: 'Schedule and fan out daily social media posts',
  },

  // Paid Traffic Acquisition
  AD_CAMPAIGN_SYNC: {
    label: 'Sync Ad Campaigns',
    description: 'Sync performance metrics from ad platforms',
  },
  AD_PERFORMANCE_REPORT: {
    label: 'Ad Performance Report',
    description: 'Generate ROAS and CPA reports for ad campaigns',
  },
  AD_BUDGET_OPTIMIZER: {
    label: 'Optimize Ad Budgets',
    description: 'Auto-optimize budget allocation across campaigns',
  },
  AD_CONVERSION_UPLOAD: {
    label: 'Upload Conversions',
    description: 'Upload booking conversions to ad platforms via CAPI',
  },
  PAID_KEYWORD_SCAN: {
    label: 'Scan Paid Keywords',
    description: 'Discover new low-CPC keyword opportunities for paid traffic',
  },
  BIDDING_ENGINE_RUN: {
    label: 'Bidding Engine',
    description: 'Calculate site profitability and create/optimize ad campaigns',
  },
  KEYWORD_ENRICHMENT: {
    label: 'Keyword Enrichment',
    description: 'Extract keyword seeds from product data and validate via DataForSEO',
  },
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

    // Determine blocking reason for pending phases
    let blockingReason: string | null = null;
    let nextAction: string | null = null;

    if (phaseStatus === 'pending' || phaseStatus === 'in_progress') {
      // Find the first incomplete task and check its dependencies
      const firstIncompleteTask = phaseTasks.find((t) => t.status !== 'COMPLETED');
      if (firstIncompleteTask) {
        const deps = TASK_DEPENDENCIES[firstIncompleteTask.type] || [];
        const incompleteDeps = deps.filter((depType) => {
          const depJob = jobs.find((j) => j.type === depType);
          return !depJob || depJob.status !== 'COMPLETED';
        });

        if (incompleteDeps.length > 0) {
          const depLabels = incompleteDeps.map((dt) => TASK_DESCRIPTIONS[dt].label);
          blockingReason = `Waiting for: ${depLabels.join(', ')}`;
          nextAction = 'System will automatically start once dependencies complete';
        } else if (
          firstIncompleteTask.status === 'PLANNED' ||
          firstIncompleteTask.status === 'PENDING'
        ) {
          nextAction = 'Ready to start - click "Execute Next Tasks" to begin';
        } else if (firstIncompleteTask.status === 'RUNNING') {
          nextAction = `Currently running: ${firstIncompleteTask.label}`;
        } else if (firstIncompleteTask.status === 'FAILED') {
          nextAction = 'Click "Execute Next Tasks" to retry failed task';
        }
      }
    }

    return {
      key,
      name: phase.name,
      description: phase.description,
      estimatedMinutes: phase.estimatedMinutes,
      autonomousExplanation: phase.autonomousExplanation,
      status: phaseStatus,
      progress: {
        completed: completedTasks,
        total: totalTasks,
        percentage: Math.round((completedTasks / totalTasks) * 100),
      },
      blockingReason,
      nextAction,
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
async function getJobPayload(siteId: string, jobType: JobType): Promise<Record<string, unknown>> {
  const basePayload = { siteId };

  switch (jobType) {
    case 'CONTENT_GENERATE': {
      // Query homepageConfig to provide destination/category context for content generation.
      // Without these, internal linking crashes on thematic sites that lack location context.
      const siteForContent = await prisma.site.findUnique({
        where: { id: siteId },
        select: { name: true, homepageConfig: true },
      });
      const hpc = (siteForContent?.homepageConfig as Record<string, unknown>) || {};
      const popExp = (hpc['popularExperiences'] as Record<string, unknown>) || {};
      const destinations = (hpc['destinations'] as Array<{ name: string }>) || [];

      const destination = (popExp['destination'] as string) || destinations[0]?.name || '';
      const category = (popExp['categoryPath'] as string) || '';
      // Derive a target keyword from destination + site name context
      const targetKeyword = destination
        ? `${destination} ${category || 'experiences'}`.trim()
        : siteForContent?.name || '';

      return {
        ...basePayload,
        contentType: 'destination',
        destination: destination || undefined,
        category: category || undefined,
        targetKeyword: targetKeyword || undefined,
      };
    }
    case 'CONTENT_OPTIMIZE':
      // No contentId → handler runs in batch mode (optimizes all content for site)
      return basePayload;
    case 'CONTENT_REVIEW':
      // No contentId → handler runs in batch mode (reviews all content for site)
      return basePayload;
    case 'DOMAIN_REGISTER':
      return { ...basePayload, registrar: 'cloudflare', autoRenew: true };
    case 'DOMAIN_VERIFY': {
      // Handler expects { domainId, verificationMethod } — look up the domain record.
      // Prefer an unverified domain (verifiedAt is null) so we don't re-verify needlessly.
      // Fall back to the most recently registered domain if all are already verified
      // (the handler has an idempotency guard and will return success immediately).
      const unverifiedDomain = await prisma.domain.findFirst({
        where: { siteId, verifiedAt: null },
        orderBy: { registeredAt: 'desc' },
      });
      const domainForVerify =
        unverifiedDomain ||
        (await prisma.domain.findFirst({
          where: { siteId },
          orderBy: { registeredAt: 'desc' },
        }));
      if (!domainForVerify) {
        throw new Error(`Cannot queue DOMAIN_VERIFY: no domain found for site ${siteId}`);
      }
      return { siteId, domainId: domainForVerify.id, verificationMethod: 'dns' as const };
    }
    case 'SSL_PROVISION': {
      // Handler expects { domainId, provider } — look up the verified domain
      // Include siteId so the job record is linked to the site for deduplication and tracking
      const verifiedDomain = await prisma.domain.findFirst({
        where: { siteId, verifiedAt: { not: null } },
        orderBy: { verifiedAt: 'desc' },
      });
      if (!verifiedDomain) {
        throw new Error(`Cannot queue SSL_PROVISION: no verified domain found for site ${siteId}`);
      }
      return {
        siteId,
        domainId: verifiedDomain.id,
        provider: verifiedDomain.registrar === 'cloudflare' ? 'cloudflare' : 'letsencrypt',
      };
    }
    case 'GSC_SETUP': {
      // Handler expects { siteId, domain, cloudflareZoneId } — look up the active domain
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        include: { domains: { where: { status: DomainStatus.ACTIVE }, take: 1 } },
      });
      const activeDomain = site?.domains[0];
      if (!activeDomain) {
        throw new Error(`Cannot queue GSC_SETUP: no active domain found for site ${siteId}`);
      }
      if (!activeDomain.cloudflareZoneId) {
        throw new Error(
          `Cannot queue GSC_SETUP: domain ${activeDomain.domain} has no Cloudflare zone ID`
        );
      }
      return {
        siteId,
        domain: activeDomain.domain,
        cloudflareZoneId: activeDomain.cloudflareZoneId,
      };
    }
    case 'GSC_VERIFY': {
      // Handler expects { siteId, domain, cloudflareZoneId } — same context as GSC_SETUP
      const siteForGsc = await prisma.site.findUnique({
        where: { id: siteId },
        include: { domains: { where: { status: DomainStatus.ACTIVE }, take: 1 } },
      });
      const gscDomain = siteForGsc?.domains[0];
      if (!gscDomain) {
        throw new Error(`Cannot queue GSC_VERIFY: no active domain found for site ${siteId}`);
      }
      if (!gscDomain.cloudflareZoneId) {
        throw new Error(
          `Cannot queue GSC_VERIFY: domain ${gscDomain.domain} has no Cloudflare zone ID`
        );
      }
      return {
        siteId,
        domain: gscDomain.domain,
        cloudflareZoneId: gscDomain.cloudflareZoneId,
      };
    }
    case 'GSC_SYNC':
      return { ...basePayload };
    case 'GA4_SETUP':
      return { ...basePayload };
    case 'SITE_DEPLOY': {
      // Use 'production' if the site has a verified domain (ready for live traffic),
      // otherwise default to 'staging'.
      const siteForDeploy = await prisma.site.findUnique({
        where: { id: siteId },
        include: { domains: { where: { verifiedAt: { not: null } }, take: 1 } },
      });
      const deployEnv = siteForDeploy?.domains.length ? 'production' : 'staging';
      return { ...basePayload, environment: deployEnv };
    }
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
 *
 * @param retryFailed - When true (manual execution), deletes FAILED jobs so they can be re-queued.
 *   When false (autonomous processing), FAILED jobs are skipped to prevent retry storms.
 */
export async function executeNextTasks(
  siteId: string,
  options?: { retryFailed?: boolean }
): Promise<{
  queued: string[];
  skipped: string[];
  blocked: string[];
  requeued: string[];
  message: string;
}> {
  const retryFailed = options?.retryFailed ?? false;
  console.log(
    `[Site Roadmap] Executing next tasks for site ${siteId} (retryFailed: ${retryFailed})`
  );

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

  // For domain-related tasks, the direct handler chain (DOMAIN_REGISTER → DOMAIN_VERIFY →
  // SSL_PROVISION) may have completed the work but created job records with siteId=null
  // (since the handler payloads used domainId, not siteId). In those cases, the artifact
  // is the source of truth: if the domain is verified or SSL-enabled, the task is done.
  const artifactOnlyTaskTypes: JobType[] = ['DOMAIN_REGISTER', 'DOMAIN_VERIFY', 'SSL_PROVISION'];
  for (const taskType of artifactOnlyTaskTypes) {
    if (!completedJobs.has(taskType) && artifactValidation[taskType]?.valid) {
      completedJobs.add(taskType);
    }
  }

  // Jobs marked completed but without artifacts (need re-run)
  const invalidCompletedJobs = jobs.filter(
    (j) => j.status === 'COMPLETED' && !artifactValidation[j.type]?.valid
  );

  // Track deleted job IDs so we exclude them when building the active jobs set
  const deletedJobIds = new Set<string>();

  // When retryFailed is true (manual execution), delete FAILED jobs so they can be re-queued
  const failedJobs = jobs.filter((j) => j.status === 'FAILED');
  if (retryFailed && failedJobs.length > 0) {
    for (const failedJob of failedJobs) {
      console.log(
        `[Site Roadmap] Deleting FAILED job ${failedJob.type} (id: ${failedJob.id}) for retry`
      );
      await prisma.job.delete({ where: { id: failedJob.id } });
      deletedJobIds.add(failedJob.id);
    }
  }

  // When retryFailed is true (manual execution), also clean up PENDING jobs
  // from non-planned queues. These are either:
  // - Jobs that were queued but never picked up by a worker (stale)
  // - Zombie DB records from addJob calls where BullMQ failed after DB insert
  // Cleaning ALL of them (not just stale) ensures a fresh start on manual retry.
  if (retryFailed) {
    const stalePendingJobs = jobs.filter((j) => j.status === 'PENDING' && j.queue !== 'planned');
    for (const staleJob of stalePendingJobs) {
      console.log(
        `[Site Roadmap] Deleting PENDING job ${staleJob.type} (id: ${staleJob.id}, queue: ${staleJob.queue}) for retry`
      );
      await prisma.job.delete({ where: { id: staleJob.id } });
      deletedJobIds.add(staleJob.id);
    }
  }

  // When retryFailed is true, also clean up RUNNING jobs stuck for more than 30 minutes.
  // These are jobs where the worker crashed or timed out.
  if (retryFailed) {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const staleRunningJobs = jobs.filter(
      (j) =>
        j.status === 'RUNNING' &&
        j.startedAt &&
        j.startedAt < thirtyMinutesAgo &&
        !deletedJobIds.has(j.id)
    );
    for (const staleJob of staleRunningJobs) {
      console.log(
        `[Site Roadmap] Deleting stale RUNNING job ${staleJob.type} (id: ${staleJob.id}, started: ${staleJob.startedAt?.toISOString()}) for retry`
      );
      await prisma.job.delete({ where: { id: staleJob.id } });
      deletedJobIds.add(staleJob.id);
    }
  }

  // Jobs that are still in progress (skip these always)
  // FAILED jobs are only skipped during autonomous processing (retryFailed=false)
  // IMPORTANT: Exclude 'planned' queue jobs — those are placeholders, not active jobs.
  // They get deleted and replaced with real jobs in the execution loop below.
  // Also exclude jobs that were just deleted above.
  const skipStatuses = retryFailed
    ? ['RUNNING', 'PENDING', 'SCHEDULED', 'RETRYING']
    : ['RUNNING', 'PENDING', 'SCHEDULED', 'RETRYING', 'FAILED'];

  const activeOrFailedJobs = new Set(
    jobs
      .filter(
        (j) => skipStatuses.includes(j.status) && j.queue !== 'planned' && !deletedJobIds.has(j.id)
      )
      .map((j) => j.type)
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

  // Clean up stale planned placeholders whose type already has a completed job with valid artifacts
  const stalePlaceholders = jobs.filter(
    (j) => j.queue === 'planned' && j.status === 'PENDING' && completedJobs.has(j.type)
  );
  for (const stale of stalePlaceholders) {
    console.log(
      `[Site Roadmap] Removing stale planned placeholder for completed task ${stale.type}`
    );
    await prisma.job.delete({ where: { id: stale.id } });
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

    // Skip if already running, pending, retrying, or failed
    if (activeOrFailedJobs.has(jobType)) {
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
      const payload = await getJobPayload(siteId, jobType);

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
