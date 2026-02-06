#!/usr/bin/env npx ts-node
/**
 * Expand Thin Content Script
 *
 * Finds all published blog pages with fewer than 800 words and queues
 * CONTENT_OPTIMIZE jobs to expand them.
 *
 * Usage:
 *   npx ts-node scripts/expand-thin-content.ts                    # Audit only (dry run)
 *   npx ts-node scripts/expand-thin-content.ts --fix              # Queue expansion jobs
 *   npx ts-node scripts/expand-thin-content.ts --site=<siteId>    # Target specific site
 *   npx ts-node scripts/expand-thin-content.ts --limit=10         # Limit jobs queued
 */

import { PrismaClient, PageType, PageStatus, SiteStatus } from '@prisma/client';
import Redis from 'ioredis';
import { Queue } from 'bullmq';

const prisma = new PrismaClient();

interface ThinPage {
  pageId: string;
  contentId: string;
  siteId: string;
  siteName: string;
  pageTitle: string;
  pageSlug: string;
  wordCount: number;
  minWords: number;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const siteArg = args.find((arg) => arg.startsWith('--site='));
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const targetSiteId = siteArg?.split('=')[1];
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '0', 10) : undefined;

  console.log('='.repeat(60));
  console.log('Thin Content Expansion Tool');
  console.log('='.repeat(60));

  // Find all published blog pages across all active sites
  console.log('\n[1/3] Finding thin content pages...');

  const whereClause: any = {
    status: PageStatus.PUBLISHED,
    type: PageType.BLOG,
    site: {
      status: { not: SiteStatus.ARCHIVED },
    },
    content: {
      isNot: null,
    },
  };

  if (targetSiteId) {
    whereClause.siteId = targetSiteId;
    console.log(`  Filtering to site: ${targetSiteId}`);
  }

  const pages = await prisma.page.findMany({
    where: whereClause,
    include: {
      content: true,
      site: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  console.log(`  Found ${pages.length} published blog pages`);

  // Identify thin pages
  const thinPages: ThinPage[] = [];
  const minWords = 800; // Blog threshold

  for (const page of pages) {
    if (!page.content) continue;

    const contentBody = page.content.body || '';
    const wordCount = contentBody.split(/\s+/).filter((w) => w.length > 0).length;

    if (wordCount < minWords) {
      thinPages.push({
        pageId: page.id,
        contentId: page.content.id,
        siteId: page.siteId,
        siteName: page.site?.name || 'Unknown',
        pageTitle: page.title,
        pageSlug: page.slug,
        wordCount,
        minWords,
      });
    }
  }

  console.log(`  Found ${thinPages.length} pages with thin content (<${minWords} words)`);

  // Group by site for reporting
  console.log('\n[2/3] Results by site');
  console.log('='.repeat(60));

  const bySite = new Map<string, ThinPage[]>();
  for (const page of thinPages) {
    const group = bySite.get(page.siteName) || [];
    group.push(page);
    bySite.set(page.siteName, group);
  }

  for (const [siteName, sitePages] of bySite) {
    console.log(`\n${siteName} (${sitePages.length} thin pages):`);
    for (const page of sitePages) {
      console.log(
        `  - ${page.pageSlug}: ${page.wordCount} words (needs ${minWords - page.wordCount} more)`
      );
    }
  }

  // Summary
  console.log('\n[3/3] Summary');
  console.log('='.repeat(60));
  console.log(`Total thin pages: ${thinPages.length}`);
  console.log(`Sites affected: ${bySite.size}`);

  if (thinPages.length === 0) {
    console.log('\nNo thin content pages found!');
    return;
  }

  // Queue expansion jobs if --fix flag is provided
  if (shouldFix) {
    const pagesToFix = limit ? thinPages.slice(0, limit) : thinPages;
    console.log(`\nQueuing ${pagesToFix.length} content expansion jobs...`);

    // Connect to Redis
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    const contentQueue = new Queue('content', { connection });

    let queued = 0;
    for (const page of pagesToFix) {
      await contentQueue.add(
        'CONTENT_OPTIMIZE',
        {
          siteId: page.siteId,
          pageId: page.pageId,
          contentId: page.contentId,
          reason: 'thin_content',
          performanceData: {
            currentWordCount: page.wordCount,
            targetWordCount: page.minWords,
          },
        },
        {
          priority: 5,
          delay: queued * 30000, // Stagger jobs by 30 seconds each
        }
      );
      queued++;
      console.log(`  [${queued}/${pagesToFix.length}] Queued: ${page.siteName} - ${page.pageSlug}`);
    }

    console.log(`\nDone! Queued ${queued} content expansion jobs.`);
    console.log('Jobs will run with 30-second delays between each.');

    await contentQueue.close();
    await connection.quit();
  } else {
    console.log('\nTo queue expansion jobs, re-run with --fix flag:');
    console.log('  npx ts-node scripts/expand-thin-content.ts --fix');
    console.log('\nOptional flags:');
    console.log('  --site=<siteId>   Target a specific site');
    console.log('  --limit=10        Limit number of jobs queued');
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
