/**
 * Query Google Ads API directly to check live campaign status and metrics.
 *
 * Usage:
 *   heroku run "node /app/packages/jobs/dist/scripts/check-google-live-status.js" \
 *     --app holibob-experiences-demand-gen
 */

import { getConfig, apiRequest, flattenStreamResults } from '../services/google-ads-client';

async function main() {
  const config = getConfig();
  if (!config) {
    console.error('Google Ads not configured');
    process.exit(1);
  }

  // Query all non-removed Search campaigns with status, budget, and metrics
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND campaign.advertising_channel_type = 'SEARCH'
    ORDER BY campaign_budget.amount_micros DESC
  `.trim();

  const raw = await apiRequest(config, 'POST', '/googleAds:searchStream', { query });
  const rows = flattenStreamResults<{
    campaign: { id: string; name: string; status: string };
    campaignBudget: { amountMicros: string };
    metrics: {
      impressions: string;
      clicks: string;
      costMicros: string;
      conversions: string;
    };
  }>(raw);

  console.info('=== Live Google Ads Campaign Status ===\n');

  let totalBudget = 0;
  let totalSpend = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalConversions = 0;

  for (const row of rows) {
    const c = row.campaign;
    const budgetMicros = parseInt(row.campaignBudget?.amountMicros || '0');
    const budget = budgetMicros / 1_000_000;
    const spend = parseInt(row.metrics?.costMicros || '0') / 1_000_000;
    const clicks = parseInt(row.metrics?.clicks || '0');
    const impressions = parseInt(row.metrics?.impressions || '0');
    const conversions = parseFloat(row.metrics?.conversions || '0');

    totalBudget += budget;
    totalSpend += spend;
    totalClicks += clicks;
    totalImpressions += impressions;
    totalConversions += conversions;

    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : '0.0';
    const avgCpc = clicks > 0 ? (spend / clicks).toFixed(2) : '0.00';

    console.info(`  ${c.name}`);
    console.info(`    ID: ${c.id} | Status: ${c.status} | Budget: £${budget.toFixed(2)}/day`);
    console.info(
      `    Impressions: ${impressions} | Clicks: ${clicks} | CTR: ${ctr}% | Avg CPC: £${avgCpc} | Spend: £${spend.toFixed(2)} | Conv: ${Math.round(conversions)}`
    );
    console.info('');
  }

  const overallCtr =
    totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0.0';
  const overallCpc = totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : '0.00';

  console.info('=== Totals ===');
  console.info(`  Campaigns:    ${rows.length}`);
  console.info(`  Total budget: £${totalBudget.toFixed(2)}/day`);
  console.info(`  Total spend:  £${totalSpend.toFixed(2)}`);
  console.info(`  Impressions:  ${totalImpressions}`);
  console.info(`  Clicks:       ${totalClicks} (CTR: ${overallCtr}%)`);
  console.info(`  Avg CPC:      £${overallCpc}`);
  console.info(`  Conversions:  ${Math.round(totalConversions)}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
