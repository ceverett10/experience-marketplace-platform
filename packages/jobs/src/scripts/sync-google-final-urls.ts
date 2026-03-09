/**
 * Sync Google Ads final URLs into audiences.adGroups for restructured campaigns.
 *
 * The 10 restructured Google campaigns have ad group configs in audiences.adGroups
 * with stale landingPagePath values from proposal time. This script queries the
 * Google Ads API for the actual live final URLs and updates each ad group entry
 * with the correct targetUrl and landingPagePath.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/sync-google-final-urls.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/sync-google-final-urls.ts --apply
 *
 * Run on Heroku:
 *   heroku run "npx tsx packages/jobs/src/scripts/sync-google-final-urls.ts --dry-run" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import { getConfig, apiRequest, flattenStreamResults } from '../services/google-ads-client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

/** The 10 restructured Google campaign platform IDs */
const RESTRUCTURED_GOOGLE_IDS = [
  '23609912135', // General Experiences
  '23609892926', // Transfers & Transport
  '23604367863', // Culture & Sightseeing
  '23614507858', // Adventure & Nature
  '23607017999', // Water & Boat Activities
  '23611493431', // Food & Dining Experiences
  '23606879261', // Destination Discovery
  '23606873744', // Branded -- Attraction Tickets
  '23601336654', // Branded -- London Food Tours
  '23606870156', // Branded -- Harry Potter Tours
];

interface AdGroupEntry {
  primaryKeyword: string;
  keywords: string[];
  landingPagePath?: string;
  targetUrl?: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  console.info('=== Sync Google Ads Final URLs ===');
  console.info(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.info();

  const config = getConfig();
  if (!config) {
    console.error('Google Ads API not configured. Set GOOGLE_ADS_* env vars.');
    process.exit(1);
  }

  // Fetch all 10 restructured campaigns from DB
  const campaigns = await prisma.adCampaign.findMany({
    where: { platformCampaignId: { in: RESTRUCTURED_GOOGLE_IDS } },
    select: {
      id: true,
      name: true,
      platformCampaignId: true,
      audiences: true,
      targetUrl: true,
    },
  });

  console.info(`Found ${campaigns.length} restructured campaigns in DB`);
  let totalUpdated = 0;
  let totalAdGroups = 0;

  for (const campaign of campaigns) {
    const platformId = campaign.platformCampaignId!;
    const audiences = (campaign.audiences as Record<string, unknown>) || {};
    const adGroups: AdGroupEntry[] = (audiences['adGroups'] as AdGroupEntry[]) || [];

    if (adGroups.length === 0) {
      console.info(`  [${campaign.name}] No ad groups in DB — skipping`);
      continue;
    }

    // Query Google Ads API for all ad groups + their final URLs
    const query = `
      SELECT
        ad_group.name,
        ad_group_ad.ad.final_urls
      FROM ad_group_ad
      WHERE campaign.id = ${platformId}
      AND ad_group_ad.status != "REMOVED"
    `;

    let googleAdGroups: Array<{
      adGroup: { name: string };
      adGroupAd: { ad: { finalUrls: string[] } };
    }>;

    try {
      const raw = await apiRequest(config, 'POST', '/googleAds:searchStream', {
        query,
      });
      googleAdGroups = flattenStreamResults(raw);
    } catch (error) {
      console.error(`  [${campaign.name}] Failed to query Google Ads:`, (error as Error).message);
      continue;
    }

    // Build a map: extract primary keyword from the Google final URL q= param
    // and map it to the full URL
    const urlByKeyword = new Map<string, string>();
    for (const gag of googleAdGroups) {
      const finalUrl = gag.adGroupAd?.ad?.finalUrls?.[0];
      if (!finalUrl) continue;

      // Extract the ad group number from name like "General Experiences — Group 29"
      const groupMatch = gag.adGroup.name.match(/Group (\d+)$/);
      if (groupMatch) {
        const groupIndex = parseInt(groupMatch[1]!, 10);
        // The group number maps to the ad group index in the DB array
        urlByKeyword.set(`__index_${groupIndex}`, finalUrl);
      }

      // Also try to match by keyword from ?q= param
      try {
        const url = new URL(finalUrl);
        const qParam = url.searchParams.get('q');
        if (qParam) {
          urlByKeyword.set(qParam.toLowerCase(), finalUrl);
        }
        // For destination URLs like /destinations/london, use the path
        if (url.pathname.startsWith('/destinations/')) {
          urlByKeyword.set(url.pathname, finalUrl);
        }
      } catch {
        // Not a valid URL, skip
      }
    }

    console.info(
      `  [${campaign.name}] ${adGroups.length} DB ad groups, ${googleAdGroups.length} Google ad groups, ${urlByKeyword.size} URL mappings`
    );

    // Match DB ad groups to Google final URLs
    let matched = 0;
    let alreadyCorrect = 0;

    for (let i = 0; i < adGroups.length; i++) {
      const ag = adGroups[i]!;

      // Try matching by: 1) group index, 2) primary keyword, 3) any keyword
      let finalUrl =
        urlByKeyword.get(`__index_${i}`) ||
        urlByKeyword.get(ag.primaryKeyword.toLowerCase()) ||
        null;

      if (!finalUrl) {
        // Try matching any keyword in the ad group
        for (const kw of ag.keywords) {
          const match = urlByKeyword.get(kw.toLowerCase());
          if (match) {
            finalUrl = match;
            break;
          }
        }
      }

      if (finalUrl) {
        if (ag.targetUrl === finalUrl) {
          alreadyCorrect++;
          continue;
        }

        // Extract path for display
        try {
          const url = new URL(finalUrl);
          ag.targetUrl = finalUrl;
          ag.landingPagePath = url.pathname + url.search;
        } catch {
          ag.targetUrl = finalUrl;
        }
        matched++;
      }
    }

    console.info(
      `    Matched: ${matched}, Already correct: ${alreadyCorrect}, Unmatched: ${adGroups.length - matched - alreadyCorrect}`
    );

    if (matched > 0) {
      if (DRY_RUN) {
        // Show a sample of what would change
        const samples = adGroups.filter((ag) => ag.targetUrl).slice(0, 3);
        for (const ag of samples) {
          console.info(`    Sample: "${ag.primaryKeyword}" → ${ag.targetUrl}`);
        }
      } else {
        await prisma.adCampaign.update({
          where: { id: campaign.id },
          data: {
            audiences: { ...audiences, adGroups } as any,
          },
        });
        console.info(`    ✓ Updated ${matched} ad group URLs`);
      }
      totalUpdated += matched;
    }
    totalAdGroups += adGroups.length;
  }

  console.info();
  console.info(`=== Summary ===`);
  console.info(`Total ad groups: ${totalAdGroups}`);
  console.info(`URLs ${DRY_RUN ? 'to update' : 'updated'}: ${totalUpdated}`);
  if (DRY_RUN) {
    console.info('Run with --apply to make changes.');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
