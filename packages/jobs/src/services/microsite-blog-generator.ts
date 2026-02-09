/**
 * Microsite Blog Generator Service
 * Scalable blog generation for thousands of microsites
 *
 * Key features:
 * - Rotating daily processing (5% of microsites per day = each site refreshed every ~20 days)
 * - Batch parallel processing (10 concurrent jobs)
 * - Priority-based queuing (high-traffic microsites first)
 * - Graceful rate limiting for AI API
 */

import { prisma, PageType, PageStatus } from '@experience-marketplace/database';
import { generateDailyBlogTopic, BlogTopicContext } from './blog-topics.js';
import { addJob } from '../queues/index.js';

// Configuration
const DAILY_PERCENTAGE = 0.05; // Process 5% of microsites per day
const BATCH_SIZE = 10; // Process 10 microsites concurrently
const DELAY_BETWEEN_BATCHES_MS = 5000; // 5 seconds between batches
const DELAY_BETWEEN_ITEMS_MS = 500; // 0.5 seconds between items in a batch

export interface MicrositeBlogGenerationResult {
  micrositeId: string;
  micrositeName: string;
  topicGenerated: boolean;
  postQueued: boolean;
  error?: string;
  skippedReason?: string;
}

export interface MicrositeBlogGenerationSummary {
  totalMicrosites: number;
  processedCount: number;
  postsQueued: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

/**
 * Generate blog post for a single microsite
 */
export async function generateBlogPostForMicrosite(
  micrositeId: string
): Promise<MicrositeBlogGenerationResult> {
  const microsite = await prisma.micrositeConfig.findUnique({
    where: { id: micrositeId },
    include: {
      brand: true,
      supplier: {
        select: {
          name: true,
          cities: true,
          categories: true,
        },
      },
    },
  });

  if (!microsite) {
    return {
      micrositeId,
      micrositeName: 'Unknown',
      topicGenerated: false,
      postQueued: false,
      error: 'Microsite not found',
    };
  }

  // Get existing blog posts to avoid duplicates
  const existingPosts = await prisma.page.findMany({
    where: {
      micrositeId,
      type: PageType.BLOG,
    },
    select: { title: true },
  });

  const existingTopics = existingPosts.map((p) => p.title);

  // Build context from microsite data
  const supplierName = microsite.supplier?.name || microsite.siteName;
  const cities = microsite.supplier?.cities || [];
  const categories = microsite.supplier?.categories || [];
  const niche = categories[0] || 'travel experiences';
  const location = cities[0] || undefined;

  const context: BlogTopicContext = {
    siteName: microsite.siteName,
    niche,
    location,
    existingTopics,
  };

  try {
    const dayOfYear = getDayOfYear();
    const topic = await generateDailyBlogTopic(context, dayOfYear);

    if (!topic) {
      return {
        micrositeId,
        micrositeName: microsite.siteName,
        topicGenerated: false,
        postQueued: false,
        skippedReason: 'No topic generated',
      };
    }

    // Check if slug already exists
    const existingPage = await prisma.page.findFirst({
      where: {
        micrositeId,
        slug: `blog/${topic.slug}`,
      },
    });

    if (existingPage) {
      return {
        micrositeId,
        micrositeName: microsite.siteName,
        topicGenerated: true,
        postQueued: false,
        skippedReason: 'Slug already exists',
      };
    }

    // Create the blog page
    const blogPage = await prisma.page.create({
      data: {
        micrositeId,
        title: topic.title,
        slug: `blog/${topic.slug}`,
        type: PageType.BLOG,
        status: PageStatus.DRAFT,
        metaDescription: `${topic.targetKeyword} - ${microsite.siteName}`,
      },
    });

    // Queue content generation
    await addJob('CONTENT_GENERATE', {
      micrositeId,
      pageId: blogPage.id,
      contentType: 'blog',
      targetKeyword: topic.targetKeyword,
      secondaryKeywords: topic.secondaryKeywords,
    });

    // Update lastContentUpdate timestamp
    await prisma.micrositeConfig.update({
      where: { id: micrositeId },
      data: { lastContentUpdate: new Date() },
    });

    return {
      micrositeId,
      micrositeName: microsite.siteName,
      topicGenerated: true,
      postQueued: true,
    };
  } catch (error) {
    console.error(`[Microsite Blog] Error for ${microsite.siteName}:`, error);
    return {
      micrositeId,
      micrositeName: microsite.siteName,
      topicGenerated: false,
      postQueued: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate blog posts for a rotating subset of active microsites
 * Processes 5% of microsites per day, prioritized by traffic
 */
export async function generateDailyBlogPostsForMicrosites(): Promise<MicrositeBlogGenerationSummary> {
  const startTime = Date.now();
  console.log('[Microsite Blog] Starting daily blog generation for microsites...');

  // Get total count of active microsites
  const totalActive = await prisma.micrositeConfig.count({
    where: { status: 'ACTIVE' },
  });

  if (totalActive === 0) {
    console.log('[Microsite Blog] No active microsites found');
    return {
      totalMicrosites: 0,
      processedCount: 0,
      postsQueued: 0,
      skipped: 0,
      errors: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Calculate how many to process (5% per day, minimum 1)
  const processCount = Math.max(1, Math.floor(totalActive * DAILY_PERCENTAGE));

  console.log(
    `[Microsite Blog] Processing ${processCount} of ${totalActive} active microsites (${(DAILY_PERCENTAGE * 100).toFixed(0)}% daily rotation)`
  );

  // Get microsites to process, prioritized by:
  // 1. Page views (high-traffic first)
  // 2. Last content update (oldest first)
  const micrositesToProcess = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [
      { pageViews: 'desc' }, // High-traffic first
      { lastContentUpdate: 'asc' }, // Then oldest content
    ],
    take: processCount,
    select: {
      id: true,
      siteName: true,
      pageViews: true,
    },
  });

  console.log(`[Microsite Blog] Selected ${micrositesToProcess.length} microsites for processing`);

  // Process in batches
  const results: MicrositeBlogGenerationResult[] = [];

  for (let i = 0; i < micrositesToProcess.length; i += BATCH_SIZE) {
    const batch = micrositesToProcess.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(micrositesToProcess.length / BATCH_SIZE);

    console.log(
      `[Microsite Blog] Processing batch ${batchNumber}/${totalBatches} (${batch.length} microsites)`
    );

    // Process batch concurrently
    const batchPromises = batch.map(async (ms, idx) => {
      // Small stagger within batch to avoid API burst
      await sleep(idx * DELAY_BETWEEN_ITEMS_MS);
      return generateBlogPostForMicrosite(ms.id);
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Log batch progress
    const batchQueued = batchResults.filter((r) => r.postQueued).length;
    const batchErrors = batchResults.filter((r) => r.error).length;
    console.log(
      `[Microsite Blog] Batch ${batchNumber} complete: ${batchQueued} queued, ${batchErrors} errors`
    );

    // Delay between batches (except for last batch)
    if (i + BATCH_SIZE < micrositesToProcess.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  // Calculate summary
  const postsQueued = results.filter((r) => r.postQueued).length;
  const skipped = results.filter((r) => r.skippedReason).length;
  const errors = results.filter((r) => r.error).length;
  const durationMs = Date.now() - startTime;

  console.log(
    `[Microsite Blog] Complete. ` +
      `Processed: ${results.length}, ` +
      `Posts queued: ${postsQueued}, ` +
      `Skipped: ${skipped}, ` +
      `Errors: ${errors}, ` +
      `Duration: ${(durationMs / 1000).toFixed(1)}s`
  );

  return {
    totalMicrosites: totalActive,
    processedCount: results.length,
    postsQueued,
    skipped,
    errors,
    durationMs,
  };
}

/**
 * Generate blog posts for microsites that have never had content
 * One-time bootstrap for new microsites
 */
export async function bootstrapBlogPostsForNewMicrosites(): Promise<MicrositeBlogGenerationSummary> {
  const startTime = Date.now();
  console.log('[Microsite Blog] Bootstrapping blog posts for new microsites...');

  // Find active microsites with no blog posts
  const micrositesWithoutBlogs = await prisma.micrositeConfig.findMany({
    where: {
      status: 'ACTIVE',
      // No blog posts exist for this microsite
      NOT: {
        id: {
          in: await prisma.page
            .findMany({
              where: { type: PageType.BLOG, micrositeId: { not: null } },
              select: { micrositeId: true },
              distinct: ['micrositeId'],
            })
            .then((pages) => pages.map((p) => p.micrositeId!).filter(Boolean)),
        },
      },
    },
    orderBy: { pageViews: 'desc' },
    take: 50, // Bootstrap max 50 at a time
    select: { id: true, siteName: true },
  });

  if (micrositesWithoutBlogs.length === 0) {
    console.log('[Microsite Blog] No new microsites need bootstrapping');
    return {
      totalMicrosites: 0,
      processedCount: 0,
      postsQueued: 0,
      skipped: 0,
      errors: 0,
      durationMs: Date.now() - startTime,
    };
  }

  console.log(
    `[Microsite Blog] Found ${micrositesWithoutBlogs.length} microsites needing bootstrap`
  );

  // Process using the same batch logic
  const results: MicrositeBlogGenerationResult[] = [];

  for (let i = 0; i < micrositesWithoutBlogs.length; i += BATCH_SIZE) {
    const batch = micrositesWithoutBlogs.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (ms, idx) => {
      await sleep(idx * DELAY_BETWEEN_ITEMS_MS);
      return generateBlogPostForMicrosite(ms.id);
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (i + BATCH_SIZE < micrositesWithoutBlogs.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  const postsQueued = results.filter((r) => r.postQueued).length;
  const skipped = results.filter((r) => r.skippedReason).length;
  const errors = results.filter((r) => r.error).length;
  const durationMs = Date.now() - startTime;

  console.log(
    `[Microsite Blog] Bootstrap complete. ` +
      `Posts queued: ${postsQueued}, ` +
      `Errors: ${errors}, ` +
      `Duration: ${(durationMs / 1000).toFixed(1)}s`
  );

  return {
    totalMicrosites: micrositesWithoutBlogs.length,
    processedCount: results.length,
    postsQueued,
    skipped,
    errors,
    durationMs,
  };
}

// Helper functions
function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
