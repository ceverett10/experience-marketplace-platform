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

  // Recency gate: skip if a blog was published within the last 14 days.
  // This caps main sites at ~2 posts/month regardless of daily run frequency.
  const recencyCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentBlog = await prisma.page.findFirst({
    where: {
      siteId,
      type: PageType.BLOG,
      status: 'PUBLISHED' as const,
      updatedAt: { gte: recencyCutoff },
    },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (recentBlog) {
    console.info(
      `[Daily Blog] Skipping ${site.name} — blog published ${Math.floor((Date.now() - recentBlog.updatedAt.getTime()) / (1000 * 60 * 60 * 24))}d ago (< 14d recency gate)`
    );
    return {
      siteId: site.id,
      siteName: site.name,
      topicGenerated: false,
      postQueued: false,
      error: 'Recent blog exists (14-day gate)',
    };
  }

  console.info(`[Daily Blog] Generating post for ${site.name}...`);

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
      console.info(`[Daily Blog] No topic generated for ${site.name}`);
      return {
        siteId: site.id,
        siteName: site.name,
        topicGenerated: false,
        postQueued: false,
        error: 'Failed to generate topic',
      };
    }

    console.info(`[Daily Blog] Generated topic for ${site.name}: ${topic.title}`);

    // Check if slug already exists
    const existingPage = await prisma.page.findFirst({
      where: {
        siteId: site.id,
        slug: `blog/${topic.slug}`,
      },
    });

    if (existingPage) {
      console.info(`[Daily Blog] Skipping existing slug: blog/${topic.slug}`);
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

    console.info(`[Daily Blog] Queued: "${topic.title}"`);

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
 * Generate blog posts for all active main sites, respecting the 14-day recency gate.
 * Each site generates at most 1 post every 14 days.
 */
export async function generateDailyBlogPostsForAllSites(): Promise<DailyBlogGenerationResult[]> {
  console.info('[Daily Blog] Starting blog generation for active main sites...');

  const activeSites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  console.info(`[Daily Blog] Found ${activeSites.length} active main sites`);

  const results: DailyBlogGenerationResult[] = [];

  // Stagger CONTENT_GENERATE jobs by 15s per site to prevent queue flooding.
  // Topic generation + page creation happen inline; the AI-heavy work is delayed.
  const STAGGER_MS = 15_000;

  for (let i = 0; i < activeSites.length; i++) {
    const site = activeSites[i]!;
    const result = await generateDailyBlogPostForSite(site.id, i * STAGGER_MS);
    results.push(result);

    // Small delay to avoid rate limiting on topic generation
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const postsQueued = results.filter((r) => r.postQueued).length;
  const errors = results.filter((r) => r.error).length;

  console.info(
    `[Daily Blog] Main sites complete. Sites: ${results.length}, Posts queued: ${postsQueued}, Errors: ${errors}`
  );

  return results;
}

/**
 * Generate daily blog posts for supplier microsites only.
 * This is the main entry point called by the scheduler (daily at 4 AM UTC).
 *
 * Main sites are excluded — the strategy is to build up microsite SEO authority first.
 * Main sites can still receive blogs via manual generateDailyBlogPostForSite() calls.
 *
 * - Supplier microsites: up to 80 per day, prioritised by oldest lastContentUpdate,
 *   with a 14-day recency gate in generateDailyBlogPostsForMicrosites
 */
export async function generateDailyBlogPostsForAllSitesAndMicrosites(): Promise<{
  sites: DailyBlogGenerationResult[];
  microsites: MicrositeBlogGenerationSummary;
}> {
  console.info('[Daily Blog] Starting daily blog generation (supplier microsites only)...');

  // Main sites excluded — focusing on supplier microsites to build SEO authority
  // at scale before turning attention back to main sites.
  const siteResults: DailyBlogGenerationResult[] = [];

  // Supplier microsites — 80/day hard cap, oldest-first ordering, 14-day recency gate
  const micrositeResults = await generateDailyBlogPostsForMicrosites();

  console.info(
    `[Daily Blog] Complete. ` +
      `Supplier microsites: ${micrositeResults.postsQueued} posts ` +
      `(${micrositeResults.processedCount}/${micrositeResults.totalMicrosites} eligible processed)`
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
