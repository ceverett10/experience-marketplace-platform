/**
 * Check keyword-to-site assignment status.
 * Run: heroku run 'cd /app && node packages/jobs/dist/scripts/check-assignment.js'
 */
import { prisma } from '@experience-marketplace/database';

async function main() {
  const total = await prisma.sEOOpportunity.count({ where: { status: 'PAID_CANDIDATE' } });
  const assigned = await prisma.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', siteId: { not: null } },
  });
  const unassigned = total - assigned;

  console.log(`\n=== KEYWORD ASSIGNMENT STATUS ===`);
  console.log(`Total PAID_CANDIDATE: ${total}`);
  console.log(`Assigned to sites: ${assigned} (${Math.round(assigned / total * 100)}%)`);
  console.log(`Unassigned: ${unassigned} (${Math.round(unassigned / total * 100)}%)`);

  // Show which sites have keywords
  const bySite = await prisma.sEOOpportunity.groupBy({
    by: ['siteId'],
    where: { status: 'PAID_CANDIDATE', siteId: { not: null } },
    _count: true,
    orderBy: { _count: { siteId: 'desc' } },
  });

  console.log(`\nKeywords per site:`);
  for (const entry of bySite.slice(0, 15)) {
    const site = await prisma.site.findUnique({
      where: { id: entry.siteId! },
      select: { name: true },
    });
    console.log(`  ${site?.name || '?'}: ${entry._count} keywords`);
  }

  // Show active sites
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, homepageConfig: true },
  });
  console.log(`\nActive sites: ${sites.length}`);
  for (const s of sites) {
    const config = s.homepageConfig as any;
    const dests = config?.destinations?.length || 0;
    const cats = config?.categories?.length || 0;
    const terms = config?.popularExperiences?.searchTerms?.length || 0;
    console.log(`  ${s.name}: ${dests} destinations, ${cats} categories, ${terms} search terms`);
  }

  // Sample unassigned keywords
  const unassignedSample = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE', siteId: null },
    take: 20,
    orderBy: { searchVolume: 'desc' },
    select: { keyword: true, searchVolume: true, cpc: true },
  });
  console.log(`\nTop 20 unassigned keywords by volume:`);
  for (const k of unassignedSample) {
    console.log(`  vol=${k.searchVolume} cpc=$${Number(k.cpc).toFixed(2)} | ${k.keyword}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
