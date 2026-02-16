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
  console.log(
    `Profiles with positive maxCPC: ${result.profiles.filter((p) => p.maxProfitableCpc > 0.01).length}`
  );

  // Show top 10 most profitable sites
  const topSites = result.profiles
    .filter((p) => p.maxProfitableCpc > 0.01)
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
      console.log(
        '  → Keywords not assigned to any site. The bidding engine needs siteId to match.'
      );
    }

    // Check profile maxCPC vs keyword CPC
    const avgMaxCpc =
      result.profiles.length > 0
        ? result.profiles.reduce((s, p) => s + p.maxProfitableCpc, 0) / result.profiles.length
        : 0;
    const topKeywords = await prisma.sEOOpportunity.findMany({
      where: { status: 'PAID_CANDIDATE', siteId: { not: null } },
      take: 10,
      orderBy: { priorityScore: 'desc' },
      select: { keyword: true, cpc: true },
    });
    console.log(`  Avg maxCPC across profiles: £${avgMaxCpc.toFixed(4)}`);
    console.log(
      `  Top keyword CPCs: ${topKeywords.map((k) => `${k.keyword}=$${Number(k.cpc).toFixed(2)}`).join(', ')}`
    );

    if (avgMaxCpc < 0.1 && topKeywords.length > 0) {
      console.log(
        '  → MaxCPC is very low — sites need more booking data for accurate profitability.'
      );
    }
  } else {
    // Show top 20 selected campaigns with ROAS
    console.log('\nTop 20 selected campaigns by profitability:');
    const top20 = result.candidates.slice(0, 20);
    for (const c of top20) {
      const expectedRoas =
        c.expectedDailyCost > 0 ? c.expectedDailyRevenue / c.expectedDailyCost : 0;
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
    const profitableCampaigns = result.candidates.filter(
      (c) => c.expectedDailyRevenue / c.expectedDailyCost >= 3
    );
    const breakEvenCampaigns = result.candidates.filter((c) => {
      const r = c.expectedDailyRevenue / c.expectedDailyCost;
      return r >= 1 && r < 3;
    });

    // Microsite routing breakdown
    const micrositeCampaigns = result.candidates.filter((c) => c.isMicrosite);
    const mainSiteCampaigns = result.candidates.filter((c) => !c.isMicrosite);
    const uniqueMicrosites = new Set(micrositeCampaigns.map((c) => c.micrositeDomain));
    const uniqueKeywords = new Set(result.candidates.map((c) => c.keyword));

    // CPC distribution of selected campaigns
    const cpcBuckets = { under025: 0, to050: 0, to100: 0, over100: 0 };
    for (const c of result.candidates) {
      if (c.estimatedCpc < 0.25) cpcBuckets.under025++;
      else if (c.estimatedCpc < 0.5) cpcBuckets.to050++;
      else if (c.estimatedCpc < 1.0) cpcBuckets.to100++;
      else cpcBuckets.over100++;
    }

    console.log('\n=== ROAS SUMMARY ===');
    console.log(
      `Total campaigns: ${result.candidates.length} (${uniqueKeywords.size} unique keywords × 2 platforms)`
    );
    console.log(`  Profitable (ROAS >= 3x): ${profitableCampaigns.length}`);
    console.log(`  Break-even (1-3x): ${breakEvenCampaigns.length}`);
    console.log(`Total daily spend: £${totalDailyCost.toFixed(2)}`);
    console.log(`Total daily revenue: £${totalDailyRevenue.toFixed(2)}`);
    console.log(`Overall ROAS: ${overallRoas.toFixed(1)}x`);
    console.log(
      `Monthly projection: spend £${(totalDailyCost * 30).toFixed(0)}, revenue £${(totalDailyRevenue * 30).toFixed(0)}`
    );
    console.log(`Monthly profit: £${((totalDailyRevenue - totalDailyCost) * 30).toFixed(0)}`);

    console.log('\n=== LANDING PAGE ROUTING ===');
    console.log(
      `Microsite campaigns: ${micrositeCampaigns.length} (${uniqueMicrosites.size} unique microsites)`
    );
    console.log(`Main site campaigns: ${mainSiteCampaigns.length}`);
    if (uniqueMicrosites.size > 0) {
      // Group by microsite
      const bySite = new Map<string, number>();
      for (const c of micrositeCampaigns) {
        bySite.set(c.micrositeDomain!, (bySite.get(c.micrositeDomain!) || 0) + 1);
      }
      const sorted = [...bySite.entries()].sort((a, b) => b[1] - a[1]);
      console.log('Top microsites by campaign count:');
      for (const [domain, count] of sorted.slice(0, 15)) {
        console.log(`  ${domain}: ${count} campaigns`);
      }
    }

    console.log('\n=== CPC DISTRIBUTION (selected campaigns) ===');
    console.log(`  Under £0.25: ${cpcBuckets.under025}`);
    console.log(`  £0.25-0.50:  ${cpcBuckets.to050}`);
    console.log(`  £0.50-1.00:  ${cpcBuckets.to100}`);
    console.log(`  Over £1.00:  ${cpcBuckets.over100}`);

    // ROAS by platform
    const googleCampaigns = result.candidates.filter((c) => c.platform === 'GOOGLE_SEARCH');
    const fbCampaigns = result.candidates.filter((c) => c.platform === 'FACEBOOK');
    const gCost = googleCampaigns.reduce((s, c) => s + c.expectedDailyCost, 0);
    const gRev = googleCampaigns.reduce((s, c) => s + c.expectedDailyRevenue, 0);
    const fCost = fbCampaigns.reduce((s, c) => s + c.expectedDailyCost, 0);
    const fRev = fbCampaigns.reduce((s, c) => s + c.expectedDailyRevenue, 0);
    console.log('\n=== BY PLATFORM ===');
    console.log(
      `Google Search: ${googleCampaigns.length} campaigns, £${gCost.toFixed(2)}/day spend, £${gRev.toFixed(2)}/day revenue, ${gCost > 0 ? (gRev / gCost).toFixed(1) : 0}x ROAS`
    );
    console.log(
      `Facebook:      ${fbCampaigns.length} campaigns, £${fCost.toFixed(2)}/day spend, £${fRev.toFixed(2)}/day revenue, ${fCost > 0 ? (fRev / fCost).toFixed(1) : 0}x ROAS`
    );
  }

  // ─── Campaign Groups (per-microsite) ──────────────────────────────────
  if (result.groups && result.groups.length > 0) {
    console.log('\n=== CAMPAIGN GROUPS (per-microsite) ===');
    console.log(`Total groups: ${result.groups.length} (campaigns to create)`);
    const msGroups = result.groups.filter((g) => g.isMicrosite);
    const mainGroups = result.groups.filter((g) => !g.isMicrosite);
    console.log(`  Microsite campaigns: ${msGroups.length}`);
    console.log(`  Main site campaigns: ${mainGroups.length}`);

    const subThreshold = result.groups.filter((g) => g.totalExpectedDailyCost < 1.0);
    console.log(`  Sub-£1 natural budget (will be floored to £1): ${subThreshold.length}`);

    const totalNatural = result.groups.reduce((s, g) => s + g.totalExpectedDailyCost, 0);
    const totalFloored = result.groups.reduce(
      (s, g) => s + Math.max(g.totalExpectedDailyCost, 1.0),
      0
    );
    console.log(`  Total natural budget: £${totalNatural.toFixed(2)}/day`);
    console.log(`  Total with £1 floor: £${totalFloored.toFixed(2)}/day`);

    // Keywords per group distribution
    const groupSizes = result.groups.map((g) => g.candidates.length);
    const avgSize = groupSizes.reduce((a, b) => a + b, 0) / groupSizes.length;
    const maxSize = Math.max(...groupSizes);
    const singleKw = groupSizes.filter((s) => s === 1).length;
    console.log(
      `\n  Keywords per group: avg=${avgSize.toFixed(1)}, max=${maxSize}, single-kw=${singleKw}`
    );

    // Ad groups per campaign distribution
    const agCounts = result.groups.map((g) => g.adGroups.length);
    const avgAg = agCounts.reduce((a, b) => a + b, 0) / agCounts.length;
    console.log(`  Ad groups per campaign: avg=${avgAg.toFixed(1)}, max=${Math.max(...agCounts)}`);

    console.log('\nTop 20 groups by profitability:');
    for (const g of result.groups.slice(0, 20)) {
      const roas =
        g.totalExpectedDailyCost > 0 ? g.totalExpectedDailyRevenue / g.totalExpectedDailyCost : 0;
      const budgetLabel =
        g.totalExpectedDailyCost < 1.0
          ? `£${g.totalExpectedDailyCost.toFixed(2)}->£1.00`
          : `£${g.totalExpectedDailyCost.toFixed(2)}`;
      console.log(
        `  ${(g.micrositeDomain || g.siteName).substring(0, 45)} (${g.platform === 'GOOGLE_SEARCH' ? 'Google' : 'Meta'}): ` +
          `${g.candidates.length} kw, ${g.adGroups.length} ag, ` +
          `budget=${budgetLabel}/day, ROAS ${roas.toFixed(1)}x`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
