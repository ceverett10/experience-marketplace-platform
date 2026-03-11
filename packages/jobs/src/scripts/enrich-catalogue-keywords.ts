/**
 * Enrich catalogue keywords with real search volume and CPC data
 * from the Google Ads Keyword Planner API (free).
 *
 * Usage:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/enrich-catalogue-keywords.js'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/enrich-catalogue-keywords.js --dry-run'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/enrich-catalogue-keywords.js --group "Food, Drink & Culinary"'
 */
import { prisma } from '@experience-marketplace/database';
import { getConfig, getKeywordHistoricalMetrics } from '../services/google-ads-client';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const groupFilter = args.includes('--group') ? args[args.indexOf('--group') + 1] : undefined;

  console.info('\n=== CATALOGUE KEYWORD ENRICHMENT (Google Ads Keyword Planner) ===');
  console.info(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (groupFilter) console.info(`Group filter: "${groupFilter}"`);

  const config = getConfig();
  if (!config) {
    console.error('Google Ads credentials not configured. Set GOOGLE_ADS_* env vars.');
    process.exit(1);
  }

  // Get campaign groups with unenriched catalogue keywords
  const groupWhere = {
    source: 'catalogue',
    searchVolume: 0,
    ...(groupFilter ? { campaignGroup: groupFilter } : {}),
  };

  const groups = await prisma.sEOOpportunity.groupBy({
    by: ['campaignGroup'],
    where: groupWhere,
    _count: true,
  });

  if (groups.length === 0) {
    console.info('\nNo unenriched catalogue keywords found.');
    await prisma.$disconnect();
    process.exit(0);
  }

  console.info(`\nCampaign groups to enrich:`);
  let totalKeywords = 0;
  for (const g of groups) {
    console.info(`  ${g.campaignGroup || '(ungrouped)'}: ${g._count} keywords`);
    totalKeywords += g._count;
  }
  console.info(`  Total: ${totalKeywords} keywords`);

  if (dryRun) {
    console.info('\n[DRY RUN] Would enrich these keywords via Keyword Planner API.');
    console.info(`[DRY RUN] Estimated API calls: ${Math.ceil(totalKeywords / 10000)}`);
    await prisma.$disconnect();
    process.exit(0);
  }

  let totalEnriched = 0;
  let totalZeroVolume = 0;
  let totalApiCalls = 0;
  const groupResults: Array<{
    group: string;
    total: number;
    enriched: number;
    zeroVolume: number;
  }> = [];

  for (const g of groups) {
    const groupName = g.campaignGroup || '(ungrouped)';
    console.info(`\n--- Enriching: ${groupName} (${g._count} keywords) ---`);

    // Fetch unique keywords for this group
    const records = await prisma.sEOOpportunity.findMany({
      where: {
        ...groupWhere,
        campaignGroup: g.campaignGroup,
      },
      select: { keyword: true },
      distinct: ['keyword'],
    });

    const uniqueKeywords = records.map((r) => r.keyword);
    console.info(`  Unique keywords: ${uniqueKeywords.length}`);

    // Call Keyword Planner API
    const metrics = await getKeywordHistoricalMetrics(config, uniqueKeywords);
    totalApiCalls += Math.ceil(uniqueKeywords.length / 10000);

    // Build lookup map — use highTopOfPageBidMicros as CPC estimate
    const metricsMap = new Map<string, { volume: number; cpcMicros: number }>();
    for (const m of metrics) {
      metricsMap.set(m.keyword.toLowerCase(), {
        volume: m.avgMonthlySearches,
        cpcMicros: m.highTopOfPageBidMicros,
      });
    }

    let groupEnriched = 0;
    let groupZero = 0;

    // Update records with real data
    for (const kw of uniqueKeywords) {
      const m = metricsMap.get(kw.toLowerCase());
      const volume = m?.volume ?? 0;
      const cpcMicros = m?.cpcMicros ?? 0;
      const cpc = cpcMicros / 1_000_000;

      if (volume > 0 && cpc > 0) {
        await prisma.sEOOpportunity.updateMany({
          where: { keyword: kw, source: 'catalogue' },
          data: { searchVolume: volume, cpc },
        });
        groupEnriched++;
      } else {
        groupZero++;
      }
    }

    console.info(`  Enriched: ${groupEnriched} | Zero volume/CPC: ${groupZero}`);
    totalEnriched += groupEnriched;
    totalZeroVolume += groupZero;
    groupResults.push({
      group: groupName,
      total: uniqueKeywords.length,
      enriched: groupEnriched,
      zeroVolume: groupZero,
    });
  }

  // Clean up keywords that still have zero volume after enrichment
  // Only delete within the groups we just enriched (respect --group filter)
  const cleanupWhere = {
    source: 'catalogue' as const,
    searchVolume: 0,
    campaignGroup: { in: groups.map((g) => g.campaignGroup).filter(Boolean) as string[] },
  };
  console.info('\n--- Cleanup: removing zero-volume catalogue keywords ---');
  const deleted = await prisma.sEOOpportunity.deleteMany({ where: cleanupWhere });
  console.info(`  Deleted: ${deleted.count} dead keywords`);

  // Summary
  console.info('\n=== ENRICHMENT SUMMARY ===');
  console.info(`API calls made: ${totalApiCalls}`);
  console.info(
    `${'Campaign Group'.padEnd(35)} ${'Total'.padStart(8)} ${'Enriched'.padStart(10)} ${'Zero Vol'.padStart(10)}`
  );
  console.info('-'.repeat(65));
  for (const r of groupResults) {
    console.info(
      `${r.group.padEnd(35)} ${String(r.total).padStart(8)} ${String(r.enriched).padStart(10)} ${String(r.zeroVolume).padStart(10)}`
    );
  }
  console.info('-'.repeat(65));
  console.info(
    `${'TOTAL'.padEnd(35)} ${String(totalEnriched + totalZeroVolume).padStart(8)} ${String(totalEnriched).padStart(10)} ${String(totalZeroVolume).padStart(10)}`
  );
  console.info(`\nDeleted ${deleted.count} zero-volume keywords from DB.`);
  console.info(
    `Remaining catalogue keywords with data: ${totalEnriched} unique keywords (×3 patterns each)`
  );

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
