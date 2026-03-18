/**
 * Daily Blog Generator Service
 * Generates blog posts for supplier microsites to build SEO authority
 * Runs on a schedule and can also be triggered manually
 *
 * Blog generation is focused on SUPPLIER microsites only — main sites and
 * opportunity/product microsites are excluded. This ensures AI-generated content
 * is tightly relevant to each supplier's actual product inventory.
 *
 * Uses the scalable microsite-blog-generator service which implements
 * rotating daily processing and batch parallelization.
 */

import { prisma, PageType, PageStatus } from '@experience-marketplace/database';
import { generateDailyBlogTopic, type BlogTopicContext } from './blog-topics.js';
import { addJob } from '../queues/index.js';
import {
  generateDailyBlogPostsForMicrosites,
  type MicrositeBlogGenerationSummary,
} from './microsite-blog-generator.js';

export interface DailyBlogGenerationResult {
  siteId: string;
  siteName: string;
  topicGenerated: boolean;
  postQueued: boolean;
  error?: string;
}

/**
 * Generate daily blog post for a single site
 * @param siteId - Site to generate blog for
 * @param staggerDelayMs - Optional BullMQ delay to stagger content generation
 */
export async function generateDailyBlogPostForSite(
  siteId: string,
  staggerDelayMs?: number
): Promise<DailyBlogGenerationResult> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      brand: true,
      pages: {
        where: { type: PageType.BLOG },
        select: { title: true },
      },
      opportunities: {
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!site) {
    return {
      siteId,
      siteName: 'Unknown',
      topicGenerated: false,
      postQueued: false,
      error: 'Site not found',
    };
  }

  console.log(`[Daily Blog] Generating post for ${site.name}...`);

  try {
    // Build context from site data
    const existingTopics = site.pages.map((p) => p.title);
    const dayOfYear = getDayOfYear();

    // Get niche and location from opportunity or seoConfig
    const opportunity = site.opportunities?.[0];
    const seoConfig = site.seoConfig as { primaryKeywords?: string[]; destination?: string } | null;
    const niche = opportunity?.niche || seoConfig?.primaryKeywords?.[0] || 'travel experiences';
    const location = opportunity?.location || seoConfig?.destination || undefined;

    const context: BlogTopicContext = {
      siteName: site.name,
      niche,
      location,
      existingTopics,
    };

    // Generate 1 topic for today
    const topic = await generateDailyBlogTopic(context, dayOfYear);

    if (!topic) {
      console.log(`[Daily Blog] No topic generated for ${site.name}`);
      return {
        siteId: site.id,
        siteName: site.name,
        topicGenerated: false,
        postQueued: false,
        error: 'Failed to generate topic',
      };
    }

    console.log(`[Daily Blog] Generated topic for ${site.name}: ${topic.title}`);

    // Check if slug already exists
    const existingPage = await prisma.page.findFirst({
      where: {
        siteId: site.id,
        slug: `blog/${topic.slug}`,
      },
    });

    if (existingPage) {
      console.log(`[Daily Blog] Skipping existing slug: blog/${topic.slug}`);
      return {
        siteId: site.id,
        siteName: site.name,
        topicGenerated: true,
        postQueued: false,
        error: 'Slug already exists',
      };
    }

    const blogPage = await prisma.page.create({
      data: {
        siteId: site.id,
        title: topic.title,
        slug: `blog/${topic.slug}`,
        type: PageType.BLOG,
        status: PageStatus.DRAFT,
        metaDescription: `${topic.targetKeyword} - ${site.name}`,
      },
    });

    // Queue content generation (with optional stagger delay to prevent queue flooding)
    await addJob(
      'CONTENT_GENERATE',
      {
        siteId: site.id,
        pageId: blogPage.id,
        contentType: 'blog',
        targetKeyword: topic.targetKeyword,
        secondaryKeywords: topic.secondaryKeywords,
      },
      staggerDelayMs ? { delay: staggerDelayMs } : undefined
    );

    console.log(`[Daily Blog] Queued: "${topic.title}"`);

    return {
      siteId: site.id,
      siteName: site.name,
      topicGenerated: true,
      postQueued: true,
    };
  } catch (error) {
    console.error(`[Daily Blog] Error generating post for ${site.name}:`, error);
    return {
      siteId: site.id,
      siteName: site.name,
      topicGenerated: false,
      postQueued: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate daily blog posts for all active sites (traditional sites only)
 * For microsites, use generateDailyBlogPostsForMicrosites() instead
 * Called by the scheduler
 */
export async function generateDailyBlogPostsForAllSites(): Promise<DailyBlogGenerationResult[]> {
  console.log('[Daily Blog] Starting daily blog generation for all active sites...');

  // Find all active sites (traditional sites, not microsites)
  const activeSites = await prisma.site.findMany({
    where: {
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
    },
  });

  console.log(`[Daily Blog] Found ${activeSites.length} active traditional sites`);

  const results: DailyBlogGenerationResult[] = [];

  // Stagger content generation jobs by 15s per site to prevent queue flooding.
  // Topic generation + page creation happen inline; the AI-heavy CONTENT_GENERATE
  // job is delayed in BullMQ so they don't all start at once.
  const STAGGER_MS = 15_000;

  // Process sites sequentially to avoid overwhelming the AI API
  for (let i = 0; i < activeSites.length; i++) {
    const site = activeSites[i]!;
    const result = await generateDailyBlogPostForSite(site.id, i * STAGGER_MS);
    results.push(result);

    // Small delay between sites to avoid rate limiting on topic generation
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Log summary for traditional sites
  const postsQueued = results.filter((r) => r.postQueued).length;
  const errors = results.filter((r) => r.error).length;

  console.log(
    `[Daily Blog] Traditional sites complete. Sites: ${results.length}, Posts queued: ${postsQueued}, Errors: ${errors}`
  );

  return results;
}

/**
 * Generate daily blog posts for supplier microsites only
 * This is the main entry point for the scheduler
 *
 * Main sites are excluded — blog generation is focused on supplier microsites
 * where product context enables tightly relevant content.
 *
 * Supplier microsites: Process a rotating % per day, batched for scalability
 */
export async function generateDailyBlogPostsForAllSitesAndMicrosites(): Promise<{
  sites: DailyBlogGenerationResult[];
  microsites: MicrositeBlogGenerationSummary;
}> {
  console.info('[Daily Blog] Starting daily blog generation (supplier microsites only)...');

  // Skip traditional sites — blog content is now focused on supplier microsites
  // where we have rich product context for relevant topic generation.
  // Main sites can still get blogs via manual generateDailyBlogPostForSite() calls.
  const siteResults: DailyBlogGenerationResult[] = [];

  // Process supplier microsites with scalable rotating/batching
  const micrositeResults = await generateDailyBlogPostsForMicrosites();

  console.info(
    `[Daily Blog] Complete. ` +
      `Supplier microsites: ${micrositeResults.postsQueued} posts ` +
      `(${micrositeResults.processedCount}/${micrositeResults.totalMicrosites} processed)`
  );

  return {
    sites: siteResults,
    microsites: micrositeResults,
  };
}

// Re-export microsite functions for direct access
export { generateDailyBlogPostsForMicrosites } from './microsite-blog-generator.js';

/**
 * Get the current day number of the year (1-366)
 */
function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}
