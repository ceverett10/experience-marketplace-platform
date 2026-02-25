/**
 * Backfill Google Ads campaign assets (sitelinks, callouts, structured snippets).
 *
 * Adds assets to all existing ACTIVE Google campaigns that are missing them.
 * Assets improve ad quality score and optimization score.
 *
 * Modes:
 *   --audit    Show campaign counts and asset status (default)
 *   --backfill Add assets to campaigns missing them
 *   --dry-run  Show what would be done without making API calls
 *
 * Options:
 *   --limit=N  Process only the first N campaigns
 *
 * Usage:
 *   heroku run "npx tsx packages/jobs/src/scripts/backfill-google-ad-assets.ts --audit" \
 *     --app holibob-experiences-demand-gen
 *
 *   heroku run "npx tsx packages/jobs/src/scripts/backfill-google-ad-assets.ts --backfill --limit=5" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import {
  isGoogleAdsConfigured,
  createAndLinkSitelinks,
  createAndLinkCallouts,
  createAndLinkStructuredSnippets,
} from '../services/google-ads-client';
import { extractDestination, toTitleCase } from '../services/ad-creative-generator';

const prisma = new PrismaClient();

// --- Asset Content Generation ------------------------------------------------

function generateAssetsForCampaign(
  campaign: {
    keywords: string[];
    landingPagePath: string | null;
    site?: { name: string; primaryDomain: string | null } | null;
  },
  siteName: string
) {
  // landingPagePath is a path like "/destinations/london", not a full URL
  const domain = campaign.site?.primaryDomain
    ? `https://${campaign.site.primaryDomain}`
    : 'https://example.com';
  const landingUrl = campaign.landingPagePath
    ? `${domain}${campaign.landingPagePath}`
    : `${domain}/experiences`;

  const destination = extractDestination(campaign.keywords[0] || 'experiences');
  const titleDest = toTitleCase(destination);

  const sitelinks = [
    {
      linkText: 'All Experiences',
      description1: `Browse all ${siteName} tours`,
      description2: 'Instant confirmation available',
      finalUrl: `${domain}/experiences`,
    },
    {
      linkText: 'Book Now',
      description1: `Book ${titleDest} today`,
      description2: 'Secure your spot online',
      finalUrl: landingUrl || `${domain}/experiences`,
    },
    {
      linkText: `${titleDest} Tours`.substring(0, 25),
      description1: `Top-rated ${titleDest} tours`,
      description2: 'Compare prices and reviews',
      finalUrl: landingUrl || `${domain}/experiences`,
    },
    {
      linkText: 'About Us',
      description1: `Learn about ${siteName}`,
      description2: 'Trusted local providers',
      finalUrl: `${domain}/about`,
    },
  ];

  const callouts = [
    'Instant Confirmation',
    'Free Cancellation',
    'Best Price Guarantee',
    'Trusted Local Providers',
    '24/7 Support',
    'Secure Booking',
  ];

  // Extract activity types from keywords for structured snippets
  const activityTypes = new Set<string>();
  for (const kw of campaign.keywords) {
    const cleaned = kw.toLowerCase();
    const types = [
      'walking tours',
      'food tours',
      'boat tours',
      'bike tours',
      'wine tours',
      'day trips',
      'pub crawls',
      'museum tours',
      'city tours',
      'guided tours',
      'cooking classes',
      'water sports',
      'adventure tours',
      'cultural tours',
      'night tours',
      'bus tours',
      'helicopter tours',
      'snorkeling',
      'diving',
      'kayaking',
      'sailing',
      'hiking',
    ];
    for (const type of types) {
      if (cleaned.includes(type)) {
        activityTypes.add(toTitleCase(type));
      }
    }
  }

  let structuredSnippet: { header: 'Types' | 'Destinations'; values: string[] } | null = null;
  if (activityTypes.size >= 3) {
    structuredSnippet = {
      header: 'Types',
      values: [...activityTypes].slice(0, 10),
    };
  } else {
    const destinations = new Set<string>();
    for (const kw of campaign.keywords) {
      const dest = toTitleCase(extractDestination(kw));
      if (dest.length >= 3 && dest.length <= 25) {
        destinations.add(dest);
      }
    }
    if (destinations.size >= 3) {
      structuredSnippet = {
        header: 'Destinations',
        values: [...destinations].slice(0, 10),
      };
    }
  }

  return { sitelinks, callouts, structuredSnippet };
}

// --- Audit -------------------------------------------------------------------

async function audit() {
  console.info('\n=== Google Ads Campaign Assets Audit ===\n');

  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      platformCampaignId: { not: null },
    },
    include: { site: { select: { name: true, primaryDomain: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (campaigns.length === 0) {
    console.info('No deployed GOOGLE_SEARCH campaigns found.');
    return;
  }

  const byStatus: Record<string, number> = {};
  for (const c of campaigns) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  }

  console.info('Deployed Google campaigns by status:');
  for (const [status, count] of Object.entries(byStatus)) {
    console.info(`  ${status}: ${count}`);
  }
  console.info(`  TOTAL: ${campaigns.length}`);

  const active = campaigns.filter((c) => c.status === 'ACTIVE');
  const paused = campaigns.filter((c) => c.status === 'PAUSED');

  console.info(
    `\nCandidates for asset backfill: ${active.length} ACTIVE + ${paused.length} PAUSED = ${active.length + paused.length} campaigns`
  );
  console.info(
    `Estimated API calls: ~${(active.length + paused.length) * 6} (3 asset create + 3 campaign link per campaign)`
  );
  console.info(
    `Estimated time at 15 req/min: ~${Math.ceil(((active.length + paused.length) * 6) / 15)} minutes`
  );
}

// --- Backfill ----------------------------------------------------------------

async function backfill(limit: number, dryRun: boolean) {
  if (!isGoogleAdsConfigured()) {
    console.error('Google Ads not configured. Set GOOGLE_ADS_* env vars.');
    process.exit(1);
  }

  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      platformCampaignId: { not: null },
      status: { in: ['ACTIVE', 'PAUSED'] },
    },
    include: { site: { select: { name: true, primaryDomain: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  console.info(
    `\n=== Backfilling assets for ${campaigns.length} Google campaigns${dryRun ? ' (DRY RUN)' : ''} ===\n`
  );

  let processed = 0;
  let sitelinksTotal = 0;
  let calloutsTotal = 0;
  let snippetsTotal = 0;
  let errors = 0;

  for (const campaign of campaigns) {
    processed++;
    const googleId = campaign.platformCampaignId!;
    const siteName = campaign.site?.name || 'Holibob';

    const assets = generateAssetsForCampaign(
      {
        keywords: campaign.keywords,
        landingPagePath: campaign.landingPagePath,
        site: campaign.site,
      },
      siteName
    );

    if (dryRun) {
      console.info(
        `[${processed}/${campaigns.length}] DRY RUN: ${campaign.name.substring(0, 50)} (Google: ${googleId})`
      );
      console.info(
        `  Would add: ${assets.sitelinks.length} sitelinks, ${assets.callouts.length} callouts, snippet: ${assets.structuredSnippet ? `${assets.structuredSnippet.header} (${assets.structuredSnippet.values.length} values)` : 'none'}`
      );
      continue;
    }

    try {
      const sitelinks = await createAndLinkSitelinks(googleId, assets.sitelinks);
      sitelinksTotal += sitelinks;

      const callouts = await createAndLinkCallouts(googleId, assets.callouts);
      calloutsTotal += callouts;

      let snippetOk = false;
      if (assets.structuredSnippet) {
        snippetOk = await createAndLinkStructuredSnippets(googleId, assets.structuredSnippet);
        if (snippetOk) snippetsTotal++;
      }

      console.info(
        `[${processed}/${campaigns.length}] ${campaign.name.substring(0, 50)} — ${sitelinks} sitelinks, ${callouts} callouts, snippet: ${snippetOk ? 'yes' : 'no'}`
      );
    } catch (error) {
      errors++;
      console.error(
        `[${processed}/${campaigns.length}] FAILED: ${campaign.name.substring(0, 50)} — ${error instanceof Error ? error.message : error}`
      );
    }
  }

  console.info('\n=== Backfill Complete ===');
  console.info(`Processed: ${processed}`);
  console.info(`Sitelinks added: ${sitelinksTotal}`);
  console.info(`Callouts added: ${calloutsTotal}`);
  console.info(`Structured snippets added: ${snippetsTotal}`);
  console.info(`Errors: ${errors}`);
}

// --- Main --------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const doAudit =
    args.includes('--audit') || (!args.includes('--backfill') && !args.includes('--dry-run'));
  const doBackfill = args.includes('--backfill') || args.includes('--dry-run');
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '9999') : 9999;

  try {
    if (doAudit) await audit();
    if (doBackfill) await backfill(limit, dryRun);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
