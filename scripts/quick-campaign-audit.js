const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const googleActive = await p.adCampaign.count({
    where: { platform: 'GOOGLE_SEARCH', status: 'ACTIVE', parentCampaignId: null },
  });
  const googleDraft = await p.adCampaign.count({
    where: { platform: 'GOOGLE_SEARCH', status: 'DRAFT', parentCampaignId: null },
  });
  const googleCompleted = await p.adCampaign.count({
    where: { platform: 'GOOGLE_SEARCH', status: 'COMPLETED', parentCampaignId: null },
  });
  const metaActive = await p.adCampaign.count({
    where: { platform: 'FACEBOOK', status: 'ACTIVE', parentCampaignId: null },
  });
  const metaDraft = await p.adCampaign.count({
    where: { platform: 'FACEBOOK', status: 'DRAFT', parentCampaignId: null },
  });
  const metaCompleted = await p.adCampaign.count({
    where: { platform: 'FACEBOOK', status: 'COMPLETED', parentCampaignId: null },
  });
  const metaChildren = await p.adCampaign.count({
    where: { platform: 'FACEBOOK', parentCampaignId: { not: null } },
  });

  console.info(
    'GOOGLE: active=' + googleActive + ' draft=' + googleDraft + ' completed=' + googleCompleted
  );
  console.info(
    'META: active=' +
      metaActive +
      ' draft=' +
      metaDraft +
      ' completed=' +
      metaCompleted +
      ' children=' +
      metaChildren
  );

  // Google campaigns detail
  const gc = await p.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      status: { in: ['ACTIVE', 'PAUSED'] },
      parentCampaignId: null,
    },
    select: {
      name: true,
      status: true,
      keywords: true,
      landingPageType: true,
      landingPagePath: true,
      audiences: true,
    },
    orderBy: { name: 'asc' },
  });
  console.info('\n=== GOOGLE CAMPAIGNS ===');
  for (const c of gc) {
    const kws = Array.isArray(c.keywords) ? c.keywords : [];
    const aud = c.audiences || {};
    const adGroups = aud.adGroups || [];
    console.info(
      '[' +
        c.status +
        '] ' +
        c.name +
        ' | kw:' +
        kws.length +
        ' adGroups:' +
        adGroups.length +
        ' LP:' +
        (c.landingPageType || 'N/A')
    );
    for (const ag of adGroups.slice(0, 5)) {
      console.info(
        '  AG: ' + (ag.primaryKeyword || '?') + ' -> ' + (ag.targetUrl || ag.landingPagePath || '?')
      );
    }
    if (adGroups.length > 5) console.info('  ... +' + (adGroups.length - 5) + ' more ad groups');
  }

  // Meta campaigns detail
  const mc = await p.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      status: { in: ['ACTIVE', 'PAUSED'] },
      parentCampaignId: null,
    },
    select: { id: true, name: true, status: true },
    orderBy: { name: 'asc' },
  });
  console.info('\n=== META CAMPAIGNS ===');
  for (const parent of mc) {
    const kids = await p.adCampaign.findMany({
      where: { parentCampaignId: parent.id },
      select: { name: true, status: true, landingPagePath: true, landingPageType: true },
      orderBy: { name: 'asc' },
    });
    console.info('[' + parent.status + '] ' + parent.name + ' | ' + kids.length + ' children');
    for (const k of kids.slice(0, 3)) {
      console.info(
        '  [' +
          k.status +
          '] ' +
          k.name +
          ' -> ' +
          (k.landingPagePath || 'N/A') +
          ' (' +
          (k.landingPageType || 'N/A') +
          ')'
      );
    }
    if (kids.length > 3) console.info('  ... +' + (kids.length - 3) + ' more');
  }

  // Keywords with siteId assigned
  const kwWithSite = await p.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', siteId: { not: null } },
  });
  const kwNoSite = await p.sEOOpportunity.count({
    where: { status: 'PAID_CANDIDATE', siteId: null },
  });
  console.info('\n=== KEYWORD ASSIGNMENT ===');
  console.info('With site: ' + kwWithSite + ', No site: ' + kwNoSite);

  // Sample landing page slugs
  const sampleLP = await p.page.findMany({
    where: { type: 'LANDING', status: 'PUBLISHED' },
    select: { title: true, slug: true, site: { select: { name: true } } },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });
  console.info('\n=== SAMPLE DESTINATION PAGES ===');
  for (const pg of sampleLP) {
    console.info('  ' + (pg.site ? pg.site.name : 'no-site') + ' | ' + pg.title + ' | /' + pg.slug);
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
