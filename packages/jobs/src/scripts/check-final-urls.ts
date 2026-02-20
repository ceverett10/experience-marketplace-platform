/**
 * Check Final URLs on Google Ads campaigns to verify they're populated.
 * Usage: node packages/jobs/dist/scripts/check-final-urls.js
 */
import { apiRequest, getConfig, flattenStreamResults } from '../services/google-ads-client.js';

async function main() {
  const config = getConfig();
  if (!config) {
    console.error('No Google Ads config available');
    process.exit(1);
  }

  const query = `
    SELECT
      campaign.name,
      campaign.status,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.status,
      ad_group_ad.policy_summary.approval_status
    FROM ad_group_ad
    WHERE campaign.status = 'ENABLED'
    LIMIT 20
  `.trim();

  const raw = await apiRequest(config, 'POST', '/googleAds:searchStream', { query });
  const rows = flattenStreamResults<{
    campaign: { name: string; status: string };
    adGroupAd: {
      ad: {
        finalUrls: string[];
        responsiveSearchAd?: { headlines: Array<{ text: string }> };
      };
      status: string;
      policySummary?: { approvalStatus: string };
    };
  }>(raw);

  let withUrls = 0;
  let withoutUrls = 0;

  console.info(`=== Final URL Check (${rows.length} ads sampled) ===\n`);

  for (const row of rows) {
    const name = row.campaign?.name || '?';
    const urls = row.adGroupAd?.ad?.finalUrls || [];
    const adStatus = row.adGroupAd?.status || '?';
    const approval = row.adGroupAd?.policySummary?.approvalStatus || 'UNKNOWN';
    const headlineCount = row.adGroupAd?.ad?.responsiveSearchAd?.headlines?.length || 0;

    if (urls.length > 0) {
      withUrls++;
      console.info(`OK  ${name}`);
      console.info(`    URL: ${urls[0]}`);
      console.info(`    Ad: ${adStatus} | Approval: ${approval} | Headlines: ${headlineCount}`);
    } else {
      withoutUrls++;
      console.info(`MISSING  ${name}`);
      console.info(`    No Final URL set!`);
      console.info(`    Ad: ${adStatus} | Approval: ${approval} | Headlines: ${headlineCount}`);
    }
    console.info('');
  }

  console.info('---');
  console.info(`With Final URL: ${withUrls}/${rows.length}`);
  console.info(`Missing Final URL: ${withoutUrls}/${rows.length}`);
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
