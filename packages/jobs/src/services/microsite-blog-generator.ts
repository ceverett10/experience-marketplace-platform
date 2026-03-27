/**
 * Microsite Blog Generator Service
 * Scalable blog generation for SUPPLIER microsites only
 *
 * Key features:
 * - SUPPLIER entity type filtering — only supplier microsites get blogs
 * - Fixed daily target of 500/day (each supplier refreshed every ~68 days from a 34K pool)
 * - Batch parallel processing with stagger delays
 * - Priority-based queuing (high-traffic microsites first)
 *
 * PRODUCT and OPPORTUNITY microsites are excluded because:
 * - PRODUCT microsites are single-product pages with insufficient context for varied blog topics
 * - OPPORTUNITY microsites are SEO-driven and get content via the daily-content-generator instead
 *
 * Architecture note: this fanout is intentionally DUMB and FAST — it only queries the DB and
 * enqueues jobs. Topic generation and content AI calls happen inside each CONTENT_GENERATE job
 * on the worker, where they get independent retry logic and don't block the fanout.
 */

import { prisma, MicrositeEntityType } from '@experience-marketplace/database';
import { addJob } from '../queues/index.js';

// Only generate blogs for supplier microsites — they have rich product context
const SUPPLIER_ENTITY_TYPE = MicrositeEntityType.SUPPLIER;

// Configuration
// Target 500 supplier microsites per day. With ~34K in the pool, each supplier
// gets refreshed roughly every 68 days. Increase MAX_DAILY_MICROSITES to scale up
// if Heroku memory allows (monitor worker-fast dyno on deploy before raising further).
const MAX_DAILY_MICROSITES = 500;
const BATCH_SIZE = 10; // Process 10 microsites concurrently (addJob is fast, no AI calls)
const DELAY_BETWEEN_BATCHES_MS = 500; // 0.5 seconds between batches (no API calls, can be fast)
const STAGGER_DELAY_PER_JOB_MS = 30_000; // 30s BullMQ delay per job so content is spread across day
const ADD_JOB_TIMEOUT_MS = 8_000; // Abort addJob after 8s to prevent Redis hang blocking fanout

// Only process microsites that haven't had a blog post published in at least this many days.
const RECENCY_GATE_DAYS = 14;

export interface MicrositeBlogGenerationResult {
  micrositeId: string;
  micrositeName: string;
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
 * Queue a CONTENT_GENERATE blog job for a single supplier microsite.
 *
 * Intentionally lightweight: only verifies the microsite has a linked supplier,
 * then enqueues. Topic generation happens inside the CONTENT_GENERATE worker so
 * that each microsite's AI call is independently retryable.
 *
 * @param micrositeId - Microsite to generate blog for
 * @param staggerDelayMs - BullMQ delay to spread jobs across the day
 */
export async function generateBlogPostForMicrosite(
  micrositeId: string,
  staggerDelayMs?: number
): Promise<MicrositeBlogGenerationResult> {
  const microsite = await prisma.micrositeConfig.findUnique({
    where: { id: micrositeId },
    select: { id: true, siteName: true, supplierId: true },
  });

  if (!microsite) {
    return {
      micrositeId,
      micrositeName: 'Unknown',
      postQueued: false,
      error: 'Microsite not found',
    };
  }

  // Supplier microsites without a linked supplier can't produce relevant content
  if (!microsite.supplierId) {
    return {
      micrositeId,
      micrositeName: microsite.siteName,
      postQueued: false,
      skippedReason: 'No linked supplier',
    };
  }

  try {
    // Wrap addJob in a timeout to prevent Redis connection hang from blocking the fanout
    await Promise.race([
      addJob(
        'CONTENT_GENERATE',
        { micrositeId, contentType: 'blog' },
        staggerDelayMs ? { delay: staggerDelayMs } : undefined
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('addJob timed out after 8s')), ADD_JOB_TIMEOUT_MS)
      ),
    ]);

    return { micrositeId, micrositeName: microsite.siteName, postQueued: true };
  } catch (error) {
    console.error(`[Microsite Blog] Failed to queue job for ${microsite.siteName}:`, error);
    return {
      micrositeId,
      micrositeName: microsite.siteName,
      postQueued: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate blog posts for a rotating subset of active supplier microsites.
 * Processes 0.2% of supplier microsites per day (capped at 500), prioritised by traffic.
 */
export async function generateDailyBlogPostsForMicrosites(): Promise<MicrositeBlogGenerationSummary> {
  const startTime = Date.now();
  console.info('[Microsite Blog] Starting daily blog generation for supplier microsites...');

  // Recency gate: skip microsites whose last blog was published within 14 days
  const recencyCutoff = new Date(Date.now() - RECENCY_GATE_DAYS * 24 * 60 * 60 * 1000);
  const supplierFilter = {
    status: 'ACTIVE' as const,
    entityType: SUPPLIER_ENTITY_TYPE,
    supplierId: { not: null as unknown as string },
    OR: [{ lastContentUpdate: null }, { lastContentUpdate: { lt: recencyCutoff } }],
  };

  const totalActive = await prisma.micrositeConfig.count({ where: supplierFilter });

  if (totalActive === 0) {
    console.info('[Microsite Blog] No eligible supplier microsites found');
    return {
      totalMicrosites: 0,
      processedCount: 0,
      postsQueued: 0,
      skipped: 0,
      errors: 0,
      durationMs: Date.now() - startTime,
    };
  }

  const processCount = Math.min(MAX_DAILY_MICROSITES, totalActive);

  console.info(
    `[Microsite Blog] Queuing ${processCount} of ${totalActive} eligible supplier microsites`
  );

  const micrositesToProcess = await prisma.micrositeConfig.findMany({
    where: supplierFilter,
    orderBy: [
      { pageViews: 'desc' }, // High-traffic first
      { lastContentUpdate: 'asc' }, // Then oldest content
    ],
    take: processCount,
    select: { id: true, siteName: true },
  });

  const results: MicrositeBlogGenerationResult[] = [];

  for (let i = 0; i < micrositesToProcess.length; i += BATCH_SIZE) {
    const batch = micrositesToProcess.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(micrositesToProcess.length / BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map((ms, idx) => {
        const globalIdx = i + idx;
        return generateBlogPostForMicrosite(ms.id, globalIdx * STAGGER_DELAY_PER_JOB_MS);
      })
    );
    results.push(...batchResults);

    const batchQueued = batchResults.filter((r) => r.postQueued).length;
    const batchErrors = batchResults.filter((r) => r.error).length;
    console.info(
      `[Microsite Blog] Batch ${batchNumber}/${totalBatches}: ${batchQueued} queued, ${batchErrors} errors`
    );

    if (i + BATCH_SIZE < micrositesToProcess.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  const summary: MicrositeBlogGenerationSummary = {
    totalMicrosites: totalActive,
    processedCount: results.length,
    postsQueued: results.filter((r) => r.postQueued).length,
    skipped: results.filter((r) => r.skippedReason).length,
    errors: results.filter((r) => r.error).length,
    durationMs: Date.now() - startTime,
  };

  console.info(
    `[Microsite Blog] Complete: ${summary.postsQueued} queued, ${summary.skipped} skipped, ` +
      `${summary.errors} errors in ${(summary.durationMs / 1000).toFixed(1)}s`
  );

  return summary;
}
