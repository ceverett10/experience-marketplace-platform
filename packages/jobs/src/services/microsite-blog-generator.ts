/**
 * Microsite Blog Generator Service
 * Scalable blog generation for SUPPLIER microsites only
 *
 * Key features:
 * - SUPPLIER entity type filtering — only supplier microsites get blogs
 * - Rotating daily processing (5% per day = each supplier refreshed every ~20 days)
 * - Batch parallel processing (10 concurrent jobs)
 * - Priority-based queuing (high-traffic microsites first)
 * - Graceful rate limiting for AI API
 *
 * PRODUCT and OPPORTUNITY microsites are excluded because:
 * - PRODUCT microsites are single-product pages with insufficient context for varied blog topics
 * - OPPORTUNITY microsites are SEO-driven and get content via the daily-content-generator instead
 */

import {
  prisma,
  PageType,
  PageStatus,
  MicrositeEntityType,
} from '@experience-marketplace/database';
import { generateDailyBlogTopic, type BlogTopicContext } from './blog-topics.js';
import { addJob } from '../queues/index.js';

// Only generate blogs for supplier microsites — they have rich product context
const SUPPLIER_ENTITY_TYPE = MicrositeEntityType.SUPPLIER;

// Configuration
// With ~39K supplier microsites, percentage-based rotation produces too many
// items per day. Use a hard cap instead to keep within 1GB Heroku memory.
const DAILY_PERCENTAGE = 0.002; // 0.2% = ~78 microsites/day from 39K pool
const MAX_DAILY_MICROSITES = 80; // Hard cap regardless of pool size
const BATCH_SIZE = 5; // Process 5 microsites concurrently (memory-safe for 1GB dyno)
const DELAY_BETWEEN_BATCHES_MS = 5000; // 5 seconds between batches
const DELAY_BETWEEN_ITEMS_MS = 500; // 0.5 seconds between items in a batch

// Only process microsites that haven't had a blog post in at least this many days.
// Prioritizes stale microsites and prevents re-processing recently-updated ones.
const RECENCY_GATE_DAYS = 14;

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
          id: true,
          name: true,
          description: true,
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

  // Supplier microsites without a linked supplier can't produce relevant content
  if (!microsite.supplier?.id) {
    return {
      micrositeId,
      micrositeName: microsite.siteName,
      topicGenerated: false,
      postQueued: false,
      skippedReason: 'No linked supplier',
    };
  }

  // Fetch supplier's top experiences for topic relevance
  const topProducts = await prisma.product.findMany({
    where: { supplierId: microsite.supplier.id },
    select: { title: true, shortDescription: true, city: true, categories: true },
    orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
    take: 15,
  });

  // Skip suppliers with no products — blogs would be generic and irrelevant
  if (topProducts.length === 0) {
    return {
      micrositeId,
      micrositeName: microsite.siteName,
      topicGenerated: false,
      postQueued: false,
      skippedReason: 'Supplier has no products',
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

  // Build context from supplier data — use product-derived info for accuracy
  const cities = microsite.supplier.cities || [];
  const categories = microsite.supplier.categories || [];

  // Derive niche from actual product categories, not just supplier metadata
  const productCategories = topProducts
    .flatMap((p) => (p.categories as string[]) || [])
    .filter(Boolean);
  const uniqueProductCategories = [...new Set(productCategories)];
  const niche = uniqueProductCategories[0] || (categories as string[])[0] || 'travel experiences';

  // Derive location from actual product cities for accuracy
  const productCities = topProducts.map((p) => p.city).filter(Boolean) as string[];
  const uniqueProductCities = [...new Set(productCities)];
  const location = uniqueProductCities[0] || (cities as string[])[0] || undefined;

  const context: BlogTopicContext = {
    siteName: microsite.siteName,
    niche,
    location,
    existingTopics,
    supplierDescription: microsite.supplier.description || undefined,
    allCities:
      uniqueProductCities.length > 0
        ? uniqueProductCities
        : (cities as string[]).length > 0
          ? (cities as string[])
          : undefined,
    allCategories:
      uniqueProductCategories.length > 0
        ? uniqueProductCategories
        : (categories as string[]).length > 0
          ? (categories as string[])
          : undefined,
    topExperiences: topProducts.map((p) => ({
      title: p.title,
      description: p.shortDescription || undefined,
      city: p.city || undefined,
      categories: (p.categories as string[]) || undefined,
    })),
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

    // Queue content generation — shorter posts for microsites (400-600 words) to
    // reduce cost and generation time while still providing SEO value
    await addJob('CONTENT_GENERATE', {
      micrositeId,
      pageId: blogPage.id,
      contentType: 'blog',
      targetKeyword: topic.targetKeyword,
      secondaryKeywords: topic.secondaryKeywords,
      targetLength: { min: 400, max: 600 },
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
 * Generate blog posts for a rotating subset of active supplier microsites
 * Processes 5% of supplier microsites per day, prioritized by traffic
 */
export async function generateDailyBlogPostsForMicrosites(): Promise<MicrositeBlogGenerationSummary> {
  const startTime = Date.now();
  console.info('[Microsite Blog] Starting daily blog generation for supplier microsites...');

  // Recency gate: only process microsites that haven't been updated in 14+ days.
  // This ensures the daily cap (80) is spent on stale microsites rather than
  // re-processing recently-updated ones while others have never been touched.
  const recencyCutoff = new Date(Date.now() - RECENCY_GATE_DAYS * 24 * 60 * 60 * 1000);
  const supplierFilter = {
    status: 'ACTIVE' as const,
    entityType: SUPPLIER_ENTITY_TYPE,
    OR: [{ lastContentUpdate: null }, { lastContentUpdate: { lt: recencyCutoff } }],
  };

  // Get total count of active supplier microsites
  const totalActive = await prisma.micrositeConfig.count({
    where: supplierFilter,
  });

  if (totalActive === 0) {
    console.info('[Microsite Blog] No active supplier microsites found');
    return {
      totalMicrosites: 0,
      processedCount: 0,
      postsQueued: 0,
      skipped: 0,
      errors: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Calculate how many to process, with hard cap to prevent OOM on 1GB dynos
  const processCount = Math.min(
    MAX_DAILY_MICROSITES,
    Math.max(1, Math.floor(totalActive * DAILY_PERCENTAGE))
  );

  console.info(
    `[Microsite Blog] Processing ${processCount} of ${totalActive} active supplier microsites (${(DAILY_PERCENTAGE * 100).toFixed(0)}% daily rotation)`
  );

  // Get supplier microsites to process, prioritized by:
  // 1. Page views (high-traffic first)
  // 2. Last content update (oldest first)
  const micrositesToProcess = await prisma.micrositeConfig.findMany({
    where: supplierFilter,
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

  console.info(
    `[Microsite Blog] Selected ${micrositesToProcess.length} supplier microsites for processing`
  );

  // Process in batches
  const results: MicrositeBlogGenerationResult[] = [];

  for (let i = 0; i < micrositesToProcess.length; i += BATCH_SIZE) {
    const batch = micrositesToProcess.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(micrositesToProcess.length / BATCH_SIZE);

    console.info(
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
    console.info(
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

  console.info(
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
 * Generate blog posts for supplier microsites that have never had content
 * One-time bootstrap for new supplier microsites
 */
export async function bootstrapBlogPostsForNewMicrosites(): Promise<MicrositeBlogGenerationSummary> {
  const startTime = Date.now();
  console.info('[Microsite Blog] Bootstrapping blog posts for new supplier microsites...');

  // Find active supplier microsites with no blog posts
  const micrositesWithoutBlogs = await prisma.micrositeConfig.findMany({
    where: {
      status: 'ACTIVE',
      entityType: SUPPLIER_ENTITY_TYPE,
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
    console.info('[Microsite Blog] No new supplier microsites need bootstrapping');
    return {
      totalMicrosites: 0,
      processedCount: 0,
      postsQueued: 0,
      skipped: 0,
      errors: 0,
      durationMs: Date.now() - startTime,
    };
  }

  console.info(
    `[Microsite Blog] Found ${micrositesWithoutBlogs.length} supplier microsites needing bootstrap`
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

  console.info(
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
