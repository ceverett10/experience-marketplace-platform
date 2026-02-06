/**
 * Daily Content Generator Service
 * Orchestrates all daily content generation for SEO across active sites
 * Generates: FAQ hubs, destination pages, comparisons, refreshes, guides, seasonal content
 */

import { prisma, PageType, PageStatus, SiteStatus } from '@experience-marketplace/database';
import { addJob } from '../queues/index.js';
import { getPagesNeedingOptimization } from './seo-health.js';

// ============================================================================
// Types
// ============================================================================

export type ContentGenerationType =
  | 'faq_hub'
  | 'destination_landing'
  | 'comparison'
  | 'content_refresh'
  | 'local_guide'
  | 'seasonal_event';

export interface ContentGenerationResult {
  siteId: string;
  siteName: string;
  contentType: ContentGenerationType;
  generated: boolean;
  queued: boolean;
  pageId?: string;
  pageSlug?: string;
  reason?: string;
  error?: string;
}

interface SiteContext {
  id: string;
  name: string;
  niche: string;
  location?: string;
  categories: string[];
  destinations: string[];
}

interface HomepageConfig {
  categories?: string[];
  destinations?: string[];
}

interface SeoConfig {
  primaryKeywords?: string[];
  destination?: string;
  destinations?: string[];
}

// Seasonal events calendar
const SEASONAL_EVENTS: Record<number, string[]> = {
  1: ['New Year celebrations', 'winter activities', 'January sales'],
  2: ["Valentine's Day experiences", 'winter escapes', 'romantic getaways'],
  3: ['spring break activities', 'Easter markets', 'spring festivals'],
  4: ['Easter activities', 'spring blooms', 'outdoor experiences'],
  5: ['summer preview', "Mother's Day experiences", 'bank holiday activities'],
  6: ['summer activities', "Father's Day experiences", 'outdoor adventures'],
  7: ['summer holidays', 'festival season', 'family activities'],
  8: ['late summer activities', 'back-to-school preparation', 'harvest festivals'],
  9: ['autumn activities', 'harvest season', 'cultural events'],
  10: ['Halloween experiences', 'autumn adventures', 'half-term activities'],
  11: ['bonfire night', 'Christmas market previews', 'winter preparation'],
  12: ['Christmas markets', 'New Year Eve celebrations', 'winter wonderland', 'festive experiences'],
};

// ============================================================================
// Main Orchestrator
// ============================================================================

/**
 * Generate content of a specific type for all active sites
 */
export async function generateDailyContent(
  contentType: ContentGenerationType
): Promise<ContentGenerationResult[]> {
  console.log(`[Daily Content] Starting ${contentType} generation for all active sites...`);

  const activeSites = await prisma.site.findMany({
    where: { status: SiteStatus.ACTIVE },
    select: { id: true, name: true },
  });

  console.log(`[Daily Content] Found ${activeSites.length} active sites`);

  const results: ContentGenerationResult[] = [];

  for (const site of activeSites) {
    try {
      let result: ContentGenerationResult;

      switch (contentType) {
        case 'faq_hub':
          result = await generateFAQHubForSite(site.id);
          break;
        case 'destination_landing':
          result = await generateDestinationLandingForSite(site.id);
          break;
        case 'comparison':
          result = await generateComparisonPageForSite(site.id);
          break;
        case 'content_refresh':
          result = await refreshUnderperformingContent(site.id);
          break;
        case 'local_guide':
          result = await generateLocalGuideForSite(site.id);
          break;
        case 'seasonal_event':
          result = await generateSeasonalContentForSite(site.id);
          break;
        default:
          result = {
            siteId: site.id,
            siteName: site.name,
            contentType,
            generated: false,
            queued: false,
            error: `Unknown content type: ${contentType}`,
          };
      }

      results.push(result);
    } catch (error) {
      results.push({
        siteId: site.id,
        siteName: site.name,
        contentType,
        generated: false,
        queued: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Delay between sites to avoid rate limiting
    await sleep(2000);
  }

  // Log summary
  const generated = results.filter((r) => r.generated).length;
  const errors = results.filter((r) => r.error).length;
  console.log(
    `[Daily Content] ${contentType} complete. Generated: ${generated}, Errors: ${errors}`
  );

  return results;
}

// ============================================================================
// FAQ Hub Generation
// ============================================================================

/**
 * Generate FAQ hub page from GSC queries and existing content
 */
export async function generateFAQHubForSite(siteId: string): Promise<ContentGenerationResult> {
  const site = await getSiteWithContext(siteId);
  if (!site) {
    return errorResult(siteId, 'Unknown', 'faq_hub', 'Site not found');
  }

  console.log(`[FAQ Hub] Generating for ${site.name}...`);

  // Check if FAQ hub already exists
  const existingFaq = await prisma.page.findFirst({
    where: { siteId, slug: 'faq', type: PageType.FAQ },
  });

  if (existingFaq) {
    return {
      siteId,
      siteName: site.name,
      contentType: 'faq_hub',
      generated: false,
      queued: false,
      reason: 'FAQ hub already exists',
    };
  }

  // Collect questions from GSC queries (queries ending in ?)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const gscQuestions = await prisma.performanceMetric.findMany({
    where: {
      siteId,
      query: { endsWith: '?' },
      impressions: { gte: 10 },
      date: { gte: ninetyDaysAgo },
    },
    orderBy: { impressions: 'desc' },
    take: 20,
    distinct: ['query'],
  });

  // Collect questions from existing content (H3 headings with ?)
  const existingContent = await prisma.content.findMany({
    where: { siteId },
    select: { body: true },
    take: 50,
  });

  const contentQuestions = existingContent
    .flatMap((c) => extractQuestionsFromContent(c.body || ''))
    .slice(0, 20);

  // Deduplicate questions
  const allQuestions = [...new Set([...gscQuestions.map((q) => q.query!), ...contentQuestions])];

  if (allQuestions.length < 3) {
    const aiQuestions = generateFallbackQuestions(site.niche, site.location);
    allQuestions.push(...aiQuestions);
  }

  // Create FAQ hub page
  const faqTitle = `Frequently Asked Questions | ${site.name}`;
  const faqPage = await prisma.page.create({
    data: {
      siteId,
      title: faqTitle,
      slug: 'faq',
      type: PageType.FAQ,
      status: PageStatus.DRAFT,
      metaTitle: generateMetaTitle({
        title: faqTitle,
        siteName: site.name,
        niche: site.niche,
        location: site.location,
        type: 'faq',
      }),
      metaDescription: `Find answers to common questions about ${site.niche}${site.location ? ` in ${site.location}` : ''}`,
      priority: 0.7,
    },
  });

  await addJob('CONTENT_GENERATE', {
    siteId,
    pageId: faqPage.id,
    contentType: 'faq',
    targetKeyword: `${site.niche} FAQ`,
    sourceData: { questions: allQuestions.slice(0, 15), contentSubtype: 'faq_hub' },
  });

  console.log(`[FAQ Hub] Created FAQ hub for ${site.name} with ${allQuestions.length} questions`);

  return {
    siteId,
    siteName: site.name,
    contentType: 'faq_hub',
    generated: true,
    queued: true,
    pageId: faqPage.id,
    pageSlug: 'faq',
  };
}

// ============================================================================
// Destination Landing Page Generation
// ============================================================================

export async function generateDestinationLandingForSite(
  siteId: string
): Promise<ContentGenerationResult> {
  const site = await getSiteWithContext(siteId);
  if (!site) {
    return errorResult(siteId, 'Unknown', 'destination_landing', 'Site not found');
  }

  console.log(`[Destination] Generating for ${site.name}...`);

  const existingDestinations = await prisma.page.findMany({
    where: {
      siteId,
      type: PageType.LANDING,
      slug: { startsWith: 'destinations/' },
    },
    select: { slug: true },
  });

  const existingSlugs = new Set(existingDestinations.map((p) => p.slug));

  const opportunities = await prisma.sEOOpportunity.findMany({
    where: {
      siteId,
      location: { not: null },
      status: { in: ['IDENTIFIED', 'EVALUATED'] },
    },
    orderBy: { priorityScore: 'desc' },
    take: 20,
  });

  let targetLocation: string | null = null;
  let targetKeyword: string | null = null;

  for (const opp of opportunities) {
    if (!opp.location) continue;
    const slug = `destinations/${slugify(opp.location)}`;
    if (!existingSlugs.has(slug)) {
      targetLocation = opp.location;
      targetKeyword = opp.keyword;
      break;
    }
  }

  if (!targetLocation && site.destinations.length > 0) {
    for (const dest of site.destinations) {
      const slug = `destinations/${slugify(dest)}`;
      if (!existingSlugs.has(slug)) {
        targetLocation = dest;
        targetKeyword = `${site.niche} in ${dest}`;
        break;
      }
    }
  }

  if (!targetLocation) {
    return {
      siteId,
      siteName: site.name,
      contentType: 'destination_landing',
      generated: false,
      queued: false,
      reason: 'All destinations covered',
    };
  }

  const pageSlug = `destinations/${slugify(targetLocation)}`;
  const destinationTitle = `${capitalize(site.niche)} in ${targetLocation}`;

  const destinationPage = await prisma.page.create({
    data: {
      siteId,
      title: destinationTitle,
      slug: pageSlug,
      type: PageType.LANDING,
      status: PageStatus.DRAFT,
      metaTitle: generateMetaTitle({
        title: destinationTitle,
        siteName: site.name,
        niche: site.niche,
        location: targetLocation,
        type: 'landing',
      }),
      metaDescription: `Discover the best ${site.niche} in ${targetLocation}. Expert guides, insider tips, and top experiences.`,
      priority: 0.8,
    },
  });

  await addJob('CONTENT_GENERATE', {
    siteId,
    pageId: destinationPage.id,
    contentType: 'destination',
    targetKeyword: targetKeyword || `${site.niche} in ${targetLocation}`,
    destination: targetLocation,
  });

  console.log(`[Destination] Created "${targetLocation}" page for ${site.name}`);

  return {
    siteId,
    siteName: site.name,
    contentType: 'destination_landing',
    generated: true,
    queued: true,
    pageId: destinationPage.id,
    pageSlug,
  };
}

// ============================================================================
// Comparison Page Generation
// ============================================================================

export async function generateComparisonPageForSite(
  siteId: string
): Promise<ContentGenerationResult> {
  const site = await getSiteWithContext(siteId);
  if (!site) {
    return errorResult(siteId, 'Unknown', 'comparison', 'Site not found');
  }

  console.log(`[Comparison] Generating for ${site.name}...`);

  const dayOfYear = getDayOfYear();
  const comparisonTypes = ['category_vs_category', 'destination_vs_destination', 'experience_type'];
  const comparisonType = comparisonTypes[dayOfYear % comparisonTypes.length];

  let comparisonPair: [string, string] | null = null;
  let targetKeyword: string;

  switch (comparisonType) {
    case 'category_vs_category':
      if (site.categories.length >= 2) {
        comparisonPair = selectPairForDay(site.categories, dayOfYear);
      }
      break;
    case 'destination_vs_destination':
      if (site.destinations.length >= 2) {
        comparisonPair = selectPairForDay(site.destinations, dayOfYear);
      }
      break;
    case 'experience_type': {
      const experienceTypes = [
        ['walking tours', 'bus tours'],
        ['private tours', 'group tours'],
        ['day trips', 'half-day experiences'],
        ['morning tours', 'evening tours'],
      ];
      comparisonPair = experienceTypes[dayOfYear % experienceTypes.length] as [string, string];
      break;
    }
  }

  if (!comparisonPair) {
    return {
      siteId,
      siteName: site.name,
      contentType: 'comparison',
      generated: false,
      queued: false,
      reason: 'Not enough items for comparison',
    };
  }

  targetKeyword = `${comparisonPair[0]} vs ${comparisonPair[1]}`;
  if (site.location) {
    targetKeyword += ` ${site.location}`;
  }

  // Blog slugs must include 'blog/' prefix to match frontend route lookup
  const pageSlug = `blog/${slugify(targetKeyword)}`;

  const existing = await prisma.page.findFirst({
    where: { siteId, slug: pageSlug },
  });

  if (existing) {
    return {
      siteId,
      siteName: site.name,
      contentType: 'comparison',
      generated: false,
      queued: false,
      reason: 'Comparison already exists',
    };
  }

  const comparisonTitle = `${comparisonPair[0]} vs ${comparisonPair[1]}: Which is Right for You?`;
  const comparisonPage = await prisma.page.create({
    data: {
      siteId,
      title: comparisonTitle,
      slug: pageSlug,
      type: PageType.BLOG,
      status: PageStatus.DRAFT,
      metaTitle: generateMetaTitle({
        title: comparisonTitle,
        siteName: site.name,
        niche: site.niche,
        type: 'comparison',
      }),
      metaDescription: `Compare ${comparisonPair[0]} and ${comparisonPair[1]} to find the perfect experience for you.`,
      priority: 0.6,
    },
  });

  await addJob('CONTENT_GENERATE', {
    siteId,
    pageId: comparisonPage.id,
    contentType: 'blog',
    targetKeyword,
    sourceData: {
      contentSubtype: 'comparison',
      comparedItems: comparisonPair,
      comparisonType,
    },
  });

  console.log(`[Comparison] Created "${targetKeyword}" for ${site.name}`);

  return {
    siteId,
    siteName: site.name,
    contentType: 'comparison',
    generated: true,
    queued: true,
    pageId: comparisonPage.id,
    pageSlug,
  };
}

// ============================================================================
// Content Refresh
// ============================================================================

export async function refreshUnderperformingContent(
  siteId: string
): Promise<ContentGenerationResult> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true },
  });

  if (!site) {
    return errorResult(siteId, 'Unknown', 'content_refresh', 'Site not found');
  }

  console.log(`[Content Refresh] Checking ${site.name}...`);

  const pagesNeedingWork = await getPagesNeedingOptimization(siteId, 1);

  if (pagesNeedingWork.length === 0) {
    return {
      siteId,
      siteName: site.name,
      contentType: 'content_refresh',
      generated: false,
      queued: false,
      reason: 'No pages need refresh',
    };
  }

  const targetPage = pagesNeedingWork[0]!;

  const page = await prisma.page.findUnique({
    where: { id: targetPage.pageId },
    include: { content: true },
  });

  if (!page?.content) {
    return {
      siteId,
      siteName: site.name,
      contentType: 'content_refresh',
      generated: false,
      queued: false,
      reason: 'Page has no content to refresh',
    };
  }

  // Map reason to ContentOptimizePayload reason type
  const optimizeReason = mapReasonToOptimizeType(targetPage.reason);

  await addJob('CONTENT_OPTIMIZE', {
    siteId,
    pageId: targetPage.pageId,
    contentId: page.content.id,
    reason: optimizeReason,
    performanceData: {
      ctr: targetPage.metrics.ctr,
      position: targetPage.metrics.position,
    },
  });

  console.log(`[Content Refresh] Queued optimization for "${page.title}" (${targetPage.reason})`);

  return {
    siteId,
    siteName: site.name,
    contentType: 'content_refresh',
    generated: true,
    queued: true,
    pageId: targetPage.pageId,
    reason: targetPage.reason,
  };
}

// ============================================================================
// Local Beginner Guide Generation (Weekly)
// ============================================================================

export async function generateLocalGuideForSite(siteId: string): Promise<ContentGenerationResult> {
  const site = await getSiteWithContext(siteId);
  if (!site) {
    return errorResult(siteId, 'Unknown', 'local_guide', 'Site not found');
  }

  console.log(`[Local Guide] Generating for ${site.name}...`);

  const existingGuides = await prisma.page.findMany({
    where: {
      siteId,
      slug: { contains: 'first-timers-guide' },
    },
    select: { slug: true },
  });

  const existingGuideSlugs = new Set(existingGuides.map((p) => p.slug));

  let targetDestination: string | null = null;
  for (const dest of site.destinations) {
    // Blog slugs include 'blog/' prefix for frontend route lookup
    const guideSlug = `blog/first-timers-guide-${slugify(dest)}`;
    if (!existingGuideSlugs.has(guideSlug)) {
      targetDestination = dest;
      break;
    }
  }

  if (!targetDestination && site.location) {
    const guideSlug = `blog/first-timers-guide-${slugify(site.location)}`;
    if (!existingGuideSlugs.has(guideSlug)) {
      targetDestination = site.location;
    }
  }

  if (!targetDestination) {
    return {
      siteId,
      siteName: site.name,
      contentType: 'local_guide',
      generated: false,
      queued: false,
      reason: 'All guides created',
    };
  }

  // Blog slugs must include 'blog/' prefix to match frontend route lookup
  const pageSlug = `blog/first-timers-guide-${slugify(targetDestination)}`;
  const guideTitle = `Complete Guide to ${targetDestination} for First-Timers`;

  const guidePage = await prisma.page.create({
    data: {
      siteId,
      title: guideTitle,
      slug: pageSlug,
      type: PageType.BLOG,
      status: PageStatus.DRAFT,
      metaTitle: generateMetaTitle({
        title: guideTitle,
        siteName: site.name,
        niche: site.niche,
        location: targetDestination,
        type: 'guide',
      }),
      metaDescription: `Everything you need to know about ${site.niche} in ${targetDestination}. Expert tips for first-time visitors.`,
      priority: 0.7,
    },
  });

  await addJob('CONTENT_GENERATE', {
    siteId,
    pageId: guidePage.id,
    contentType: 'blog',
    targetKeyword: `${targetDestination} travel guide first time`,
    destination: targetDestination,
    targetLength: { min: 1500, max: 2500 },
    sourceData: { contentSubtype: 'beginner_guide' },
  });

  console.log(`[Local Guide] Created "${guideTitle}" for ${site.name}`);

  return {
    siteId,
    siteName: site.name,
    contentType: 'local_guide',
    generated: true,
    queued: true,
    pageId: guidePage.id,
    pageSlug,
  };
}

// ============================================================================
// Seasonal/Event Content Generation
// ============================================================================

export async function generateSeasonalContentForSite(
  siteId: string
): Promise<ContentGenerationResult> {
  const site = await getSiteWithContext(siteId);
  if (!site) {
    return errorResult(siteId, 'Unknown', 'seasonal_event', 'Site not found');
  }

  console.log(`[Seasonal] Generating for ${site.name}...`);

  const currentMonth = new Date().getMonth() + 1;
  const upcomingMonth = (currentMonth % 12) + 1;

  const currentEvents = SEASONAL_EVENTS[currentMonth] || [];
  const upcomingEvents = SEASONAL_EVENTS[upcomingMonth] || [];
  const allEvents = [...currentEvents, ...upcomingEvents];

  const existingSeasonal = await prisma.page.findMany({
    where: {
      siteId,
      type: PageType.BLOG,
      slug: { startsWith: 'blog/seasonal-' },
    },
    select: { slug: true },
  });

  const existingSlugs = new Set(existingSeasonal.map((p) => p.slug));
  const location = site.location || site.destinations[0] || '';
  let targetEvent: string | null = null;

  for (const event of allEvents) {
    // Blog slugs include 'blog/' prefix for frontend route lookup
    const testSlug = `blog/seasonal-${slugify(event)}${location ? `-${slugify(location)}` : ''}`;
    if (!existingSlugs.has(testSlug)) {
      targetEvent = event;
      break;
    }
  }

  if (!targetEvent) {
    return {
      siteId,
      siteName: site.name,
      contentType: 'seasonal_event',
      generated: false,
      queued: false,
      reason: 'Seasonal topics covered',
    };
  }

  const seasonalTitle = location
    ? `${capitalize(targetEvent)} in ${location}: Top ${capitalize(site.niche)}`
    : `Best ${capitalize(site.niche)} for ${capitalize(targetEvent)}`;

  // Blog slugs must include 'blog/' prefix to match frontend route lookup
  const pageSlug = `blog/seasonal-${slugify(targetEvent)}${location ? `-${slugify(location)}` : ''}`;

  const seasonalPage = await prisma.page.create({
    data: {
      siteId,
      title: seasonalTitle,
      slug: pageSlug,
      type: PageType.BLOG,
      status: PageStatus.DRAFT,
      metaTitle: generateMetaTitle({
        title: seasonalTitle,
        siteName: site.name,
        niche: site.niche,
        location: location || undefined,
        type: 'seasonal',
      }),
      metaDescription: `Discover the best ${site.niche} for ${targetEvent}${location ? ` in ${location}` : ''}. Seasonal recommendations and tips.`,
      priority: 0.6,
    },
  });

  await addJob('CONTENT_GENERATE', {
    siteId,
    pageId: seasonalPage.id,
    contentType: 'blog',
    targetKeyword: `${targetEvent} ${site.niche}${location ? ` ${location}` : ''}`,
    destination: location || undefined,
    sourceData: { contentSubtype: 'seasonal', event: targetEvent },
  });

  console.log(`[Seasonal] Created "${seasonalTitle}" for ${site.name}`);

  return {
    siteId,
    siteName: site.name,
    contentType: 'seasonal_event',
    generated: true,
    queued: true,
    pageId: seasonalPage.id,
    pageSlug,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getSiteWithContext(siteId: string): Promise<SiteContext | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      opportunities: { take: 1, orderBy: { createdAt: 'desc' } },
    },
  });

  if (!site) return null;

  const opportunity = site.opportunities?.[0];
  const seoConfig = site.seoConfig as SeoConfig | null;
  const homepageConfig = site.homepageConfig as HomepageConfig | null;

  return {
    id: site.id,
    name: site.name,
    niche: opportunity?.niche || seoConfig?.primaryKeywords?.[0] || 'travel experiences',
    location: opportunity?.location || seoConfig?.destination,
    categories: homepageConfig?.categories || [],
    destinations: seoConfig?.destinations || homepageConfig?.destinations || [],
  };
}

function extractQuestionsFromContent(body: string): string[] {
  const questionRegex = /###\s*([^#\n]+\?)/g;
  const questions: string[] = [];
  let match;
  while ((match = questionRegex.exec(body)) !== null) {
    if (match[1]) {
      questions.push(match[1].trim());
    }
  }
  return questions;
}

function generateFallbackQuestions(niche: string, location?: string): string[] {
  const base = [
    `What is the best ${niche}?`,
    `How much does ${niche} cost?`,
    `What should I wear for ${niche}?`,
    `How long does ${niche} last?`,
    `Is ${niche} suitable for children?`,
  ];

  if (location) {
    return base.map((q) => q.replace('?', ` in ${location}?`));
  }
  return base;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function capitalize(text: string): string {
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function selectPairForDay(items: string[], day: number): [string, string] {
  const n = items.length;
  if (n < 2) {
    throw new Error('Need at least 2 items for comparison');
  }

  const totalPairs = (n * (n - 1)) / 2;
  const pairIndex = day % totalPairs;

  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (count === pairIndex) {
        return [items[i]!, items[j]!];
      }
      count++;
    }
  }

  // Fallback (should never reach here with valid inputs)
  return [items[0]!, items[1]!];
}

type OptimizeReasonType =
  | 'low_ctr'
  | 'position_drop'
  | 'high_bounce'
  | 'low_time'
  | 'no_bookings'
  | 'initial_seo';

function mapReasonToOptimizeType(reason: string): OptimizeReasonType {
  const mapping: Record<string, OptimizeReasonType> = {
    low_ctr_top_10: 'low_ctr',
    low_quality: 'initial_seo',
    close_to_page_1: 'position_drop',
    quality_improvement: 'initial_seo',
    stale_content: 'initial_seo',
    thin_content: 'initial_seo',
    missing_structured_data: 'initial_seo',
  };
  return mapping[reason] || 'initial_seo';
}

/**
 * Generate an SEO-optimized meta title for a page
 * Ensures meta title is never null and follows SEO best practices:
 * - Under 60 characters for full display in search results
 * - Includes primary keyword/topic
 * - Includes brand name when space allows
 */
function generateMetaTitle(params: {
  title: string;
  siteName: string;
  niche?: string;
  location?: string;
  type: 'faq' | 'landing' | 'blog' | 'comparison' | 'guide' | 'seasonal';
}): string {
  const { title, siteName, niche, location, type } = params;
  const MAX_LENGTH = 60;

  // Type-specific title generation
  switch (type) {
    case 'faq':
      if (location && niche) {
        const faqTitle = `${capitalize(niche)} FAQ - ${location} | ${siteName}`;
        if (faqTitle.length <= MAX_LENGTH) return faqTitle;
      }
      return truncateWithBrand(`${niche || 'Experience'} FAQ`, siteName, MAX_LENGTH);

    case 'landing':
      if (location && niche) {
        const landingTitle = `Best ${capitalize(niche)} in ${location} | ${siteName}`;
        if (landingTitle.length <= MAX_LENGTH) return landingTitle;
        return `${capitalize(niche)} in ${location}`;
      }
      return truncateWithBrand(title, siteName, MAX_LENGTH);

    case 'comparison':
      // Comparisons already have descriptive titles
      return truncateWithBrand(title, siteName, MAX_LENGTH);

    case 'guide':
      if (location) {
        const guideTitle = `${location} Guide for First-Timers | ${siteName}`;
        if (guideTitle.length <= MAX_LENGTH) return guideTitle;
        return `First-Timers Guide to ${location}`;
      }
      return truncateWithBrand(title, siteName, MAX_LENGTH);

    case 'seasonal':
      return truncateWithBrand(title, siteName, MAX_LENGTH);

    default:
      return truncateWithBrand(title, siteName, MAX_LENGTH);
  }
}

function truncateWithBrand(title: string, siteName: string, maxLength: number): string {
  const withBrand = `${title} | ${siteName}`;
  if (withBrand.length <= maxLength) {
    return withBrand;
  }

  // Title too long, truncate at word boundary
  const availableLength = maxLength - siteName.length - 3; // " | " = 3 chars
  if (availableLength < 20) {
    // Not enough room for brand, just truncate title
    return truncateAtWord(title, maxLength - 3) + '...';
  }

  return truncateAtWord(title, availableLength) + ` | ${siteName}`;
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const words = text.split(' ');
  let result = '';

  for (const word of words) {
    if ((result + ' ' + word).trim().length <= maxLength) {
      result = (result + ' ' + word).trim();
    } else {
      break;
    }
  }

  return result || text.substring(0, maxLength);
}

function errorResult(
  siteId: string,
  siteName: string,
  contentType: ContentGenerationType,
  error: string
): ContentGenerationResult {
  return {
    siteId,
    siteName,
    contentType,
    generated: false,
    queued: false,
    error,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
