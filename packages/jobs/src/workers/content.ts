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
 * Note: /blog links are validated separately against existing page slugs.
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
 * Placeholder/example domains that AI tends to fabricate.
 * Links to these domains are always stripped.
 */
const PLACEHOLDER_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'placeholder.com',
  'yoursite.com',
  'yourdomain.com',
  'website.com',
  'domain.com',
  'sample.com',
  'demo.com',
  'localhost',
];

/**
 * Extract the path from a URL, handling both relative and absolute URLs.
 * For same-domain links, extracts the path portion.
 * For placeholder domains (example.com, etc.), marks as invalid.
 */
function extractPathFromUrl(
  url: string,
  siteDomain?: string
): { path: string; isExternal: boolean; isPlaceholder: boolean } {
  // Handle relative URLs
  if (url.startsWith('/') || url.startsWith('#')) {
    return { path: url, isExternal: false, isPlaceholder: false };
  }

  // Handle absolute URLs
  try {
    const parsed = new URL(url);
    const urlDomain = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Check for placeholder/example domains that AI fabricates
    const isPlaceholder = PLACEHOLDER_DOMAINS.some(
      (placeholder) => urlDomain === placeholder || urlDomain.endsWith('.' + placeholder)
    );
    if (isPlaceholder) {
      return { path: url, isExternal: true, isPlaceholder: true };
    }

    // Check if it's a link to the same domain (including with/without www)
    if (siteDomain) {
      const normalizedDomain = siteDomain.toLowerCase().replace(/^www\./, '');

      if (urlDomain === normalizedDomain) {
        // Same domain - treat as internal link
        return { path: parsed.pathname + parsed.hash, isExternal: false, isPlaceholder: false };
      }
    }

    // External link to different domain
    return { path: url, isExternal: true, isPlaceholder: false };
  } catch {
    // Invalid URL, treat as relative
    return { path: url, isExternal: false, isPlaceholder: false };
  }
}

/**
 * Sanitize AI-generated content by removing invalid internal links.
 * The AI sometimes fabricates links to non-existent pages like /tours/camden,
 * /guides/borough-market, /faq, etc. This function strips those links while
 * preserving the anchor text.
 *
 * Also handles same-domain absolute URLs (e.g., https://example.com/blog/fake-page)
 * by extracting the path and validating it against known routes.
 *
 * For 'about' pages, ALL internal links are stripped since About pages
 * should not contain any inline links.
 */
function sanitizeContentLinks(
  content: string,
  contentType?: string,
  siteDomain?: string,
  existingSlugs?: Set<string>
): { sanitized: string; removedCount: number } {
  let removedCount = 0;

  // Match markdown links: [text](url)
  const sanitized = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const { path, isExternal, isPlaceholder } = extractPathFromUrl(url, siteDomain);

    // For about pages, strip ALL links (internal and external)
    if (contentType === 'about') {
      removedCount++;
      return text;
    }

    // Strip links to placeholder/example domains (AI fabrications)
    if (isPlaceholder) {
      removedCount++;
      return text;
    }

    // Allow truly external links (different domain, not placeholder)
    if (isExternal) {
      return match;
    }

    // Allow pure anchor links within the same page
    if (path.startsWith('#')) {
      return match;
    }

    // Strip the anchor portion for path validation
    const pathWithoutAnchor = path.split('#')[0] || path;

    // Check if internal link matches a valid route prefix
    const isValidPrefix = VALID_ROUTE_PREFIXES.some(
      (prefix) =>
        pathWithoutAnchor === prefix ||
        pathWithoutAnchor.startsWith(prefix + '?') ||
        pathWithoutAnchor.startsWith(prefix + '/')
    );

    if (isValidPrefix) {
      return match;
    }

    // Check if it's a blog post link - validate against existing slugs
    // Blog posts can be at /blog/[slug] or just /[slug]
    const blogMatch = pathWithoutAnchor.match(/^\/(?:blog\/)?([a-z0-9-]+)$/);
    if (blogMatch && existingSlugs) {
      const slug = blogMatch[1];
      if (slug && existingSlugs.has(slug)) {
        return match; // Valid existing blog post
      }
    }

    // Invalid link - strip the markdown link but keep the text
    removedCount++;
    return text;
  });

  return { sanitized, removedCount };
}

/**
 * Get all existing page slugs for a site to validate links against
 */
async function getExistingPageSlugs(siteId: string): Promise<Set<string>> {
  const pages = await prisma.page.findMany({
    where: { siteId, status: 'PUBLISHED' },
    select: { slug: true },
  });
  return new Set(pages.map((p) => p.slug));
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

    case 'faq': {
      // FAQPage schema - extract all Q&A pairs from content
      const faqs = extractFAQsFromContent(content);
      const faqSchema = faqs.length > 0 ? generateFAQSchema(faqs) : null;

      return {
        ...(faqSchema && { faq: faqSchema }),
        breadcrumbTemplate: [...breadcrumbItems, { name: 'FAQ' }, { name: title }],
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
  if (targetKeyword && !baseDescription.toLowerCase().includes(targetKeyword.toLowerCase())) {
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
  const keywordFirstWord = targetKeyword?.toLowerCase().split(' ')[0] || '';
  if (keywordFirstWord && aiTitle.length <= 60 && aiTitle.toLowerCase().includes(keywordFirstWord)) {
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
 * Get content formatting hints based on content subtype
 * These hints guide AI to format content appropriately for featured snippets
 */
function getContentFormatHints(
  contentSubtype?: string,
  sourceData?: ContentGeneratePayload['sourceData']
): string {
  if (!contentSubtype) return '';

  switch (contentSubtype) {
    case 'comparison': {
      const items = sourceData?.comparedItems;
      return items && items.length >= 2
        ? `FORMAT: This is a comparison article. Include a markdown comparison table with columns for Feature, ${items[0]}, and ${items[1]}. Structure with clear "Key Differences" and "Which is Right for You?" sections.`
        : 'FORMAT: Include a comparison table summarizing key differences.';
    }

    case 'faq_hub': {
      const questions = sourceData?.questions;
      return questions && questions.length > 0
        ? `FORMAT: This is an FAQ hub page. Use H3 headings for each question (ending with ?). Follow each H3 with a concise 40-60 word answer paragraph. Questions to answer: ${questions.slice(0, 10).join('; ')}`
        : 'FORMAT: Structure as FAQ with H3 question headings and concise answer paragraphs.';
    }

    case 'beginner_guide':
      return 'FORMAT: This is a first-timers guide. Use numbered H2 sections (1. Getting There, 2. Where to Stay, etc.). Include practical tips, common mistakes to avoid, and a "Quick Start Checklist" at the end.';

    case 'seasonal': {
      const event = sourceData?.event;
      return event
        ? `FORMAT: This is seasonal content for "${event}". Include specific dates/timing, what to expect, booking tips, and alternatives. Add a "Planning Timeline" section.`
        : 'FORMAT: Include seasonal timing, booking recommendations, and alternative options.';
    }

    default:
      return '';
  }
}

/**
 * Build comprehensive writing guidelines combining brand identity and format hints
 */
function buildWritingGuidelines(
  brandIdentity: {
    toneOfVoice?: { writingStyle?: string; personality?: string[] };
    brandStory?: { mission?: string };
    trustSignals?: { valuePropositions?: string[] };
  },
  formatHints: string
): string {
  const parts: string[] = [];

  // CRITICAL: Instruction to prevent fabricated links
  parts.push(
    'IMPORTANT: Do NOT include any hyperlinks in the content. Do not link to external websites, booking pages, or any URLs. Write plain text only - links will be added separately by our system'
  );

  // Add brand tone guidelines
  if (brandIdentity.toneOfVoice) {
    const tone = brandIdentity.toneOfVoice;
    if (tone.writingStyle) parts.push(`Tone: ${tone.writingStyle}`);
    if (tone.personality?.length) parts.push(`Personality: ${tone.personality.join(', ')}`);
  }

  // Add mission context
  if (brandIdentity.brandStory?.mission) {
    parts.push(`Mission: ${brandIdentity.brandStory.mission}`);
  }

  // Add value propositions
  if (brandIdentity.trustSignals?.valuePropositions?.length) {
    parts.push(`Value propositions: ${brandIdentity.trustSignals.valuePropositions.join('; ')}`);
  }

  // Add content format hints for SEO/featured snippets
  if (formatHints) {
    parts.push(formatHints);
  }

  return parts.join('. ');
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
    sourceData,
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

    // Build content-subtype-specific formatting hints
    const contentSubtype = sourceData?.contentSubtype;
    const formatHints = getContentFormatHints(contentSubtype, sourceData);

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
      // Include content subtype and formatting data
      sourceData: sourceData || undefined,
      // Include comprehensive brand guidelines for content generation
      brandContext: {
        siteName: site.name,
        toneOfVoice: brandIdentity.toneOfVoice,
        trustSignals: brandIdentity.trustSignals,
        brandStory: brandIdentity.brandStory,
        contentGuidelines: brandIdentity.contentGuidelines,
        writingGuidelines: buildWritingGuidelines(brandIdentity, formatHints),
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
      if (result.content) {
        // Content was generated but didn't meet the quality threshold after rewrites.
        // Accept it anyway — CONTENT_OPTIMIZE will improve it later in the pipeline.
        console.warn(
          `[Content Generate] Quality threshold not met (score: ${result.content.qualityAssessment?.overallScore || 'unknown'}/80), accepting content for later optimization`
        );
      } else {
        // No content generated at all — retryable since a fresh attempt may succeed
        throw new ExternalApiError(result.error || 'Content generation failed', {
          service: 'anthropic-api',
          statusCode: 503,
          context: { targetKeyword, contentType, qualityThreshold: 80 },
        });
      }
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

    // Get existing page slugs to validate blog links against
    const existingSlugs = await getExistingPageSlugs(siteId);

    // Sanitize AI-generated links - remove any links to non-existent pages
    // Includes validation of same-domain links (e.g., https://site.com/blog/fake-page)
    // For about pages, strip ALL links (internal and external)
    const { sanitized: sanitizedContent, removedCount } = sanitizeContentLinks(
      result.content.content,
      contentType,
      site.primaryDomain || undefined,
      existingSlugs
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
      // Check if page with same slug already exists (idempotency on retry)
      const existingPage = await prisma.page.findFirst({
        where: { siteId, slug: result.content.slug },
      });

      if (existingPage) {
        // Update existing page instead of creating duplicate
        page = await prisma.page.update({
          where: { id: existingPage.id },
          data: {
            contentId: content.id,
            metaTitle: optimizedMetaTitle,
            metaDescription: optimizedMetaDescription,
            priority: sitemapPriority,
            status: newStatus as any,
          },
        });
        console.log(`[Content Generate] Updated existing page ${page.id} (slug: ${result.content.slug})`);
      } else {
        // Map content type to PageType enum — destination content uses LANDING
        const pageTypeMap: Record<string, string> = {
          destination: 'LANDING',
          experience: 'PRODUCT',
          category: 'CATEGORY',
          blog: 'BLOG',
          about: 'ABOUT',
          faq: 'FAQ',
        };
        page = await prisma.page.create({
          data: {
            siteId,
            slug: result.content.slug,
            type: (pageTypeMap[contentType] || contentType.toUpperCase()) as any,
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
 * Batch content optimization for the launch pipeline.
 * Called when CONTENT_OPTIMIZE runs without a specific contentId (roadmap mode).
 * Enhances ALL generated content for the site:
 *  - Refreshes internal links (now that all pages exist, cross-linking is more effective)
 *  - Updates structured data
 *  - Optimizes meta titles/descriptions with full site context
 * This is a lightweight pass — no AI regeneration. The content was already quality-checked
 * during CONTENT_GENERATE; this step adds cross-page SEO enhancements.
 */
async function handleContentOptimizeBatch(siteId: string): Promise<JobResult> {
  console.log(`[Content Optimize] Batch mode: optimizing all content for site ${siteId}`);

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) {
    return { success: false, error: `Site ${siteId} not found`, timestamp: new Date() };
  }

  // Find all pages with AI-generated content
  const pages = await prisma.page.findMany({
    where: { siteId },
    include: {
      content: {
        include: { opportunity: true },
      },
    },
  });

  const pagesWithContent = pages.filter((p) => p.content?.isAiGenerated);
  if (pagesWithContent.length === 0) {
    return {
      success: false,
      error: 'No AI-generated content found to optimize',
      timestamp: new Date(),
    };
  }

  const siteName = site.name;
  const siteUrl = site.primaryDomain ? `https://${site.primaryDomain}` : '';
  let optimizedCount = 0;

  // Get all existing page slugs for link validation
  const existingSlugs = await getExistingPageSlugs(siteId);

  for (const page of pagesWithContent) {
    const content = page.content!;
    const contentType = (page.type || 'blog').toLowerCase();
    const targetKeyword = content.opportunity?.keyword || page.title || '';

    try {
      // First, sanitize any invalid links in existing content
      const { sanitized: sanitizedBody, removedCount } = sanitizeContentLinks(
        content.body,
        contentType,
        site.primaryDomain || undefined,
        existingSlugs
      );
      if (removedCount > 0) {
        console.log(
          `[Content Optimize] Page "${page.slug}": removed ${removedCount} invalid links`
        );
      }

      // Enhance internal links now that all pages exist for the site
      let enhancedBody = sanitizedBody;
      if (contentType !== 'about') {
        const linkSuggestion = await suggestInternalLinks({
          siteId,
          content: content.body,
          contentType: contentType as 'blog' | 'destination' | 'category' | 'experience',
          targetKeyword,
          secondaryKeywords: [],
          destination: content.opportunity?.location || undefined,
          category: content.opportunity?.niche || undefined,
        });
        if (linkSuggestion.links.length > 0) {
          enhancedBody = linkSuggestion.contentWithLinks;
          console.log(
            `[Content Optimize] Page "${page.slug}": added ${linkSuggestion.links.length} internal links`
          );
        }
      }

      // Refresh structured data with full site context
      const structuredData = generateStructuredDataForContent({
        contentType,
        siteName,
        siteUrl,
        title: page.title,
        description: targetKeyword,
        content: enhancedBody,
        destination: content.opportunity?.location || undefined,
        datePublished: content.createdAt?.toISOString() || new Date().toISOString(),
      });

      // Update content body and structured data in place (no new version — this is enhancement, not rewrite)
      await prisma.content.update({
        where: { id: content.id },
        data: {
          body: enhancedBody,
          structuredData: structuredData as any,
        },
      });

      // Re-optimize meta title and description with full site context
      const optimizedMetaDescription = generateOptimizedMetaDescription({
        aiMetaDescription: page.metaDescription || undefined,
        contentBody: enhancedBody,
        targetKeyword,
        contentType,
        siteName,
      });
      const optimizedMetaTitle = generateOptimizedMetaTitle({
        aiTitle: page.title,
        targetKeyword,
        siteName,
        contentType,
      });

      await prisma.page.update({
        where: { id: page.id },
        data: {
          metaTitle: optimizedMetaTitle,
          metaDescription: optimizedMetaDescription,
          status: 'PUBLISHED',
        },
      });

      optimizedCount++;
    } catch (pageError) {
      console.error(`[Content Optimize] Error optimizing page "${page.slug}":`, pageError);
      // Continue with other pages — don't fail the whole batch for one page
    }
  }

  console.log(
    `[Content Optimize] Batch complete: optimized ${optimizedCount}/${pagesWithContent.length} pages`
  );

  return {
    success: true,
    message: `Batch optimized ${optimizedCount} page(s) for SEO`,
    data: { optimizedCount, totalPages: pagesWithContent.length },
    timestamp: new Date(),
  };
}

/**
 * Content Optimization Worker
 * Rewrites underperforming content based on GSC data.
 * In batch mode (no contentId), enhances all content for the site — used by the launch pipeline.
 */
export async function handleContentOptimize(job: Job<ContentOptimizePayload>): Promise<JobResult> {
  const { siteId, pageId, contentId, reason, performanceData } = job.data;

  try {
    // Batch mode: when no contentId is provided (roadmap launch pipeline),
    // optimize all content for the site — enhance internal links and structured data.
    if (!contentId) {
      return await handleContentOptimizeBatch(siteId);
    }

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
      console.log(
        `[Content Optimize] Content ${contentId} not found - skipping (content may not have been generated yet)`
      );
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
      type: (content.page?.type?.toLowerCase() as any) || 'blog',
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
    if (pageId) {
      await prisma.page.update({
        where: { id: pageId },
        data: {
          contentId: optimizedContent.id,
          status: 'PUBLISHED',
        },
      });
    }

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
 * Batch content review for the launch pipeline.
 * Called when CONTENT_REVIEW runs without a specific contentId (roadmap mode).
 * Reviews ALL generated content for the site:
 *  - Auto-approves content with quality score >= 70 (sets page status to PUBLISHED)
 *  - Flags low-quality content for human review
 */
async function handleContentReviewBatch(siteId: string): Promise<JobResult> {
  console.log(`[Content Review] Batch mode: reviewing all content for site ${siteId}`);

  const pages = await prisma.page.findMany({
    where: { siteId },
    include: {
      content: true,
    },
  });

  const pagesWithContent = pages.filter((p) => p.content?.isAiGenerated);
  if (pagesWithContent.length === 0) {
    return {
      success: false,
      error: 'No AI-generated content found to review',
      timestamp: new Date(),
    };
  }

  let approvedCount = 0;
  let flaggedCount = 0;
  const QUALITY_THRESHOLD = 70;

  for (const page of pagesWithContent) {
    const content = page.content!;
    const score = content.qualityScore || 0;

    if (score >= QUALITY_THRESHOLD) {
      // Auto-approve — content meets quality threshold
      await prisma.page.update({
        where: { id: page.id },
        data: { status: 'PUBLISHED' },
      });
      approvedCount++;
      console.log(
        `[Content Review] Page "${page.slug}" auto-approved (score: ${score})`
      );
    } else {
      // Flag for human review
      await prisma.page.update({
        where: { id: page.id },
        data: { status: 'REVIEW' },
      });
      flaggedCount++;
      console.log(
        `[Content Review] Page "${page.slug}" flagged for review (score: ${score})`
      );
    }
  }

  console.log(
    `[Content Review] Batch complete: ${approvedCount} approved, ${flaggedCount} flagged`
  );

  return {
    success: true,
    message: `Reviewed ${pagesWithContent.length} page(s): ${approvedCount} approved, ${flaggedCount} flagged`,
    data: { approvedCount, flaggedCount, totalPages: pagesWithContent.length },
    timestamp: new Date(),
  };
}

/**
 * Content Review Worker
 * Handles content that failed quality gate multiple times.
 * In batch mode (no contentId), reviews all content for the site — used by the launch pipeline.
 */
export async function handleContentReview(job: Job<ContentReviewPayload>): Promise<JobResult> {
  const { siteId, contentId, qualityScore, issues } = job.data;

  try {
    // Batch mode: when no contentId is provided (roadmap launch pipeline),
    // review all content for the site.
    if (!contentId) {
      return await handleContentReviewBatch(siteId);
    }

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
      `[Content Review] Flagged for review - Score: ${qualityScore}, Issues: ${issues?.length || 0}`
    );

    return {
      success: true,
      message: `Content flagged for review`,
      data: {
        contentId,
        qualityScore,
        issueCount: issues?.length || 0,
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
