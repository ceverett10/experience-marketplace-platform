/**
 * Export Google Ads campaigns to CSV for Google Ads Editor bulk upload.
 * Run: node scripts/export-google-ads-csv.js
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

function genHeadlines(kw, siteName) {
  const t = kw.charAt(0).toUpperCase() + kw.slice(1);
  return [
    t.substring(0, 30),
    ('Book ' + t).substring(0, 30),
    (t + ' | ' + siteName).substring(0, 30),
    'Best Prices Guaranteed',
    'Instant Confirmation',
    'Book Online Today',
  ];
}

function genDescs(kw) {
  return [
    (
      'Discover and book amazing ' +
      kw +
      ' experiences. Best prices, instant confirmation.'
    ).substring(0, 90),
    ('Browse ' + kw + ' from top-rated local providers. Free cancellation available.').substring(
      0,
      90
    ),
  ];
}

function buildUrl(base, src, med, camp) {
  const u = new URL(base);
  if (src) u.searchParams.set('utm_source', src);
  if (med) u.searchParams.set('utm_medium', med);
  if (camp) u.searchParams.set('utm_campaign', camp);
  return u.toString();
}

function esc(v) {
  const s = v || '';
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function main() {
  const campaigns = await p.adCampaign.findMany({
    where: { platform: 'GOOGLE_SEARCH', status: { in: ['DRAFT', 'PAUSED'] } },
    include: {
      microsite: { select: { siteName: true } },
      site: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  console.error('Found ' + campaigns.length + ' Google Search campaigns');

  const cRows = [
    'Campaign,Campaign Status,Budget,Budget type,Bid Strategy Type,Ad Group,Ad Group Status,Max CPC,Ad Group Type',
  ];
  const kRows = ['Campaign,Ad Group,Keyword,Match Type,Status,Max CPC,Final URL'];
  const aRows = [
    'Campaign,Ad Group,Ad type,Status,Headline 1,Headline 2,Headline 3,Headline 4,Headline 5,Headline 6,Description 1,Description 2,Final URL,Path 1,Path 2',
  ];

  for (const c of campaigns) {
    const sn = c.microsite?.siteName || c.site?.name || 'Experiences';
    const rawAgs = c.audiences?.adGroups || [];
    const ags =
      rawAgs.length > 0
        ? rawAgs
        : [
            {
              primaryKeyword: c.keywords[0] || 'experiences',
              keywords: c.keywords,
              maxBid: Number(c.maxCpc) || 0.1,
              targetUrl: c.targetUrl || '',
            },
          ];
    const budget = Number(c.dailyBudget) || 1;

    for (const ag of ags) {
      const agn = ags.length === 1 ? c.name + ' - Ad Group' : c.name + ' - ' + ag.primaryKeyword;
      const url = buildUrl(
        ag.targetUrl || c.targetUrl || 'https://experiencess.com',
        c.utmSource,
        c.utmMedium,
        c.utmCampaign
      );

      // Campaign + Ad Group row
      cRows.push(
        [
          esc(c.name),
          'Paused',
          budget.toFixed(2),
          'Daily',
          'Manual CPC',
          esc(agn),
          'Enabled',
          ag.maxBid.toFixed(2),
          'Standard',
        ].join(',')
      );

      // Keywords — EXACT + PHRASE for each
      const kws = ag.keywords?.length > 0 ? ag.keywords : c.keywords;
      for (const kw of kws) {
        kRows.push(
          [
            esc(c.name),
            esc(agn),
            '[' + kw + ']',
            'Exact',
            'Enabled',
            ag.maxBid.toFixed(2),
            esc(url),
          ].join(',')
        );
        kRows.push(
          [
            esc(c.name),
            esc(agn),
            '"' + kw + '"',
            'Phrase',
            'Enabled',
            ag.maxBid.toFixed(2),
            esc(url),
          ].join(',')
        );
      }

      // Responsive Search Ad
      const hl = genHeadlines(ag.primaryKeyword, sn);
      const ds = genDescs(ag.primaryKeyword);
      const p2 = (ag.primaryKeyword.split(' ')[0] || '').substring(0, 15).toLowerCase();

      aRows.push(
        [
          esc(c.name),
          esc(agn),
          'Responsive search ad',
          'Enabled',
          ...hl.map((h) => esc(h)),
          esc(ds[0]),
          esc(ds[1]),
          esc(url),
          'experiences',
          esc(p2),
        ].join(',')
      );
    }
  }

  // Output all 3 CSVs separated by markers
  console.log('===CAMPAIGNS===');
  console.log(cRows.join('\n'));
  console.log('===KEYWORDS===');
  console.log(kRows.join('\n'));
  console.log('===ADS===');
  console.log(aRows.join('\n'));
  console.log('===END===');

  console.error('Campaigns: ' + (cRows.length - 1) + ' ad groups');
  console.error('Keywords: ' + (kRows.length - 1) + ' entries (exact + phrase)');
  console.error('Ads: ' + (aRows.length - 1) + ' responsive search ads');
}

main()
  .catch((e) => console.error(e))
  .finally(() => p.$disconnect());
