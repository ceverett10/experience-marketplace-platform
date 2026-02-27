/**
 * Domain Gap Analysis Script
 *
 * Analyses PAID_CANDIDATE keywords grouped by destination + campaign group to identify:
 * 1. Which campaign groups have the highest unserved search volume
 * 2. Which destinations lack branded site coverage
 * 3. Estimated monthly value per gap (volume × CPC × CVR × AOV × commission)
 *
 * Cross-references against existing Site domains to show coverage vs gaps.
 *
 * Usage:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/domain-gap-analysis.js'
 *   npx tsx packages/jobs/src/scripts/domain-gap-analysis.ts
 *   npx tsx packages/jobs/src/scripts/domain-gap-analysis.ts --json   # JSON output
 */
import { prisma } from '@experience-marketplace/database';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';

// ---------------------------------------------------------------------------
// Campaign group → purchased domain mapping (Phase 2 of main-site-ppc-strategy)
// ---------------------------------------------------------------------------
const CAMPAIGN_GROUP_DOMAINS: Record<string, string[]> = {
  'Food, Drink & Culinary': ['food-tour-guide.com'],
  'Boats, Sailing & Water': ['water-tours.com'],
  'Adventure & Outdoor': ['outdoorexploring.com'],
  'Cultural & Sightseeing': ['cultural-tours.com'],
  'General Tours – Tier 1': ['experiencess.com'],
  'General Tours – Tier 2': ['experiencess.com'],
  'Branded – Attraction Tickets': ['attractionbooking.com'],
  'Branded – Harry Potter Tours': ['harry-potter-tours.com'],
  'Branded – London Food Tours': ['london-food-tours.com'],
  'Transfers & Transport': [], // No domain purchased yet
};

const { defaults } = PAID_TRAFFIC_CONFIG;

// ---------------------------------------------------------------------------
// Keyword → campaign group classification (mirrors bidding-engine.ts)
// ---------------------------------------------------------------------------
function classifyKeyword(keyword: string): string {
  const kw = keyword.toLowerCase();
  for (const [group, patterns] of Object.entries(
    PAID_TRAFFIC_CONFIG.metaConsolidated.categoryPatterns
  )) {
    if ((patterns as string[]).some((p) => kw.includes(p))) return group;
  }
  return 'General Tours';
}

// ---------------------------------------------------------------------------
// Extract destination city from a keyword (heuristic)
// Looks for "in {city}" or "{city} tours" patterns.
// ---------------------------------------------------------------------------
function extractDestination(keyword: string, location: string | null): string {
  // Use the DB location field if present
  if (location) return location;

  const kw = keyword.toLowerCase();

  // "things to do in london" → "london"
  const inMatch = kw.match(/\b(?:in|near|around)\s+([a-z\s]+?)(?:\s+\d|\s*$)/);
  if (inMatch?.[1]) return titleCase(inMatch[1].trim());

  // "london food tours" → "london" (city before category keyword)
  const cityPatterns = PAID_TRAFFIC_CONFIG.metaConsolidated.categoryPatterns;
  for (const patterns of Object.values(cityPatterns)) {
    for (const pattern of patterns as string[]) {
      const idx = kw.indexOf(pattern);
      if (idx > 0) {
        const before = kw.substring(0, idx).trim();
        if (before.length > 2 && before.length < 30) return titleCase(before);
      }
    }
  }

  return 'Global';
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GapEntry {
  campaignGroup: string;
  destination: string;
  keywordCount: number;
  totalSearchVolume: number;
  avgCpc: number;
  maxCpc: number;
  estimatedMonthlyClicks: number;
  estimatedMonthlyValue: number;
  coveredByDomains: string[];
  topKeywords: string[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const jsonOutput = process.argv.includes('--json');

  // 1. Fetch all PAID_CANDIDATE opportunities
  const opportunities = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE', searchVolume: { gte: 10 } },
    select: {
      keyword: true,
      searchVolume: true,
      cpc: true,
      location: true,
      priorityScore: true,
    },
    orderBy: { searchVolume: 'desc' },
  });

  // 2. Fetch existing sites with their domains
  const sites = await prisma.site.findMany({
    where: { status: { in: ['ACTIVE', 'REVIEW'] }, primaryDomain: { not: null } },
    select: { name: true, primaryDomain: true, seoConfig: true },
  });
  const existingDomains = sites.map((s) => s.primaryDomain).filter(Boolean) as string[];

  // 3. Group opportunities by campaign group + destination
  const gapMap = new Map<string, GapEntry>();

  for (const opp of opportunities) {
    const group = classifyKeyword(opp.keyword);
    const destination = extractDestination(opp.keyword, opp.location);
    const key = `${group}||${destination}`;
    const cpc = Number(opp.cpc);

    let entry = gapMap.get(key);
    if (!entry) {
      // Check which domains cover this campaign group
      const assignedDomains = CAMPAIGN_GROUP_DOMAINS[group] ?? [];
      const coveredByDomains = assignedDomains.filter((d) => existingDomains.includes(d));

      entry = {
        campaignGroup: group,
        destination,
        keywordCount: 0,
        totalSearchVolume: 0,
        avgCpc: 0,
        maxCpc: 0,
        estimatedMonthlyClicks: 0,
        estimatedMonthlyValue: 0,
        coveredByDomains,
        topKeywords: [],
      };
      gapMap.set(key, entry);
    }

    entry.keywordCount++;
    entry.totalSearchVolume += opp.searchVolume;
    entry.avgCpc = (entry.avgCpc * (entry.keywordCount - 1) + cpc) / entry.keywordCount;
    entry.maxCpc = Math.max(entry.maxCpc, cpc);

    if (entry.topKeywords.length < 5) {
      entry.topKeywords.push(`${opp.keyword} (vol=${opp.searchVolume}, cpc=£${cpc.toFixed(2)})`);
    }
  }

  // 4. Calculate estimated value for each gap
  for (const entry of gapMap.values()) {
    // Estimate clicks: ~3% CTR on paid search (conservative for position 2-3)
    const ctr = 0.03;
    entry.estimatedMonthlyClicks = Math.round(entry.totalSearchVolume * ctr);

    // Value = clicks × CVR × AOV × commissionRate
    const revenuePerClick = defaults.cvr * defaults.aov * (defaults.commissionRate / 100);
    entry.estimatedMonthlyValue =
      Math.round(entry.estimatedMonthlyClicks * revenuePerClick * 100) / 100;
  }

  // 5. Sort by estimated monthly value descending
  const gaps = Array.from(gapMap.values()).sort(
    (a, b) => b.estimatedMonthlyValue - a.estimatedMonthlyValue
  );

  // 6. Aggregate by campaign group
  const groupSummary = new Map<
    string,
    {
      totalVolume: number;
      totalValue: number;
      keywordCount: number;
      destinations: number;
      coveredDomains: string[];
      uncoveredDestinations: number;
    }
  >();

  for (const gap of gaps) {
    const existing = groupSummary.get(gap.campaignGroup);
    if (!existing) {
      groupSummary.set(gap.campaignGroup, {
        totalVolume: gap.totalSearchVolume,
        totalValue: gap.estimatedMonthlyValue,
        keywordCount: gap.keywordCount,
        destinations: 1,
        coveredDomains: gap.coveredByDomains,
        uncoveredDestinations: gap.coveredByDomains.length === 0 ? 1 : 0,
      });
    } else {
      existing.totalVolume += gap.totalSearchVolume;
      existing.totalValue += gap.estimatedMonthlyValue;
      existing.keywordCount += gap.keywordCount;
      existing.destinations++;
      if (gap.coveredByDomains.length === 0) existing.uncoveredDestinations++;
    }
  }

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  if (jsonOutput) {
    const output = {
      generatedAt: new Date().toISOString(),
      totalOpportunities: opportunities.length,
      existingSites: sites.map((s) => ({ name: s.name, domain: s.primaryDomain })),
      campaignGroupSummary: Array.from(groupSummary.entries()).map(([group, data]) => ({
        campaignGroup: group,
        ...data,
      })),
      topGaps: gaps.slice(0, 50),
    };
    console.info(JSON.stringify(output, null, 2));
    return;
  }

  // Human-readable output
  console.info('='.repeat(80));
  console.info('DOMAIN GAP ANALYSIS — Paid Traffic Opportunities');
  console.info('='.repeat(80));
  console.info(`\nDate: ${new Date().toISOString().split('T')[0]}`);
  console.info(`Total PAID_CANDIDATE keywords (vol >= 10): ${opportunities.length}`);
  console.info(`Existing branded sites: ${existingDomains.length}`);
  console.info(`Unique campaign group × destination combos: ${gaps.length}`);

  // Campaign group summary
  console.info('\n' + '='.repeat(80));
  console.info('CAMPAIGN GROUP SUMMARY');
  console.info('='.repeat(80));

  const sortedGroups = Array.from(groupSummary.entries()).sort(
    (a, b) => b[1].totalValue - a[1].totalValue
  );

  for (const [group, data] of sortedGroups) {
    const domains = (CAMPAIGN_GROUP_DOMAINS[group] ?? []).join(', ') || 'NONE';
    const coverage =
      data.coveredDomains.length > 0 ? `COVERED (${data.coveredDomains.join(', ')})` : 'NO DOMAIN';

    console.info(`\n--- ${group} ---`);
    console.info(`  Domain(s): ${domains} [${coverage}]`);
    console.info(`  Keywords: ${data.keywordCount}`);
    console.info(`  Total monthly volume: ${data.totalVolume.toLocaleString()}`);
    console.info(`  Estimated monthly value: £${data.totalValue.toFixed(2)}`);
    console.info(`  Destinations: ${data.destinations} (${data.uncoveredDestinations} uncovered)`);
  }

  // Existing site coverage
  console.info('\n' + '='.repeat(80));
  console.info('EXISTING BRANDED SITES');
  console.info('='.repeat(80));

  for (const site of sites) {
    console.info(`  ${site.primaryDomain} — ${site.name}`);
  }

  // Top 30 gaps by value
  console.info('\n' + '='.repeat(80));
  console.info('TOP 30 GAPS BY ESTIMATED MONTHLY VALUE');
  console.info('='.repeat(80));

  for (const [i, gap] of gaps.slice(0, 30).entries()) {
    const coverage =
      gap.coveredByDomains.length > 0 ? `COVERED: ${gap.coveredByDomains.join(', ')}` : 'NO DOMAIN';

    console.info(`\n${i + 1}. ${gap.campaignGroup} — ${gap.destination} [${coverage}]`);
    console.info(
      `   ${gap.keywordCount} keywords | ` +
        `Volume: ${gap.totalSearchVolume.toLocaleString()}/mo | ` +
        `Avg CPC: £${gap.avgCpc.toFixed(2)} | ` +
        `Est. value: £${gap.estimatedMonthlyValue.toFixed(2)}/mo`
    );
    console.info(`   Top keywords: ${gap.topKeywords.slice(0, 3).join(', ')}`);
  }

  // Uncovered campaign groups
  const uncoveredGroups = sortedGroups.filter(
    ([group]) => (CAMPAIGN_GROUP_DOMAINS[group] ?? []).length === 0
  );

  if (uncoveredGroups.length > 0) {
    console.info('\n' + '='.repeat(80));
    console.info('UNCOVERED CAMPAIGN GROUPS (No Purchased Domain)');
    console.info('='.repeat(80));

    for (const [group, data] of uncoveredGroups) {
      console.info(
        `  ${group}: ${data.keywordCount} keywords, ` +
          `${data.totalVolume.toLocaleString()} vol/mo, ` +
          `£${data.totalValue.toFixed(2)}/mo est. value`
      );
    }
  }

  // Recommendations
  console.info('\n' + '='.repeat(80));
  console.info('RECOMMENDATIONS');
  console.info('='.repeat(80));

  // Find the top destination per campaign group that has a domain
  const coveredGroups = sortedGroups.filter(
    ([group]) => (CAMPAIGN_GROUP_DOMAINS[group] ?? []).length > 0
  );

  for (const [group] of coveredGroups.slice(0, 6)) {
    const groupGaps = gaps
      .filter((g) => g.campaignGroup === group)
      .sort((a, b) => b.totalSearchVolume - a.totalSearchVolume);
    const topDests = groupGaps.slice(0, 5).map((g) => g.destination);
    const domain = (CAMPAIGN_GROUP_DOMAINS[group] ?? [])[0] ?? '?';

    console.info(`\n  ${domain} (${group}):`);
    console.info(`    Priority destination pages: ${topDests.join(', ')}`);
    console.info(
      `    Total opportunity: ${groupGaps.reduce((s, g) => s + g.totalSearchVolume, 0).toLocaleString()} vol/mo`
    );
  }

  console.info('\n' + '='.repeat(80));
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
