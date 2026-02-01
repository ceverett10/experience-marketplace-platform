import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import { createPipeline } from '@experience-marketplace/content-engine';
import type {
  ContentGeneratePayload,
  ContentOptimizePayload,
  ContentReviewPayload,
  JobResult,
} from '../types';
import {
  toJobError,
  NotFoundError,
  ExternalApiError,
  calculateRetryDelay,
  shouldMoveToDeadLetter,
} from '../errors';
import { errorTracking } from '../errors/tracking';
import { circuitBreakers } from '../errors/circuit-breaker';
import { canExecuteAutonomousOperation } from '../services/pause-control';

/**
 * Content Generation Worker
 * Generates new content using AI based on opportunities or manual requests
 */
export async function handleContentGenerate(job: Job<ContentGeneratePayload>): Promise<JobResult> {
  const {
    siteId,
    opportunityId,
    contentType,
    targetKeyword,
    secondaryKeywords,
    destination,
    category,
    targetLength,
  } = job.data;

  try {
    console.log(`[Content Generate] Starting for site ${siteId}, keyword: ${targetKeyword}`);

    // Check if autonomous content generation is allowed
    const canProceed = await canExecuteAutonomousOperation({
      siteId,
      feature: 'enableContentGeneration',
      rateLimitType: 'CONTENT_GENERATE',
    });

    if (!canProceed.allowed) {
      console.log(`[Content Generate] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'Content generation is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    // Verify site exists
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundError('Site', siteId);
    }

    // Get opportunity if provided
    let opportunity = null;
    if (opportunityId) {
      opportunity = await prisma.sEOOpportunity.findUnique({
        where: { id: opportunityId },
      });
    }

    // Create content brief
    const brief = {
      type: contentType,
      siteId,
      targetKeyword,
      secondaryKeywords: secondaryKeywords || (opportunity?.keyword ? [opportunity.keyword] : []),
      destination: destination || opportunity?.location || '',
      category: category || opportunity?.niche || '',
      targetLength: targetLength || { min: 800, max: 1500 },
      tone: 'informative' as const,
    };

    // Generate content using pipeline with circuit breaker
    const anthropicBreaker = circuitBreakers.getBreaker('anthropic-api', {
      failureThreshold: 3,
      timeout: 120000, // 2 minutes for AI
    });

    const result = await anthropicBreaker.execute(async () => {
      const pipeline = createPipeline({
        qualityThreshold: 80,
        maxRewrites: 3,
        draftModel: 'haiku',
        qualityModel: 'sonnet',
        rewriteModel: 'haiku',
      });

      return await pipeline.generate(brief);
    });

    if (!result.success) {
      throw new ExternalApiError(result.error || 'Content generation failed quality threshold', {
        service: 'anthropic-api',
        context: {
          targetKeyword,
          contentType,
          qualityThreshold: 80,
        },
      });
    }

    // Save content to database
    const content = await prisma.content.create({
      data: {
        siteId,
        body: result.content.content,
        bodyFormat: 'MARKDOWN',
        isAiGenerated: true,
        aiModel: result.content.generatedBy,
        aiPrompt: `Generated for keyword: ${targetKeyword}`,
        qualityScore: result.content.qualityAssessment?.overallScore || 0,
        version: result.content.version,
        opportunityId: opportunityId || undefined,
      },
    });

    // Create page for the content
    const page = await prisma.page.create({
      data: {
        siteId,
        slug: result.content.slug,
        type: contentType.toUpperCase() as any,
        title: result.content.title,
        metaTitle: result.content.title,
        metaDescription: targetKeyword,
        contentId: content.id,
        status:
          result.content.qualityAssessment && result.content.qualityAssessment.overallScore >= 85
            ? 'PUBLISHED'
            : 'REVIEW',
      },
    });

    // Update opportunity status if provided
    if (opportunityId) {
      await prisma.sEOOpportunity.update({
        where: { id: opportunityId },
        data: { status: 'PUBLISHED' },
      });
    }

    console.log(`[Content Generate] Success! Created content ${content.id} and page ${page.id}`);

    return {
      success: true,
      message: `Generated content for "${targetKeyword}"`,
      data: {
        contentId: content.id,
        pageId: page.id,
        qualityScore: result.content.qualityAssessment?.overallScore || 0,
        slug: result.content.slug,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);

    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'CONTENT_GENERATE',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { ...jobError.context, siteId, targetKeyword },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });

    if (jobError.retryable) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
    }

    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      await job.moveToFailed(new Error(`Permanent failure: ${jobError.message}`), '0', true);
    }

    console.error('[Content Generate] Error:', jobError.toJSON());

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}

/**
 * Content Optimization Worker
 * Rewrites underperforming content based on GSC data
 */
export async function handleContentOptimize(job: Job<ContentOptimizePayload>): Promise<JobResult> {
  const { siteId, pageId, contentId, reason, performanceData } = job.data;

  try {
    console.log(`[Content Optimize] Optimizing content ${contentId} for reason: ${reason}`);

    // Check if autonomous content optimization is allowed
    const canProceed = await canExecuteAutonomousOperation({
      siteId,
      feature: 'enableContentOptimization',
    });

    if (!canProceed.allowed) {
      console.log(`[Content Optimize] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'Content optimization is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    // Get current content
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { page: true, opportunity: true },
    });

    if (!content) {
      throw new NotFoundError('Content', contentId);
    }

    // Determine optimization strategy based on reason
    let optimizationPrompt = '';
    switch (reason) {
      case 'low_ctr':
        optimizationPrompt = `Improve headline and meta description to increase click-through rate. Current CTR: ${performanceData?.ctr?.toFixed(2)}%`;
        break;
      case 'position_drop':
        optimizationPrompt = `Content has dropped ${performanceData?.position} positions. Strengthen SEO and add more relevant keywords.`;
        break;
      case 'high_bounce':
        optimizationPrompt = `High bounce rate (${performanceData?.bounceRate}%). Improve introduction and engagement.`;
        break;
      case 'low_time':
        optimizationPrompt = `Low time on page (${performanceData?.timeOnPage}s). Add more engaging content and visuals.`;
        break;
      case 'no_bookings':
        optimizationPrompt = 'No conversions. Strengthen CTAs and add urgency/social proof.';
        break;
    }

    // Re-generate content with optimization hints
    const anthropicBreaker = circuitBreakers.getBreaker('anthropic-api', {
      failureThreshold: 3,
      timeout: 120000,
    });

    const brief = {
      type: (content.page?.type.toLowerCase() as any) || 'blog',
      siteId,
      targetKeyword: content.opportunity?.keyword || content.page?.title || 'unknown',
      secondaryKeywords: [],
      destination: content.opportunity?.location || '',
      category: content.opportunity?.niche || '',
      targetLength: { min: 1000, max: 2000 },
      tone: 'informative' as const,
    };

    const result = await anthropicBreaker.execute(async () => {
      const pipeline = createPipeline({
        qualityThreshold: 85, // Higher threshold for optimizations
        maxRewrites: 3,
      });

      return await pipeline.generate(brief);
    });

    if (!result.success) {
      throw new ExternalApiError('Content optimization failed quality threshold', {
        service: 'anthropic-api',
        context: {
          contentId,
          reason,
          qualityThreshold: 85,
        },
      });
    }

    // Create new version of content
    const optimizedContent = await prisma.content.create({
      data: {
        siteId,
        body: result.content.content,
        bodyFormat: 'MARKDOWN',
        isAiGenerated: true,
        aiModel: result.content.generatedBy,
        aiPrompt: `Optimization: ${optimizationPrompt}`,
        qualityScore: result.content.qualityAssessment?.overallScore || 0,
        version: content.version + 1,
        previousVersionId: contentId,
        opportunityId: content.opportunityId || undefined,
      },
    });

    // Update page to use new content
    await prisma.page.update({
      where: { id: pageId },
      data: {
        contentId: optimizedContent.id,
        status: 'PUBLISHED',
      },
    });

    console.log(`[Content Optimize] Success! Created optimized version ${optimizedContent.id}`);

    return {
      success: true,
      message: `Optimized content for ${reason}`,
      data: {
        contentId: optimizedContent.id,
        previousVersion: contentId,
        qualityScore: result.content.qualityAssessment?.overallScore || 0,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);

    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'CONTENT_OPTIMIZE',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { ...jobError.context, siteId, contentId, reason },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });

    if (jobError.retryable) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
    }

    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      await job.moveToFailed(new Error(`Permanent failure: ${jobError.message}`), '0', true);
    }

    console.error('[Content Optimize] Error:', jobError.toJSON());

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}

/**
 * Content Review Worker
 * Handles content that failed quality gate multiple times
 */
export async function handleContentReview(job: Job<ContentReviewPayload>): Promise<JobResult> {
  const { siteId, contentId, qualityScore, issues } = job.data;

  try {
    console.log(`[Content Review] Flagging content ${contentId} for human review`);

    // Update content status to review
    await prisma.content.update({
      where: { id: contentId },
      data: {
        qualityScore,
      },
    });

    // Update associated page status
    await prisma.page.updateMany({
      where: { contentId },
      data: { status: 'REVIEW' },
    });

    // TODO: Send notification to admin (Slack, email, etc.)
    console.log(
      `[Content Review] Flagged for review - Score: ${qualityScore}, Issues: ${issues.length}`
    );

    return {
      success: true,
      message: `Content flagged for review`,
      data: {
        contentId,
        qualityScore,
        issueCount: issues.length,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);

    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'CONTENT_REVIEW',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { ...jobError.context, siteId, contentId },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });

    if (jobError.retryable) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
    }

    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      await job.moveToFailed(new Error(`Permanent failure: ${jobError.message}`), '0', true);
    }

    console.error('[Content Review] Error:', jobError.toJSON());

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}
