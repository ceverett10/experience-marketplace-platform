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
import { getBrandIdentityForContent } from '../services/brand-identity';
import {
  generateArticleSchema,
  generateBreadcrumbSchema,
  generateLocalBusinessSchema,
  extractFAQsFromContent,
  generateFAQSchema,
} from '../services/structured-data';
import { suggestInternalLinks } from '../services/internal-linking';

/**
 * Valid internal routes that exist on every site.
 * Links to any other paths are considered hallucinated and will be stripped.
 */
const VALID_ROUTE_PREFIXES = [
  '/experiences',
  '/destinations',
  '/categories',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
];

/**
 * Sanitize AI-generated content by removing invalid internal links.
 * The AI sometimes fabricates links to non-existent pages like /tours/camden,
 * /guides/borough-market, /faq, etc. This function strips those links while
 * preserving the anchor text.
 *
 * For 'about' pages, ALL internal links are stripped since About pages
 * should not contain any inline links.
 */
function sanitizeContentLinks(
  content: string,
  contentType?: string
): { sanitized: string; removedCount: number } {
  let removedCount = 0;

  // Match markdown links: [text](url)
  const sanitized = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    // Allow external links (http/https) - but NOT for about pages
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (contentType === 'about') {
        removedCount++;
        return text;
      }
      return match;
    }

    // Allow anchor links
    if (url.startsWith('#')) {
      return match;
    }

    // For about pages, strip ALL internal links
    if (contentType === 'about') {
      removedCount++;
      return text;
    }

    // Check if internal link matches a valid route
    const isValid = VALID_ROUTE_PREFIXES.some(
      (prefix) => url === prefix || url.startsWith(prefix + '?') || url.startsWith(prefix + '/')
    );

    if (isValid) {
      return match;
    }

    // Invalid link - strip the markdown link but keep the text
    removedCount++;
    return text;
  });

  return { sanitized, removedCount };
}

/**
 * Sanitize About Us content to remove AI-fabricated claims.
 * The AI tends to fabricate credentials, certifications, and partnership claims
 * that could be misleading to users or create legal liability.
 */
function sanitizeAboutContent(content: string): { sanitized: string; claimsRemoved: number } {
  let claimsRemoved = 0;
  let sanitized = content;

  // Patterns that indicate fabricated credential claims (full sentences/phrases)
  const fabricatedClaimPatterns = [
    // Licensed/certified claims
    /[^.]*\b(?:licensed travel provider|tourism board certified|PCI[- ]DSS compliant|ABTA[- ]bonded|ATOL[- ]protected)\b[^.]*\./gi,
    // Specific regulatory compliance claims
    /[^.]*\b(?:operating under|registered under|compliant with)\b[^.]*\b(?:UK|EU|US|European)\b[^.]*\b(?:travel regulations?|consumer protection|data protection)\b[^.]*\./gi,
    // "24/7 support" claims
    /[^.]*\b24\/7\s+(?:support|customer service|assistance|helpline)\b[^.]*\./gi,
  ];

  for (const pattern of fabricatedClaimPatterns) {
    const before = sanitized;
    sanitized = sanitized.replace(pattern, '');
    if (sanitized !== before) {
      claimsRemoved++;
    }
  }

  // Clean up any resulting double newlines or empty list items
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  sanitized = sanitized.replace(/^-\s*$/gm, '');

  return { sanitized, claimsRemoved };
}

/**
 * Generate Schema.org structured data based on content type
 * This data is stored with the content and merged into page JSON-LD
 */
function generateStructuredDataForContent(params: {
  contentType: string;
  siteName: string;
  siteUrl: string;
  title: string;
  description: string;
  content: string;
  destination?: string;
  datePublished: string;
}): object {
  const {
    contentType,
    siteName,
    siteUrl,
    title,
    description,
    content,
    destination,
    datePublished,
  } = params;

  // Base breadcrumb structure - will be completed when page URL is known
  const breadcrumbItems = [{ name: 'Home', url: siteUrl }];

  // Generate type-specific structured data
  switch (contentType) {
    case 'blog': {
      // Extract FAQs from content for FAQ rich snippets
      const faqs = extractFAQsFromContent(content);
      const faqSchema = faqs.length > 0 ? generateFAQSchema(faqs) : null;

      // Article schema for blog posts
      const articleSchema = generateArticleSchema({
        headline: title,
        description: description,
        url: '', // Will be filled in when rendering
        datePublished,
        authorName: siteName,
        publisherName: siteName,
        isBlog: true,
        wordCount: content.split(/\s+/).length,
      });

      return {
        article: articleSchema,
        ...(faqSchema && { faq: faqSchema }),
        breadcrumbTemplate: [...breadcrumbItems, { name: 'Blog' }, { name: title }],
      };
    }

    case 'destination': {
      // LocalBusiness schema for destination pages
      const destinationSchema = generateLocalBusinessSchema({
        name: siteName,
        url: '', // Will be filled in when rendering
        description,
        areasServed: destination ? [destination] : undefined,
      });

      return {
        localBusiness: destinationSchema,
        breadcrumbTemplate: [...breadcrumbItems, { name: 'Destinations' }, { name: title }],
      };
    }

    case 'category': {
      // CollectionPage-style schema for category pages
      const categorySchema = generateLocalBusinessSchema({
        name: siteName,
        url: '',
        description,
      });

      return {
        localBusiness: categorySchema,
        breadcrumbTemplate: [...breadcrumbItems, { name: 'Categories' }, { name: title }],
      };
    }

    default:
      // Generic article schema
      return {
        article: generateArticleSchema({
          headline: title,
          description,
          url: '',
          datePublished,
          authorName: siteName,
          publisherName: siteName,
          isBlog: false,
        }),
        breadcrumbTemplate: [...breadcrumbItems, { name: title }],
      };
  }
}

/**
 * Generate an optimized meta description for higher CTR
 * - Uses AI-generated description if available
 * - Falls back to extracting compelling content from the body
 * - Ensures length is 150-160 chars (optimal for SERP display)
 */
function generateOptimizedMetaDescription(params: {
  aiMetaDescription?: string;
  contentBody: string;
  targetKeyword: string;
  contentType: string;
  siteName: string;
}): string {
  const { aiMetaDescription, contentBody, targetKeyword, contentType, siteName } = params;

  // Use AI-generated description if available and appropriate length
  if (aiMetaDescription && aiMetaDescription.length >= 100 && aiMetaDescription.length <= 160) {
    return aiMetaDescription;
  }

  // Extract first meaningful paragraph from content
  const paragraphs = contentBody
    .split('\n\n')
    .filter(
      (p) => p.trim().length > 50 && !p.startsWith('#') && !p.startsWith('-') && !p.startsWith('*')
    );

  let baseDescription = paragraphs[0] || contentBody;

  // Remove markdown formatting
  baseDescription = baseDescription
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();

  // If description is too long, truncate smartly at sentence boundary
  if (baseDescription.length > 155) {
    const sentences = baseDescription.split(/[.!?]+\s+/);
    let result = '';
    for (const sentence of sentences) {
      if ((result + sentence).length <= 150) {
        result += sentence + '. ';
      } else {
        break;
      }
    }
    baseDescription = result.trim() || baseDescription.substring(0, 150) + '...';
  }

  // Ensure keyword is included if not already present
  if (!baseDescription.toLowerCase().includes(targetKeyword.toLowerCase())) {
    // Add CTA-style prefix with keyword
    const ctaTemplates = {
      blog: `Discover ${targetKeyword}. `,
      destination: `Explore ${targetKeyword}. `,
      category: `Find the best ${targetKeyword}. `,
      experience: `Book ${targetKeyword}. `,
    };
    const prefix = ctaTemplates[contentType as keyof typeof ctaTemplates] || '';

    if ((prefix + baseDescription).length <= 160) {
      baseDescription = prefix + baseDescription;
    }
  }

  // Final length check
  if (baseDescription.length > 160) {
    baseDescription = baseDescription.substring(0, 157) + '...';
  }

  return baseDescription;
}

/**
 * Generate an optimized SEO title for higher CTR
 * - Front-loads the keyword
 * - Includes brand name appropriately
 * - Ensures length is 50-60 chars (optimal for SERP display)
 */
function generateOptimizedMetaTitle(params: {
  aiTitle: string;
  targetKeyword: string;
  siteName: string;
  contentType: string;
}): string {
  const { aiTitle, targetKeyword, siteName, contentType } = params;

  // If AI title is good length and contains keyword, use it
  const keywordFirstWord = targetKeyword.toLowerCase().split(' ')[0] || targetKeyword.toLowerCase();
  if (aiTitle.length <= 60 && aiTitle.toLowerCase().includes(keywordFirstWord)) {
    // Append site name if there's room
    const withBrand = `${aiTitle} | ${siteName}`;
    if (withBrand.length <= 60) {
      return withBrand;
    }
    return aiTitle;
  }

  // Generate optimized title with keyword front-loaded
  let title = aiTitle;

  // Truncate if too long
  if (title.length > 50) {
    // Try to cut at a word boundary
    const words = title.split(' ');
    title = '';
    for (const word of words) {
      if ((title + ' ' + word).trim().length <= 47) {
        title = (title + ' ' + word).trim();
      } else {
        break;
      }
    }
  }

  // Add brand if there's room
  const withBrand = `${title} | ${siteName}`;
  if (withBrand.length <= 60) {
    return withBrand;
  }

  return title;
}

/**
 * Calculate sitemap priority based on content quality and type
 * - Higher quality content gets higher priority
 * - Different content types have different base priorities
 * - Priority range: 0.1 to 1.0
 */
function calculateSitemapPriority(params: { qualityScore: number; contentType: string }): number {
  const { qualityScore, contentType } = params;

  // Base priorities by content type (SEO importance)
  const basePriorities: Record<string, number> = {
    destination: 0.8, // High value landing pages
    category: 0.7, // Category hubs
    experience: 0.6, // Product pages
    blog: 0.5, // Content marketing
  };

  const basePriority = basePriorities[contentType] || 0.5;

  // Adjust based on quality score (0-100 → +/- 0.2)
  // Score 0 → -0.2, Score 50 → 0, Score 100 → +0.2
  const qualityAdjustment = ((qualityScore - 50) / 50) * 0.2;

  // Calculate final priority, clamped to 0.1-1.0 range
  const priority = Math.max(0.1, Math.min(1.0, basePriority + qualityAdjustment));

  return Math.round(priority * 100) / 100; // Round to 2 decimal places
}

/**
 * Content Generation Worker
 * Generates new content using AI based on opportunities or manual requests
 */
export async function handleContentGenerate(job: Job<ContentGeneratePayload>): Promise<JobResult> {
  const {
    siteId,
    pageId,
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

    // Get brand identity for tone of voice and trust signals
    const brandIdentity = await getBrandIdentityForContent(siteId);
    console.log(
      `[Content Generate] Using brand identity with tone: ${brandIdentity.toneOfVoice?.personality?.join(', ') || 'default'}`
    );

    // Get opportunity if provided
    let opportunity = null;
    if (opportunityId) {
      opportunity = await prisma.sEOOpportunity.findUnique({
        where: { id: opportunityId },
      });
    }

    // Create content brief with brand context
    const brief = {
      type: contentType,
      siteId,
      siteName: site.name, // Include site name for brand-aware content generation
      targetKeyword,
      secondaryKeywords: secondaryKeywords || (opportunity?.keyword ? [opportunity.keyword] : []),
      destination: destination || opportunity?.location || '',
      category: category || opportunity?.niche || '',
      targetLength: targetLength || { min: 800, max: 1500 },
      tone: 'informative' as const,
      // Include comprehensive brand guidelines for content generation
      brandContext: {
        siteName: site.name,
        toneOfVoice: brandIdentity.toneOfVoice,
        trustSignals: brandIdentity.trustSignals,
        brandStory: brandIdentity.brandStory,
        contentGuidelines: brandIdentity.contentGuidelines,
        writingGuidelines: brandIdentity.toneOfVoice
          ? `Tone: ${brandIdentity.toneOfVoice.writingStyle}. Personality: ${brandIdentity.toneOfVoice.personality?.join(', ')}.
            Mission: ${brandIdentity.brandStory?.mission}.
            Value propositions: ${brandIdentity.trustSignals?.valuePropositions?.join('; ')}.`
          : undefined,
      },
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

    // Generate Schema.org structured data for SEO
    const structuredData = generateStructuredDataForContent({
      contentType,
      siteName: site.name,
      siteUrl: site.primaryDomain ? `https://${site.primaryDomain}` : '',
      title: result.content.title,
      description: targetKeyword,
      content: result.content.content,
      destination,
      datePublished: new Date().toISOString(),
    });

    // Sanitize AI-generated links - remove any links to non-existent pages
    // For about pages, strip ALL links (internal and external)
    const { sanitized: sanitizedContent, removedCount } = sanitizeContentLinks(
      result.content.content,
      contentType
    );
    if (removedCount > 0) {
      console.log(
        `[Content Generate] Removed ${removedCount} invalid AI-generated links from content`
      );
    }

    // For about pages, also sanitize fabricated credential/partnership claims
    let postSanitized = sanitizedContent;
    if (contentType === 'about') {
      const { sanitized: claimSanitized, claimsRemoved } = sanitizeAboutContent(sanitizedContent);
      if (claimsRemoved > 0) {
        console.log(
          `[Content Generate] Removed ${claimsRemoved} fabricated claims from about page content`
        );
        postSanitized = claimSanitized;
      }
    }

    // Add internal links to improve SEO and user navigation
    // Skip for about pages - they should not have inline internal links
    let finalContent = postSanitized;
    if (contentType !== 'about') {
      const linkSuggestion = await suggestInternalLinks({
        siteId,
        content: postSanitized,
        contentType: contentType as 'blog' | 'destination' | 'category' | 'experience',
        targetKeyword,
        secondaryKeywords,
        destination,
        category,
      });

      if (linkSuggestion.links.length > 0) {
        finalContent = linkSuggestion.contentWithLinks;
        console.log(
          `[Content Generate] Added ${linkSuggestion.links.length} internal links for SEO`
        );
      }
    }

    // Save content to database
    const content = await prisma.content.create({
      data: {
        siteId,
        body: finalContent,
        bodyFormat: 'MARKDOWN',
        isAiGenerated: true,
        aiModel: result.content.generatedBy,
        aiPrompt: `Generated for keyword: ${targetKeyword}`,
        qualityScore: result.content.qualityAssessment?.overallScore || 0,
        version: result.content.version,
        opportunityId: opportunityId || undefined,
        structuredData: structuredData as any,
      },
    });

    // Generate optimized meta description and title for better CTR
    const optimizedMetaDescription = generateOptimizedMetaDescription({
      aiMetaDescription: result.content.metaDescription,
      contentBody: finalContent,
      targetKeyword,
      contentType,
      siteName: site.name,
    });

    const optimizedMetaTitle = generateOptimizedMetaTitle({
      aiTitle: result.content.title,
      targetKeyword,
      siteName: site.name,
      contentType,
    });

    console.log(
      `[Content Generate] Optimized meta title: "${optimizedMetaTitle}" (${optimizedMetaTitle.length} chars)`
    );
    console.log(
      `[Content Generate] Optimized meta description: "${optimizedMetaDescription.substring(0, 50)}..." (${optimizedMetaDescription.length} chars)`
    );

    // Calculate sitemap priority based on quality score
    const qualityScore = result.content.qualityAssessment?.overallScore || 50;
    const sitemapPriority = calculateSitemapPriority({
      qualityScore,
      contentType,
    });
    console.log(
      `[Content Generate] Sitemap priority: ${sitemapPriority} (quality: ${qualityScore})`
    );

    // Update existing page or create new one
    // Auto-publish all generated content - quality score is tracked for admin review
    let page;
    const newStatus = 'PUBLISHED';

    if (pageId) {
      // Update existing page with generated content
      page = await prisma.page.update({
        where: { id: pageId },
        data: {
          contentId: content.id,
          metaTitle: optimizedMetaTitle,
          metaDescription: optimizedMetaDescription,
          priority: sitemapPriority,
          status: newStatus as any,
        },
      });
      console.log(`[Content Generate] Updated existing page ${pageId} with content`);
    } else {
      // Create new page for the content
      page = await prisma.page.create({
        data: {
          siteId,
          slug: result.content.slug,
          type: contentType.toUpperCase() as any,
          title: result.content.title,
          metaTitle: optimizedMetaTitle,
          metaDescription: optimizedMetaDescription,
          priority: sitemapPriority,
          contentId: content.id,
          status: newStatus as any,
        },
      });
      console.log(`[Content Generate] Created new page ${page.id}`);
    }

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

    console.error('[Content Generate] Error:', jobError.toJSON());

    // For retryable errors, throw to trigger BullMQ retry mechanism
    if (jobError.retryable && !shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
      // Throw the error so BullMQ marks this as failed and retries
      throw new Error(jobError.message);
    }

    // For non-retryable errors or max retries exceeded, return failure result
    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      await job.moveToFailed(new Error(`Permanent failure: ${jobError.message}`), '0', true);
    }

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
      console.log(`[Content Optimize] Content ${contentId} not found - skipping (content may not have been generated yet)`);
      return {
        success: false,
        error: `Content not found: ${contentId}`,
        errorCategory: 'not_found',
        timestamp: new Date(),
      };
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

    // Get site for structured data generation
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    const siteName = site?.name || 'Unknown';
    const siteUrl = site?.primaryDomain ? `https://${site.primaryDomain}` : '';

    // Generate updated structured data
    const structuredData = generateStructuredDataForContent({
      contentType: brief.type,
      siteName,
      siteUrl,
      title: result.content.title,
      description: content.opportunity?.keyword || content.page?.title || '',
      content: result.content.content,
      destination: content.opportunity?.location || undefined,
      datePublished: content.createdAt?.toISOString() || new Date().toISOString(),
    });

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
        structuredData: structuredData as any,
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

    console.error('[Content Optimize] Error:', jobError.toJSON());

    // For retryable errors, throw to trigger BullMQ retry mechanism
    if (jobError.retryable && !shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
      throw new Error(jobError.message);
    }

    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      await job.moveToFailed(new Error(`Permanent failure: ${jobError.message}`), '0', true);
    }

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

    console.error('[Content Review] Error:', jobError.toJSON());

    // For retryable errors, throw to trigger BullMQ retry mechanism
    if (jobError.retryable && !shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
      throw new Error(jobError.message);
    }

    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      await job.moveToFailed(new Error(`Permanent failure: ${jobError.message}`), '0', true);
    }

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
