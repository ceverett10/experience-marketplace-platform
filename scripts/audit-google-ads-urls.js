/**
 * Audit Google Ads campaigns — check which ad groups have RSAs with final URLs.
 *
 * Queries the Google Ads API directly to see what's actually live.
 *
 * Usage:
 *   heroku run 'cd /app && node scripts/audit-google-ads-urls.js' --app holibob-experiences-demand-gen
 */
const path = require('path');

async function main() {
  const googleAds = require(
    path.join(__dirname, '../packages/jobs/dist/services/google-ads-client.js')
  );

  const config = googleAds.getConfig();
  if (!config) {
    console.error('Google Ads config not available');
    process.exit(1);
  }

  console.info('=== GOOGLE ADS URL AUDIT ===\n');

  // 1. Get all active/paused campaigns
  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status
    FROM campaign
    WHERE campaign.status IN ('ENABLED', 'PAUSED')
    ORDER BY campaign.name
  `.trim();

  const campaignRaw = await googleAds.apiRequest(config, 'POST', '/googleAds:searchStream', {
    query: campaignQuery,
  });
  const campaigns = googleAds.flattenStreamResults(campaignRaw);

  console.info('Campaigns found: ' + campaigns.length);
  for (const c of campaigns) {
    console.info(
      '  [' + c.campaign.status + '] ' + c.campaign.name + ' (id=' + c.campaign.id + ')'
    );
  }

  // 2. For each campaign, get ad groups and their ads with final URLs
  for (const c of campaigns) {
    const cid = c.campaign.id;
    const cname = c.campaign.name;

    console.info('\n--- Campaign: ' + cname + ' (id=' + cid + ') ---');

    // Get ad groups
    const agQuery = `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status
      FROM ad_group
      WHERE campaign.id = ${cid}
      AND ad_group.status IN ('ENABLED', 'PAUSED')
      ORDER BY ad_group.name
    `.trim();

    const agRaw = await googleAds.apiRequest(config, 'POST', '/googleAds:searchStream', {
      query: agQuery,
    });
    const adGroups = googleAds.flattenStreamResults(agRaw);

    console.info('  Ad groups: ' + adGroups.length);

    // Get all ads in this campaign with their final URLs
    const adQuery = `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group_ad.ad.id,
        ad_group_ad.ad.type,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.status
      FROM ad_group_ad
      WHERE campaign.id = ${cid}
      AND ad_group_ad.status IN ('ENABLED', 'PAUSED')
      ORDER BY ad_group.name
    `.trim();

    const adRaw = await googleAds.apiRequest(config, 'POST', '/googleAds:searchStream', {
      query: adQuery,
    });
    const ads = googleAds.flattenStreamResults(adRaw);

    // Map ad group ID → ads
    var adsByGroup = {};
    for (const ad of ads) {
      var agId = ad.adGroup.id;
      if (!adsByGroup[agId]) adsByGroup[agId] = [];
      adsByGroup[agId].push(ad);
    }

    var withUrl = 0;
    var withoutUrl = 0;

    for (const ag of adGroups) {
      var groupAds = adsByGroup[ag.adGroup.id] || [];
      var urlList = [];
      for (var a of groupAds) {
        var finalUrls = a.adGroupAd?.ad?.finalUrls || [];
        urlList = urlList.concat(finalUrls);
      }

      var hasUrl = urlList.length > 0 && urlList[0];
      if (hasUrl) {
        withUrl++;
      } else {
        withoutUrl++;
      }

      console.info(
        '  [' +
          ag.adGroup.status +
          '] ' +
          ag.adGroup.name +
          ' | ads=' +
          groupAds.length +
          ' | finalUrl=' +
          (urlList[0] || 'NONE')
      );
    }

    console.info(
      '  Summary: ' +
        withUrl +
        ' with URL, ' +
        withoutUrl +
        ' without URL, ' +
        adGroups.length +
        ' total'
    );

    // Also get keyword count
    const kwQuery = `
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group.name
      FROM ad_group_criterion
      WHERE campaign.id = ${cid}
      AND ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status = 'ENABLED'
    `.trim();

    const kwRaw = await googleAds.apiRequest(config, 'POST', '/googleAds:searchStream', {
      query: kwQuery,
    });
    const keywords = googleAds.flattenStreamResults(kwRaw);
    console.info('  Keywords: ' + keywords.length);
  }

  console.info('\n=== DONE ===');
  process.exit(0);
}

main().catch(function (e) {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
