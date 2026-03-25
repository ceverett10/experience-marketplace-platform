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
const MAX_DAILY_MICROSITES = 500; // Hard cap regardless of pool size
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
 * Queue a blog post content job for a single microsite.
 *
 * The page record is NOT created here — it is created atomically by the
 * CONTENT_GENERATE worker once content has been successfully generated and
 * passes quality checks. This prevents orphaned DRAFT stubs when content
 * generation fails.
 *
 * @param micrositeId - Microsite to generate blog for
 * @param staggerDelayMs - Optional BullMQ delay to spread jobs across the day
 */
export async function generateBlogPostForMicrosite(
  micrositeId: string,
  staggerDelayMs?: number
): Promise<MicrositeBlogGenerationResult> {
  const microsite = await prisma.micrositeConfig.findUnique({
    where: { id: micrositeId },
    include: {
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

  // Get existing published blog titles to avoid topic duplication
  const existingPosts = await prisma.page.findMany({
    where: { micrositeId, type: PageType.BLOG, status: 'PUBLISHED' },
    select: { title: true },
  });
  const existingTopics = existingPosts.map((p) => p.title);

  // Build topic context from supplier/product data
  const cities = microsite.supplier.cities || [];
  const categories = microsite.supplier.categories || [];
  const productCategories = topProducts
    .flatMap((p) => (p.categories as string[]) || [])
    .filter(Boolean);
  const uniqueProductCategories = [...new Set(productCategories)];
  const niche = uniqueProductCategories[0] || (categories as string[])[0] || 'travel experiences';
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
    const topic = await generateDailyBlogTopic(context, getDayOfYear());

    if (!topic) {
      return {
        micrositeId,
        micrositeName: microsite.siteName,
        topicGenerated: false,
        postQueued: false,
        skippedReason: 'No topic generated',
      };
    }

    // Queue content generation — no pageId, the worker creates the page atomically
    // on success. Stagger delay spreads jobs across the day.
    await addJob(
      'CONTENT_GENERATE',
      {
        micrositeId,
        contentType: 'blog',
        targetKeyword: topic.targetKeyword,
        secondaryKeywords: topic.secondaryKeywords,
        targetLength: { min: 400, max: 600 },
      },
      staggerDelayMs ? { delay: staggerDelayMs } : undefined
    );

    // Mark microsite as processed so the recency gate skips it for 14 days
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

    // Process batch concurrently — stagger CONTENT_GENERATE jobs by 30s each
    // so 200 jobs spread across ~100 minutes rather than all landing at 4 AM.
    const batchPromises = batch.map(async (ms, idx) => {
      // Small in-batch stagger for topic generation API calls
      await sleep(idx * DELAY_BETWEEN_ITEMS_MS);
      const globalIdx = i + idx;
      return generateBlogPostForMicrosite(ms.id, globalIdx * 30_000);
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
