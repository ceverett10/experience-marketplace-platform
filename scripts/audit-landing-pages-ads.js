/**
 * Audit landing pages, keywords, and ad campaigns.
 * Shows coverage gaps between destination pages and active ads.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // 1. Landing pages by site
  const pages = await p.$queryRaw`
    SELECT s.name as site_name, s.id as site_id,
      COUNT(*)::int as total,
      SUM(CASE WHEN p.status = 'PUBLISHED' THEN 1 ELSE 0 END)::int as published,
      SUM(CASE WHEN p.status = 'DRAFT' THEN 1 ELSE 0 END)::int as draft
    FROM "Page" p
    JOIN "Site" s ON p."siteId" = s.id
    WHERE p.type = 'LANDING'
    GROUP BY s.name, s.id
    ORDER BY total DESC
  `;
  console.info('=== LANDING PAGES BY SITE ===');
  let totalPages = 0;
  let totalPublished = 0;
  for (const r of pages) {
    console.info(
      '  ' +
        r.site_name +
        ': ' +
        r.total +
        ' total (' +
        r.published +
        ' published, ' +
        r.draft +
        ' draft)'
    );
    totalPages += r.total;
    totalPublished += r.published;
  }
  console.info('TOTAL: ' + totalPages + ' landing pages (' + totalPublished + ' published)');

  // 2. PAID_CANDIDATE keywords
  const kwCount = await p.sEOOpportunity.count({ where: { status: 'PAID_CANDIDATE' } });
  console.info('\n=== PAID_CANDIDATE Keywords: ' + kwCount + ' ===');

  // 3. Ad campaigns by platform and status (parents only)
  const campaigns = await p.$queryRaw`
    SELECT platform, status, COUNT(*)::int as count
    FROM "AdCampaign"
    WHERE "parentCampaignId" IS NULL
    GROUP BY platform, status
    ORDER BY platform, status
  `;
  console.info('\n=== AD CAMPAIGNS (parents only) ===');
  for (const c of campaigns) {
    console.info('  ' + c.platform + ' / ' + c.status + ': ' + c.count);
  }

  // 4. Ad campaigns with landing page types
  const lpTypes = await p.$queryRaw`
    SELECT "landingPageType", platform, COUNT(*)::int as count
    FROM "AdCampaign"
    WHERE status IN ('ACTIVE', 'DRAFT')
    GROUP BY "landingPageType", platform
    ORDER BY count DESC
  `;
  console.info('\n=== ACTIVE/DRAFT CAMPAIGNS BY LANDING PAGE TYPE ===');
  for (const r of lpTypes) {
    console.info('  ' + (r.landingPageType || 'NULL') + ' (' + r.platform + '): ' + r.count);
  }

  // 5. Google campaigns - the 10 restructured ones
  const googleCampaigns = await p.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      status: { in: ['ACTIVE', 'PAUSED'] },
      parentCampaignId: null,
    },
    select: {
      name: true,
      status: true,
      platformCampaignId: true,
      keywords: true,
      landingPageType: true,
      landingPagePath: true,
    },
    orderBy: { name: 'asc' },
  });
  console.info('\n=== GOOGLE CAMPAIGNS ===');
  for (const c of googleCampaigns) {
    const kwArr = Array.isArray(c.keywords) ? c.keywords : [];
    console.info(
      '  [' +
        c.status +
        '] ' +
        c.name +
        ' — ' +
        kwArr.length +
        ' keywords, LP: ' +
        (c.landingPageType || 'N/A') +
        ' ' +
        (c.landingPagePath || '')
    );
  }

  // 6. Meta consolidated campaigns and their children
  const metaParents = await p.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      status: { in: ['ACTIVE', 'PAUSED'] },
      parentCampaignId: null,
    },
    select: {
      id: true,
      name: true,
      status: true,
      platformCampaignId: true,
    },
    orderBy: { name: 'asc' },
  });
  console.info('\n=== META CONSOLIDATED CAMPAIGNS ===');
  for (const parent of metaParents) {
    const children = await p.adCampaign.count({
      where: { parentCampaignId: parent.id, status: { in: ['ACTIVE', 'DRAFT'] } },
    });
    console.info('  [' + parent.status + '] ' + parent.name + ' — ' + children + ' child ad sets');
  }

  // 7. Sample destination landing pages with their ad coverage
  const destPages = await p.$queryRaw`
    SELECT p.title, p.slug, p.status, s.name as site_name,
      (SELECT COUNT(*)::int FROM "AdCampaign" ac
       WHERE ac."landingPagePath" LIKE '%' || p.slug || '%'
       AND ac.status IN ('ACTIVE', 'DRAFT')) as ad_count
    FROM "Page" p
    JOIN "Site" s ON p."siteId" = s.id
    WHERE p.type = 'LANDING' AND p.status = 'PUBLISHED'
    ORDER BY p."createdAt" DESC
    LIMIT 30
  `;
  console.info('\n=== RECENT PUBLISHED DESTINATION PAGES (with ad count) ===');
  let withAds = 0;
  let withoutAds = 0;
  for (const r of destPages) {
    const marker = r.ad_count > 0 ? 'HAS ADS' : 'NO ADS';
    if (r.ad_count > 0) withAds++;
    else withoutAds++;
    console.info(
      '  [' +
        marker +
        '] ' +
        r.site_name +
        ' — ' +
        r.title +
        ' (/' +
        r.slug +
        ') — ' +
        r.ad_count +
        ' campaigns'
    );
  }
  console.info('Sample: ' + withAds + ' with ads, ' + withoutAds + ' without ads');

  // 8. Total destination pages with vs without ads
  const coverage = await p.$queryRaw`
    SELECT
      COUNT(*)::int as total_published,
      SUM(CASE WHEN (
        SELECT COUNT(*) FROM "AdCampaign" ac
        WHERE ac."landingPagePath" LIKE '%' || p.slug || '%'
        AND ac.status IN ('ACTIVE', 'DRAFT')
      ) > 0 THEN 1 ELSE 0 END)::int as with_ads,
      SUM(CASE WHEN (
        SELECT COUNT(*) FROM "AdCampaign" ac
        WHERE ac."landingPagePath" LIKE '%' || p.slug || '%'
        AND ac.status IN ('ACTIVE', 'DRAFT')
      ) = 0 THEN 1 ELSE 0 END)::int as without_ads
    FROM "Page" p
    WHERE p.type = 'LANDING' AND p.status = 'PUBLISHED'
  `;
  console.info('\n=== OVERALL AD COVERAGE FOR DESTINATION PAGES ===');
  for (const r of coverage) {
    console.info(
      'Total published: ' +
        r.total_published +
        ', With ads: ' +
        r.with_ads +
        ', Without ads: ' +
        r.without_ads
    );
  }

  // 9. Bidding engine last run
  const lastRun = await p.$queryRaw`
    SELECT "createdAt", status, "proposalData"
    FROM "AdCampaign"
    WHERE "parentCampaignId" IS NULL
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  if (lastRun.length > 0) {
    console.info('\n=== LAST CAMPAIGN CREATED ===');
    console.info('  Date: ' + lastRun[0].createdAt);
    console.info('  Status: ' + lastRun[0].status);
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
