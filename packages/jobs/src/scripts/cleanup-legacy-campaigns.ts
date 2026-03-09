/**
 * Cleanup Legacy Campaigns: Archive old 1:1:1 campaigns from bidding dashboard.
 *
 * After restructuring Google Ads into 10 consolidated campaigns and Meta into
 * 8 CBO campaigns, ~2,000 old 1:1:1 campaign records remain in the database.
 * This script marks them as COMPLETED so they no longer clutter the dashboard.
 *
 * Keeps:
 *   - 10 restructured Google campaigns (identified by platformCampaignId list)
 *   - 8 consolidated Meta CBO parent campaigns (proposalData.consolidatedCampaign)
 *   - Child ad sets under consolidated parents (parentCampaignId != null)
 *
 * Flags:
 *   --dry-run   Show what would be archived without making changes (default)
 *   --apply     Actually mark legacy campaigns as COMPLETED
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/cleanup-legacy-campaigns.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/cleanup-legacy-campaigns.ts --apply
 */

import { prisma } from '@experience-marketplace/database';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

/** The 10 restructured Google campaign platform IDs */
const RESTRUCTURED_GOOGLE_IDS = [
  '23609912135', // General Experiences
  '23609892926', // Transfers & Transport
  '23604367863', // Culture & Sightseeing
  '23614507858', // Adventure & Nature
  '23607017999', // Water & Boat Activities
  '23611493431', // Food & Dining Experiences
  '23606879261', // Destination Discovery
  '23606873744', // Branded -- Attraction Tickets
  '23601336654', // Branded -- London Food Tours
  '23606870156', // Branded -- Harry Potter Tours
];

async function main(): Promise<void> {
  console.info('=== Legacy Campaign Cleanup ===');
  console.info(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.info();

  // Count totals before cleanup
  const totalBefore = await prisma.adCampaign.count({
    where: { status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] }, parentCampaignId: null },
  });
  console.info(`Campaigns visible in dashboard (ACTIVE/PAUSED/DRAFT parents): ${totalBefore}`);

  // Find campaigns to KEEP
  // 1. The 10 restructured Google campaigns
  const keepGoogle = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      platformCampaignId: { in: RESTRUCTURED_GOOGLE_IDS },
    },
    select: { id: true, name: true, platformCampaignId: true, status: true },
  });
  console.info(`\nGoogle campaigns to keep: ${keepGoogle.length}`);
  for (const c of keepGoogle) {
    console.info(`  [${c.status}] ${c.name} (${c.platformCampaignId})`);
  }

  // 2. Consolidated Meta CBO parent campaigns
  const allMetaParents = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      parentCampaignId: null,
      status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
    },
    select: { id: true, name: true, platformCampaignId: true, status: true, proposalData: true },
  });

  const keepMeta = allMetaParents.filter((c) => {
    const data = c.proposalData as Record<string, unknown> | null;
    return data?.['consolidatedCampaign'] === true;
  });

  console.info(`\nMeta consolidated campaigns to keep: ${keepMeta.length}`);
  for (const c of keepMeta) {
    console.info(`  [${c.status}] ${c.name} (${c.platformCampaignId})`);
  }

  // 3. Child ad sets (under consolidated parents) — always keep
  const childCount = await prisma.adCampaign.count({
    where: { parentCampaignId: { not: null } },
  });
  console.info(`\nChild ad sets (always kept): ${childCount}`);

  // Build set of IDs to keep
  const keepIds = new Set<string>([...keepGoogle.map((c) => c.id), ...keepMeta.map((c) => c.id)]);

  // Find campaigns to archive
  const toArchive = await prisma.adCampaign.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
      parentCampaignId: null,
      id: { notIn: Array.from(keepIds) },
    },
    select: { id: true, name: true, platform: true, status: true, totalSpend: true },
  });

  // Breakdown
  const byPlatformStatus = new Map<string, number>();
  for (const c of toArchive) {
    const key = `${c.platform} / ${c.status}`;
    byPlatformStatus.set(key, (byPlatformStatus.get(key) || 0) + 1);
  }

  console.info(`\n=== CLEANUP SUMMARY ===`);
  console.info(`Campaigns to archive: ${toArchive.length}`);
  console.info(`Campaigns to keep: ${keepIds.size} parents + ${childCount} children`);
  console.info();
  console.info('Archive breakdown:');
  for (const [key, count] of Array.from(byPlatformStatus.entries()).sort()) {
    console.info(`  ${key}: ${count}`);
  }

  const totalSpend = toArchive.reduce((s, c) => s + Number(c.totalSpend || 0), 0);
  console.info(`\nTotal historical spend on archived campaigns: £${totalSpend.toFixed(2)}`);

  if (DRY_RUN) {
    console.info('\nDRY RUN — no changes made. Run with --apply to archive legacy campaigns.');
    await prisma.$disconnect();
    return;
  }

  // Apply: mark as COMPLETED
  console.info(`\nArchiving ${toArchive.length} campaigns (setting status to COMPLETED)...`);
  const result = await prisma.adCampaign.updateMany({
    where: {
      id: { in: toArchive.map((c) => c.id) },
    },
    data: { status: 'COMPLETED' },
  });

  console.info(`Archived: ${result.count} campaigns`);

  // Verify
  const totalAfter = await prisma.adCampaign.count({
    where: { status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] }, parentCampaignId: null },
  });
  console.info(`\nDashboard campaigns after cleanup: ${totalAfter}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
