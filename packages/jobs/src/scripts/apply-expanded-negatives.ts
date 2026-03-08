/**
 * Apply Expanded Negative Keywords to All Live Google Campaigns.
 *
 * Existing campaigns only have the negatives they were created with. This script
 * applies the full expanded list from PAID_TRAFFIC_CONFIG to all active campaigns.
 *
 * Flags:
 *   --dry-run   Show what would be applied without making API calls (default)
 *   --apply     Actually add negative keywords
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/apply-expanded-negatives.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/apply-expanded-negatives.ts --apply
 */

import {
  getConfig,
  apiRequest,
  flattenStreamResults,
  addCampaignNegativeKeywords,
} from '../services/google-ads-client';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

async function main(): Promise<void> {
  console.info('=== Apply Expanded Negative Keywords ===');
  console.info(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.info(`Negative keywords to apply: ${PAID_TRAFFIC_CONFIG.defaultNegativeKeywords.length}`);
  console.info();

  const config = getConfig();
  if (!config) {
    console.error('Google Ads config not available');
    process.exit(1);
  }

  // Get all active campaigns
  const query =
    'SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status != "REMOVED" ORDER BY campaign.name';
  const rows = flattenStreamResults<{ campaign: { id: string; name: string } }>(
    await apiRequest(config, 'POST', '/googleAds:searchStream', { query })
  );

  console.info(`Found ${rows.length} active campaigns\n`);

  // Get existing negative keywords per campaign to avoid duplicates
  const existingQuery = `
    SELECT campaign.id, campaign_criterion.keyword.text
    FROM campaign_criterion
    WHERE campaign.status != "REMOVED"
      AND campaign_criterion.negative = true
      AND campaign_criterion.type = "KEYWORD"
  `;
  const existingRows = flattenStreamResults<{
    campaign: { id: string };
    campaignCriterion: { keyword: { text: string } };
  }>(await apiRequest(config, 'POST', '/googleAds:searchStream', { query: existingQuery }));

  const existingByCampaign = new Map<string, Set<string>>();
  for (const row of existingRows) {
    const id = row.campaign.id;
    if (!existingByCampaign.has(id)) existingByCampaign.set(id, new Set());
    existingByCampaign.get(id)!.add(row.campaignCriterion.keyword.text.toLowerCase());
  }

  let totalAdded = 0;
  let totalSkipped = 0;

  for (const row of rows) {
    const existing = existingByCampaign.get(row.campaign.id) ?? new Set<string>();
    const newKeywords = PAID_TRAFFIC_CONFIG.defaultNegativeKeywords.filter(
      (kw) => !existing.has(kw.toLowerCase())
    );

    if (newKeywords.length === 0) {
      console.info(`  ${row.campaign.name}: all negatives already applied`);
      totalSkipped++;
      continue;
    }

    if (DRY_RUN) {
      console.info(
        `  ${row.campaign.name}: would add ${newKeywords.length} new negatives (${existing.size} already exist)`
      );
      totalAdded += newKeywords.length;
    } else {
      const added = await addCampaignNegativeKeywords(row.campaign.id, newKeywords);
      console.info(
        `  ${row.campaign.name}: added ${added} new negatives (${existing.size} already existed)`
      );
      totalAdded += added;
    }
  }

  console.info('\n=== SUMMARY ===');
  console.info(`Campaigns processed: ${rows.length}`);
  console.info(`Campaigns already up-to-date: ${totalSkipped}`);
  console.info(`Negative keywords ${DRY_RUN ? 'would be ' : ''}added: ${totalAdded}`);

  if (DRY_RUN) {
    console.info('\nDRY RUN — no changes made. Run with --apply to add negatives.');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
