/**
 * Test the bidding engine with the enriched keyword pool.
 * Shows ROAS projections and campaign profitability.
 *
 * Usage: heroku run 'cd /app && node packages/jobs/dist/scripts/test-bidding-engine.js'
 */
import { runBiddingEngine } from '../services/bidding-engine';
import { prisma } from '@experience-marketplace/database';

async function main() {
  const budget = 1200;
  console.log(`\n=== BIDDING ENGINE ROAS ANALYSIS (£${budget}/day budget) ===\n`);

  const result = await runBiddingEngine({ mode: 'full', maxDailyBudget: budget });

  console.log('\n=== SITE PROFITABILITY ===');
  console.log(`Sites analyzed: ${result.sitesAnalyzed}`);
  console.log(`Profiles with positive maxCPC: ${result.profiles.filter(p => p.maxProfitableCpc > 0.01).length}`);

  // Show top 10 most profitable sites
  const topSites = result.profiles
    .filter(p => p.maxProfitableCpc > 0.01)
    .sort((a, b) => b.maxProfitableCpc - a.maxProfitableCpc)
    .slice(0, 10);

  console.log('\nTop 10 most profitable sites:');
  for (const s of topSites) {
    console.log(
      `  ${s.siteName}: maxCPC=£${s.maxProfitableCpc.toFixed(2)}, ` +
      `AOV=£${s.avgOrderValue.toFixed(2)}, commission=${s.avgCommissionRate.toFixed(1)}%, ` +
      `CVR=${(s.conversionRate * 100).toFixed(2)}%`
    );
  }

  console.log(`\n=== CAMPAIGN SELECTION ===`);
  console.log(`Total candidates scored: (check logs above)`);
  console.log(`Campaigns selected: ${result.candidates.length}`);
  console.log(`Budget allocated: £${result.budgetAllocated.toFixed(2)}/day`);
  console.log(`Budget remaining: £${result.budgetRemaining.toFixed(2)}/day`);

  if (result.candidates.length === 0) {
    console.log('\nNo campaigns selected — checking why...');

    // Debug: check keyword pool
    const paidCount = await prisma.sEOOpportunity.count({
      where: { status: 'PAID_CANDIDATE' },
    });
    const assignedCount = await prisma.sEOOpportunity.count({
      where: { status: 'PAID_CANDIDATE', siteId: { not: null } },
    });
    const unassignedCount = paidCount - assignedCount;

    console.log(`  PAID_CANDIDATE keywords: ${paidCount}`);
    console.log(`  Assigned to sites: ${assignedCount}`);
    console.log(`  Unassigned: ${unassignedCount}`);

    if (assignedCount === 0) {
      console.log('  → Keywords not assigned to any site. The bidding engine needs siteId to match.');
    }

    // Check profile maxCPC vs keyword CPC
    const avgMaxCpc = result.profiles.length > 0
      ? result.profiles.reduce((s, p) => s + p.maxProfitableCpc, 0) / result.profiles.length
      : 0;
    const topKeywords = await prisma.sEOOpportunity.findMany({
      where: { status: 'PAID_CANDIDATE', siteId: { not: null } },
      take: 10,
      orderBy: { priorityScore: 'desc' },
      select: { keyword: true, cpc: true },
    });
    console.log(`  Avg maxCPC across profiles: £${avgMaxCpc.toFixed(4)}`);
    console.log(`  Top keyword CPCs: ${topKeywords.map(k => `${k.keyword}=$${Number(k.cpc).toFixed(2)}`).join(', ')}`);

    if (avgMaxCpc < 0.10 && topKeywords.length > 0) {
      console.log('  → MaxCPC is very low — sites need more booking data for accurate profitability.');
    }
  } else {
    // Show top 20 selected campaigns with ROAS
    console.log('\nTop 20 selected campaigns by profitability:');
    const top20 = result.candidates.slice(0, 20);
    for (const c of top20) {
      const expectedRoas = c.expectedDailyCost > 0 ? c.expectedDailyRevenue / c.expectedDailyCost : 0;
      console.log(
        `  [score=${c.profitabilityScore}] ${c.keyword}` +
        `\n    Platform: ${c.platform}, CPC: £${c.estimatedCpc.toFixed(2)}, MaxBid: £${c.maxBid.toFixed(2)}` +
        `\n    Vol: ${c.searchVolume}/mo, Daily clicks: ${c.expectedClicksPerDay.toFixed(1)}` +
        `\n    Daily cost: £${c.expectedDailyCost.toFixed(2)}, Daily revenue: £${c.expectedDailyRevenue.toFixed(2)}` +
        `\n    Expected ROAS: ${expectedRoas.toFixed(1)}x ${expectedRoas >= 3 ? '✓ PROFITABLE' : expectedRoas >= 1 ? '⚠ BREAK-EVEN' : '✗ LOSS'}` +
        `\n    Landing: ${c.targetUrl}${c.isMicrosite ? ' (microsite)' : ''}`
      );
    }

    // Summary stats
    const totalDailyRevenue = result.candidates.reduce((s, c) => s + c.expectedDailyRevenue, 0);
    const totalDailyCost = result.candidates.reduce((s, c) => s + c.expectedDailyCost, 0);
    const overallRoas = totalDailyCost > 0 ? totalDailyRevenue / totalDailyCost : 0;
    const profitableCampaigns = result.candidates.filter(c => c.expectedDailyRevenue / c.expectedDailyCost >= 3);
    const breakEvenCampaigns = result.candidates.filter(c => {
      const r = c.expectedDailyRevenue / c.expectedDailyCost;
      return r >= 1 && r < 3;
    });

    console.log('\n=== ROAS SUMMARY ===');
    console.log(`Total campaigns: ${result.candidates.length}`);
    console.log(`  Profitable (ROAS >= 3x): ${profitableCampaigns.length}`);
    console.log(`  Break-even (1-3x): ${breakEvenCampaigns.length}`);
    console.log(`Total daily spend: £${totalDailyCost.toFixed(2)}`);
    console.log(`Total daily revenue: £${totalDailyRevenue.toFixed(2)}`);
    console.log(`Overall ROAS: ${overallRoas.toFixed(1)}x`);
    console.log(`Monthly projection: spend £${(totalDailyCost * 30).toFixed(0)}, revenue £${(totalDailyRevenue * 30).toFixed(0)}`);
    console.log(`Monthly profit: £${((totalDailyRevenue - totalDailyCost) * 30).toFixed(0)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
