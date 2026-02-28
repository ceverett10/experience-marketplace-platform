/**
 * Update Geo Targets: Enrich existing campaigns with destination countries.
 *
 * Currently, campaigns only target home markets (GB, US, CA, AU, IE, NZ).
 * This script adds the countries WHERE experiences actually take place,
 * so travelers on-location can see the ads too.
 *
 * Two audiences:
 *   1. Travelers at the destination — someone in Spain searching "boat tour Barcelona"
 *   2. Trip planners at home — someone in GB searching "boat tour Barcelona"
 *
 * Flags:
 *   --dry-run       Show what would change without making API calls
 *   --google-only   Only update Google Ads campaigns
 *   --meta-only     Only update Meta (Facebook) campaigns
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/update-geo-targets.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/update-geo-targets.ts
 *
 * On Heroku:
 *   heroku run "npx -y tsx packages/jobs/src/scripts/update-geo-targets.ts --dry-run" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import { getConfig, apiRequest, flattenStreamResults } from '../services/google-ads-client';
import { deriveDestinationCountriesFromKeywords } from '../utils/keyword-location';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const GOOGLE_ONLY = args.includes('--google-only');
const META_ONLY = args.includes('--meta-only');

// ---------------------------------------------------------------------------
// Extended country code → Google Geo Target Constant ID mapping
// ---------------------------------------------------------------------------

const COUNTRY_CODE_TO_GEO_ID: Record<string, number> = {
  // Home markets
  GB: 2826,
  US: 2840,
  CA: 2124,
  AU: 2036,
  IE: 2372,
  NZ: 2554,
  // Western Europe
  DE: 2276,
  FR: 2250,
  ES: 2724,
  IT: 2380,
  NL: 2528,
  PT: 2620,
  AT: 2040,
  CH: 2756,
  BE: 2056,
  // Scandinavia
  SE: 2752,
  NO: 2578,
  DK: 2208,
  FI: 2246,
  IS: 2352,
  // Eastern/Southern Europe
  GR: 2300,
  TR: 2792,
  HR: 2191,
  CZ: 2203,
  HU: 2348,
  PL: 2616,
  // Asia-Pacific
  SG: 2702,
  HK: 2344,
  JP: 2392,
  KR: 2410,
  IN: 2356,
  TH: 2764,
  ID: 2360,
  VN: 2704,
  MY: 2458,
  PH: 2608,
  // Middle East & Africa
  AE: 2784,
  ZA: 2710,
  MA: 2504,
  EG: 2818,
  // Americas
  BR: 2076,
  MX: 2484,
  CO: 2170,
  AR: 2032,
  PE: 2604,
  CL: 2152,
};

// EU countries requiring DSA compliance on Meta
const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

// ---------------------------------------------------------------------------
// Google Ads: query existing geo targets for a campaign
// ---------------------------------------------------------------------------

async function getExistingGeoTargets(
  config: NonNullable<ReturnType<typeof getConfig>>,
  campaignId: string
): Promise<Set<number>> {
  const query = `SELECT campaign_criterion.location.geo_target_constant FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'LOCATION' AND campaign_criterion.negative = false`;

  try {
    const rows = flattenStreamResults<{
      campaignCriterion: {
        location: { geoTargetConstant: string };
      };
    }>(await apiRequest(config, 'POST', '/googleAds:searchStream', { query }));

    const geoIds = new Set<number>();
    for (const row of rows) {
      const geoId = parseInt(
        row.campaignCriterion.location.geoTargetConstant.split('/').pop()!,
        10
      );
      if (!isNaN(geoId)) geoIds.add(geoId);
    }
    return geoIds;
  } catch (error) {
    console.error(
      `  Warning: Could not query existing geo targets for campaign ${campaignId}:`,
      error instanceof Error ? error.message : error
    );
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Google Ads: add new geo target criteria
// ---------------------------------------------------------------------------

async function addGoogleGeoTargets(
  config: NonNullable<ReturnType<typeof getConfig>>,
  campaignId: string,
  newCountryCodes: string[]
): Promise<number> {
  const campaignResourceName = `customers/${config.customerId}/campaigns/${campaignId}`;

  // Get existing geo targets to avoid duplicates
  const existingGeoIds = await getExistingGeoTargets(config, campaignId);

  // Resolve new country codes to geo IDs, filtering out ones already set
  const newGeoIds = newCountryCodes
    .map((code) => ({ code, geoId: COUNTRY_CODE_TO_GEO_ID[code.toUpperCase()] }))
    .filter((item): item is { code: string; geoId: number } => {
      if (!item.geoId) {
        console.warn(`  Warning: No geo ID for country code "${item.code}" — skipping`);
        return false;
      }
      if (existingGeoIds.has(item.geoId)) return false; // Already targeted
      return true;
    });

  if (newGeoIds.length === 0) return 0;

  const operations = newGeoIds.map(({ geoId }) => ({
    create: {
      campaign: campaignResourceName,
      location: { geoTargetConstant: `geoTargetConstants/${geoId}` },
      negative: false,
    },
  }));

  await apiRequest(config, 'POST', '/campaignCriteria:mutate', { operations });
  return newGeoIds.length;
}

// ---------------------------------------------------------------------------
// Meta: update ad set targeting countries
// ---------------------------------------------------------------------------

async function updateMetaAdSetCountries(
  adSetId: string,
  newCountries: string[],
  siteName: string
): Promise<boolean> {
  const accessToken = process.env['META_ACCESS_TOKEN'];
  if (!accessToken) {
    console.error('  META_ACCESS_TOKEN not set — skipping Meta updates');
    return false;
  }

  // Read current ad set targeting to preserve other fields
  const readUrl = `https://graph.facebook.com/v18.0/${adSetId}?fields=targeting&access_token=${accessToken}`;
  const readResp = await fetch(readUrl);
  if (!readResp.ok) {
    const err = await readResp.text();
    console.error(`  Failed to read ad set ${adSetId}: ${err.substring(0, 500)}`);
    return false;
  }

  const adSetData = (await readResp.json()) as {
    targeting?: {
      geo_locations?: { countries?: string[] };
      [key: string]: unknown;
    };
  };

  const currentTargeting = adSetData.targeting || {};
  const currentCountries = currentTargeting.geo_locations?.countries || [];
  const mergedCountries = Array.from(new Set([...currentCountries, ...newCountries])).sort();

  if (mergedCountries.length === currentCountries.length) {
    return false; // No new countries to add
  }

  // Build updated targeting, preserving all existing fields
  const updatedTargeting = {
    ...currentTargeting,
    geo_locations: {
      ...currentTargeting.geo_locations,
      countries: mergedCountries,
    },
  };

  // Check if any new countries are EU — need DSA fields
  const hasEU = mergedCountries.some((c) => EU_COUNTRIES.has(c));

  const params = new URLSearchParams({
    targeting: JSON.stringify(updatedTargeting),
    access_token: accessToken,
  });

  if (hasEU) {
    params.set('dsa_beneficiary', siteName);
    params.set('dsa_payor', siteName);
  }

  const updateUrl = `https://graph.facebook.com/v18.0/${adSetId}`;
  const updateResp = await fetch(updateUrl, {
    method: 'POST',
    body: params,
  });

  if (!updateResp.ok) {
    const err = await updateResp.text();
    console.error(`  Failed to update ad set ${adSetId}: ${err.substring(0, 500)}`);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Geo-Target Enrichment ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(
    `Platforms: ${GOOGLE_ONLY ? 'Google only' : META_ONLY ? 'Meta only' : 'Google + Meta'}`
  );
  console.log();

  const site = await prisma.site.findFirst({
    select: { id: true, name: true, targetMarkets: true },
  });
  if (!site) {
    console.error('No site found in database!');
    process.exit(1);
  }

  const homeMarkets = site.targetMarkets?.length
    ? (site.targetMarkets as string[])
    : ['GB', 'US', 'CA', 'AU', 'IE', 'NZ'];

  console.log(`Home markets: ${homeMarkets.join(', ')}`);
  console.log();

  // -----------------------------------------------------------------------
  // Google Ads campaigns
  // -----------------------------------------------------------------------

  if (!META_ONLY) {
    console.log('--- Google Ads Campaigns ---\n');

    const config = getConfig();
    if (!config) {
      console.error('Google Ads config not available (missing env vars)');
    } else {
      const googleCampaigns = await prisma.adCampaign.findMany({
        where: {
          platform: 'GOOGLE_SEARCH',
          campaignGroup: { not: null },
          platformCampaignId: { not: null },
          status: { not: 'COMPLETED' },
        },
        select: {
          id: true,
          name: true,
          platformCampaignId: true,
          geoTargets: true,
          keywords: true,
          campaignGroup: true,
        },
      });

      console.log(`Found ${googleCampaigns.length} restructured Google campaigns\n`);

      let totalAdded = 0;

      for (const campaign of googleCampaigns) {
        const keywords = (campaign.keywords as string[]) || [];
        if (keywords.length === 0) {
          console.log(`  "${campaign.name}": no keywords — skipping`);
          continue;
        }

        const currentGeo = (campaign.geoTargets as string[]) || homeMarkets;
        const destinationCountries = deriveDestinationCountriesFromKeywords(keywords);
        const newCountries = destinationCountries.filter((c) => !currentGeo.includes(c));

        if (newCountries.length === 0) {
          console.log(`  "${campaign.name}": no new destination countries to add`);
          continue;
        }

        const mergedGeo = Array.from(new Set([...currentGeo, ...newCountries])).sort();

        console.log(`  "${campaign.name}" (${campaign.platformCampaignId}):`);
        console.log(`    Current: ${currentGeo.join(', ')}`);
        console.log(`    Adding:  ${newCountries.join(', ')}`);
        console.log(`    Result:  ${mergedGeo.join(', ')}`);

        if (!DRY_RUN) {
          try {
            const added = await addGoogleGeoTargets(
              config,
              campaign.platformCampaignId!,
              newCountries
            );
            totalAdded += added;
            console.log(`    ✓ Added ${added} new geo targets via API`);

            // Update DB record
            await prisma.adCampaign.update({
              where: { id: campaign.id },
              data: { geoTargets: mergedGeo },
            });
            console.log(`    ✓ DB updated`);
          } catch (error) {
            console.error(`    ✗ Failed:`, error instanceof Error ? error.message : error);
          }
        }
        console.log();
      }

      console.log(
        `Google summary: ${totalAdded} new geo targets added across ${googleCampaigns.length} campaigns\n`
      );
    }
  }

  // -----------------------------------------------------------------------
  // Meta (Facebook) campaigns
  // -----------------------------------------------------------------------

  if (!GOOGLE_ONLY) {
    console.log('--- Meta (Facebook) Campaigns ---\n');

    const metaCampaigns = await prisma.adCampaign.findMany({
      where: {
        platform: 'FACEBOOK',
        campaignGroup: { not: null },
        platformCampaignId: { not: null },
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      select: {
        id: true,
        name: true,
        platformCampaignId: true,
        platformAdSetId: true,
        geoTargets: true,
        keywords: true,
        campaignGroup: true,
      },
    });

    console.log(`Found ${metaCampaigns.length} Meta campaigns with campaignGroup\n`);

    let metaUpdated = 0;

    for (const campaign of metaCampaigns) {
      const keywords = (campaign.keywords as string[]) || [];
      if (keywords.length === 0) {
        console.log(`  "${campaign.name}": no keywords — skipping`);
        continue;
      }

      const adSetId = (campaign as { platformAdSetId?: string }).platformAdSetId;
      if (!adSetId) {
        console.log(`  "${campaign.name}": no platformAdSetId — skipping`);
        continue;
      }

      const currentGeo = (campaign.geoTargets as string[]) || homeMarkets;
      const destinationCountries = deriveDestinationCountriesFromKeywords(keywords);
      const newCountries = destinationCountries.filter((c) => !currentGeo.includes(c));

      if (newCountries.length === 0) {
        console.log(`  "${campaign.name}": no new destination countries to add`);
        continue;
      }

      const mergedGeo = Array.from(new Set([...currentGeo, ...newCountries])).sort();

      console.log(`  "${campaign.name}" (ad set: ${adSetId}):`);
      console.log(`    Current: ${currentGeo.join(', ')}`);
      console.log(`    Adding:  ${newCountries.join(', ')}`);
      console.log(`    Result:  ${mergedGeo.join(', ')}`);

      if (!DRY_RUN) {
        try {
          const updated = await updateMetaAdSetCountries(adSetId, mergedGeo, site.name);
          if (updated) {
            metaUpdated++;
            console.log(`    ✓ Ad set targeting updated via Meta API`);
          } else {
            console.log(`    - No changes needed (countries already set)`);
          }

          // Update DB record
          await prisma.adCampaign.update({
            where: { id: campaign.id },
            data: { geoTargets: mergedGeo },
          });
          console.log(`    ✓ DB updated`);
        } catch (error) {
          console.error(`    ✗ Failed:`, error instanceof Error ? error.message : error);
        }
      }
      console.log();
    }

    console.log(`Meta summary: ${metaUpdated} ad sets updated\n`);
  }

  console.log('=== Complete ===');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
