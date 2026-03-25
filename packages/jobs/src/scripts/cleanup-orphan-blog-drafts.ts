#!/usr/bin/env npx tsx
/**
 * Delete orphaned DRAFT blog pages that have no content record.
 *
 * These were created by the old fanout flow which wrote a page stub before
 * queuing content generation. When content generation failed, the stub was
 * left as a DRAFT with no body — consuming slug space and polluting metrics.
 *
 * The new flow creates page records only after content passes quality checks,
 * so these orphans will never be filled in. Safe to delete.
 *
 * Pages created TODAY are excluded — they may still be in the content queue
 * from this morning's fanout run and could be processed later today.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/cleanup-orphan-blog-drafts.ts [--dry-run]
 */

import { prisma } from '@experience-marketplace/database';

const isDryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  console.info('='.repeat(60));
  console.info('Cleanup Orphan Blog Drafts');
  console.info(`Mode: ${isDryRun ? 'DRY RUN (no changes will be saved)' : 'LIVE'}`);
  console.info('='.repeat(60));

  // Exclude today's drafts — they may still be processing from this morning's fanout
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Find all DRAFT blog pages with no content record, created before today
  const orphans = await prisma.page.findMany({
    where: {
      type: 'BLOG',
      status: 'DRAFT',
      contentId: null,
      createdAt: { lt: todayStart },
    },
    select: {
      id: true,
      createdAt: true,
      micrositeId: true,
      siteId: true,
    },
  });

  const micrositeOrphans = orphans.filter((p) => p.micrositeId !== null).length;
  const siteOrphans = orphans.filter((p) => p.siteId !== null).length;

  console.info(`\nFound ${orphans.length} orphaned DRAFT blog pages to delete:`);
  console.info(`  Microsite: ${micrositeOrphans}`);
  console.info(`  Main site: ${siteOrphans}`);

  // Also show today's drafts that we're preserving
  const todayDrafts = await prisma.page.count({
    where: {
      type: 'BLOG',
      status: 'DRAFT',
      contentId: null,
      createdAt: { gte: todayStart },
    },
  });
  console.info(`\nPreserving ${todayDrafts} drafts created today (may still be processing)`);

  if (orphans.length === 0) {
    console.info('\nNothing to delete.');
    await prisma.$disconnect();
    return;
  }

  if (isDryRun) {
    console.info('\nDRY RUN — no changes made. Re-run without --dry-run to delete.');
    await prisma.$disconnect();
    return;
  }

  // Delete in batches to avoid overwhelming the DB
  const BATCH_SIZE = 500;
  const ids = orphans.map((p) => p.id);
  let deleted = 0;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    await prisma.page.deleteMany({ where: { id: { in: batch } } });
    deleted += batch.length;
    console.info(`  Deleted ${deleted}/${ids.length}...`);
  }

  console.info(`\n✓ Deleted ${deleted} orphaned DRAFT blog pages.`);
  console.info('='.repeat(60));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
