/**
 * Reassign misassigned SEO opportunity keywords to the correct branded site.
 *
 * Keywords like "safari tanzania" or "auschwitz tours" were incorrectly assigned
 * to london-food-tours.com (the first active site) because assignKeywordsToSites()
 * used sites[0] as a blind default. This script uses campaign group classification
 * to route each keyword to the correct branded domain's site.
 *
 * Usage:
 *   node scripts/reassign-keyword-sites.js             # dry-run
 *   node scripts/reassign-keyword-sites.js --apply      # execute
 *
 * On Heroku:
 *   heroku run "node scripts/reassign-keyword-sites.js --apply" --app holibob-experiences-demand-gen
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Copied from packages/jobs/src/config/paid-traffic.ts — must stay in sync
const CATEGORY_PATTERNS = {
  'Branded – Harry Potter Tours': ['harry potter'],
  'Branded – London Food Tours': ['london food tour'],
  'Adventure & Outdoor': [
    'adventure',
    'hiking',
    'safari',
    'trek',
    'outdoor',
    'climb',
    'expedition',
    'wildlife',
  ],
  'Food, Drink & Culinary': [
    'food tour',
    'culinary',
    'wine tast',
    'cooking class',
    'gastro',
    'street food',
  ],
  'Boats, Sailing & Water': [
    'boat',
    'sailing',
    'yacht',
    'cruise',
    'diving',
    'snorkel',
    'kayak',
    'surf',
    'water sport',
  ],
  'Transfers & Transport': [
    'transfer',
    'airport',
    'taxi',
    'shuttle',
    'limo',
    'chauffeur',
    'private car',
  ],
  'Cultural & Sightseeing': [
    'museum',
    'gallery',
    'history',
    'cultural',
    'sightseeing',
    'monument',
    'heritage',
    'walking tour',
  ],
};

const CAMPAIGN_GROUP_DOMAINS = {
  'Food, Drink & Culinary': ['food-tour-guide.com'],
  'Boats, Sailing & Water': ['water-tours.com'],
  'Adventure & Outdoor': ['outdoorexploring.com'],
  'Cultural & Sightseeing': ['cultural-tours.com'],
  'General Tours – Tier 1': ['experiencess.com'],
  'General Tours – Tier 2': ['experiencess.com'],
  'Branded – Attraction Tickets': ['attractionbooking.com'],
  'Branded – Harry Potter Tours': ['harry-potter-tours.com'],
  'Branded – London Food Tours': ['london-food-tours.com'],
  'Transfers & Transport': [],
};

function classifyKeyword(keyword) {
  const kw = keyword.toLowerCase();
  for (const [group, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some((p) => kw.includes(p))) return group;
  }
  // Default: General Tours Tier 1 (→ experiencess.com)
  return 'General Tours – Tier 1';
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.info('=== Reassign Misassigned Keyword Sites ===');
  console.info('Mode:', apply ? 'APPLY' : 'DRY RUN');
  console.info('');

  // Load all PAID_CANDIDATE keywords with their current site
  const keywords = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE', siteId: { not: null } },
    select: {
      id: true,
      keyword: true,
      siteId: true,
      site: { select: { primaryDomain: true, name: true } },
    },
  });
  console.info('Total PAID_CANDIDATE keywords with siteId:', keywords.length);

  // Build domain → siteId from Domain table
  const allBrandedDomains = [...new Set(Object.values(CAMPAIGN_GROUP_DOMAINS).flat())].filter(
    Boolean
  );
  const domainRecords = await prisma.domain.findMany({
    where: { domain: { in: allBrandedDomains }, status: 'ACTIVE' },
    select: { domain: true, siteId: true },
  });
  const domainToSiteId = new Map();
  for (const dr of domainRecords) {
    if (dr.siteId) domainToSiteId.set(dr.domain, dr.siteId);
  }

  // Also check primaryDomain on sites
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, primaryDomain: true, name: true },
  });
  for (const site of sites) {
    if (site.primaryDomain && !domainToSiteId.has(site.primaryDomain)) {
      domainToSiteId.set(site.primaryDomain, site.id);
    }
  }

  console.info('Branded domain mappings:');
  for (const [d, sid] of domainToSiteId) {
    const site = sites.find((s) => s.id === sid);
    console.info('  ' + d + ' → ' + (site ? site.name : sid));
  }
  console.info('');

  // Build campaignGroup → siteId
  const groupToSiteId = new Map();
  for (const [group, domains] of Object.entries(CAMPAIGN_GROUP_DOMAINS)) {
    for (const d of domains) {
      const sid = domainToSiteId.get(d);
      if (sid) {
        groupToSiteId.set(group, sid);
        break;
      }
    }
  }

  // Find misassigned keywords
  const misassigned = [];
  const stats = {};
  const fromStats = {};

  for (const kw of keywords) {
    const group = classifyKeyword(kw.keyword);
    const expectedDomains = CAMPAIGN_GROUP_DOMAINS[group] || [];
    const currentDomain = kw.site?.primaryDomain;

    if (expectedDomains.length === 0) continue; // No expected domain (e.g., Transfers)
    if (!currentDomain) continue;
    if (expectedDomains.includes(currentDomain)) continue; // Already correct

    const correctSiteId = groupToSiteId.get(group);
    if (!correctSiteId || correctSiteId === kw.siteId) continue;

    misassigned.push({
      id: kw.id,
      keyword: kw.keyword,
      from: currentDomain,
      fromName: kw.site?.name,
      to: expectedDomains[0],
      correctSiteId,
      group,
    });
    stats[group] = (stats[group] || 0) + 1;
    fromStats[currentDomain] = (fromStats[currentDomain] || 0) + 1;
  }

  console.info('Misassigned keywords:', misassigned.length, 'out of', keywords.length, 'total');
  console.info('');
  console.info('By campaign group:');
  for (const [group, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.info('  ' + group + ': ' + count);
  }
  console.info('');
  console.info('By source domain (moving FROM):');
  for (const [domain, count] of Object.entries(fromStats).sort((a, b) => b[1] - a[1])) {
    console.info('  ' + domain + ': ' + count);
  }
  console.info('');

  // Print sample
  console.info('Sample (first 30):');
  for (const m of misassigned.slice(0, 30)) {
    console.info('  "' + m.keyword + '": ' + m.from + ' → ' + m.to + ' (' + m.group + ')');
  }
  console.info('');

  if (!apply) {
    console.info('--- DRY RUN — no changes made ---');
    console.info('Run with --apply to reassign', misassigned.length, 'keywords');
    await prisma.$disconnect();
    return;
  }

  // Batch update in chunks of 100
  let updated = 0;
  for (let i = 0; i < misassigned.length; i += 100) {
    const batch = misassigned.slice(i, i + 100);
    await Promise.all(
      batch.map((m) =>
        prisma.sEOOpportunity
          .update({ where: { id: m.id }, data: { siteId: m.correctSiteId } })
          .catch((err) => console.info('Error updating ' + m.keyword + ': ' + err.message))
      )
    );
    updated += batch.length;
    if (updated % 500 === 0) {
      console.info('Updated', updated, '/', misassigned.length);
    }
  }

  console.info('');
  console.info('=== DONE ===');
  console.info('Reassigned:', updated, 'keywords');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
