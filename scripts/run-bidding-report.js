/**
 * Run bidding engine in report_only mode to see what it would propose.
 * Usage: node scripts/run-bidding-report.js
 */
const path = require('path');

// The compiled bidding engine
const { runBiddingEngine } = require(
  path.join(__dirname, '..', 'packages', 'jobs', 'dist', 'services', 'bidding-engine')
);

async function main() {
  const budget = parseInt(process.env.BIDDING_MAX_DAILY_BUDGET || '200', 10);
  console.info('=== BIDDING ENGINE REPORT (budget: ' + budget + '/day) ===');

  const result = await runBiddingEngine({ mode: 'report_only', maxDailyBudget: budget });

  console.info('\n--- SUMMARY ---');
  console.info('Sites analyzed: ' + result.sitesAnalyzed);
  console.info('Candidates selected: ' + result.candidates.length);
  console.info('Campaign groups: ' + result.groups.length);
  console.info(
    'Budget: ' +
      result.budgetAllocated.toFixed(2) +
      ' allocated / ' +
      result.budgetRemaining.toFixed(2) +
      ' remaining'
  );

  // Top profitable sites
  const topP = result.profiles
    .filter((p) => p.maxProfitableCpc > 0.01)
    .sort((a, b) => b.maxProfitableCpc - a.maxProfitableCpc)
    .slice(0, 10);
  console.info('\n--- TOP PROFITABLE SITES ---');
  for (const p of topP) {
    console.info(
      '  ' +
        p.siteName +
        ': maxCPC=' +
        p.maxProfitableCpc.toFixed(2) +
        ', AOV=' +
        p.avgOrderValue.toFixed(0) +
        ', CVR=' +
        (p.conversionRate * 100).toFixed(2) +
        '%'
    );
  }

  // Landing page type breakdown
  const lpTypes = {};
  for (const c of result.candidates) {
    const key = (c.landingPageType || 'UNKNOWN') + ' / ' + c.platform;
    lpTypes[key] = (lpTypes[key] || 0) + 1;
  }
  console.info('\n--- LANDING PAGE TYPES ---');
  for (const [k, v] of Object.entries(lpTypes).sort((a, b) => b[1] - a[1])) {
    console.info('  ' + k + ': ' + v);
  }

  // Top 20 candidates
  console.info('\n--- TOP 20 CANDIDATES ---');
  for (const c of result.candidates.slice(0, 20)) {
    const roas = c.expectedDailyCost > 0 ? c.expectedDailyRevenue / c.expectedDailyCost : 0;
    console.info(
      '  [' +
        c.profitabilityScore +
        '] ' +
        c.keyword +
        ' (' +
        c.platform +
        ')\n    -> ' +
        c.targetUrl +
        '\n    LP: ' +
        (c.landingPageType || 'N/A') +
        ', CPC: ' +
        c.estimatedCpc.toFixed(2) +
        ', ROAS: ' +
        roas.toFixed(1) +
        'x'
    );
  }

  // Destination page candidates
  const destCandidates = result.candidates.filter((c) => c.landingPageType === 'DESTINATION');
  console.info('\n--- DESTINATION PAGE CANDIDATES: ' + destCandidates.length + ' ---');
  for (const c of destCandidates.slice(0, 20)) {
    console.info('  ' + c.keyword + ' (' + c.platform + ') -> ' + c.targetUrl);
  }

  // Campaign groups summary
  if (result.groups.length > 0) {
    console.info('\n--- CAMPAIGN GROUPS (top 20) ---');
    for (const g of result.groups.slice(0, 20)) {
      const roas =
        g.totalExpectedDailyCost > 0 ? g.totalExpectedDailyRevenue / g.totalExpectedDailyCost : 0;
      console.info(
        '  ' +
          (g.micrositeDomain || g.siteName || 'unknown').substring(0, 40) +
          ' (' +
          g.platform +
          '): ' +
          g.candidates.length +
          ' kw, ' +
          g.adGroups.length +
          ' ad groups, budget=' +
          g.totalExpectedDailyCost.toFixed(2) +
          '/day, ROAS ' +
          roas.toFixed(1) +
          'x'
      );
    }
  }

  // Overall ROAS
  const totalCost = result.candidates.reduce((s, c) => s + c.expectedDailyCost, 0);
  const totalRev = result.candidates.reduce((s, c) => s + c.expectedDailyRevenue, 0);
  const overallRoas = totalCost > 0 ? totalRev / totalCost : 0;
  console.info('\n--- OVERALL PROJECTIONS ---');
  console.info('Daily spend: ' + totalCost.toFixed(2));
  console.info('Daily revenue: ' + totalRev.toFixed(2));
  console.info('Overall ROAS: ' + overallRoas.toFixed(1) + 'x');
  console.info(
    'Monthly: spend ' + (totalCost * 30).toFixed(0) + ', revenue ' + (totalRev * 30).toFixed(0)
  );

  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
