/**
 * Inspect the full STAG output from the bidding engine.
 *
 * Shows the complete hierarchy:
 *   Campaign Group → Ad Group → Keywords → Final URLs
 *
 * Usage:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/inspect-stag-output.js'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/inspect-stag-output.js --google-only'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/inspect-stag-output.js --group "Food, Drink & Culinary"'
 */
import { runBiddingEngine } from '../services/bidding-engine';
import { prisma } from '@experience-marketplace/database';

async function main() {
  const args = process.argv.slice(2);
  const googleOnly = args.includes('--google-only');
  const groupFilter = args.find((a) => a.startsWith('--group'))
    ? args[args.indexOf('--group') + 1]
    : undefined;

  console.info('\n=== STAG PIPELINE INSPECTION ===');
  console.info(`Budget: £1200/day | Platform filter: ${googleOnly ? 'Google only' : 'All'}`);
  if (groupFilter) console.info(`Group filter: "${groupFilter}"`);
  console.info('');

  const result = await runBiddingEngine({ mode: 'full', maxDailyBudget: 1200 });

  if (!result.groups || result.groups.length === 0) {
    console.info('No campaign groups generated. Check bidding engine logs above.');
    process.exit(0);
  }

  // Filter
  let groups = result.groups;
  if (googleOnly) {
    groups = groups.filter((g) => g.platform === 'GOOGLE_SEARCH');
  }
  if (groupFilter) {
    groups = groups.filter((g) =>
      g.campaignGroup?.toLowerCase().includes(groupFilter.toLowerCase())
    );
  }

  console.info(`\n${'='.repeat(100)}`);
  console.info(`CAMPAIGN GROUPS: ${groups.length} campaigns`);
  console.info(`${'='.repeat(100)}\n`);

  // Summary table first
  console.info('SUMMARY:');
  console.info(
    `${'Campaign Group'.padEnd(35)} ${'Platform'.padEnd(10)} ${'Site'.padEnd(30)} ${'KWs'.padStart(6)} ${'AGs'.padStart(5)} ${'Budget'.padStart(10)} ${'ROAS'.padStart(6)}`
  );
  console.info('-'.repeat(105));

  for (const g of groups) {
    const roas =
      g.totalExpectedDailyCost > 0 ? g.totalExpectedDailyRevenue / g.totalExpectedDailyCost : 0;
    const platform = g.platform === 'GOOGLE_SEARCH' ? 'Google' : 'Meta';
    const site = (g.micrositeDomain || g.siteName || '').substring(0, 29);
    console.info(
      `${(g.campaignGroup || 'General').padEnd(35)} ${platform.padEnd(10)} ${site.padEnd(30)} ${String(g.candidates.length).padStart(6)} ${String(g.adGroups.length).padStart(5)} ${('£' + g.totalExpectedDailyCost.toFixed(2)).padStart(10)} ${(roas.toFixed(1) + 'x').padStart(6)}`
    );
  }

  // Detailed drill-down
  console.info(`\n\n${'='.repeat(100)}`);
  console.info('DETAILED STAG DRILL-DOWN');
  console.info(`${'='.repeat(100)}`);

  for (const g of groups) {
    const roas =
      g.totalExpectedDailyCost > 0 ? g.totalExpectedDailyRevenue / g.totalExpectedDailyCost : 0;
    const platform = g.platform === 'GOOGLE_SEARCH' ? 'Google' : 'Meta';

    console.info(`\n${'─'.repeat(100)}`);
    console.info(`CAMPAIGN: ${g.campaignGroup || 'General'} (${platform})`);
    console.info(`  Site: ${g.micrositeDomain || g.siteName}`);
    console.info(`  Microsite: ${g.isMicrosite ? 'Yes' : 'No'}`);
    console.info(`  Keywords: ${g.candidates.length} | Ad Groups: ${g.adGroups.length}`);
    console.info(
      `  Budget: £${g.totalExpectedDailyCost.toFixed(2)}/day | Revenue: £${g.totalExpectedDailyRevenue.toFixed(2)}/day | ROAS: ${roas.toFixed(1)}x`
    );
    console.info(
      `  Max Bid: £${g.maxBid.toFixed(2)} | Avg Score: ${g.avgProfitabilityScore.toFixed(0)}`
    );
    console.info(`  Primary KW: ${g.primaryKeyword}`);
    console.info(`  Primary URL: ${g.primaryTargetUrl}`);

    for (let agIdx = 0; agIdx < g.adGroups.length; agIdx++) {
      const ag = g.adGroups[agIdx]!;
      console.info(`\n  ┌─ AD GROUP ${agIdx + 1}: ${ag.primaryKeyword}`);
      console.info(`  │  Landing Page: ${ag.targetUrl}`);
      console.info(`  │  LP Type: ${ag.landingPageType || 'unknown'}`);
      console.info(`  │  Max Bid: £${ag.maxBid.toFixed(2)}`);
      console.info(`  │  Keywords (${ag.keywords.length}):`);

      for (const kw of ag.keywords) {
        const finalUrl = ag.keywordFinalUrls?.[kw];
        if (finalUrl) {
          console.info(`  │    • "${kw}" → ${finalUrl}`);
        } else {
          console.info(`  │    • "${kw}" → (uses ad group URL)`);
        }
      }

      if (ag.keywordFinalUrls && Object.keys(ag.keywordFinalUrls).length > 0) {
        console.info(
          `  │  [${Object.keys(ag.keywordFinalUrls).length} keywords with custom final URLs]`
        );
      }
      console.info(`  └─`);
    }
  }

  // Landing page type breakdown
  console.info(`\n\n${'='.repeat(100)}`);
  console.info('LANDING PAGE TYPE BREAKDOWN');
  console.info(`${'='.repeat(100)}`);

  const lpTypeCounts: Record<string, number> = {};
  for (const g of groups) {
    for (const ag of g.adGroups) {
      const t = ag.landingPageType || 'unknown';
      lpTypeCounts[t] = (lpTypeCounts[t] || 0) + 1;
    }
  }
  for (const [type, count] of Object.entries(lpTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.info(`  ${type}: ${count} ad groups`);
  }

  // Campaign group → domain mapping
  console.info(`\n${'='.repeat(100)}`);
  console.info('CAMPAIGN GROUP → DOMAIN ROUTING');
  console.info(`${'='.repeat(100)}`);

  const groupDomains: Record<string, Set<string>> = {};
  for (const g of groups) {
    const key = g.campaignGroup || 'General';
    if (!groupDomains[key]) groupDomains[key] = new Set();
    groupDomains[key]!.add(g.micrositeDomain || g.siteName || 'unknown');
  }
  for (const [group, domains] of Object.entries(groupDomains)) {
    console.info(`  ${group}: ${Array.from(domains).join(', ')}`);
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
