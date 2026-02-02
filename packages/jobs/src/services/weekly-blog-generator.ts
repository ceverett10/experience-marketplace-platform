/**
 * Weekly Blog Generator Service
 * Generates blog posts for active sites to build SEO authority
 * Runs on a schedule and can also be triggered manually
 */

import { prisma, PageType, PageStatus } from '@experience-marketplace/database';
import { generateWeeklyBlogTopics, BlogTopicContext } from './blog-topics.js';
import { addJob } from '../queues/index.js';

export interface WeeklyBlogGenerationResult {
  siteId: string;
  siteName: string;
  topicsGenerated: number;
  postsQueued: number;
  error?: string;
}

/**
 * Generate weekly blog posts for a single site
 */
export async function generateWeeklyBlogPostsForSite(
  siteId: string
): Promise<WeeklyBlogGenerationResult> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      brand: true,
      seoConfig: true,
      pages: {
        where: { type: PageType.BLOG },
        select: { title: true },
      },
      opportunity: true,
    },
  });

  if (!site) {
    return {
      siteId,
      siteName: 'Unknown',
      topicsGenerated: 0,
      postsQueued: 0,
      error: 'Site not found',
    };
  }

  console.log(`[Weekly Blog] Generating posts for ${site.name}...`);

  try {
    // Build context from site data
    const existingTopics = site.pages.map((p) => p.title);
    const weekNumber = getWeekNumber();

    // Get niche and location from opportunity or seoConfig
    const niche = site.opportunity?.niche ||
      (site.seoConfig?.primaryKeywords as string[] | undefined)?.[0] ||
      'travel experiences';
    const location = site.opportunity?.location ||
      (site.seoConfig as { destination?: string } | null)?.destination ||
      undefined;

    const context: BlogTopicContext = {
      siteName: site.name,
      niche,
      location,
      existingTopics,
    };

    // Generate weekly topics (3-4 posts per week)
    const topics = await generateWeeklyBlogTopics(context, weekNumber);

    console.log(`[Weekly Blog] Generated ${topics.length} topics for ${site.name}`);

    // Create blog pages and queue content generation
    let postsQueued = 0;
    for (const topic of topics) {
      try {
        // Check if slug already exists
        const existingPage = await prisma.page.findFirst({
          where: {
            siteId: site.id,
            slug: `blog/${topic.slug}`,
          },
        });

        if (existingPage) {
          console.log(`[Weekly Blog] Skipping existing slug: blog/${topic.slug}`);
          continue;
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

        postsQueued++;
        console.log(`[Weekly Blog] Queued: "${topic.title}"`);
      } catch (pageError) {
        console.error(`[Weekly Blog] Failed to create page for topic "${topic.title}":`, pageError);
      }
    }

    return {
      siteId: site.id,
      siteName: site.name,
      topicsGenerated: topics.length,
      postsQueued,
    };
  } catch (error) {
    console.error(`[Weekly Blog] Error generating posts for ${site.name}:`, error);
    return {
      siteId: site.id,
      siteName: site.name,
      topicsGenerated: 0,
      postsQueued: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate weekly blog posts for all active sites
 * Called by the scheduler
 */
export async function generateWeeklyBlogPostsForAllSites(): Promise<WeeklyBlogGenerationResult[]> {
  console.log('[Weekly Blog] Starting weekly blog generation for all active sites...');

  // Find all active sites
  const activeSites = await prisma.site.findMany({
    where: {
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
    },
  });

  console.log(`[Weekly Blog] Found ${activeSites.length} active sites`);

  const results: WeeklyBlogGenerationResult[] = [];

  // Process sites sequentially to avoid overwhelming the AI API
  for (const site of activeSites) {
    const result = await generateWeeklyBlogPostsForSite(site.id);
    results.push(result);

    // Small delay between sites to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Log summary
  const totalTopics = results.reduce((sum, r) => sum + r.topicsGenerated, 0);
  const totalPosts = results.reduce((sum, r) => sum + r.postsQueued, 0);
  const errors = results.filter((r) => r.error).length;

  console.log(`[Weekly Blog] Completed. Sites: ${results.length}, Topics: ${totalTopics}, Posts queued: ${totalPosts}, Errors: ${errors}`);

  return results;
}

/**
 * Get the current week number of the year
 */
function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.ceil(diff / oneWeek);
}
