/**
 * Fix keyword-level final URLs on live Google Ads campaigns.
 *
 * Two fixes:
 *   1. Add missing keyword-level URLs (46 keywords falling back to homepage)
 *   2. Correct bad URL splits (harry potter compound keywords)
 *
 * Usage:
 *   heroku run "npx tsx packages/jobs/src/scripts/fix-keyword-urls.ts --dry-run" \
 *     --app holibob-experiences-demand-gen
 *
 *   heroku run "npx tsx packages/jobs/src/scripts/fix-keyword-urls.ts --apply" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import {
  getConfig,
  apiRequest,
  flattenStreamResults,
  updateKeywordFinalUrls,
} from '../services/google-ads-client';
import { buildExperiencesFilteredUrl } from '../services/landing-page-routing';

const prisma = new PrismaClient();

interface KeywordRow {
  campaign: { name: string; id: string };
  adGroup: { id: string; name: string };
  adGroupCriterion: {
    criterionId: string;
    keyword: { text: string; matchType: string };
    finalUrls: string[];
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  if (dryRun) {
    console.info('DRY RUN — pass --apply to make changes\n');
  }

  const config = getConfig();
  if (!config) {
    console.error('Google Ads not configured');
    process.exit(1);
  }

  // Get all keyword criteria from Google Ads
  const query = `
    SELECT
      campaign.name, campaign.id,
      ad_group.id, ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.final_urls
    FROM ad_group_criterion
    WHERE campaign.status != 'REMOVED'
      AND ad_group_criterion.status != 'REMOVED'
      AND ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.negative = false
      AND campaign.advertising_channel_type = 'SEARCH'
    ORDER BY campaign.name, ad_group.name
  `.trim();

  const raw = await apiRequest(config, 'POST', '/googleAds:searchStream', { query });
  const rows = flattenStreamResults<KeywordRow>(raw);
  console.info(`Found ${rows.length} keywords across all campaigns\n`);

  // Get campaign-to-domain mapping from DB
  const campaigns = await prisma.adCampaign.findMany({
    where: { platform: 'GOOGLE_SEARCH', status: 'ACTIVE' },
    include: { site: { select: { primaryDomain: true } } },
  });

  const campaignDomainMap = new Map<string, string>();
  for (const c of campaigns) {
    if (c.platformCampaignId && c.site?.primaryDomain) {
      campaignDomainMap.set(c.platformCampaignId, c.site.primaryDomain);
    }
  }

  const fixes: Array<{ adGroupId: string; criterionId: string; finalUrl: string }> = [];
  let missingCount = 0;
  let badSplitCount = 0;

  for (const row of rows) {
    const kw = row.adGroupCriterion.keyword.text;
    const currentUrls = row.adGroupCriterion.finalUrls || [];
    const currentUrl = currentUrls[0] || '';
    const campaignId = row.campaign.id;
    const domain = campaignDomainMap.get(campaignId);

    if (!domain) continue;

    // Extract UTM params from existing URL or use default
    let utmParams = '';
    if (currentUrl.includes('utm_source=')) {
      utmParams = currentUrl.substring(currentUrl.indexOf('utm_source='));
    } else {
      // Find UTM from any sibling keyword in the same campaign
      const siblingUrl = rows.find(
        (r) =>
          r.campaign.id === campaignId &&
          r.adGroupCriterion.finalUrls?.length > 0 &&
          r.adGroupCriterion.finalUrls[0]?.includes('utm_source=')
      );
      if (siblingUrl) {
        const sibUrl = siblingUrl.adGroupCriterion.finalUrls[0]!;
        utmParams = sibUrl.substring(sibUrl.indexOf('utm_source='));
      }
    }

    // Fix 1: Missing keyword-level URL
    if (currentUrls.length === 0) {
      const { url } = buildExperiencesFilteredUrl(domain, kw);
      const finalUrl = utmParams ? `${url}&${utmParams}` : url;
      fixes.push({
        adGroupId: row.adGroup.id,
        criterionId: row.adGroupCriterion.criterionId,
        finalUrl,
      });
      missingCount++;
      console.info(`  [MISSING] ${row.campaign.name} | "${kw}" -> ${finalUrl}`);
      continue;
    }

    // Fix 2: Bad URL splits (destination should not exist for compound keywords)
    const hasBadSplit =
      (kw.includes('harry potter forbidden forest') &&
        currentUrl.includes('destination=forbidden')) ||
      (kw.includes('universal') &&
        kw.includes('harry potter') &&
        currentUrl.includes('destination=universal'));

    if (hasBadSplit) {
      const { url } = buildExperiencesFilteredUrl(domain, kw);
      const finalUrl = utmParams ? `${url}&${utmParams}` : url;
      fixes.push({
        adGroupId: row.adGroup.id,
        criterionId: row.adGroupCriterion.criterionId,
        finalUrl,
      });
      badSplitCount++;
      console.info(`  [BAD SPLIT] "${kw}" | ${currentUrl.substring(0, 80)}... -> ${finalUrl}`);
    }
  }

  console.info(`\n=== Summary ===`);
  console.info(`  Missing URLs to add: ${missingCount}`);
  console.info(`  Bad splits to fix:   ${badSplitCount}`);
  console.info(`  Total fixes:         ${fixes.length}`);

  if (!dryRun && fixes.length > 0) {
    console.info('\nApplying fixes...');
    const updated = await updateKeywordFinalUrls(fixes);
    console.info(`\nDone. Updated ${updated} keyword URLs on Google Ads.`);
  } else if (dryRun && fixes.length > 0) {
    console.info('\nPass --apply to apply these fixes.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
