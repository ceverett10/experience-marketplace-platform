#!/usr/bin/env npx tsx
/**
 * Backfill content generation for microsites stuck in GENERATING status.
 *
 * Root cause: Bulk microsite creation on Feb 24-25 (~27.5K microsites) overwhelmed
 * the CONTENT queue daily budget (2,000/day). The addJob() budget check silently
 * dropped ~20K MICROSITE_CONTENT_GENERATE jobs, leaving microsites at GENERATING
 * with zero pages.
 *
 * This script bypasses the budget check by adding jobs directly to the BullMQ
 * CONTENT queue. It batches jobs with delays to avoid overwhelming the workers.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-stuck-microsites.ts [--dry-run] [--limit=N] [--batch=100] [--delay=1000]
 *
 * On Heroku:
 *   heroku run:detached "cd packages/jobs && npx tsx src/scripts/backfill-stuck-microsites.ts" --app holibob-experiences-demand-gen --size=standard-1x
 */

import 'dotenv/config';
import { prisma } from '@experience-marketplace/database';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

interface StuckMicrosite {
  id: string;
  siteName: string;
  entityType: string;
  supplierId: string | null;
  _count: { pages: number };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? '0', 10) : 0;

  const batchArg = args.find((a) => a.startsWith('--batch='));
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1] ?? '100', 10) : 100;

  const delayArg = args.find((a) => a.startsWith('--delay='));
  const delayMs = delayArg ? parseInt(delayArg.split('=')[1] ?? '1000', 10) : 1000;

  return { dryRun, limit, batchSize, delayMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { dryRun, limit, batchSize, delayMs } = parseArgs();

  console.info('=== Backfill Stuck GENERATING Microsites ===');
  console.info(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (limit) console.info(`Limit: ${limit}`);
  console.info(`Batch size: ${batchSize}`);
  console.info(`Delay between batches: ${delayMs}ms`);
  console.info('');

  // Find all microsites stuck in GENERATING with no pages
  const stuckMicrosites: StuckMicrosite[] = await prisma.micrositeConfig.findMany({
    where: {
      status: 'GENERATING',
      pages: { none: {} },
    },
    select: {
      id: true,
      siteName: true,
      entityType: true,
      supplierId: true,
      _count: { select: { pages: true } },
    },
    orderBy: { createdAt: 'asc' },
    ...(limit > 0 ? { take: limit } : {}),
  });

  console.info(`Found ${stuckMicrosites.length} microsites stuck in GENERATING with 0 pages`);

  if (stuckMicrosites.length === 0) {
    console.info('Nothing to do.');
    process.exit(0);
  }

  // Count by entity type
  const byType = new Map<string, number>();
  for (const m of stuckMicrosites) {
    byType.set(m.entityType, (byType.get(m.entityType) ?? 0) + 1);
  }
  console.info('By entity type:', Object.fromEntries(byType));

  if (dryRun) {
    console.info('\nDry run — no jobs will be queued. Showing first 10:');
    for (const m of stuckMicrosites.slice(0, 10)) {
      const contentTypes =
        m.entityType === 'OPPORTUNITY'
          ? ['homepage', 'about', 'experiences', 'blog', 'contact', 'privacy', 'terms', 'faq']
          : ['homepage', 'about', 'experiences'];
      console.info(
        `  ${m.id} | ${m.siteName.substring(0, 40)} | ${m.entityType} | ${contentTypes.length} content types`
      );
    }
    process.exit(0);
  }

  // Connect directly to BullMQ queue, bypassing addJob budget check
  const redisUrl =
    process.env['REDIS_URL'] || process.env['REDIS_TLS_URL'] || 'redis://localhost:6379';
  const usesTls = redisUrl.includes('rediss://');
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: usesTls ? { rejectUnauthorized: false } : undefined,
  });

  const contentQueue = new Queue('content', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 20,
      removeOnFail: 100,
    },
  });

  let queued = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < stuckMicrosites.length; i += batchSize) {
    const batch = stuckMicrosites.slice(i, i + batchSize);

    for (const microsite of batch) {
      try {
        const contentTypes: string[] =
          microsite.entityType === 'OPPORTUNITY'
            ? ['homepage', 'about', 'experiences', 'blog', 'contact', 'privacy', 'terms', 'faq']
            : ['homepage', 'about', 'experiences'];

        // Create DB job record for tracking
        const dbJob = await prisma.job.create({
          data: {
            type: 'MICROSITE_CONTENT_GENERATE',
            queue: 'content',
            payload: {
              micrositeId: microsite.id,
              contentTypes,
            },
            status: 'PENDING',
            priority: 5,
            maxAttempts: 3,
          },
        });

        // Add directly to BullMQ, bypassing budget check
        const bullmqJob = await contentQueue.add(
          'MICROSITE_CONTENT_GENERATE',
          {
            micrositeId: microsite.id,
            contentTypes,
            dbJobId: dbJob.id,
          },
          {
            priority: 10, // Lower priority than regular content (higher number = lower priority)
          }
        );

        // Update DB record with BullMQ job ID
        await prisma.job.update({
          where: { id: dbJob.id },
          data: { idempotencyKey: `content:${bullmqJob.id}` },
        });

        queued++;
      } catch (err) {
        errors++;
        console.error(
          `Error queuing ${microsite.id} (${microsite.siteName}):`,
          err instanceof Error ? err.message : err
        );
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const progress = Math.min(i + batchSize, stuckMicrosites.length);
    console.info(
      `Progress: ${progress}/${stuckMicrosites.length} processed, ${queued} queued, ${errors} errors, ${elapsed}s elapsed`
    );

    // Delay between batches to avoid overwhelming workers
    if (i + batchSize < stuckMicrosites.length) {
      await sleep(delayMs);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(0);
  console.info('\n=== Backfill Complete ===');
  console.info(`Total microsites: ${stuckMicrosites.length}`);
  console.info(`Queued: ${queued}`);
  console.info(`Errors: ${errors}`);
  console.info(`Duration: ${duration}s`);

  await contentQueue.close();
  await connection.quit();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
