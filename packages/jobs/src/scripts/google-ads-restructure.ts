/**
 * Google Ads Restructure: 893 single-keyword campaigns → 11 intent-based campaigns.
 *
 * This standalone migration script:
 *   1. Pauses all existing Google Search campaigns (DB + Google Ads API)
 *   2. Classifies keywords into 11 intent-based campaigns
 *   3. Creates 11 new campaigns with MAXIMIZE_CLICKS bidding
 *   4. Adds shared negative keyword lists
 *   5. Generates data-driven RSAs using Product table data
 *   6. Sets campaign-specific geo-targeting
 *
 * Flags:
 *   --dry-run      Show what would happen without making changes
 *   --pause-only   Only pause existing campaigns (Day 1 of 2-day migration)
 *   --create-only  Only create new campaigns (Day 2, after pausing)
 *   --limit=N      Process only first N campaigns/keywords
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/google-ads-restructure.ts --dry-run
 *   npx tsx packages/jobs/src/scripts/google-ads-restructure.ts --pause-only
 *   npx tsx packages/jobs/src/scripts/google-ads-restructure.ts --create-only
 *
 * On Heroku:
 *   heroku run "npx tsx packages/jobs/src/scripts/google-ads-restructure.ts --dry-run" \
 *     --app holibob-experiences-demand-gen
 */

import { PrismaClient } from '@prisma/client';
import {
  getConfig,
  apiRequest,
  flattenStreamResults,
  setCampaignStatus,
  setCampaignGeoTargets,
  addCampaignNegativeKeywords,
  createKeywordAdGroup,
  createResponsiveSearchAd,
  createAndLinkSitelinks,
  createAndLinkCallouts,
  createAndLinkStructuredSnippets,
} from '../services/google-ads-client';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Campaign definitions
// ---------------------------------------------------------------------------

interface CampaignDefinition {
  name: string;
  campaignGroup: string;
  dailyBudgetGBP: number;
  maxCpcCapGBP: number;
  geoTargets: string[];
  /** Geo target type: PRESENCE or PRESENCE_OR_INTEREST */
  geoTargetType: 'PRESENCE' | 'PRESENCE_OR_INTEREST';
}

const CAMPAIGN_DEFINITIONS: CampaignDefinition[] = [
  {
    name: 'Branded — Harry Potter Tours',
    campaignGroup: 'Branded – Harry Potter Tours',
    dailyBudgetGBP: 75,
    maxCpcCapGBP: 2.0,
    geoTargets: ['GB', 'IE', 'US', 'CA', 'AU', 'NZ'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'Branded — London Food Tours',
    campaignGroup: 'Branded – London Food Tours',
    dailyBudgetGBP: 50,
    maxCpcCapGBP: 2.0,
    geoTargets: ['GB', 'IE', 'US', 'CA', 'AU', 'NZ'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'Branded — Attraction Tickets',
    campaignGroup: 'Branded — Attraction Tickets',
    dailyBudgetGBP: 40,
    maxCpcCapGBP: 2.0,
    geoTargets: ['GB', 'IE'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'Destination Discovery',
    campaignGroup: 'Destination Discovery',
    dailyBudgetGBP: 100,
    maxCpcCapGBP: 1.5,
    geoTargets: ['GB', 'US', 'CA', 'AU', 'IE', 'NZ'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'Food & Dining Experiences',
    campaignGroup: 'Food, Drink & Culinary',
    dailyBudgetGBP: 30,
    maxCpcCapGBP: 1.5,
    geoTargets: ['GB', 'US', 'CA', 'AU', 'IE', 'NZ'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'Water & Boat Activities',
    campaignGroup: 'Boats, Sailing & Water',
    dailyBudgetGBP: 60,
    maxCpcCapGBP: 1.5,
    geoTargets: ['GB', 'US', 'CA', 'AU', 'IE', 'NZ'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'Adventure & Nature',
    campaignGroup: 'Adventure & Outdoor',
    dailyBudgetGBP: 30,
    maxCpcCapGBP: 1.5,
    geoTargets: ['GB', 'US', 'CA', 'AU', 'IE', 'NZ'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'Culture & Sightseeing',
    campaignGroup: 'Cultural & Sightseeing',
    dailyBudgetGBP: 40,
    maxCpcCapGBP: 1.5,
    geoTargets: ['GB', 'US', 'CA', 'AU', 'IE', 'NZ'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'Transfers & Transport',
    campaignGroup: 'Transfers & Transport',
    dailyBudgetGBP: 15,
    maxCpcCapGBP: 1.0,
    geoTargets: ['GB', 'IE'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'Brand & Competitor Terms',
    campaignGroup: 'Brand & Competitor',
    dailyBudgetGBP: 25,
    maxCpcCapGBP: 1.5,
    geoTargets: ['GB'],
    geoTargetType: 'PRESENCE',
  },
  {
    name: 'General Experiences',
    campaignGroup: 'General Experiences',
    dailyBudgetGBP: 35,
    maxCpcCapGBP: 1.0,
    geoTargets: ['GB', 'US', 'CA', 'AU', 'IE', 'NZ'],
    geoTargetType: 'PRESENCE',
  },
];

// ---------------------------------------------------------------------------
// Keyword classification
// ---------------------------------------------------------------------------

/** Destination discovery signals — keywords matching these go to Campaign 4 */
const DESTINATION_SIGNALS = [
  'things to do in',
  'what to do in',
  'best things to do in',
  'top things to do in',
  'activities in',
  'tours in',
  'experiences in',
  'best tours in',
  'book activities in',
];

/** Branded attraction patterns — keywords matching these go to Campaign 3 */
const ATTRACTION_PATTERNS = [
  'ticket',
  'tickets',
  'admission',
  'entry',
  'alton towers',
  'hampton court',
  'london eye',
  'tower of london',
  'legoland',
  'thorpe park',
  'madame tussauds',
  'sea life',
];

/** Brand/competitor patterns — keywords matching these go to Campaign 10 */
const BRAND_COMPETITOR_PATTERNS = [
  'holibob',
  'experiencess',
  'viator alternative',
  'getyourguide alternative',
  'klook alternative',
  'better than viator',
  'better than getyourguide',
];

/**
 * Classify a keyword into one of the 11 Google campaign groups.
 * Order matters — more specific patterns checked first.
 */
function classifyKeyword(keyword: string): string {
  const kw = keyword.toLowerCase();

  // 1. Branded — Harry Potter
  if (kw.includes('harry potter') || kw.includes('warner bros studio')) {
    return 'Branded – Harry Potter Tours';
  }

  // 2. Branded — London Food Tours
  if (kw.includes('london food tour') || kw.includes('london food experience')) {
    return 'Branded – London Food Tours';
  }

  // 3. Branded — Attraction Tickets
  if (ATTRACTION_PATTERNS.some((p) => kw.includes(p))) {
    return 'Branded — Attraction Tickets';
  }

  // 10. Brand/Competitor (before category matching to catch "viator alternative" etc.)
  if (BRAND_COMPETITOR_PATTERNS.some((p) => kw.includes(p))) {
    return 'Brand & Competitor';
  }

  // 4. Destination Discovery — "things to do in X", "activities in X"
  if (DESTINATION_SIGNALS.some((s) => kw.includes(s))) {
    return 'Destination Discovery';
  }

  // 5-9. Category campaigns — use shared categoryPatterns from paid-traffic config
  const categoryPatterns = PAID_TRAFFIC_CONFIG.metaConsolidated.categoryPatterns;
  for (const [group, patterns] of Object.entries(categoryPatterns)) {
    // Skip branded patterns (already handled above)
    if (group.startsWith('Branded')) continue;
    if ((patterns as string[]).some((p) => kw.includes(p))) return group;
  }

  // 11. General Experiences (catch-all)
  return 'General Experiences';
}

// ---------------------------------------------------------------------------
// Ad group sub-grouping
// ---------------------------------------------------------------------------

interface AdGroupDef {
  name: string;
  keywords: string[];
  /** Best keyword by search volume */
  primaryKeyword: string;
}

/**
 * Sub-group keywords within a campaign into themed ad groups.
 * For Discovery: group by destination region.
 * For others: group by activity theme, max ~20 keywords per ad group.
 */
function buildAdGroups(campaignGroup: string, keywords: string[]): AdGroupDef[] {
  if (keywords.length === 0) return [];

  if (campaignGroup === 'Destination Discovery') {
    return buildDestinationAdGroups(keywords);
  }

  // For most campaigns, create a single ad group if ≤20 keywords,
  // or split into chunks of 20 if more
  const MAX_PER_GROUP = 20;
  if (keywords.length <= MAX_PER_GROUP) {
    return [
      {
        name: campaignGroup,
        keywords,
        primaryKeyword: keywords[0]!,
      },
    ];
  }

  const groups: AdGroupDef[] = [];
  for (let i = 0; i < keywords.length; i += MAX_PER_GROUP) {
    const chunk = keywords.slice(i, i + MAX_PER_GROUP);
    groups.push({
      name: `${campaignGroup} — Group ${Math.floor(i / MAX_PER_GROUP) + 1}`,
      keywords: chunk,
      primaryKeyword: chunk[0]!,
    });
  }
  return groups;
}

/**
 * Group destination discovery keywords by geographic region.
 * Uses regionMap from paid-traffic config.
 */
function buildDestinationAdGroups(keywords: string[]): AdGroupDef[] {
  const regionMap = PAID_TRAFFIC_CONFIG.metaConsolidated.regionMap;
  const regionKeywords = new Map<string, string[]>();
  const unmatched: string[] = [];

  for (const kw of keywords) {
    let matched = false;
    // Try to extract a location and match to a region
    for (const [countryCode, region] of Object.entries(regionMap)) {
      // Check if the keyword mentions a country associated with this region
      // (simple heuristic — the keyword likely contains the destination name, not country code)
      const existing = regionKeywords.get(region);
      if (existing) {
        // Already tracking this region — check if keyword matches
      } else {
        regionKeywords.set(region, []);
      }
    }
    // Fallback: use the keyword itself to infer region
    const kwLower = kw.toLowerCase();
    const regionMatch = inferRegionFromKeyword(kwLower);
    if (regionMatch) {
      const existing = regionKeywords.get(regionMatch) || [];
      existing.push(kw);
      regionKeywords.set(regionMatch, existing);
      matched = true;
    }
    if (!matched) unmatched.push(kw);
  }

  const adGroups: AdGroupDef[] = [];
  for (const [region, kws] of Array.from(regionKeywords.entries())) {
    if (kws.length === 0) continue;
    adGroups.push({
      name: `Dest — ${region}`,
      keywords: kws,
      primaryKeyword: kws[0]!,
    });
  }

  // Put unmatched in a "Dest — Other" group
  if (unmatched.length > 0) {
    adGroups.push({
      name: 'Dest — Other',
      keywords: unmatched,
      primaryKeyword: unmatched[0]!,
    });
  }

  return adGroups;
}

/** Known destination → region mapping for common keywords */
const DESTINATION_REGION_MAP: Record<string, string> = {
  // UK & Ireland
  london: 'UK & Ireland',
  edinburgh: 'UK & Ireland',
  liverpool: 'UK & Ireland',
  scotland: 'UK & Ireland',
  cardiff: 'UK & Ireland',
  dublin: 'UK & Ireland',
  dingle: 'UK & Ireland',
  newport: 'UK & Ireland',
  cotswolds: 'UK & Ireland',
  bath: 'UK & Ireland',
  york: 'UK & Ireland',
  windsor: 'UK & Ireland',
  // Western Europe
  madrid: 'Europe',
  barcelona: 'Europe',
  bordeaux: 'Europe',
  paris: 'Europe',
  munich: 'Europe',
  hamburg: 'Europe',
  santander: 'Europe',
  toledo: 'Europe',
  amsterdam: 'Europe',
  lisbon: 'Europe',
  rome: 'Europe',
  florence: 'Europe',
  venice: 'Europe',
  berlin: 'Europe',
  vienna: 'Europe',
  prague: 'Europe',
  // Southern Europe & Med
  athens: 'Europe',
  olympia: 'Europe',
  catania: 'Europe',
  // Southeast Asia
  bali: 'Asia-Pacific',
  yogyakarta: 'Asia-Pacific',
  'kuala lumpur': 'Asia-Pacific',
  hanoi: 'Asia-Pacific',
  thailand: 'Asia-Pacific',
  bangkok: 'Asia-Pacific',
  bentota: 'Asia-Pacific',
  tokyo: 'Asia-Pacific',
  osaka: 'Asia-Pacific',
  kyoto: 'Asia-Pacific',
  singapore: 'Asia-Pacific',
  // Americas
  chicago: 'Americas',
  'montego bay': 'Americas',
  recife: 'Americas',
  montevideo: 'Americas',
  bermuda: 'Americas',
  cartagena: 'Americas',
  tampa: 'Americas',
  'new york': 'Americas',
  honolulu: 'Americas',
  cancun: 'Americas',
  // Middle East & Africa
  jerusalem: 'Middle East & Africa',
  dakar: 'Middle East & Africa',
  'sharm el sheikh': 'Middle East & Africa',
  marrakech: 'Middle East & Africa',
  'cape town': 'Middle East & Africa',
};

function inferRegionFromKeyword(kw: string): string | null {
  for (const [dest, region] of Object.entries(DESTINATION_REGION_MAP)) {
    if (kw.includes(dest)) return region;
  }
  return null;
}

// ---------------------------------------------------------------------------
// RSA generation (data-driven)
// ---------------------------------------------------------------------------

interface ProductStats {
  count: number;
  minPrice: number | null;
  avgRating: number | null;
  totalReviewCount: number;
}

async function getProductStatsForKeywords(keywords: string[]): Promise<ProductStats> {
  // Extract potential cities and categories from keywords
  const cities = new Set<string>();
  const categories = new Set<string>();

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    for (const dest of Object.keys(DESTINATION_REGION_MAP)) {
      if (kwLower.includes(dest)) cities.add(dest);
    }
    // Extract category signals
    const catMap: Record<string, string[]> = {
      food: ['food tour', 'cooking class', 'culinary', 'wine tast', 'street food'],
      boat: ['boat', 'sailing', 'cruise', 'kayak', 'diving', 'snorkel'],
      adventure: ['adventure', 'hiking', 'safari', 'trek'],
      culture: ['museum', 'gallery', 'walking tour', 'sightseeing'],
    };
    for (const [, patterns] of Object.entries(catMap)) {
      for (const p of patterns) {
        if (kwLower.includes(p)) categories.add(p);
      }
    }
  }

  // Query products matching these cities/categories
  const where: Record<string, unknown> = {};
  if (cities.size > 0) {
    where['city'] = {
      in: Array.from(cities).map((c) => c.charAt(0).toUpperCase() + c.slice(1)),
      mode: 'insensitive',
    };
  }

  try {
    const products = await prisma.product.aggregate({
      where: Object.keys(where).length > 0 ? (where as any) : undefined,
      _count: true,
      _min: { priceFrom: true },
      _avg: { rating: true },
      _sum: { reviewCount: true },
    });

    return {
      count: products._count,
      minPrice: products._min.priceFrom ? Number(products._min.priceFrom) : null,
      avgRating: products._avg.rating ? Math.round(products._avg.rating * 10) / 10 : null,
      totalReviewCount: Number(products._sum.reviewCount || 0),
    };
  } catch {
    return { count: 0, minPrice: null, avgRating: null, totalReviewCount: 0 };
  }
}

/** Truncate string to max length without cutting mid-word */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  const truncated = str.substring(0, max);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > max * 0.6 ? truncated.substring(0, lastSpace) : truncated;
}

function toTitleCase(str: string): string {
  const minor = new Set(['a', 'an', 'the', 'and', 'or', 'in', 'of', 'to', 'for', 'on', 'at']);
  return str
    .split(' ')
    .map((w, i) => {
      if (i === 0 || !minor.has(w.toLowerCase())) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }
      return w.toLowerCase();
    })
    .join(' ');
}

/**
 * Extract a likely destination name from a keyword.
 * "things to do in bali" → "Bali"
 * "food tours london" → "London"
 */
function extractDestination(keyword: string): string {
  const kw = keyword.toLowerCase();
  const cleaned = kw
    .replace(
      /^(things to do in|what to do in|best things to do in|top things to do in|activities in|tours in|experiences in|best tours in|book activities in)\s+/i,
      ''
    )
    .replace(
      /\s+(tours?|tickets?|activities|experiences|things to do|excursions|day trips?|adventures?|walks?)\s*$/i,
      ''
    )
    .trim();
  return toTitleCase(cleaned || keyword);
}

function generateHeadlines(
  campaignGroup: string,
  primaryKeyword: string,
  stats: ProductStats
): string[] {
  const dest = extractDestination(primaryKeyword);
  const headlines: string[] = [];

  // Pin 1 — Destination/Activity hook (always position 1)
  headlines.push(truncate(`${dest} Tours & Activities`, 30));
  headlines.push(truncate(`Best ${dest} Experiences`, 30));
  headlines.push(truncate(`Explore ${dest} Today`, 30));

  // Pin 2 — Value proposition
  if (stats.minPrice != null) {
    headlines.push(truncate(`From £${Math.round(stats.minPrice)}`, 30));
  } else {
    headlines.push(truncate('Great Value Experiences', 30));
  }
  headlines.push('Free Cancellation');
  if (stats.totalReviewCount > 100) {
    headlines.push(truncate(`${stats.totalReviewCount.toLocaleString()}+ Reviews`, 30));
  } else {
    headlines.push('Verified Guest Reviews');
  }

  // Pin 3 — Trust signals
  headlines.push('Instant Confirmation');
  if (stats.avgRating != null && stats.avgRating >= 4.0) {
    headlines.push(truncate(`${stats.avgRating}★ Average Rating`, 30));
  } else {
    headlines.push('Top-Rated Providers');
  }
  headlines.push('Secure Online Booking');

  // Unpinned — CTAs and variety
  if (stats.count > 10) {
    headlines.push(truncate(`Compare ${stats.count}+ Options`, 30));
  } else {
    headlines.push('Compare & Book Online');
  }
  headlines.push('Trusted Local Providers');
  headlines.push(truncate(`Book ${dest} Online`, 30));
  headlines.push(truncate(`Top ${dest} Tours`, 30));
  headlines.push(truncate(`${dest} Day Trips`, 30));
  headlines.push('Best Prices Guaranteed');

  // Ensure exactly 15 unique headlines, all ≤30 chars
  const unique = Array.from(new Set(headlines)).filter((h) => h.length <= 30);
  while (unique.length < 15) {
    unique.push(truncate(`${dest} Activities`, 30));
    unique.push('Book With Confidence');
    unique.push('Expert Local Guides');
    unique.push('Skip the Queue');
    unique.push('Easy Online Booking');
  }
  return unique.slice(0, 15);
}

function generateDescriptions(
  campaignGroup: string,
  primaryKeyword: string,
  stats: ProductStats
): string[] {
  const dest = extractDestination(primaryKeyword);
  const descriptions: string[] = [];

  // Description 1 — Destination + count + price
  if (stats.count > 0 && stats.minPrice != null) {
    descriptions.push(
      truncate(
        `${stats.count}+ experiences in ${dest} from £${Math.round(stats.minPrice)}. Instant booking confirmation.`,
        90
      )
    );
  } else {
    descriptions.push(
      truncate(
        `Discover the best experiences in ${dest}. Compare options and book instantly online.`,
        90
      )
    );
  }

  // Description 2 — Social proof
  if (stats.avgRating != null && stats.totalReviewCount > 50) {
    descriptions.push(
      truncate(
        `Top-rated ${dest} tours rated ${stats.avgRating}/5 by ${stats.totalReviewCount.toLocaleString()}+ travellers. Book today.`,
        90
      )
    );
  } else {
    descriptions.push(
      truncate(
        `Top-rated ${dest} tours from trusted local providers. Read reviews and book securely.`,
        90
      )
    );
  }

  // Description 3 — Value
  descriptions.push(
    truncate(
      `Compare ${dest} experiences from trusted local providers. Best prices, free cancellation.`,
      90
    )
  );

  // Description 4 — Trust
  descriptions.push(
    truncate(
      `Explore ${dest} with verified local guides. Instant confirmation, secure payment.`,
      90
    )
  );

  return descriptions.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Shared negative keyword lists
// ---------------------------------------------------------------------------

interface SharedNegativeList {
  name: string;
  keywords: string[];
  /** Campaign groups to EXCLUDE from (empty = apply to all) */
  excludeFromGroups?: string[];
}

const NEGATIVE_KEYWORD_LISTS: SharedNegativeList[] = [
  {
    name: 'Global Negatives — Non-Commercial',
    keywords: PAID_TRAFFIC_CONFIG.defaultNegativeKeywords,
  },
  {
    name: 'Competitor Brand Negatives',
    keywords: [
      'viator',
      'getyourguide',
      'get your guide',
      'klook',
      'tripadvisor',
      'trip advisor',
      'expedia',
      'tui',
      'booking.com',
    ],
    excludeFromGroups: ['Brand & Competitor'], // Don't apply to brand/competitor campaign
  },
];

// ---------------------------------------------------------------------------
// Phase 1: Pause existing campaigns
// ---------------------------------------------------------------------------

async function pauseExistingCampaigns(dryRun: boolean, limit: number): Promise<number> {
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
      platformCampaignId: { not: null },
    },
    select: {
      id: true,
      name: true,
      platformCampaignId: true,
      status: true,
    },
    take: limit,
  });

  console.log(`\nFound ${campaigns.length} existing Google campaigns to pause\n`);

  if (campaigns.length === 0) return 0;

  let paused = 0;
  let errors = 0;

  for (const campaign of campaigns) {
    if (dryRun) {
      console.log(`  [DRY RUN] Would pause: "${campaign.name}" (${campaign.status})`);
      paused++;
      continue;
    }

    try {
      // Pause on Google Ads API
      if (campaign.status === 'ACTIVE') {
        await setCampaignStatus(campaign.platformCampaignId!, 'PAUSED');
      }

      // Mark as COMPLETED in DB (preserves history, removes from active management)
      const current = await prisma.adCampaign.findUnique({
        where: { id: campaign.id },
        select: { proposalData: true },
      });

      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: {
          status: 'COMPLETED',
          proposalData: {
            ...(typeof current?.proposalData === 'object' && current?.proposalData !== null
              ? current.proposalData
              : {}),
            pauseReason: 'RESTRUCTURE_2026_02',
            pausedAt: new Date().toISOString(),
          },
        },
      });

      paused++;
      if (paused % 50 === 0) {
        console.log(`  Paused ${paused}/${campaigns.length}...`);
      }
    } catch (error) {
      errors++;
      console.error(
        `  ERROR pausing "${campaign.name}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`\nPaused: ${paused}, Errors: ${errors}`);
  return paused;
}

// ---------------------------------------------------------------------------
// Phase 2: Create new campaigns
// ---------------------------------------------------------------------------

async function createRestructuredCampaigns(dryRun: boolean, limit: number): Promise<number> {
  const config = getConfig();
  if (!config) {
    console.error('Google Ads not configured. Set GOOGLE_ADS_* env vars.');
    return 0;
  }

  // Step 1: Fetch all PAID_CANDIDATE keywords for classification
  console.log('\nFetching keywords from SEOOpportunity...');
  const opportunities = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE' },
    select: { keyword: true, searchVolume: true, cpc: true },
    orderBy: { searchVolume: 'desc' },
    take: limit > 9000 ? undefined : limit * 100, // Generous limit for keyword pool
  });

  console.log(`Found ${opportunities.length} PAID_CANDIDATE keywords\n`);

  // Step 2: Classify keywords into campaigns
  const campaignKeywords = new Map<string, string[]>();
  for (const def of CAMPAIGN_DEFINITIONS) {
    campaignKeywords.set(def.campaignGroup, []);
  }

  for (const opp of opportunities) {
    const group = classifyKeyword(opp.keyword);
    const existing = campaignKeywords.get(group);
    if (existing) {
      existing.push(opp.keyword);
    } else {
      campaignKeywords.set(group, [opp.keyword]);
    }
  }

  // Print classification summary
  console.log('=== Keyword Classification ===');
  let totalKeywords = 0;
  for (const def of CAMPAIGN_DEFINITIONS) {
    const kws = campaignKeywords.get(def.campaignGroup) || [];
    console.log(`  ${def.name}: ${kws.length} keywords`);
    totalKeywords += kws.length;
  }
  console.log(`  TOTAL: ${totalKeywords} keywords\n`);

  if (dryRun) {
    // In dry-run mode, show ad group structure for each campaign
    for (const def of CAMPAIGN_DEFINITIONS) {
      const kws = campaignKeywords.get(def.campaignGroup) || [];
      if (kws.length === 0) continue;
      const adGroups = buildAdGroups(def.campaignGroup, kws);
      console.log(
        `\n[DRY RUN] Campaign: "${def.name}" (£${def.dailyBudgetGBP}/day, max CPC £${def.maxCpcCapGBP})`
      );
      console.log(`  Geo targets: ${def.geoTargets.join(', ')}`);
      console.log(`  Ad groups (${adGroups.length}):`);
      for (const ag of adGroups) {
        console.log(
          `    - "${ag.name}": ${ag.keywords.length} keywords (primary: "${ag.primaryKeyword}")`
        );
        if (ag.keywords.length <= 5) {
          for (const kw of ag.keywords) {
            console.log(`        "${kw}"`);
          }
        } else {
          for (const kw of ag.keywords.slice(0, 3)) {
            console.log(`        "${kw}"`);
          }
          console.log(`        ... and ${ag.keywords.length - 3} more`);
        }
      }
    }
    console.log('\n[DRY RUN] Would also create shared negative keyword lists:');
    for (const list of NEGATIVE_KEYWORD_LISTS) {
      console.log(`  - "${list.name}": ${list.keywords.length} keywords`);
    }
    return 0;
  }

  // Step 3: Create shared negative keyword lists
  console.log('Creating shared negative keyword lists...');
  const sharedSetIds: Array<{ id: string; name: string; excludeFromGroups?: string[] }> = [];

  for (const list of NEGATIVE_KEYWORD_LISTS) {
    try {
      // Create SharedSet
      const setResult = (await apiRequest(config, 'POST', '/sharedSets:mutate', {
        operations: [
          {
            create: {
              name: `${list.name} ${Date.now()}`,
              type: 'NEGATIVE_KEYWORDS',
            },
          },
        ],
      })) as { results: Array<{ resourceName: string }> };

      const sharedSetResourceName = setResult.results[0]?.resourceName;
      if (!sharedSetResourceName) {
        console.error(`  Failed to create shared set: ${list.name}`);
        continue;
      }

      // Add keywords in batches of 1000
      for (let i = 0; i < list.keywords.length; i += 1000) {
        const batch = list.keywords.slice(i, i + 1000);
        await apiRequest(config, 'POST', '/sharedCriteria:mutate', {
          operations: batch.map((kw) => ({
            create: {
              sharedSet: sharedSetResourceName,
              keyword: { text: kw, matchType: 'BROAD' },
            },
          })),
        });
      }

      const sharedSetId = sharedSetResourceName.split('/').pop()!;
      sharedSetIds.push({
        id: sharedSetId,
        name: list.name,
        excludeFromGroups: list.excludeFromGroups,
      });
      console.log(
        `  Created "${list.name}" (${list.keywords.length} keywords, ID: ${sharedSetId})`
      );
    } catch (error) {
      console.error(
        `  Failed to create negative list "${list.name}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Step 4: Create the 11 campaigns
  let created = 0;
  const primarySite = await prisma.site.findFirst({
    select: { id: true, name: true, primaryDomain: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!primarySite) {
    console.error('No site found in database!');
    return 0;
  }

  for (const def of CAMPAIGN_DEFINITIONS) {
    const keywords = campaignKeywords.get(def.campaignGroup) || [];
    if (keywords.length === 0) {
      console.log(`\nSkipping "${def.name}" — no keywords classified`);
      continue;
    }

    // Skip if already created (idempotent re-run)
    const existingCampaign = await prisma.adCampaign.findFirst({
      where: {
        platform: 'GOOGLE_SEARCH',
        name: def.name,
        platformCampaignId: { not: null },
        status: { not: 'COMPLETED' },
      },
    });
    if (existingCampaign) {
      console.log(
        `\nSkipping "${def.name}" — already exists (Google ID: ${existingCampaign.platformCampaignId})`
      );
      created++;
      continue;
    }

    console.log(
      `\n--- Creating campaign: "${def.name}" (${keywords.length} keywords, £${def.dailyBudgetGBP}/day) ---`
    );

    try {
      // Create budget
      const budgetResult = (await apiRequest(config, 'POST', '/campaignBudgets:mutate', {
        operations: [
          {
            create: {
              name: `${def.name} Budget ${Date.now()}`,
              amountMicros: (def.dailyBudgetGBP * 1_000_000).toString(),
              deliveryMethod: 'STANDARD',
            },
          },
        ],
      })) as { results: Array<{ resourceName: string }> };

      const budgetResourceName = budgetResult.results[0]?.resourceName;
      if (!budgetResourceName) throw new Error('Failed to create budget');

      // Create campaign with MAXIMIZE_CLICKS
      const campaignResult = (await apiRequest(config, 'POST', '/campaigns:mutate', {
        operations: [
          {
            create: {
              name: def.name,
              status: 'PAUSED',
              advertisingChannelType: 'SEARCH',
              campaignBudget: budgetResourceName,
              targetSpend: {
                cpcBidCeilingMicros: (def.maxCpcCapGBP * 1_000_000).toString(),
              },
              networkSettings: {
                targetGoogleSearch: true,
                targetSearchNetwork: false,
                targetContentNetwork: false,
              },
              containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
            },
          },
        ],
      })) as { results: Array<{ resourceName: string }> };

      const campaignResourceName = campaignResult.results[0]?.resourceName;
      if (!campaignResourceName) throw new Error('Failed to create campaign');

      const campaignId = campaignResourceName.split('/').pop()!;
      console.log(`  Campaign created: ${campaignId}`);

      // Set geo targeting (use PRESENCE, not PRESENCE_OR_INTEREST)
      // Note: setCampaignGeoTargets uses PRESENCE_OR_INTEREST, so we set it directly
      const geoTargeted = await setCampaignGeoTargetsWithPresence(
        config,
        campaignId,
        def.geoTargets
      );
      console.log(`  Geo targets set: ${geoTargeted} locations`);

      // Link shared negative keyword lists
      for (const sharedSet of sharedSetIds) {
        if (sharedSet.excludeFromGroups?.includes(def.campaignGroup)) continue;
        try {
          await apiRequest(config, 'POST', '/campaignSharedSets:mutate', {
            operations: [
              {
                create: {
                  campaign: campaignResourceName,
                  sharedSet: `customers/${config.customerId}/sharedSets/${sharedSet.id}`,
                },
              },
            ],
          });
        } catch (error) {
          console.error(
            `  Warning: Failed to link negative list "${sharedSet.name}" to campaign:`,
            error instanceof Error ? error.message : error
          );
        }
      }

      // Build ad groups
      const adGroups = buildAdGroups(def.campaignGroup, keywords);
      console.log(`  Creating ${adGroups.length} ad groups...`);

      const adGroupConfigs: Array<{
        landingPagePath: string;
        keywords: string[];
        primaryKeyword: string;
      }> = [];

      for (const ag of adGroups) {
        try {
          // Create ad group with keywords (PHRASE + EXACT match per keyword)
          const keywordsWithMatchTypes: Array<{ text: string; matchType: 'EXACT' | 'PHRASE' }> = [];
          for (const kw of ag.keywords) {
            keywordsWithMatchTypes.push({ text: kw, matchType: 'PHRASE' });
            keywordsWithMatchTypes.push({ text: kw, matchType: 'EXACT' });
          }

          const adGroupResult = await createKeywordAdGroup({
            campaignId,
            name: ag.name,
            keywords: keywordsWithMatchTypes,
            cpcBidMicros: Math.round(def.maxCpcCapGBP * 1_000_000),
          });

          if (!adGroupResult) {
            console.error(`    Failed to create ad group: "${ag.name}"`);
            continue;
          }

          // Generate data-driven RSA
          const stats = await getProductStatsForKeywords(ag.keywords);
          const headlines = generateHeadlines(def.campaignGroup, ag.primaryKeyword, stats);
          const descriptions = generateDescriptions(def.campaignGroup, ag.primaryKeyword, stats);

          const domain = primarySite.primaryDomain || 'experiencess.com';
          const landingUrl = buildLandingUrlForAdGroup(
            domain,
            def.campaignGroup,
            ag.primaryKeyword
          );
          const displayPath = buildDisplayPath(def.campaignGroup, ag.primaryKeyword);

          await createResponsiveSearchAd({
            adGroupId: adGroupResult.adGroupId,
            headlines,
            descriptions,
            finalUrl: landingUrl,
            path1: displayPath.path1,
            path2: displayPath.path2,
          });

          adGroupConfigs.push({
            landingPagePath: `/${def.campaignGroup.toLowerCase().replace(/\s+/g, '-')}`,
            keywords: ag.keywords,
            primaryKeyword: ag.primaryKeyword,
          });

          console.log(`    Ad group "${ag.name}": ${ag.keywords.length} keywords, RSA created`);
        } catch (error) {
          console.error(
            `    Failed ad group "${ag.name}":`,
            error instanceof Error ? error.message : error
          );
        }
      }

      // Add campaign-level negative keywords
      await addCampaignNegativeKeywords(campaignId, PAID_TRAFFIC_CONFIG.defaultNegativeKeywords);

      // Add assets (sitelinks, callouts, structured snippets)
      try {
        const domain = primarySite.primaryDomain || 'experiencess.com';
        await addCampaignAssets(campaignId, def, domain, primarySite.name);
      } catch (error) {
        console.error(
          '  Warning: Failed to add campaign assets:',
          error instanceof Error ? error.message : error
        );
      }

      // Record in DB
      await prisma.adCampaign.create({
        data: {
          siteId: primarySite.id,
          platform: 'GOOGLE_SEARCH',
          name: def.name,
          status: 'PAUSED',
          dailyBudget: def.dailyBudgetGBP,
          maxCpc: def.maxCpcCapGBP,
          keywords,
          targetUrl: `https://${primarySite.primaryDomain || 'experiencess.com'}`,
          geoTargets: def.geoTargets,
          utmSource: 'google_ads',
          utmMedium: 'cpc',
          utmCampaign: `restructured_${def.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          platformCampaignId: campaignId,
          campaignGroup: def.campaignGroup,
          audiences: { adGroups: adGroupConfigs },
          proposalData: {
            restructureVersion: '2026-02',
            bidStrategy: 'MAXIMIZE_CLICKS',
            maxCpcCap: def.maxCpcCapGBP,
            phase: 1,
            keywordCount: keywords.length,
            adGroupCount: adGroups.length,
            createdAt: new Date().toISOString(),
          },
        },
      });

      created++;
      console.log(`  ✓ Campaign "${def.name}" created and recorded (Google ID: ${campaignId})`);
    } catch (error) {
      console.error(
        `  FAILED to create campaign "${def.name}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// Helper: Geo-targeting with PRESENCE (not PRESENCE_OR_INTEREST)
// ---------------------------------------------------------------------------

const COUNTRY_CODE_TO_GEO_ID: Record<string, number> = {
  GB: 2826,
  US: 2840,
  CA: 2124,
  AU: 2036,
  IE: 2372,
  NZ: 2554,
  DE: 2276,
  FR: 2250,
  ES: 2724,
  IT: 2380,
  NL: 2528,
  PT: 2620,
  AT: 2040,
  CH: 2756,
  SE: 2752,
  NO: 2578,
  DK: 2208,
  GR: 2300,
  JP: 2392,
  TH: 2764,
  SG: 2702,
  ID: 2360,
  MY: 2458,
  VN: 2704,
  AE: 2784,
  ZA: 2710,
  EG: 2818,
  MX: 2484,
  BR: 2076,
  AR: 2032,
};

async function setCampaignGeoTargetsWithPresence(
  config: NonNullable<ReturnType<typeof getConfig>>,
  campaignId: string,
  countryCodes: string[]
): Promise<number> {
  const campaignResourceName = `customers/${config.customerId}/campaigns/${campaignId}`;
  const geoIds = countryCodes
    .map((code) => COUNTRY_CODE_TO_GEO_ID[code.toUpperCase()])
    .filter((id): id is number => id !== undefined);

  if (geoIds.length === 0) return 0;

  // Set geo target type to PRESENCE (people physically in the location)
  await apiRequest(config, 'POST', '/campaigns:mutate', {
    operations: [
      {
        update: {
          resourceName: campaignResourceName,
          geoTargetTypeSetting: {
            positiveGeoTargetType: 'PRESENCE',
          },
        },
        updateMask: 'geoTargetTypeSetting.positiveGeoTargetType',
      },
    ],
  });

  // Add location criteria
  await apiRequest(config, 'POST', '/campaignCriteria:mutate', {
    operations: geoIds.map((geoId) => ({
      create: {
        campaign: campaignResourceName,
        location: { geoTargetConstant: `geoTargetConstants/${geoId}` },
        negative: false,
      },
    })),
  });

  return geoIds.length;
}

// ---------------------------------------------------------------------------
// Helper: Landing URL and display path
// ---------------------------------------------------------------------------

function buildLandingUrlForAdGroup(
  domain: string,
  campaignGroup: string,
  primaryKeyword: string
): string {
  const base = `https://${domain}`;
  const dest = extractDestination(primaryKeyword).toLowerCase().replace(/\s+/g, '-');

  if (campaignGroup === 'Destination Discovery') {
    return `${base}/destinations/${dest}`;
  }
  if (campaignGroup.startsWith('Branded')) {
    return `${base}/experiences?q=${encodeURIComponent(primaryKeyword)}`;
  }
  if (campaignGroup === 'Brand & Competitor') {
    return base;
  }
  // Category campaigns — use filtered experiences
  return `${base}/experiences?q=${encodeURIComponent(primaryKeyword)}`;
}

function buildDisplayPath(
  campaignGroup: string,
  primaryKeyword: string
): { path1: string; path2: string } {
  const dest = extractDestination(primaryKeyword)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .substring(0, 15);

  if (campaignGroup === 'Destination Discovery') {
    return { path1: 'destinations', path2: dest };
  }
  if (campaignGroup.startsWith('Branded')) {
    return { path1: 'experiences', path2: dest };
  }
  const category = campaignGroup.split(/[—–-]/)[0]!.trim().toLowerCase().replace(/\s+/g, '-');
  return { path1: category.substring(0, 15), path2: dest };
}

// ---------------------------------------------------------------------------
// Helper: Campaign assets
// ---------------------------------------------------------------------------

async function addCampaignAssets(
  campaignId: string,
  def: CampaignDefinition,
  domain: string,
  siteName: string
): Promise<void> {
  const base = `https://${domain}`;

  await createAndLinkSitelinks(campaignId, [
    {
      linkText: 'All Experiences',
      description1: `Browse all ${siteName} tours`,
      description2: 'Instant confirmation available',
      finalUrl: `${base}/experiences`,
    },
    {
      linkText: 'Book Now',
      description1: 'Secure your spot online',
      description2: 'Free cancellation on most',
      finalUrl: `${base}/experiences`,
    },
    {
      linkText: 'About Us',
      description1: `Learn about ${siteName}`,
      description2: 'Trusted local providers',
      finalUrl: `${base}/about`,
    },
    {
      linkText: 'Reviews',
      description1: 'Read verified guest reviews',
      description2: 'Real traveller feedback',
      finalUrl: `${base}/experiences`,
    },
  ]);

  await createAndLinkCallouts(campaignId, [
    'Instant Confirmation',
    'Free Cancellation',
    'Best Price Guarantee',
    'Trusted Local Providers',
    '24/7 Support',
    'Secure Booking',
  ]);

  await createAndLinkStructuredSnippets(campaignId, {
    header: 'Types',
    values: [
      'Walking Tours',
      'Food Tours',
      'Boat Tours',
      'Day Trips',
      'Museum Tours',
      'Adventure Activities',
      'City Sightseeing',
      'Cooking Classes',
    ],
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const pauseOnly = args.includes('--pause-only');
  const createOnly = args.includes('--create-only');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '99999') : 99999;

  console.log(
    `\n=== Google Ads Restructure: 893 → 11 Intent-Based Campaigns ===` +
      `${dryRun ? ' (DRY RUN)' : ''}` +
      `${pauseOnly ? ' (PAUSE ONLY)' : ''}` +
      `${createOnly ? ' (CREATE ONLY)' : ''}\n`
  );

  const shouldPause = !createOnly;
  const shouldCreate = !pauseOnly;

  if (shouldPause) {
    console.log('\n--- Phase 1: Pause Existing Campaigns ---');
    const paused = await pauseExistingCampaigns(dryRun, limit);
    console.log(`\nPhase 1 complete: ${paused} campaigns paused`);
  }

  if (shouldCreate) {
    console.log('\n--- Phase 2: Create Restructured Campaigns ---');
    const created = await createRestructuredCampaigns(dryRun, limit);
    console.log(`\nPhase 2 complete: ${created} campaigns created`);
  }

  console.log('\n=== Restructure Complete ===');
  if (!dryRun && !pauseOnly) {
    console.log('\nAll new campaigns are PAUSED. Review in Google Ads UI before enabling.');
    console.log('Enable one at a time, starting with branded campaigns.\n');
  }
}

main()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
