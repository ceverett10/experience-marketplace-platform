/**
 * Deploy Holibob.ai Google Ads campaigns.
 *
 * Creates 3 campaigns targeting UK + US:
 *   1. High-Intent Experience Searches (50% budget = £10/day)
 *   2. Trip Planning (30% budget = £6/day)
 *   3. Brand + Competitor (20% budget = £4/day)
 *
 * All ads point to https://holibob.ai with UTM tracking.
 * Bidding: Maximize Clicks (no conversion data yet).
 * Device adjustments: Desktop +10%, Tablet -15%, Mobile baseline.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/deploy-holibob-ai-campaigns.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/deploy-holibob-ai-campaigns.ts --deploy
 *   npx tsx packages/jobs/src/scripts/deploy-holibob-ai-campaigns.ts --deploy --enable
 *
 * On Heroku:
 *   heroku run "npx tsx packages/jobs/src/scripts/deploy-holibob-ai-campaigns.ts --deploy --enable" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import {
  isGoogleAdsConfigured,
  createSearchCampaign,
  createKeywordAdGroup,
  createResponsiveSearchAd,
  setCampaignStatus,
  setCampaignGeoTargets,
  addCampaignNegativeKeywords,
  createAndLinkSitelinks,
  createAndLinkCallouts,
  createAndLinkStructuredSnippets,
  setCampaignDeviceBidAdjustments,
} from '../services/google-ads-client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------
const TOTAL_DAILY_BUDGET = 20; // £20/day
const LANDING_DOMAIN = 'https://holibob.ai';

// ---------------------------------------------------------------------------
// Campaign definitions
// ---------------------------------------------------------------------------

interface AdGroupDef {
  name: string;
  keywords: string[];
  matchType: 'EXACT' | 'PHRASE' | 'BROAD';
}

interface CampaignDef {
  name: string;
  budgetPct: number; // fraction of TOTAL_DAILY_BUDGET
  adGroups: AdGroupDef[];
  headlines: string[];
  descriptions: string[];
  path1?: string;
  path2?: string;
  utmCampaign: string;
}

const DESTINATIONS = [
  'Barcelona',
  'Rome',
  'Paris',
  'Bali',
  'Cancun',
  'Santorini',
  'Lisbon',
  'Bangkok',
  'Dubai',
  'New York',
  'London',
  'Dubrovnik',
  'Amalfi Coast',
  'Marrakech',
  'Istanbul',
];

const CAMPAIGNS: CampaignDef[] = [
  // ---- Campaign 1: High-Intent Experience Searches (50%) ----
  {
    name: 'Holibob.ai - Experience Searches',
    budgetPct: 0.5,
    utmCampaign: 'experience_searches',
    path1: undefined,
    path2: undefined,
    adGroups: [
      {
        name: 'Activities by Destination',
        matchType: 'PHRASE',
        keywords: DESTINATIONS.flatMap((dest) => [
          `things to do in ${dest}`,
          `best tours in ${dest}`,
        ]),
      },
      {
        name: 'Specific Experiences',
        matchType: 'PHRASE',
        keywords: [
          'food tour Barcelona',
          'snorkelling trips Cancun',
          'walking tour Rome',
          'boat trips Amalfi',
          'wine tasting Santorini',
          'cooking class Paris',
          'desert safari Dubai',
          'temple tour Bangkok',
          'street food tour Lisbon',
          'gondola ride Venice',
          'pub crawl London',
          'sunrise trek Bali',
          'catamaran cruise Dubrovnik',
          'medina tour Marrakech',
          'Bosphorus cruise Istanbul',
        ],
      },
      {
        name: 'Booking Intent',
        matchType: 'PHRASE',
        keywords: [
          'book tours online',
          'book holiday activities',
          'best experience booking site',
          'book excursions online',
          'book activities abroad',
        ],
      },
      {
        name: 'Generic Discovery',
        matchType: 'BROAD',
        keywords: [
          'unique travel experiences',
          'local experiences abroad',
          'holiday excursions',
          'best travel experiences',
          'tours and activities worldwide',
        ],
      },
    ],
    headlines: [
      'Book Unique Local Experiences',
      'Tours & Activities Worldwide',
      'Plan. Book. Explore.',
      'AI-Powered Trip Experiences',
      'Top-Rated Tours & Excursions',
      'Discover Hidden Gems Abroad',
      "Experiences You Won't Forget",
      'Book in Minutes',
    ],
    descriptions: [
      'Holibob.ai finds the best local experiences for your trip. Browse, plan, and book in minutes.',
      'From food tours to boat trips \u2014 discover hand-picked activities at 1000s of destinations.',
      "Your AI travel companion. Tell us where you're going and we'll plan the perfect experience.",
      'Skip the tourist traps. Holibob.ai curates the best things to do wherever you travel.',
    ],
  },

  // ---- Campaign 2: Trip Planning (30%) ----
  {
    name: 'Holibob.ai - Trip Planning',
    budgetPct: 0.3,
    utmCampaign: 'trip_planning',
    path1: undefined,
    path2: undefined,
    adGroups: [
      {
        name: 'Planning',
        matchType: 'PHRASE',
        keywords: [
          'trip planner',
          'holiday planner',
          'vacation planner AI',
          'plan my trip',
          'travel planner app',
        ],
      },
      {
        name: 'Itinerary',
        matchType: 'PHRASE',
        keywords: [
          'travel itinerary builder',
          'AI trip planner',
          'plan my holiday for me',
          'AI travel itinerary',
          'automatic trip planner',
        ],
      },
      {
        name: 'Inspiration',
        matchType: 'BROAD',
        keywords: [
          'where to go on holiday',
          'best holiday destinations 2026',
          'travel inspiration',
          'holiday ideas',
        ],
      },
    ],
    headlines: [
      'AI Trip Planner - Free to Try',
      'Plan Your Perfect Holiday',
      'Your Personal Travel AI',
      'Smart Holiday Planning',
      'Build Your Trip in Minutes',
      'Let AI Plan Your Vacation',
    ],
    descriptions: [
      "Tell Holibob.ai where you're going and get a personalised itinerary with bookable experiences.",
      'Stop spending hours planning. Our AI builds your ideal trip with tours, activities & more.',
    ],
  },

  // ---- Campaign 3: Brand + Competitor (20%) ----
  {
    name: 'Holibob.ai - Brand & Competitor',
    budgetPct: 0.2,
    utmCampaign: 'brand_competitor',
    path1: undefined,
    path2: undefined,
    adGroups: [
      {
        name: 'Brand',
        matchType: 'EXACT',
        keywords: ['holibob', 'holibob.ai', 'holibob reviews', 'holibob app'],
      },
      {
        name: 'Competitor',
        matchType: 'PHRASE',
        keywords: [
          'GetYourGuide alternative',
          'Viator alternative',
          'better than TripAdvisor experiences',
          'Klook alternative',
          'Airbnb experiences alternative',
        ],
      },
    ],
    headlines: [
      'Holibob.ai - AI Trip Planner',
      'The Smarter Way to Book',
      'Better Than a Travel Agent',
      "Try Holibob.ai - It's Free",
    ],
    descriptions: [
      'The AI-powered alternative to generic booking sites. Personalised experiences, curated for you.',
      'Plan and book your entire trip in one place. Holibob.ai \u2014 travel planning made effortless.',
    ],
  },
];

// ---------------------------------------------------------------------------
// Negative keywords (applied across all campaigns)
// ---------------------------------------------------------------------------
const NEGATIVE_KEYWORDS = [
  'free',
  'jobs',
  'careers',
  'salary',
  'internship',
  'volunteer',
  'DIY',
  'cheap flights',
  'hotel booking',
  'hostel',
  'car rental',
  'car hire',
  'insurance',
  'visa',
  'embassy',
  'wiki',
  'wikipedia',
  'reddit',
  'youtube',
];

// ---------------------------------------------------------------------------
// Ad extensions
// ---------------------------------------------------------------------------
const SITELINKS = [
  {
    linkText: 'Popular Destinations',
    description1: 'Explore top destinations worldwide',
    description2: 'Barcelona, Rome, Bali & more',
    finalUrl: `${LANDING_DOMAIN}?utm_source=google&utm_medium=cpc&utm_content=sitelink_destinations`,
  },
  {
    linkText: 'How It Works',
    description1: 'AI plans your perfect trip',
    description2: 'Browse, plan, and book easily',
    finalUrl: `${LANDING_DOMAIN}?utm_source=google&utm_medium=cpc&utm_content=sitelink_how_it_works`,
  },
  {
    linkText: 'Browse Experiences',
    description1: 'Tours, activities & excursions',
    description2: '1000s of options worldwide',
    finalUrl: `${LANDING_DOMAIN}?utm_source=google&utm_medium=cpc&utm_content=sitelink_experiences`,
  },
  {
    linkText: 'Plan a Trip',
    description1: 'Let AI build your itinerary',
    description2: 'Personalised trip planning',
    finalUrl: `${LANDING_DOMAIN}?utm_source=google&utm_medium=cpc&utm_content=sitelink_plan`,
  },
];

const CALLOUTS = ['AI-Powered', '1000s of Experiences', 'Free to Use', 'Trusted Reviews'];

const STRUCTURED_SNIPPET = {
  header: 'Destinations' as const,
  values: ['Barcelona', 'Rome', 'Bali', 'Paris', 'Cancun', 'Santorini', 'London', 'Dubai'],
};

// ---------------------------------------------------------------------------
// Device bid adjustments
// ---------------------------------------------------------------------------
const DEVICE_ADJUSTMENTS: Array<{
  device: 'MOBILE' | 'DESKTOP' | 'TABLET';
  bidModifier: number;
}> = [
  { device: 'DESKTOP', bidModifier: 1.1 }, // +10%
  { device: 'TABLET', bidModifier: 0.85 }, // -15%
  // Mobile is baseline (1.0) — no adjustment needed
];

// ---------------------------------------------------------------------------
// Geo targets
// ---------------------------------------------------------------------------
const GEO_TARGETS = ['GB', 'US'];

// ---------------------------------------------------------------------------
// Max CPC bid ceiling for Maximize Clicks
// ---------------------------------------------------------------------------
const MAX_CPC_GBP = 3.0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLandingUrl(utmCampaign: string, utmContent: string): string {
  const url = new URL(LANDING_DOMAIN);
  url.searchParams.set('utm_source', 'google');
  url.searchParams.set('utm_medium', 'cpc');
  url.searchParams.set('utm_campaign', utmCampaign);
  url.searchParams.set('utm_content', utmContent);
  return url.toString();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || (!args.includes('--deploy') && args.length === 0);
  const shouldEnable = args.includes('--enable');

  console.info('\n========================================');
  console.info('  Holibob.ai Google Ads Campaign Setup');
  console.info('========================================\n');
  console.info(`Mode:           ${isDryRun ? 'DRY RUN (no API calls)' : 'DEPLOY'}`);
  console.info(`Enable:         ${shouldEnable ? 'Yes (campaigns go LIVE)' : 'No (PAUSED)'}`);
  console.info(`Total budget:   \u00a3${TOTAL_DAILY_BUDGET}/day`);
  console.info(`Landing page:   ${LANDING_DOMAIN}`);
  console.info(`Geo targets:    ${GEO_TARGETS.join(', ')}`);
  console.info(`Max CPC cap:    \u00a3${MAX_CPC_GBP}`);
  console.info('');

  // --- Validate Google Ads config ---
  if (!isDryRun && !isGoogleAdsConfigured()) {
    console.error('FAIL: Google Ads not configured (missing env vars)');
    console.error('Required: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID,');
    console.error('  GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID');
    process.exit(1);
  }

  // --- Find or note site for DB records (skip DB call in dry-run if no DATABASE_URL) ---
  let site: { id: string; name: string; primaryDomain: string | null } | null = null;

  if (isDryRun && !process.env['DATABASE_URL']) {
    console.info('(Skipping Site lookup — no DATABASE_URL in dry-run mode)\n');
  } else {
    site = await prisma.site.findFirst({
      where: {
        OR: [
          { primaryDomain: 'holibob.ai' },
          { primaryDomain: 'www.holibob.ai' },
          { slug: 'holibob-ai' },
        ],
      },
      select: { id: true, name: true, primaryDomain: true },
    });

    if (!site) {
      console.warn('WARNING: No Site record found for holibob.ai in database.');
      console.warn('AdCampaign records will NOT be created in the DB.');
      console.warn('To fix: create a Site via the admin API first.\n');
    } else {
      console.info(`Site found: ${site.name} (${site.primaryDomain}) [${site.id}]\n`);
    }
  }

  // --- Print campaign plan ---
  console.info('--- Campaign Plan ---\n');
  for (const campaign of CAMPAIGNS) {
    const dailyBudget = TOTAL_DAILY_BUDGET * campaign.budgetPct;
    console.info(`Campaign: ${campaign.name}`);
    console.info(
      `  Budget:     \u00a3${dailyBudget.toFixed(2)}/day (${campaign.budgetPct * 100}%)`
    );
    console.info(`  Bidding:    Maximize Clicks (CPC ceiling: \u00a3${MAX_CPC_GBP})`);
    console.info(`  UTM:        utm_campaign=${campaign.utmCampaign}`);
    console.info(`  Ad groups:  ${campaign.adGroups.length}`);
    for (const ag of campaign.adGroups) {
      console.info(`    - ${ag.name} [${ag.matchType}]: ${ag.keywords.length} keywords`);
    }
    console.info(`  Headlines:     ${campaign.headlines.length}`);
    console.info(`  Descriptions:  ${campaign.descriptions.length}`);
    console.info('');
  }

  const totalKeywords = CAMPAIGNS.reduce(
    (sum, c) => sum + c.adGroups.reduce((s, ag) => s + ag.keywords.length, 0),
    0
  );
  console.info(`Total keywords:       ${totalKeywords}`);
  console.info(`Negative keywords:    ${NEGATIVE_KEYWORDS.length}`);
  console.info(`Sitelinks:            ${SITELINKS.length}`);
  console.info(`Callouts:             ${CALLOUTS.length}`);
  console.info(`Structured snippets:  ${STRUCTURED_SNIPPET.values.length} destinations`);
  console.info(`Device adjustments:   Desktop +10%, Tablet -15%`);
  console.info('');

  if (isDryRun) {
    console.info('=== DRY RUN COMPLETE === (pass --deploy to create campaigns)\n');
    await prisma.$disconnect();
    return;
  }

  // --- Deploy to Google Ads ---
  console.info('=== Deploying to Google Ads ===\n');

  const deployedCampaigns: Array<{
    def: CampaignDef;
    googleCampaignId: string;
    adGroupIds: string[];
  }> = [];

  for (const campaignDef of CAMPAIGNS) {
    const dailyBudget = TOTAL_DAILY_BUDGET * campaignDef.budgetPct;
    const dailyBudgetMicros = Math.round(dailyBudget * 1_000_000);
    const cpcCeilingMicros = Math.round(MAX_CPC_GBP * 1_000_000);

    console.info(`--- Creating: ${campaignDef.name} (\u00a3${dailyBudget.toFixed(2)}/day) ---`);

    // 1. Create campaign with Maximize Clicks bidding
    const campaignResult = await createSearchCampaign({
      name: campaignDef.name,
      dailyBudgetMicros,
      status: 'PAUSED',
      bidStrategy: 'MAXIMIZE_CLICKS',
      cpcBidCeilingMicros: cpcCeilingMicros,
    });

    if (!campaignResult) {
      console.error(`  FAIL: Could not create campaign "${campaignDef.name}" — skipping`);
      continue;
    }
    console.info(`  Campaign created: ID ${campaignResult.campaignId}`);

    // 2. Set geo targets (UK + US)
    const geoCount = await setCampaignGeoTargets(campaignResult.campaignId, GEO_TARGETS);
    console.info(`  Geo targets set: ${geoCount} locations`);

    // 3. Set device bid adjustments
    const deviceCount = await setCampaignDeviceBidAdjustments(
      campaignResult.campaignId,
      DEVICE_ADJUSTMENTS
    );
    console.info(`  Device adjustments set: ${deviceCount}`);

    // 4. Add negative keywords
    const negCount = await addCampaignNegativeKeywords(
      campaignResult.campaignId,
      NEGATIVE_KEYWORDS
    );
    console.info(`  Negative keywords added: ${negCount}`);

    // 5. Add ad extensions
    const slCount = await createAndLinkSitelinks(campaignResult.campaignId, SITELINKS);
    console.info(`  Sitelinks linked: ${slCount}`);

    const coCount = await createAndLinkCallouts(campaignResult.campaignId, CALLOUTS);
    console.info(`  Callouts linked: ${coCount}`);

    const ssOk = await createAndLinkStructuredSnippets(
      campaignResult.campaignId,
      STRUCTURED_SNIPPET
    );
    console.info(`  Structured snippets: ${ssOk ? 'OK' : 'FAILED'}`);

    // 6. Create ad groups with keywords + RSAs
    const adGroupIds: string[] = [];

    for (const agDef of campaignDef.adGroups) {
      const cpcBidMicros = Math.round(MAX_CPC_GBP * 1_000_000);
      const utmContent = slugify(agDef.name);
      const landingUrl = buildLandingUrl(campaignDef.utmCampaign, utmContent);

      const keywords = agDef.keywords.map((kw) => ({
        text: kw,
        matchType: agDef.matchType,
      }));

      const agResult = await createKeywordAdGroup({
        campaignId: campaignResult.campaignId,
        name: `${campaignDef.name} - ${agDef.name}`,
        cpcBidMicros,
        keywords,
      });

      if (!agResult) {
        console.error(`  FAIL: Ad group "${agDef.name}" — skipping`);
        continue;
      }

      console.info(
        `  Ad group "${agDef.name}": ID ${agResult.adGroupId} (${keywords.length} keywords)`
      );
      adGroupIds.push(agResult.adGroupId);

      // Create RSA for this ad group
      const adResult = await createResponsiveSearchAd({
        adGroupId: agResult.adGroupId,
        headlines: campaignDef.headlines.map((h) => h.substring(0, 30)),
        descriptions: campaignDef.descriptions.map((d) => d.substring(0, 90)),
        finalUrl: landingUrl,
        path1: campaignDef.path1,
        path2: campaignDef.path2,
      });

      if (adResult) {
        console.info(`    RSA created: ID ${adResult.adId}`);
      } else {
        console.error(`    FAIL: RSA for "${agDef.name}"`);
      }
    }

    deployedCampaigns.push({
      def: campaignDef,
      googleCampaignId: campaignResult.campaignId,
      adGroupIds,
    });

    console.info('');
  }

  // 7. Enable campaigns if requested
  if (shouldEnable) {
    console.info('--- Enabling campaigns ---\n');
    for (const dc of deployedCampaigns) {
      const ok = await setCampaignStatus(dc.googleCampaignId, 'ENABLED');
      console.info(`  ${dc.def.name}: ${ok ? 'ENABLED (LIVE)' : 'FAILED to enable'}`);
    }
    console.info('');
  }

  // 8. Create AdCampaign records in database
  if (site) {
    console.info('--- Creating database records ---\n');
    for (const dc of deployedCampaigns) {
      const dailyBudget = TOTAL_DAILY_BUDGET * dc.def.budgetPct;
      const allKeywords = dc.def.adGroups.flatMap((ag) => ag.keywords);

      const landingUrl = buildLandingUrl(dc.def.utmCampaign, 'all');

      await prisma.adCampaign.create({
        data: {
          siteId: site.id,
          platform: 'GOOGLE_SEARCH',
          name: dc.def.name,
          status: shouldEnable ? 'ACTIVE' : 'PAUSED',
          dailyBudget: dailyBudget,
          maxCpc: MAX_CPC_GBP,
          keywords: allKeywords,
          targetUrl: landingUrl,
          geoTargets: GEO_TARGETS,
          platformCampaignId: dc.googleCampaignId,
          utmSource: 'google',
          utmMedium: 'cpc',
          utmCampaign: dc.def.utmCampaign,
          landingPagePath: '/',
          landingPageType: 'HOMEPAGE',
        },
      });

      console.info(`  DB record created: ${dc.def.name}`);
    }
    console.info('');
  }

  // --- Summary ---
  console.info('========================================');
  console.info('  DEPLOYMENT COMPLETE');
  console.info('========================================\n');
  console.info(`Campaigns deployed: ${deployedCampaigns.length}/${CAMPAIGNS.length}`);
  console.info(
    `Status:             ${shouldEnable ? 'ENABLED (LIVE)' : 'PAUSED (pass --enable to go live)'}`
  );
  console.info(
    `DB records:         ${site ? deployedCampaigns.length : 'SKIPPED (no Site record)'}`
  );
  console.info('');

  for (const dc of deployedCampaigns) {
    const dailyBudget = TOTAL_DAILY_BUDGET * dc.def.budgetPct;
    console.info(
      `  ${dc.def.name}: Google ID ${dc.googleCampaignId} | \u00a3${dailyBudget.toFixed(2)}/day | ${dc.adGroupIds.length} ad groups`
    );
  }

  console.info(
    `\nTotal daily budget: \u00a3${TOTAL_DAILY_BUDGET}/day (\u00a3${(TOTAL_DAILY_BUDGET * 30.4).toFixed(0)}/month est.)`
  );
  console.info('');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
