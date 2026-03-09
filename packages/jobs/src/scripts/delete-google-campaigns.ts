/**
 * Delete all existing Google Ads campaigns and mark DB records as COMPLETED.
 *
 * This is Stage 1 of the Google Ads rebuild — removes the 10 legacy campaigns
 * that have wrong landing URLs (88% pointing to london-food-tours.com).
 *
 * Flags:
 *   --dry-run   List campaigns that would be deleted (default)
 *   --apply     Actually delete campaigns from Google Ads API + update DB
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/delete-google-campaigns.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/delete-google-campaigns.ts --apply
 *
 * On Heroku:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/delete-google-campaigns.js --dry-run' \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import {
  getConfig,
  apiRequest,
  flattenStreamResults,
  removeGoogleCampaign,
} from '../services/google-ads-client';

const prisma = new PrismaClient();
const isDryRun = !process.argv.includes('--apply');

async function main(): Promise<void> {
  const config = getConfig();
  if (!config) {
    console.error('Google Ads config not available — check env vars');
    process.exit(1);
  }

  console.info('=== GOOGLE ADS CAMPAIGN DELETION ===');
  console.info(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'APPLY (will delete!)'}\n`);

  // 1. Query all non-removed campaigns from Google Ads API
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status
    FROM campaign
    WHERE campaign.status IN ('ENABLED', 'PAUSED')
    ORDER BY campaign.name
  `.trim();

  const raw = await apiRequest(config, 'POST', '/googleAds:searchStream', { query });
  const campaigns = flattenStreamResults<{
    campaign: { id: string; name: string; status: string };
  }>(raw);

  console.info(`Found ${campaigns.length} campaigns in Google Ads:\n`);
  for (const c of campaigns) {
    console.info(`  [${c.campaign.status}] ${c.campaign.name} (id=${c.campaign.id})`);
  }

  if (campaigns.length === 0) {
    console.info('\nNo campaigns to delete.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // 2. Find matching DB records
  const platformIds = campaigns.map((c) => c.campaign.id);
  const dbRecords = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      platformCampaignId: { in: platformIds },
      status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
    },
    select: { id: true, name: true, platformCampaignId: true, status: true },
  });

  console.info(`\nMatching DB records: ${dbRecords.length}`);
  for (const r of dbRecords) {
    console.info(`  [${r.status}] ${r.name} (platformId=${r.platformCampaignId})`);
  }

  if (isDryRun) {
    console.info('\n--- DRY RUN — no changes made ---');
    console.info('Run with --apply to delete these campaigns.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // 3. Delete from Google Ads API
  console.info('\n--- APPLYING DELETIONS ---\n');
  let deleted = 0;
  let failed = 0;

  for (const c of campaigns) {
    console.info(`Deleting: ${c.campaign.name} (id=${c.campaign.id})...`);
    const ok = await removeGoogleCampaign(c.campaign.id);
    if (ok) {
      deleted++;
      console.info(`  OK — removed from Google Ads`);
    } else {
      failed++;
      console.error(`  FAILED — could not remove campaign ${c.campaign.id}`);
    }
  }

  // 4. Update DB records to COMPLETED
  if (dbRecords.length > 0) {
    const updated = await prisma.adCampaign.updateMany({
      where: {
        id: { in: dbRecords.map((r) => r.id) },
      },
      data: {
        status: 'COMPLETED',
      },
    });
    console.info(`\nDB records updated to COMPLETED: ${updated.count}`);
  }

  console.info(`\n=== DONE ===`);
  console.info(`Deleted: ${deleted}, Failed: ${failed}, DB updated: ${dbRecords.length}`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  console.error(e.stack);
  process.exit(1);
});
