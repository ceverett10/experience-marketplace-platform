#!/usr/bin/env npx tsx
/**
 * Re-queue content generation for destination pages missing content.
 *
 * Use after batch-create-destinations.ts if content jobs were blocked by
 * dedup or budget limits.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/requeue-destination-content.ts [options]
 *
 * Options:
 *   --dry-run    Show what would be queued without queueing
 *   --reset-budget  Reset the daily content budget counter in Redis
 */

import IORedis from 'ioredis';
import { prisma, PageType } from '@experience-marketplace/database';
import { addJob } from '../queues/index.js';

const STAGGER_DELAY_MS = 5_000;

interface ScriptOptions {
  dryRun: boolean;
  resetBudget: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    resetBudget: args.includes('--reset-budget'),
  };
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.info('='.repeat(60));
  console.info('Re-queue Destination Content Generation');
  console.info(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.info('='.repeat(60));

  // Reset daily budget if requested
  if (options.resetBudget && !options.dryRun) {
    try {
      const redisUrl = process.env['REDIS_TLS_URL'] || process.env['REDIS_URL'];
      if (redisUrl) {
        const redis = new IORedis(redisUrl, {
          tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
        });
        const today = new Date().toISOString().split('T')[0];
        const budgetKey = `budget:content:${today}`;
        await redis.del(budgetKey);
        console.info(`Reset daily budget key: ${budgetKey}`);

        // Also clear any lingering dedup keys for CONTENT_GENERATE
        const dedupKeys = await redis.keys('dedup:*:CONTENT_GENERATE');
        if (dedupKeys.length > 0) {
          await redis.del(...dedupKeys);
          console.info(`Cleared ${dedupKeys.length} dedup keys`);
        }

        await redis.quit();
      }
    } catch (error) {
      console.error(
        'Failed to reset budget:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Find all destination pages without content
  const pages = await prisma.page.findMany({
    where: {
      type: PageType.LANDING,
      slug: { startsWith: 'destinations/' },
      contentId: null,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      siteId: true,
      site: { select: { name: true, domains: { select: { domain: true }, take: 1 } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.info(`\nFound ${pages.length} destination pages without content\n`);

  if (pages.length === 0) {
    console.info('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  let queued = 0;
  let failed = 0;

  for (const page of pages) {
    const domain = page.site?.domains[0]?.domain ?? 'unknown';
    const location = page.slug.replace('destinations/', '').replace(/-/g, ' ');
    const capitalizedLocation = location
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    if (options.dryRun) {
      console.info(`  QUEUE ${domain}/${page.slug} — "${page.title}"`);
      queued++;
      continue;
    }

    try {
      const delayMs = queued * STAGGER_DELAY_MS;
      await addJob(
        'CONTENT_GENERATE',
        {
          siteId: page.siteId ?? undefined,
          pageId: page.id,
          contentType: 'destination',
          targetKeyword: page.title.toLowerCase(),
          destination: capitalizedLocation,
        },
        delayMs > 0 ? { delay: delayMs } : undefined
      );
      queued++;
      if (queued % 25 === 0) {
        console.info(`  Queued ${queued}/${pages.length}...`);
      }
    } catch (error) {
      failed++;
      console.error(
        `  FAILED ${domain}/${page.slug}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  console.info(`\n${'='.repeat(60)}`);
  console.info(`${options.dryRun ? 'Would queue' : 'Queued'}: ${queued}`);
  if (failed > 0) console.info(`Failed: ${failed}`);
  if (!options.dryRun) {
    const estMinutes = Math.ceil((queued * 45) / 60);
    console.info(`Estimated processing time: ~${estMinutes} minutes`);
  }
  console.info('='.repeat(60));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
