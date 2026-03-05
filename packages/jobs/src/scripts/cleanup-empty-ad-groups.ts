/**
 * Cleanup Empty Ad Group Shells: Remove ad groups that have no keywords AND no ads.
 *
 * During the restructure migration, some ad groups were created as shells but never
 * populated with keywords or ads. This script identifies and removes them.
 *
 * Flags:
 *   --dry-run   Show what would be removed without making API calls
 *   --limit=N   Only process first N ad groups
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/cleanup-empty-ad-groups.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/cleanup-empty-ad-groups.ts
 *
 * On Heroku:
 *   heroku run "npx -y tsx packages/jobs/src/scripts/cleanup-empty-ad-groups.ts --dry-run" \
 *     --app holibob-experiences-demand-gen
 */

import { getConfig, apiRequest, flattenStreamResults } from '../services/google-ads-client';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;

async function main(): Promise<void> {
  console.log('=== Cleanup Empty Ad Group Shells ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} ad groups`);
  console.log();

  const config = getConfig();
  if (!config) {
    console.error('Google Ads config not available');
    process.exit(1);
  }

  // Step 1: Get all non-removed ad groups
  console.log('Querying all ad groups...');
  const agQuery =
    'SELECT campaign.id, campaign.name, ad_group.id, ad_group.name FROM ad_group WHERE campaign.status != "REMOVED" AND ad_group.status != "REMOVED"';
  const agRows = flattenStreamResults<{
    campaign: { id: string; name: string };
    adGroup: { id: string; name: string };
  }>(await apiRequest(config, 'POST', '/googleAds:searchStream', { query: agQuery }));

  console.log(`Found ${agRows.length} ad groups total`);

  // Step 2: Get ad groups that have keywords
  console.log('Querying ad groups with keywords...');
  const kwQuery =
    'SELECT ad_group.id FROM ad_group_criterion WHERE campaign.status != "REMOVED" AND ad_group_criterion.type = "KEYWORD" AND ad_group_criterion.status != "REMOVED"';
  const kwRows = flattenStreamResults<{ adGroup: { id: string } }>(
    await apiRequest(config, 'POST', '/googleAds:searchStream', { query: kwQuery })
  );
  const agWithKeywords = new Set(kwRows.map((r) => r.adGroup.id));

  // Step 3: Get ad groups that have ads
  console.log('Querying ad groups with ads...');
  const adQuery =
    'SELECT ad_group.id FROM ad_group_ad WHERE campaign.status != "REMOVED" AND ad_group_ad.status != "REMOVED"';
  const adRows = flattenStreamResults<{ adGroup: { id: string } }>(
    await apiRequest(config, 'POST', '/googleAds:searchStream', { query: adQuery })
  );
  const agWithAds = new Set(adRows.map((r) => r.adGroup.id));

  // Step 4: Find ad groups with NEITHER keywords NOR ads
  let emptyAdGroups = agRows.filter(
    (r) => !agWithKeywords.has(r.adGroup.id) && !agWithAds.has(r.adGroup.id)
  );

  console.log(`\n${agWithKeywords.size} ad groups have keywords`);
  console.log(`${agWithAds.size} ad groups have ads`);
  console.log(`${emptyAdGroups.length} ad groups are empty (no keywords, no ads)\n`);

  if (LIMIT && emptyAdGroups.length > LIMIT) {
    emptyAdGroups = emptyAdGroups.slice(0, LIMIT);
    console.log(`Processing first ${LIMIT} only\n`);
  }

  if (emptyAdGroups.length === 0) {
    console.log('No empty ad groups found — nothing to do.');
    return;
  }

  // Group by campaign for display
  const byCampaign = new Map<string, typeof emptyAdGroups>();
  for (const ag of emptyAdGroups) {
    const key = ag.campaign.name;
    if (!byCampaign.has(key)) byCampaign.set(key, []);
    byCampaign.get(key)!.push(ag);
  }

  console.log('Empty ad groups by campaign:');
  for (const [campaign, groups] of byCampaign) {
    console.log(`  ${campaign}: ${groups.length} empty ad groups`);
  }
  console.log();

  if (DRY_RUN) {
    console.log('DRY RUN — would remove these ad groups. Run without --dry-run to execute.');
    return;
  }

  // Step 5: Remove empty ad groups in batches of 100
  let removed = 0;
  let failed = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < emptyAdGroups.length; i += BATCH_SIZE) {
    const batch = emptyAdGroups.slice(i, i + BATCH_SIZE);
    const operations = batch.map((ag) => ({
      remove: `customers/${config.customerId}/adGroups/${ag.adGroup.id}`,
    }));

    try {
      await apiRequest(config, 'POST', '/adGroups:mutate', { operations });
      removed += batch.length;
      console.log(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: Removed ${batch.length} ad groups (${removed}/${emptyAdGroups.length} total)`
      );
    } catch (error) {
      // If batch fails, try one by one
      console.warn(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed, retrying individually...`);
      for (const ag of batch) {
        try {
          await apiRequest(config, 'POST', '/adGroups:mutate', {
            operations: [{ remove: `customers/${config.customerId}/adGroups/${ag.adGroup.id}` }],
          });
          removed++;
        } catch (err) {
          failed++;
          console.error(
            `  Failed to remove ${ag.adGroup.name} (${ag.adGroup.id}): ${err instanceof Error ? err.message : err}`
          );
        }
      }
      console.log(`  Progress: ${removed} removed, ${failed} failed`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Empty ad groups found: ${emptyAdGroups.length}`);
  console.log(`Removed: ${removed}`);
  console.log(`Failed: ${failed}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
