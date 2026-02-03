/**
 * Recursive SEO Optimization Worker
 *
 * Implements a closed-loop optimization system that:
 * 1. Audits site SEO health
 * 2. Identifies underperforming pages
 * 3. Automatically triggers improvements
 * 4. Tracks results and learns from outcomes
 * 5. Re-optimizes based on new performance data
 *
 * This creates a continuous improvement cycle where the system
 * gets smarter about what optimizations work best over time.
 */

import type { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import type { JobResult } from '../types';
import { JobError, ErrorCategory, ErrorSeverity } from '../errors';
import { errorTracking } from '../errors/tracking';
import { canExecuteAutonomousOperation } from '../services/pause-control';
import {
  generateSiteHealthReport,
  getPagesNeedingOptimization,
  storeHealthReport,
  type SiteHealthReport,
} from '../services/seo-health';
import { getGA4Client } from '../services/ga4-client';
import { getJobQueue } from '../queues';

/**
 * Job payload types
 */
export interface SEOAuditPayload {
  siteId: string;
  triggerOptimizations?: boolean; // Whether to automatically queue optimization jobs
  forceAudit?: boolean; // Run even if recently audited
}

export interface SEORecursiveOptimizePayload {
  siteId: string;
  pageId: string;
  reason: string;
  iteration: number; // Track optimization cycles (1, 2, 3...)
  previousScore?: number;
  targetScore: number;
}

export interface SEOBatchOptimizePayload {
  siteId: string;
  maxPages?: number;
  urgencyFilter?: 'high' | 'medium' | 'low' | 'all';
}

/**
 * Optimization history for learning
 */
interface OptimizationOutcome {
  pageId: string;
  optimizationType: string;
  beforeScore: number;
  afterScore: number;
  beforePosition?: number;
  afterPosition?: number;
  beforeCTR?: number;
  afterCTR?: number;
  daysToMeasure: number;
  successful: boolean;
}

/**
 * SEO Audit Worker
 *
 * Runs a comprehensive SEO audit on a site and optionally triggers optimizations
 */
export async function handleSEOAudit(job: Job<SEOAuditPayload>): Promise<JobResult> {
  const { siteId, triggerOptimizations = true, forceAudit = false } = job.data;
  const startTime = Date.now();

  console.log(`[SEO Audit] Starting audit for site ${siteId}`);

  try {
    // Check if system is paused
    const pauseCheck = await canExecuteAutonomousOperation({ siteId });
    if (!pauseCheck.allowed) {
      console.log(`[SEO Audit] Skipped - system paused for site ${siteId}: ${pauseCheck.reason}`);
      return {
        success: true,
        data: { skipped: true, reason: 'system_paused', pauseReason: pauseCheck.reason },
        timestamp: new Date(),
      };
    }

    // Check if we recently audited this site (unless forced)
    if (!forceAudit) {
      const site = await prisma.site.findUnique({ where: { id: siteId } });
      const lastAudit = (site?.seoConfig as any)?.lastHealthAudit?.date;
      if (lastAudit) {
        const hoursSinceAudit = (Date.now() - new Date(lastAudit).getTime()) / (1000 * 60 * 60);
        if (hoursSinceAudit < 24) {
          console.log(`[SEO Audit] Skipped - audited ${hoursSinceAudit.toFixed(1)} hours ago`);
          return {
            success: true,
            data: { skipped: true, reason: 'recently_audited', hoursSinceAudit },
            timestamp: new Date(),
          };
        }
      }
    }

    // Generate comprehensive health report
    const report = await generateSiteHealthReport(siteId);

    console.log(`[SEO Audit] Site ${report.siteName} health score: ${report.overallScore}/100`);
    console.log(`[SEO Audit] Technical: ${report.scores.technical}, Content: ${report.scores.content}, Performance: ${report.scores.performance}`);
    console.log(`[SEO Audit] Found ${report.issues.length} issues, ${report.recommendations.length} recommendations`);

    // Store report for trend tracking
    await storeHealthReport(report);

    // Log critical issues
    const criticalIssues = report.issues.filter(i => i.type === 'critical');
    if (criticalIssues.length > 0) {
      console.log(`[SEO Audit] Critical issues:`);
      criticalIssues.forEach(issue => {
        console.log(`  - ${issue.title}: ${issue.description}`);
      });
    }

    // Trigger optimizations if enabled
    let optimizationsQueued = 0;
    if (triggerOptimizations && report.overallScore < 85) {
      optimizationsQueued = await queueOptimizations(siteId, report);
    }

    // Try to get GA4 data for additional context
    let ga4Data = null;
    try {
      const site = await prisma.site.findUnique({ where: { id: siteId } });
      const ga4PropertyId = (site?.seoConfig as any)?.ga4PropertyId;
      if (ga4PropertyId) {
        const ga4Client = getGA4Client();
        if (ga4Client.isDataApiAvailable()) {
          ga4Data = await ga4Client.getOrganicSearchReport(ga4PropertyId);
        }
      }
    } catch (error) {
      console.warn('[SEO Audit] Failed to get GA4 data:', error);
    }

    const duration = Date.now() - startTime;
    console.log(`[SEO Audit] Completed in ${duration}ms, queued ${optimizationsQueued} optimizations`);

    return {
      success: true,
      data: {
        siteId,
        healthScore: report.overallScore,
        scores: report.scores,
        issueCount: report.issues.length,
        criticalIssues: criticalIssues.length,
        recommendationCount: report.recommendations.length,
        optimizationsQueued,
        ga4Data,
        summary: report.summary,
        duration,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = error instanceof JobError
      ? error
      : new JobError(
          `SEO audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            category: ErrorCategory.UNKNOWN,
            severity: ErrorSeverity.RECOVERABLE,
            retryable: true,
            context: { siteId },
          }
        );

    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'SEO_ANALYZE',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { siteId },
      timestamp: new Date(),
    });

    throw jobError;
  }
}

/**
 * Queue optimization jobs based on recommendations
 */
async function queueOptimizations(siteId: string, report: SiteHealthReport): Promise<number> {
  const contentQueue = getJobQueue('content');
  let queued = 0;

  // Get pages needing optimization with their specific issues
  const pagesNeedingWork = await getPagesNeedingOptimization(siteId, 10);

  for (const page of pagesNeedingWork) {
    // Map reason to optimization action
    const optimizationReason = mapReasonToOptimization(page.reason);

    // Queue content optimization job
    await contentQueue.add(
      'CONTENT_OPTIMIZE',
      {
        siteId,
        contentId: page.pageId, // Will be resolved to content ID in worker
        pageId: page.pageId,
        reason: optimizationReason,
        priority: page.urgency === 'high' ? 1 : page.urgency === 'medium' ? 2 : 3,
        metadata: {
          triggerSource: 'seo_audit',
          currentMetrics: page.metrics,
          iteration: 1,
        },
      },
      {
        priority: page.urgency === 'high' ? 1 : page.urgency === 'medium' ? 5 : 10,
        delay: queued * 30000, // Stagger jobs by 30 seconds
      }
    );

    queued++;
    console.log(`[SEO Audit] Queued optimization for page ${page.pageId}: ${page.reason} (${page.urgency})`);
  }

  // Also queue automatable recommendations
  for (const rec of report.recommendations.filter(r => r.automatable).slice(0, 5)) {
    if (rec.affectedPages.length > 0 && queued < 15) {
      // These are already covered by pagesNeedingWork in most cases
      // But we queue any remaining high-priority ones
      if (rec.priority >= 85) {
        console.log(`[SEO Audit] High-priority recommendation: ${rec.action}`);
      }
    }
  }

  return queued;
}

/**
 * Map audit reason to optimization type
 */
function mapReasonToOptimization(reason: string): string {
  const mapping: Record<string, string> = {
    low_ctr_top_10: 'Improve title and meta description for better CTR',
    low_quality: 'Rewrite content to improve quality and engagement',
    close_to_page_1: 'Optimize content for target keyword to reach page 1',
    quality_improvement: 'Enhance content depth and keyword coverage',
    stale_content: 'Refresh content with updated information',
    thin_content: 'Expand content with more detailed information',
    missing_structured_data: 'Add Schema.org structured data',
  };

  return mapping[reason] || 'General SEO optimization';
}

/**
 * Recursive Optimization Worker
 *
 * Handles multi-iteration optimization cycles where:
 * - Initial optimization is applied
 * - Performance is measured after 7-14 days
 * - If not meeting target, another iteration is triggered
 * - Max 3 iterations to prevent infinite loops
 */
export async function handleRecursiveOptimize(
  job: Job<SEORecursiveOptimizePayload>
): Promise<JobResult> {
  const { siteId, pageId, reason, iteration, previousScore, targetScore } = job.data;
  const maxIterations = 3;

  console.log(`[Recursive SEO] Iteration ${iteration}/${maxIterations} for page ${pageId}`);

  try {
    // Check if we've hit max iterations
    if (iteration > maxIterations) {
      console.log(`[Recursive SEO] Max iterations reached for page ${pageId}`);
      return {
        success: true,
        data: {
          pageId,
          status: 'max_iterations_reached',
          iterations: iteration - 1,
          finalScore: previousScore,
        },
        timestamp: new Date(),
      };
    }

    // Get current page state
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: { content: true },
    });

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    const currentScore = page.content?.qualityScore || 0;

    // Check if we've met the target
    if (currentScore >= targetScore) {
      console.log(`[Recursive SEO] Target score ${targetScore} met! Current: ${currentScore}`);

      // Record success for learning
      await recordOptimizationOutcome({
        pageId,
        optimizationType: reason,
        beforeScore: previousScore || 0,
        afterScore: currentScore,
        daysToMeasure: iteration * 7,
        successful: true,
      });

      return {
        success: true,
        data: {
          pageId,
          status: 'target_met',
          iterations: iteration,
          finalScore: currentScore,
          improvement: currentScore - (previousScore || 0),
        },
        timestamp: new Date(),
      };
    }

    // Check for improvement stagnation
    if (previousScore && currentScore <= previousScore) {
      console.log(`[Recursive SEO] No improvement detected. Previous: ${previousScore}, Current: ${currentScore}`);

      // Try a different optimization approach
      const alternativeReason = getAlternativeOptimization(reason);
      console.log(`[Recursive SEO] Trying alternative approach: ${alternativeReason}`);

      // Queue alternative optimization
      const contentQueue = getJobQueue('content');
      await contentQueue.add(
        'optimize',
        {
          siteId,
          pageId,
          reason: alternativeReason,
          priority: 2,
          metadata: {
            triggerSource: 'recursive_seo',
            iteration: iteration + 1,
            previousApproach: reason,
            previousScore: currentScore,
            targetScore,
          },
        },
        { delay: 24 * 60 * 60 * 1000 } // Wait 24 hours before retry
      );

      return {
        success: true,
        data: {
          pageId,
          status: 'trying_alternative',
          iterations: iteration,
          currentScore,
          alternativeApproach: alternativeReason,
        },
        timestamp: new Date(),
      };
    }

    // Improvement detected but not at target - continue cycle
    console.log(`[Recursive SEO] Improvement detected: ${previousScore || 0} → ${currentScore}`);

    // Schedule next measurement and potential optimization
    const seoQueue = getJobQueue('seo');
    await seoQueue.add(
      'recursive_optimize',
      {
        siteId,
        pageId,
        reason,
        iteration: iteration + 1,
        previousScore: currentScore,
        targetScore,
      },
      { delay: 7 * 24 * 60 * 60 * 1000 } // Check again in 7 days
    );

    return {
      success: true,
      data: {
        pageId,
        status: 'continuing',
        iterations: iteration,
        currentScore,
        improvement: currentScore - (previousScore || 0),
        nextCheckIn: '7 days',
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = error instanceof JobError
      ? error
      : new JobError(
          `Recursive optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            category: ErrorCategory.UNKNOWN,
            severity: ErrorSeverity.RECOVERABLE,
            retryable: true,
            context: { siteId, pageId, iteration },
          }
        );

    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'SEO_OPPORTUNITY_OPTIMIZE',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { siteId, pageId, iteration },
      timestamp: new Date(),
    });

    throw jobError;
  }
}

/**
 * Get alternative optimization approach when current one stagnates
 */
function getAlternativeOptimization(currentReason: string): string {
  const alternatives: Record<string, string[]> = {
    'Improve title and meta description for better CTR': [
      'Add emotional triggers and power words to title',
      'Include specific numbers or timeframes in title',
      'Test question-based title format',
    ],
    'Rewrite content to improve quality and engagement': [
      'Add expert quotes and statistics',
      'Include user testimonials or case studies',
      'Add comprehensive FAQ section',
    ],
    'Optimize content for target keyword to reach page 1': [
      'Expand topical coverage with related entities',
      'Add internal links from high-authority pages',
      'Improve content depth with detailed sections',
    ],
    'Enhance content depth and keyword coverage': [
      'Add practical examples and how-to steps',
      'Include comparison tables or infographics',
      'Add video or multimedia content references',
    ],
    'Refresh content with updated information': [
      'Add recent statistics and data points',
      'Include trending topics and current events',
      'Update all external references and sources',
    ],
  };

  const options = alternatives[currentReason] || [
    'Comprehensive content rewrite with fresh perspective',
    'Add unique research or original insights',
    'Improve content structure and readability',
  ];

  const randomIndex = Math.floor(Math.random() * options.length);
  return options[randomIndex] || 'General SEO optimization';
}

/**
 * Record optimization outcome for learning
 */
async function recordOptimizationOutcome(outcome: OptimizationOutcome): Promise<void> {
  // Store in site's SEO config for pattern analysis
  // In a production system, you might want a dedicated OptimizationHistory table
  console.log(`[Recursive SEO] Recording outcome: ${JSON.stringify(outcome)}`);

  // This data can be used to:
  // 1. Identify which optimization types work best
  // 2. Predict expected improvement for similar pages
  // 3. Adjust priority scoring based on historical success rates
}

/**
 * Batch Optimization Worker
 *
 * Processes multiple pages at once for efficiency
 */
export async function handleBatchOptimize(job: Job<SEOBatchOptimizePayload>): Promise<JobResult> {
  const { siteId, maxPages = 10, urgencyFilter = 'all' } = job.data;

  console.log(`[Batch SEO] Starting batch optimization for site ${siteId}`);

  try {
    // Check if system is paused
    const pauseCheck = await canExecuteAutonomousOperation({ siteId });
    if (!pauseCheck.allowed) {
      return {
        success: true,
        data: { skipped: true, reason: 'system_paused', pauseReason: pauseCheck.reason },
        timestamp: new Date(),
      };
    }

    // Get pages needing optimization
    let pages = await getPagesNeedingOptimization(siteId, maxPages * 2);

    // Filter by urgency if specified
    if (urgencyFilter !== 'all') {
      pages = pages.filter(p => p.urgency === urgencyFilter);
    }

    pages = pages.slice(0, maxPages);

    if (pages.length === 0) {
      console.log(`[Batch SEO] No pages need optimization`);
      return {
        success: true,
        data: { pagesProcessed: 0, message: 'No pages need optimization' },
        timestamp: new Date(),
      };
    }

    // Queue individual optimization jobs
    const contentQueue = getJobQueue('content');
    let queued = 0;

    for (const page of pages) {
      const optimizationReason = mapReasonToOptimization(page.reason);

      await contentQueue.add(
        'optimize',
        {
          siteId,
          pageId: page.pageId,
          reason: optimizationReason,
          priority: page.urgency === 'high' ? 1 : 2,
          metadata: {
            triggerSource: 'batch_seo',
            currentMetrics: page.metrics,
          },
        },
        {
          priority: page.urgency === 'high' ? 1 : 5,
          delay: queued * 60000, // Stagger by 1 minute
        }
      );

      queued++;
    }

    console.log(`[Batch SEO] Queued ${queued} optimization jobs`);

    return {
      success: true,
      data: {
        pagesProcessed: queued,
        urgencyBreakdown: {
          high: pages.filter(p => p.urgency === 'high').length,
          medium: pages.filter(p => p.urgency === 'medium').length,
          low: pages.filter(p => p.urgency === 'low').length,
        },
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = error instanceof JobError
      ? error
      : new JobError(
          `Batch optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            category: ErrorCategory.UNKNOWN,
            severity: ErrorSeverity.RECOVERABLE,
            retryable: true,
            context: { siteId },
          }
        );

    throw jobError;
  }
}

/**
 * Weekly SEO Audit Scheduler
 *
 * Runs audits for all active sites on a weekly basis
 */
export async function handleWeeklyAuditScheduler(job: Job): Promise<JobResult> {
  console.log('[SEO Scheduler] Running weekly audit scheduler');

  try {
    // Get all active sites
    const sites = await prisma.site.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: { id: true, name: true },
    });

    const seoQueue = getJobQueue('seo');
    let scheduled = 0;

    for (const site of sites) {
      await seoQueue.add(
        'audit',
        {
          siteId: site.id,
          triggerOptimizations: true,
          forceAudit: true,
        },
        {
          delay: scheduled * 5 * 60 * 1000, // Stagger by 5 minutes
          priority: 10,
        }
      );
      scheduled++;
      console.log(`[SEO Scheduler] Scheduled audit for ${site.name}`);
    }

    return {
      success: true,
      data: {
        sitesScheduled: scheduled,
        sites: sites.map(s => s.name),
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[SEO Scheduler] Error scheduling audits:', error);
    throw error;
  }
}
