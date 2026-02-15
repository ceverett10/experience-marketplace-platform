/**
 * Analyze PAID_CANDIDATE keywords stored in the database.
 * Run: heroku run 'cd /app && node packages/jobs/dist/scripts/analyze-keywords.js'
 */
import { prisma } from '@experience-marketplace/database';

async function main() {
  // 1. Total count
  const total = await prisma.sEOOpportunity.count({ where: { status: 'PAID_CANDIDATE' } });

  // 2. Volume distribution
  const highVol = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', searchVolume: { gte: 1000 } },
  });
  const medVol = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', searchVolume: { gte: 100, lt: 1000 } },
  });
  const lowVol = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', searchVolume: { gte: 10, lt: 100 } },
  });

  // 3. CPC distribution
  const cpcUnder1 = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', cpc: { lt: 1 } },
  });
  const cpc1to3 = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', cpc: { gte: 1, lt: 3 } },
  });
  const cpc3to5 = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', cpc: { gte: 3, lt: 5 } },
  });
  const cpc5to10 = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', cpc: { gte: 5, lt: 10 } },
  });

  // 4. Averages
  const agg = await prisma.sEOOpportunity.aggregate({
    where: { status: 'PAID_CANDIDATE' },
    _avg: { cpc: true, searchVolume: true, priorityScore: true },
  });

  // 5. High priority count
  const highPriority = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', priorityScore: { gte: 70 } },
  });

  // 6. Top 20 by priority score
  const topScore = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE' },
    orderBy: { priorityScore: 'desc' },
    take: 20,
    select: { keyword: true, searchVolume: true, cpc: true, priorityScore: true, difficulty: true },
  });

  // 7. Top 20 by volume
  const topVol = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE' },
    orderBy: { searchVolume: 'desc' },
    take: 20,
    select: { keyword: true, searchVolume: true, cpc: true, priorityScore: true },
  });

  // 8. Sample booking-intent keywords (CPC > $1, vol > 100)
  const bookingIntent = await prisma.sEOOpportunity.findMany({
    where: {
      status: 'PAID_CANDIDATE',
      cpc: { gte: 1 },
      searchVolume: { gte: 100 },
    },
    orderBy: { priorityScore: 'desc' },
    take: 30,
    select: { keyword: true, searchVolume: true, cpc: true, priorityScore: true },
  });

  // 9. Count enriched suppliers
  const enrichedSuppliers = await prisma.supplier.count({
    where: { keywordsEnrichedAt: { not: null } },
  });
  const totalSuppliers = await prisma.supplier.count({
    where: { microsite: { status: 'ACTIVE' } },
  });

  // 10. Category breakdown of keywords
  const sampleKeywords = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE', searchVolume: { gte: 10 } },
    select: { keyword: true },
  });

  // Categorize keywords
  const categories: Record<string, number> = {};
  for (const k of sampleKeywords) {
    const kw = k.keyword.toLowerCase();
    if (kw.startsWith('things to do') || kw.startsWith('what to do') || kw.startsWith('best tours')) {
      categories['Discovery (things to do, best tours)'] = (categories['Discovery (things to do, best tours)'] || 0) + 1;
    } else if (kw.includes('tour') || kw.includes('walking')) {
      categories['Tours (walking, city, etc.)'] = (categories['Tours (walking, city, etc.)'] || 0) + 1;
    } else if (kw.includes('food') || kw.includes('cooking') || kw.includes('wine') || kw.includes('tasting')) {
      categories['Food & Drink'] = (categories['Food & Drink'] || 0) + 1;
    } else if (kw.includes('activities') || kw.includes('experiences') || kw.includes('excursion')) {
      categories['Activities/Experiences'] = (categories['Activities/Experiences'] || 0) + 1;
    } else if (kw.includes('museum') || kw.includes('gallery') || kw.includes('cultural') || kw.includes('historical')) {
      categories['Culture & Museums'] = (categories['Culture & Museums'] || 0) + 1;
    } else if (kw.includes('boat') || kw.includes('kayak') || kw.includes('snorkel') || kw.includes('diving') || kw.includes('sailing')) {
      categories['Water Activities'] = (categories['Water Activities'] || 0) + 1;
    } else if (kw.includes('safari') || kw.includes('hiking') || kw.includes('nature') || kw.includes('wildlife')) {
      categories['Nature & Adventure'] = (categories['Nature & Adventure'] || 0) + 1;
    } else {
      categories['Other'] = (categories['Other'] || 0) + 1;
    }
  }

  // Print results
  console.log('=== PAID_CANDIDATE KEYWORD POOL ANALYSIS ===\n');
  console.log(`Total PAID_CANDIDATE keywords: ${total}`);
  console.log(`Enriched suppliers: ${enrichedSuppliers} / ${totalSuppliers} (${Math.round(enrichedSuppliers/totalSuppliers*100)}%)\n`);

  console.log('--- Volume Distribution ---');
  console.log(`  High volume (1000+):  ${highVol} (${Math.round(highVol/total*100)}%)`);
  console.log(`  Medium volume (100-999): ${medVol} (${Math.round(medVol/total*100)}%)`);
  console.log(`  Low volume (10-99):   ${lowVol} (${Math.round(lowVol/total*100)}%)`);

  console.log('\n--- CPC Distribution ---');
  console.log(`  Under $1:  ${cpcUnder1} (${Math.round(cpcUnder1/total*100)}%)`);
  console.log(`  $1-3:      ${cpc1to3} (${Math.round(cpc1to3/total*100)}%)`);
  console.log(`  $3-5:      ${cpc3to5} (${Math.round(cpc3to5/total*100)}%)`);
  console.log(`  $5-10:     ${cpc5to10} (${Math.round(cpc5to10/total*100)}%)`);

  console.log('\n--- Averages ---');
  console.log(`  Avg CPC: $${Number(agg._avg.cpc || 0).toFixed(2)}`);
  console.log(`  Avg Volume: ${Math.round(Number(agg._avg.searchVolume || 0))}`);
  console.log(`  Avg Priority Score: ${Math.round(Number(agg._avg.priorityScore || 0))}`);
  console.log(`  High priority (score >= 70): ${highPriority} (${Math.round(highPriority/total*100)}%)`);

  console.log('\n--- Keyword Categories ---');
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log('\n--- Top 20 by Priority Score ---');
  for (const k of topScore) {
    console.log(`  [${k.priorityScore}] ${k.keyword}  (vol=${k.searchVolume}, cpc=$${Number(k.cpc).toFixed(2)}, diff=${k.difficulty})`);
  }

  console.log('\n--- Top 20 by Search Volume ---');
  for (const k of topVol) {
    console.log(`  [vol=${k.searchVolume}] ${k.keyword}  (cpc=$${Number(k.cpc).toFixed(2)}, score=${k.priorityScore})`);
  }

  console.log('\n--- Top 30 Booking-Intent Keywords (CPC > $1, Vol > 100) ---');
  for (const k of bookingIntent) {
    console.log(`  [${k.priorityScore}] ${k.keyword}  (vol=${k.searchVolume}, cpc=$${Number(k.cpc).toFixed(2)})`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
