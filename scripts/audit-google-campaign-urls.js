/**
 * Audit Google Ads campaigns for domain mismatches.
 *
 * Checks every ACTIVE/PAUSED Google campaign's targetUrl domain against
 * the keyword's campaign group expected domain. Outputs a CSV report
 * showing what needs to change.
 *
 * Usage:
 *   node scripts/audit-google-campaign-urls.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- Campaign group classification (mirrors paid-traffic.ts) ---
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
  return 'General Tours – Tier 1';
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function main() {
  // Load all Google campaigns (ACTIVE or PAUSED — these are live or recently live)
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      status: { in: ['ACTIVE', 'PAUSED'] },
      platformCampaignId: { not: null },
    },
    select: {
      id: true,
      name: true,
      status: true,
      keywords: true,
      targetUrl: true,
      audiences: true,
      platformCampaignId: true,
      totalSpend: true,
      totalClicks: true,
      totalImpressions: true,
      conversions: true,
      siteId: true,
      site: { select: { name: true, primaryDomain: true } },
      campaignGroup: true,
    },
  });

  console.info(`Total Google campaigns (ACTIVE/PAUSED): ${campaigns.length}`);

  // Build domain → site lookup
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, primaryDomain: true, name: true },
  });
  const siteById = new Map(sites.map((s) => [s.id, s]));

  // Analyze each campaign
  const mismatched = [];
  const correct = [];

  for (const c of campaigns) {
    const primaryKeyword = c.keywords[0] || c.name;
    const allKeywords = c.keywords.join(', ');
    const group = classifyKeyword(primaryKeyword);
    const expectedDomains = CAMPAIGN_GROUP_DOMAINS[group] || [];
    const currentDomain = getDomainFromUrl(c.targetUrl);

    // Check ad group URLs too
    const adGroups = c.audiences?.adGroups || [];
    const adGroupUrls = adGroups.map((ag) => ({
      keyword: ag.primaryKeyword || ag.keywords?.[0],
      url: ag.targetUrl,
      domain: getDomainFromUrl(ag.targetUrl),
    }));

    const isCorrect =
      expectedDomains.length === 0 || // No expected domain (Transfers)
      expectedDomains.includes(currentDomain);

    const record = {
      campaignId: c.id,
      platformCampaignId: c.platformCampaignId,
      campaignName: c.name,
      status: c.status,
      keywords: allKeywords,
      primaryKeyword,
      campaignGroup: group,
      currentDomain,
      currentUrl: c.targetUrl,
      expectedDomain: expectedDomains[0] || '(any)',
      siteName: c.site?.name || '',
      spend: parseFloat(c.totalSpend || 0).toFixed(2),
      clicks: c.totalClicks,
      impressions: c.totalImpressions,
      conversions: c.conversions,
      adGroupCount: adGroups.length,
    };

    if (!isCorrect) {
      // Build the new URL by replacing the domain
      const newDomain = expectedDomains[0];
      let newUrl = c.targetUrl;
      if (newDomain && currentDomain) {
        try {
          const parsed = new URL(c.targetUrl);
          parsed.hostname = newDomain;
          newUrl = parsed.toString();
        } catch {
          newUrl = c.targetUrl.replace(currentDomain, newDomain);
        }
      }
      record.newUrl = newUrl;
      record.newDomain = newDomain;

      // Also compute new ad group URLs
      record.adGroupChanges = adGroups.map((ag) => {
        const agDomain = getDomainFromUrl(ag.targetUrl);
        let agNewUrl = ag.targetUrl;
        if (newDomain && agDomain && agDomain !== newDomain) {
          try {
            const parsed = new URL(ag.targetUrl);
            parsed.hostname = newDomain;
            agNewUrl = parsed.toString();
          } catch {
            agNewUrl = ag.targetUrl;
          }
        }
        return {
          keyword: ag.primaryKeyword || ag.keywords?.[0],
          currentUrl: ag.targetUrl,
          newUrl: agNewUrl,
          changed: agNewUrl !== ag.targetUrl,
        };
      });

      mismatched.push(record);
    } else {
      correct.push(record);
    }
  }

  // Summary
  console.info('');
  console.info('=== SUMMARY ===');
  console.info(`Correctly routed: ${correct.length}`);
  console.info(`Mismatched (need URL change): ${mismatched.length}`);
  console.info('');

  // Group mismatched by current domain → expected domain
  const routingChanges = {};
  for (const m of mismatched) {
    const key = `${m.currentDomain} → ${m.newDomain}`;
    if (!routingChanges[key]) routingChanges[key] = 0;
    routingChanges[key]++;
  }
  console.info('Domain routing changes needed:');
  for (const [route, count] of Object.entries(routingChanges).sort((a, b) => b[1] - a[1])) {
    console.info(`  ${route}: ${count} campaigns`);
  }
  console.info('');

  // Group by campaign group
  const byGroup = {};
  for (const m of mismatched) {
    if (!byGroup[m.campaignGroup]) byGroup[m.campaignGroup] = 0;
    byGroup[m.campaignGroup]++;
  }
  console.info('By campaign group:');
  for (const [group, count] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
    console.info(`  ${group}: ${count}`);
  }
  console.info('');

  // CSV output
  console.info('=== CSV OUTPUT ===');
  console.info(
    'Status,Campaign Group,Primary Keyword,All Keywords,Current Domain,Current URL,New Domain,New URL,Campaign Name,Platform Campaign ID,Site Name,Spend,Clicks,Impressions,Conversions,Ad Groups'
  );
  for (const m of mismatched) {
    const escapeCsv = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    console.info(
      [
        m.status,
        escapeCsv(m.campaignGroup),
        escapeCsv(m.primaryKeyword),
        escapeCsv(m.keywords),
        m.currentDomain,
        escapeCsv(m.currentUrl),
        m.newDomain,
        escapeCsv(m.newUrl),
        escapeCsv(m.campaignName),
        m.platformCampaignId,
        escapeCsv(m.siteName),
        m.spend,
        m.clicks,
        m.impressions,
        m.conversions,
        m.adGroupCount,
      ].join(',')
    );
  }

  // Also show ad group detail for mismatched campaigns
  const hasAdGroupChanges = mismatched.filter((m) => m.adGroupChanges?.some((ag) => ag.changed));
  if (hasAdGroupChanges.length > 0) {
    console.info('');
    console.info('=== AD GROUP URL CHANGES ===');
    console.info('Campaign,Ad Group Keyword,Current Ad Group URL,New Ad Group URL');
    for (const m of hasAdGroupChanges) {
      for (const ag of m.adGroupChanges.filter((a) => a.changed)) {
        const escapeCsv = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
        console.info(
          [
            escapeCsv(m.primaryKeyword),
            escapeCsv(ag.keyword),
            escapeCsv(ag.currentUrl),
            escapeCsv(ag.newUrl),
          ].join(',')
        );
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
