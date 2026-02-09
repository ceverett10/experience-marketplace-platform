/**
 * Daily Blog Generator Service
 * Generates 1 blog post per day for active sites to build SEO authority
 * Runs on a schedule and can also be triggered manually
 *
 * For microsites, uses the scalable microsite-blog-generator service
 * which implements rotating daily processing (5% per day) and batch parallelization
 */

import { prisma, PageType, PageStatus } from '@experience-marketplace/database';
import { generateDailyBlogTopic, BlogTopicContext } from './blog-topics.js';
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
 */
export async function generateDailyBlogPostForSite(
  siteId: string
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

    // Queue content generation
    await addJob('CONTENT_GENERATE', {
      siteId: site.id,
      pageId: blogPage.id,
      contentType: 'blog',
      targetKeyword: topic.targetKeyword,
      secondaryKeywords: topic.secondaryKeywords,
    });

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

  // Process sites sequentially to avoid overwhelming the AI API
  for (const site of activeSites) {
    const result = await generateDailyBlogPostForSite(site.id);
    results.push(result);

    // Small delay between sites to avoid rate limiting
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
 * Generate daily blog posts for both traditional sites AND microsites
 * This is the main entry point for the scheduler
 *
 * Traditional sites: Process all daily
 * Microsites: Process 5% per day (rotating), batched for scalability
 */
export async function generateDailyBlogPostsForAllSitesAndMicrosites(): Promise<{
  sites: DailyBlogGenerationResult[];
  microsites: MicrositeBlogGenerationSummary;
}> {
  console.log('[Daily Blog] Starting daily blog generation for all sites and microsites...');

  // Process traditional sites first
  const siteResults = await generateDailyBlogPostsForAllSites();

  // Then process microsites with scalable rotating/batching
  const micrositeResults = await generateDailyBlogPostsForMicrosites();

  // Log combined summary
  const totalQueued = siteResults.filter((r) => r.postQueued).length + micrositeResults.postsQueued;
  console.log(
    `[Daily Blog] All complete. ` +
    `Traditional sites: ${siteResults.filter((r) => r.postQueued).length} posts, ` +
    `Microsites: ${micrositeResults.postsQueued} posts (${micrositeResults.processedCount}/${micrositeResults.totalMicrosites} processed), ` +
    `Total: ${totalQueued} posts queued`
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
