#!/usr/bin/env npx ts-node
/**
 * Regenerate Unpublished Content
 *
 * Queues CONTENT_GENERATE jobs for all DRAFT pages that previously had content
 * (unpublished by the quality audit). Uses the content pipeline with Sonnet
 * to produce fresh, higher-quality content.
 *
 * For microsites: queues MICROSITE_CONTENT_GENERATE with isRefresh: true
 * For main sites: queues CONTENT_GENERATE directly
 *
 * Usage:
 *   npx ts-node scripts/regenerate-unpublished-content.ts                  # Dry run
 *   npx ts-node scripts/regenerate-unpublished-content.ts --queue          # Queue jobs
 *   npx ts-node scripts/regenerate-unpublished-content.ts --queue --type=BLOG
 *   npx ts-node scripts/regenerate-unpublished-content.ts --queue --limit=50
 *
 * Requires: DATABASE_URL, REDIS_URL (for job queue)
 */

import { PrismaClient, PageType, PageStatus } from '@prisma/client';
import Redis from 'ioredis';
import { Queue } from 'bullmq';

const prisma = new PrismaClient();
const STAGGER_MS = 15_000; // 15s between jobs to avoid queue flooding

async function main() {
  const args = process.argv.slice(2);
  const shouldQueue = args.includes('--queue');
  const typeArg = args
    .find((a) => a.startsWith('--type='))
    ?.split('=')[1]
    ?.toUpperCase();
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '9999', 10) : 9999;

  console.info('='.repeat(70));
  console.info(shouldQueue ? 'REGENERATE CONTENT — QUEUING JOBS' : 'REGENERATE CONTENT — DRY RUN');
  console.info('='.repeat(70));

  // Find all DRAFT pages with noIndex=true and contentId (these were unpublished by audit)
  const typeFilter = typeArg
    ? { type: typeArg as any }
    : {
        type: { in: [PageType.BLOG, PageType.FAQ, PageType.LEGAL, PageType.CONTACT] },
      };

  const pages = await prisma.page.findMany({
    where: {
      status: PageStatus.DRAFT,
      noIndex: true,
      contentId: { not: null },
      ...typeFilter,
    },
    include: {
      site: { select: { id: true, name: true } },
      microsite: { select: { id: true, siteName: true, supplierId: true } },
    },
    take: limit,
    orderBy: { type: 'asc' },
  });

  // Group by type
  const byType: Record<string, typeof pages> = {};
  for (const page of pages) {
    const type = page.type;
    if (!byType[type]) byType[type] = [];
    byType[type]!.push(page);
  }

  console.info(`\nFound ${pages.length} pages to regenerate:\n`);
  for (const [type, typePages] of Object.entries(byType)) {
    const mainCount = typePages.filter((p) => p.siteId && !p.micrositeId).length;
    const msCount = typePages.filter((p) => p.micrositeId).length;
    console.info(
      `  ${type.padEnd(10)} ${typePages.length} (${mainCount} main site, ${msCount} microsite)`
    );
  }

  if (!shouldQueue) {
    console.info('\nDry run. Re-run with --queue to submit jobs.');
    await prisma.$disconnect();
    return;
  }

  // Connect to Redis and queue
  const redisUrl = process.env['REDIS_TLS_URL'] || process.env['REDIS_URL'];
  if (!redisUrl) {
    console.error('REDIS_URL required to queue jobs');
    process.exit(1);
  }

  const isTLS = redisUrl.startsWith('rediss://');
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isTLS ? { tls: { rejectUnauthorized: false } } : {}),
  });

  const contentQueue = new Queue('content', { connection });
  const micrositeQueue = new Queue('microsite', { connection });

  let queued = 0;
  let skipped = 0;

  // Map page types to content types for the job payload
  const pageTypeToContentType: Record<string, string> = {
    BLOG: 'blog',
    FAQ: 'faq',
    LEGAL: 'about', // Legal uses about-style (factual, no links)
    CONTACT: 'about', // Contact uses about-style (factual, no links)
  };

  // Map for microsite content generate
  const pageTypeToMicrositeContentType: Record<string, string[]> = {
    BLOG: ['blog'],
    FAQ: ['faq'],
    LEGAL: ['privacy', 'terms'], // Will generate both if slug matches
    CONTACT: ['contact'],
  };

  for (const [type, typePages] of Object.entries(byType)) {
    console.info(`\nQueuing ${type} (${typePages.length} pages)...`);

    for (let i = 0; i < typePages.length; i++) {
      const page = typePages[i]!;

      try {
        if (page.micrositeId) {
          // Microsite page — use MICROSITE_CONTENT_GENERATE with isRefresh
          // Determine the correct content type from slug
          let msContentType: string;
          if (page.slug === 'faq') msContentType = 'faq';
          else if (page.slug === 'privacy') msContentType = 'privacy';
          else if (page.slug === 'terms') msContentType = 'terms';
          else if (page.slug === 'contact') msContentType = 'contact';
          else if (page.slug.startsWith('blog/')) msContentType = 'blog';
          else msContentType = pageTypeToContentType[type] || 'blog';

          await micrositeQueue.add(
            'MICROSITE_CONTENT_GENERATE',
            {
              micrositeId: page.micrositeId,
              contentTypes: [msContentType],
              isRefresh: true,
            },
            { delay: queued * STAGGER_MS }
          );
        } else if (page.siteId) {
          // Main site page — use CONTENT_GENERATE directly
          const contentType = pageTypeToContentType[type] || 'blog';

          await contentQueue.add(
            'CONTENT_GENERATE',
            {
              siteId: page.siteId,
              pageId: page.id,
              contentType,
              targetKeyword: page.title || `${page.site?.name || 'Unknown'} ${type.toLowerCase()}`,
              secondaryKeywords: [],
            },
            { delay: queued * STAGGER_MS }
          );
        } else {
          skipped++;
          continue;
        }

        queued++;

        if (queued % 50 === 0) {
          console.info(`  ${queued} queued (${type}: ${i + 1}/${typePages.length})`);
        }
      } catch (error) {
        console.warn(
          `  Failed to queue ${page.id}: ${error instanceof Error ? error.message : 'unknown'}`
        );
        skipped++;
      }
    }
  }

  await contentQueue.close();
  await micrositeQueue.close();
  await connection.quit();

  const totalTimeHours = ((queued * STAGGER_MS) / 1000 / 3600).toFixed(1);

  console.info('\n' + '='.repeat(70));
  console.info(`Jobs queued:  ${queued}`);
  console.info(`Skipped:      ${skipped}`);
  console.info(`Stagger:      ${STAGGER_MS / 1000}s between jobs`);
  console.info(`Est. duration: ~${totalTimeHours} hours to process all`);
  console.info('='.repeat(70));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
