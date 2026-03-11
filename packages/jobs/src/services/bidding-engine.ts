/**
 * Bidding Engine — Profitability-Driven Paid Traffic Acquisition
 *
 * Calculates per-site profitability metrics (AOV, commission rate, conversion rate)
 * to determine maximum profitable CPC, then scores PAID_CANDIDATE keywords and
 * selects the best campaigns to run within budget.
 *
 * Profitability model:
 *   revenuePerClick = AOV × conversionRate × commissionRate
 *   maxProfitableCpc = revenuePerClick / targetROAS
 */

import { prisma } from '@experience-marketplace/database';
import { evaluateKeywordQuality } from './keyword-quality-evaluator';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';
import { getLowIntentPrismaConditions } from '../utils/keyword-intent';
import {
  type LandingPageType,
  type LandingPageContext,
  type SiteType,
  buildLandingPageUrl,
  loadPageCaches,
  getLandingPageBonus,
  extractSearchQuery,
  keywordContainsAllWords,
} from './landing-page-routing';

// --- Configuration -----------------------------------------------------------

const MIN_BOOKINGS_FOR_AOV = 3; // Minimum bookings to use real AOV (else fall back to catalog)
const MIN_SESSIONS_FOR_CVR = 100; // Minimum sessions to use real conversion rate
const LOOKBACK_DAYS = 90; // Days of data to consider

/**
 * Strip city/place names from an activity query to get the core activity type.
 * "wildlife portugal" → "wildlife", "walking tour rhodes" → "walking tour",
 * "climbing bali" → "climbing", "wine tasting in split" → "wine tasting".
 *
 * Uses the category patterns from paid-traffic config as known activity terms.
 * If the keyword starts with a known activity pattern, return that pattern.
 * Otherwise, heuristically strip trailing single words that look like place names.
 */
/**
 * Naive de-pluralisation: strip trailing 's' from words >3 chars that don't end in 'ss'.
 * "walking tours" → "walking tour", "cruises" → "cruise", "bus" → "bus", "glass" → "glass"
 */
function depluralize(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => (w.length > 3 && !w.endsWith('ss') && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

function stripCityFromActivity(activity: string, _keyword: string): string {
  const actLower = activity.toLowerCase().trim();
  if (!actLower) return activity;

  const { categoryPatterns } = PAID_TRAFFIC_CONFIG.metaConsolidated;
  // De-pluralise activity for matching (patterns are singular, e.g., "walking tour")
  const actDeplural = depluralize(actLower);

  // Pass 1: Check if activity STARTS with a known pattern (e.g., "wildlife portugal")
  for (const patterns of Object.values(categoryPatterns)) {
    for (const pattern of patterns as string[]) {
      const actToCheck = actDeplural.startsWith(pattern) ? actDeplural : actLower;
      if (actToCheck.startsWith(pattern) && actToCheck.length > pattern.length) {
        const remainder = actToCheck.slice(pattern.length).trim();
        const remainderWords = remainder.split(/\s+/);
        if (remainderWords.length <= 2) {
          return pattern;
        }
      }
    }
  }

  // Pass 2: Check if activity ENDS with a known pattern (e.g., "oban walking tour")
  // This handles city-first keywords like "murcia walking tour", "utrecht walking tour"
  for (const patterns of Object.values(categoryPatterns)) {
    for (const pattern of patterns as string[]) {
      const actToCheck = actDeplural.endsWith(pattern) ? actDeplural : actLower;
      if (actToCheck.endsWith(pattern) && actToCheck.length > pattern.length) {
        const prefix = actToCheck.slice(0, actToCheck.length - pattern.length).trim();
        const prefixWords = prefix.split(/\s+/);
        if (prefixWords.length <= 2) {
          return pattern;
        }
      }
    }
  }

  // Fallback: if no pattern matched, keep the full activity
  return actLower;
}

/**
 * Normalize a keyword for near-variant deduplication.
 * Handles singular/plural, word order, and common suffixes.
 */
function normalizeKeywordForDedup(keyword: string): string {
  const STOP_WORDS = new Set(['in', 'the', 'of', 'and', 'a', 'an', 'at', 'on', 'for', 'to']);
  return keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !STOP_WORDS.has(w))
    .map((w) => (w.length > 3 && !w.endsWith('ss') && w.endsWith('s') ? w.slice(0, -1) : w))
    .sort()
    .join(' ');
}

// --- Types -------------------------------------------------------------------

export interface SiteProfitability {
  siteId: string;
  siteName: string;
  avgOrderValue: number;
  avgCommissionRate: number;
  conversionRate: number;
  maxProfitableCpc: number;
  revenuePerClick: number;
  dataQuality: {
    bookingSampleSize: number;
    sessionSampleSize: number;
    usedCatalogFallback: boolean;
    usedDefaultCommission: boolean;
    usedDefaultCvr: boolean;
  };
}

export interface CampaignCandidate {
  opportunityId: string;
  keyword: string;
  siteId: string;
  siteName: string;
  platform: 'FACEBOOK' | 'GOOGLE_SEARCH';
  estimatedCpc: number;
  maxBid: number;
  searchVolume: number;
  expectedClicksPerDay: number;
  expectedDailyCost: number;
  expectedDailyRevenue: number;
  profitabilityScore: number; // 0-100
  intent: string;
  location: string | null;
  targetUrl: string;
  utmParams: { source: string; medium: string; campaign: string };
  micrositeId?: string; // If targeting a microsite landing page
  micrositeDomain?: string; // fullDomain of the microsite
  isMicrosite: boolean; // Flag for UI grouping
  // Landing page routing
  landingPagePath: string;
  landingPageType: LandingPageType;
  landingPageProducts?: number;
  // Meta consolidated campaigns — campaign category group
  campaignGroup?: string;
}

export interface CampaignGroupAdGroup {
  landingPagePath: string;
  landingPageType: LandingPageType;
  targetUrl: string;
  keywords: string[];
  primaryKeyword: string;
  maxBid: number;
  totalExpectedDailyCost: number;
  /** Per-adGroup site ID — may differ from parent group for destination page ad sets */
  siteId?: string;
  micrositeId?: string;
  /** Keyword-level final URLs — overrides ad-group targetUrl per keyword.
   *  Used for consolidated EXPERIENCES_FILTERED groups where keywords share an ad group
   *  but each keyword should land on its city-specific search results page. */
  keywordFinalUrls?: Record<string, string>;
  /** When true, RSA generation should use booking-intent headlines
   *  ("Book Now", "Reserve Today", "Available This Week") */
  bookingIntent?: boolean;
}

export interface CampaignGroup {
  siteId: string;
  micrositeId?: string;
  platform: 'FACEBOOK' | 'GOOGLE_SEARCH';
  siteName: string;
  micrositeDomain?: string;
  isMicrosite: boolean;
  campaignGroup?: string; // Meta consolidated campaign category
  totalExpectedDailyCost: number;
  totalExpectedDailyRevenue: number;
  avgProfitabilityScore: number;
  maxBid: number;
  primaryKeyword: string;
  primaryTargetUrl: string;
  candidates: CampaignCandidate[];
  adGroups: CampaignGroupAdGroup[];
}

export interface BiddingEngineResult {
  sitesAnalyzed: number;
  profiles: SiteProfitability[];
  candidates: CampaignCandidate[];
  groups: CampaignGroup[];
  budgetAllocated: number;
  budgetRemaining: number;
}

// --- Profitability Calculation -----------------------------------------------

/**
 * Calculate profitability metrics for a single site.
 * Uses real booking/analytics data where available, falls back to catalog/defaults.
 */
export async function calculateSiteProfitability(
  siteId: string
): Promise<SiteProfitability | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true, primaryDomain: true, status: true },
  });
  if (!site || site.status !== 'ACTIVE') return null;

  // Skip excluded domains (e.g. broke-nomad.com, grad-trip.com)
  if (site.primaryDomain && PAID_TRAFFIC_CONFIG.excludedDomains.includes(site.primaryDomain)) {
    return null;
  }

  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_DAYS);

  // --- Average Order Value ---
  const bookingAgg = await prisma.booking.aggregate({
    where: {
      siteId,
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      createdAt: { gte: lookbackDate },
    },
    _avg: { totalAmount: true, commissionRate: true },
    _count: true,
    _sum: { commissionAmount: true, totalAmount: true },
  });

  const bookingCount = bookingAgg._count;
  let avgOrderValue: number;
  let usedCatalogFallback = false;

  if (bookingCount >= MIN_BOOKINGS_FOR_AOV && bookingAgg._avg.totalAmount) {
    avgOrderValue = Number(bookingAgg._avg.totalAmount);
  } else {
    // Fallback to product catalog average price for this site's niche
    const productAvg = await prisma.product.aggregate({
      where: { priceFrom: { not: null } },
      _avg: { priceFrom: true },
    });
    avgOrderValue = productAvg._avg.priceFrom
      ? Number(productAvg._avg.priceFrom)
      : PAID_TRAFFIC_CONFIG.defaults.aov;
    usedCatalogFallback = true;
  }

  // --- Commission Rate ---
  let avgCommissionRate: number;
  let usedDefaultCommission = false;

  if (bookingCount >= MIN_BOOKINGS_FOR_AOV && bookingAgg._avg.commissionRate) {
    avgCommissionRate = bookingAgg._avg.commissionRate;
  } else {
    // Try portfolio-wide average
    const portfolioAvg = await prisma.booking.aggregate({
      where: {
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        commissionRate: { not: null },
        createdAt: { gte: lookbackDate },
      },
      _avg: { commissionRate: true },
      _count: true,
    });
    if (portfolioAvg._count >= 5 && portfolioAvg._avg.commissionRate) {
      avgCommissionRate = portfolioAvg._avg.commissionRate;
    } else {
      avgCommissionRate = PAID_TRAFFIC_CONFIG.defaults.commissionRate;
      usedDefaultCommission = true;
    }
  }

  // --- Conversion Rate ---
  let conversionRate: number;
  let usedDefaultCvr = false;
  let sessionSampleSize = 0;

  const snapshots = await prisma.siteAnalyticsSnapshot.aggregate({
    where: {
      siteId,
      date: { gte: lookbackDate },
    },
    _sum: { sessions: true, bookings: true },
  });

  sessionSampleSize = snapshots._sum.sessions || 0;
  const snapshotBookings = snapshots._sum.bookings || 0;

  if (sessionSampleSize >= MIN_SESSIONS_FOR_CVR && snapshotBookings > 0) {
    const rawCvr = snapshotBookings / sessionSampleSize;
    // Floor at 0.5% — below this, analytics data is likely polluted by
    // non-converting organic traffic or incomplete tracking. Use default instead.
    if (rawCvr >= 0.005) {
      conversionRate = rawCvr;
    } else {
      conversionRate = PAID_TRAFFIC_CONFIG.defaults.cvr;
      usedDefaultCvr = true;
    }
  } else {
    conversionRate = PAID_TRAFFIC_CONFIG.defaults.cvr;
    usedDefaultCvr = true;
  }

  // --- Max Profitable CPC ---
  const commissionDecimal = avgCommissionRate / 100;
  const revenuePerClick = avgOrderValue * conversionRate * commissionDecimal;
  const maxProfitableCpc = revenuePerClick / PAID_TRAFFIC_CONFIG.targetRoas;

  return {
    siteId,
    siteName: site.name,
    avgOrderValue,
    avgCommissionRate,
    conversionRate,
    maxProfitableCpc,
    revenuePerClick,
    dataQuality: {
      bookingSampleSize: bookingCount,
      sessionSampleSize,
      usedCatalogFallback,
      usedDefaultCommission,
      usedDefaultCvr,
    },
  };
}

/**
 * Calculate profitability for all active sites and upsert BiddingProfiles.
 */
export async function calculateAllSiteProfitability(): Promise<SiteProfitability[]> {
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });

  const profiles: SiteProfitability[] = [];

  for (const site of sites) {
    const profile = await calculateSiteProfitability(site.id);
    if (!profile) continue;

    // Upsert BiddingProfile in DB
    await prisma.biddingProfile.upsert({
      where: { siteId: site.id },
      create: {
        siteId: site.id,
        avgOrderValue: profile.avgOrderValue,
        avgCommissionRate: profile.avgCommissionRate,
        conversionRate: profile.conversionRate,
        maxProfitableCpc: profile.maxProfitableCpc,
        lastCalculatedAt: new Date(),
        calculationData: profile.dataQuality as any,
      },
      update: {
        avgOrderValue: profile.avgOrderValue,
        avgCommissionRate: profile.avgCommissionRate,
        conversionRate: profile.conversionRate,
        maxProfitableCpc: profile.maxProfitableCpc,
        lastCalculatedAt: new Date(),
        calculationData: profile.dataQuality as any,
      },
    });

    profiles.push(profile);
  }

  return profiles;
}

// --- Microsite Profitability --------------------------------------------------

/**
 * Calculate profitability metrics for active microsites.
 * Microsites use MicrositeAnalyticsSnapshot for traffic data and
 * fall back to portfolio-wide booking averages (microsites don't have
 * their own bookings table — they share with the parent platform).
 *
 * Returns virtual SiteProfitability entries with siteId = `microsite:${id}`
 * so they can be mixed into the same pipeline as main sites.
 */
export async function calculateMicrositeProfitability(): Promise<SiteProfitability[]> {
  // Query microsites WITHOUT nested analyticsSnapshots to avoid hitting
  // the 32767 bind-variable limit on large deployments.
  const microsites = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      siteName: true,
      fullDomain: true,
      homepageConfig: true,
      discoveryConfig: true,
    },
  });

  if (microsites.length === 0) return [];
  console.info(`[BiddingEngine] Calculating profitability for ${microsites.length} microsites`);

  // Batch-fetch analytics session totals per microsite (avoids 32767 bind limit)
  const analyticsLookback = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const DB_BATCH = 10_000;
  const sessionsByMicrosite = new Map<string, number>();

  for (let i = 0; i < microsites.length; i += DB_BATCH) {
    const batchIds = microsites.slice(i, i + DB_BATCH).map((m) => m.id);
    const grouped = await prisma.micrositeAnalyticsSnapshot.groupBy({
      by: ['micrositeId'],
      where: {
        micrositeId: { in: batchIds },
        date: { gte: analyticsLookback },
      },
      _sum: { sessions: true },
    });
    for (const row of grouped) {
      if (row.micrositeId && row._sum.sessions != null) {
        sessionsByMicrosite.set(row.micrositeId, row._sum.sessions);
      }
    }
  }

  // Get portfolio-wide averages as fallback (includes both site and microsite bookings)
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_DAYS);

  const portfolioAvg = await prisma.booking.aggregate({
    where: {
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      createdAt: { gte: lookbackDate },
    },
    _avg: { totalAmount: true, commissionRate: true },
    _count: true,
  });

  const portfolioAov = portfolioAvg._avg.totalAmount
    ? Number(portfolioAvg._avg.totalAmount)
    : PAID_TRAFFIC_CONFIG.defaults.aov;
  const portfolioCommission =
    portfolioAvg._avg.commissionRate || PAID_TRAFFIC_CONFIG.defaults.commissionRate;

  // Product catalog fallback
  const productAvg = await prisma.product.aggregate({
    where: { priceFrom: { not: null } },
    _avg: { priceFrom: true },
  });
  const catalogAvg = productAvg._avg.priceFrom
    ? Number(productAvg._avg.priceFrom)
    : PAID_TRAFFIC_CONFIG.defaults.aov;

  // Batch-fetch per-microsite booking aggregates (avoids 32k+ individual queries)
  const bookingsByMicrosite = new Map<
    string,
    { count: number; avgAmount: number | null; avgCommission: number | null }
  >();

  for (let i = 0; i < microsites.length; i += DB_BATCH) {
    const batchIds = microsites.slice(i, i + DB_BATCH).map((m) => m.id);
    const bookingGrouped = await prisma.booking.groupBy({
      by: ['micrositeId'],
      where: {
        micrositeId: { in: batchIds },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: lookbackDate },
      },
      _avg: { totalAmount: true, commissionRate: true },
      _count: true,
    });
    for (const row of bookingGrouped) {
      if (row.micrositeId) {
        bookingsByMicrosite.set(row.micrositeId, {
          count: row._count,
          avgAmount: row._avg.totalAmount ? Number(row._avg.totalAmount) : null,
          avgCommission: row._avg.commissionRate,
        });
      }
    }
  }

  const profiles: SiteProfitability[] = [];

  for (const ms of microsites) {
    // Calculate conversion rate from microsite analytics.
    const totalSessions = sessionsByMicrosite.get(ms.id) ?? 0;
    const conversionRate =
      totalSessions >= MIN_SESSIONS_FOR_CVR
        ? PAID_TRAFFIC_CONFIG.defaults.cvr * 1.2 // Slight niche boost with real data
        : PAID_TRAFFIC_CONFIG.defaults.cvr; // 1.5% default

    // Use pre-fetched microsite booking data, falling back to portfolio averages
    const msBooking = bookingsByMicrosite.get(ms.id);
    const hasMsBookings = (msBooking?.count ?? 0) >= MIN_BOOKINGS_FOR_AOV;
    const hasPortfolioBookings = portfolioAvg._count >= MIN_BOOKINGS_FOR_AOV;

    const avgOrderValue =
      hasMsBookings && msBooking?.avgAmount
        ? msBooking.avgAmount
        : hasPortfolioBookings
          ? portfolioAov
          : catalogAvg;

    const avgCommissionRate =
      hasMsBookings && msBooking?.avgCommission ? msBooking.avgCommission : portfolioCommission;

    const bookingSampleSize = hasMsBookings ? msBooking!.count : portfolioAvg._count;

    const commissionDecimal = avgCommissionRate / 100;
    const revenuePerClick = avgOrderValue * conversionRate * commissionDecimal;
    const maxProfitableCpc = revenuePerClick / PAID_TRAFFIC_CONFIG.targetRoas;

    const virtualSiteId = `microsite:${ms.id}`;

    profiles.push({
      siteId: virtualSiteId,
      siteName: `${ms.siteName} (microsite)`,
      avgOrderValue,
      avgCommissionRate,
      conversionRate,
      maxProfitableCpc,
      revenuePerClick,
      dataQuality: {
        bookingSampleSize,
        sessionSampleSize: totalSessions,
        usedCatalogFallback: !hasMsBookings && !hasPortfolioBookings,
        usedDefaultCommission: !hasMsBookings && !portfolioAvg._avg.commissionRate,
        usedDefaultCvr: totalSessions < MIN_SESSIONS_FOR_CVR,
      },
    });
  }

  return profiles;
}

// --- Destination Page Profitability -------------------------------------------

/**
 * Calculate profitability profile for destination page ad sets.
 * Uses portfolio-wide averages with a CVR boost — destination pages aggregate
 * ALL suppliers for a location, giving visitors more choice and a higher
 * expected conversion rate than single-supplier microsites.
 */
export async function calculateDestinationPageProfitability(): Promise<SiteProfitability> {
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_DAYS);

  const portfolioAvg = await prisma.booking.aggregate({
    where: {
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      createdAt: { gte: lookbackDate },
    },
    _avg: { totalAmount: true, commissionRate: true },
    _count: true,
  });

  const portfolioAov = portfolioAvg._avg.totalAmount
    ? Number(portfolioAvg._avg.totalAmount)
    : PAID_TRAFFIC_CONFIG.defaults.aov;

  const portfolioCommission =
    portfolioAvg._avg.commissionRate || PAID_TRAFFIC_CONFIG.defaults.commissionRate;

  // 1.3x CVR boost: destination pages show ALL suppliers for a location
  const conversionRate = PAID_TRAFFIC_CONFIG.defaults.cvr * 1.3;

  const commissionDecimal = portfolioCommission / 100;
  const revenuePerClick = portfolioAov * conversionRate * commissionDecimal;
  const maxProfitableCpc = revenuePerClick / PAID_TRAFFIC_CONFIG.targetRoas;

  return {
    siteId: 'destination-pages',
    siteName: 'Destination Pages (portfolio)',
    avgOrderValue: portfolioAov,
    avgCommissionRate: portfolioCommission,
    conversionRate,
    maxProfitableCpc,
    revenuePerClick,
    dataQuality: {
      bookingSampleSize: portfolioAvg._count,
      sessionSampleSize: 0,
      usedCatalogFallback: portfolioAvg._count < MIN_BOOKINGS_FOR_AOV,
      usedDefaultCommission: !portfolioAvg._avg.commissionRate,
      usedDefaultCvr: true,
    },
  };
}

// --- Low-Intent Keyword Cleanup -----------------------------------------------

/**
 * Words indicating zero purchase intent — keywords with these terms are
 * archived out of the PAID_CANDIDATE pool.
 */
/**
 * Archive PAID_CANDIDATE keywords containing low-intent terms.
 * Covers: "free" variants, wrong product types (hotel, flight, etc.),
 * navigational intent, informational queries, and single-word keywords.
 */
export async function archiveLowIntentKeywords(): Promise<number> {
  const conditions = getLowIntentPrismaConditions();

  // Also archive single-word keywords (no spaces)
  const singleWordCondition = {
    keyword: { not: { contains: ' ' } },
  };

  const result = await prisma.sEOOpportunity.updateMany({
    where: {
      status: 'PAID_CANDIDATE' as any,
      OR: [...conditions, singleWordCondition] as any,
    },
    data: { status: 'ARCHIVED' as any },
  });

  if (result.count > 0) {
    console.log(`[BiddingEngine] Archived ${result.count} low-intent PAID_CANDIDATE keywords`);
  }

  return result.count;
}

// --- Keyword-to-Site Assignment -----------------------------------------------

/**
 * Assign unassigned PAID_CANDIDATE keywords to the best-matching site.
 * Uses site homepage config (destinations, categories) and niche matching.
 * Returns count of newly assigned keywords.
 */
export async function assignKeywordsToSites(): Promise<number> {
  // Load all unassigned PAID_CANDIDATE keywords
  const unassigned = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE', siteId: null },
    select: { id: true, keyword: true, location: true, niche: true, sourceData: true },
  });

  if (unassigned.length === 0) {
    console.log('[BiddingEngine] No unassigned PAID_CANDIDATE keywords to assign');
    return 0;
  }

  console.log(`[BiddingEngine] Assigning ${unassigned.length} unassigned keywords to sites...`);

  // Load all active sites
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      primaryDomain: true,
      homepageConfig: true,
    },
  });

  if (sites.length === 0) {
    console.log('[BiddingEngine] No active sites found — cannot assign keywords');
    return 0;
  }

  // Build site matching profiles from main sites
  const siteProfiles = sites.map((site) => {
    const config = site.homepageConfig as {
      destinations?: Array<{ name: string }>;
      categories?: Array<{ name: string }>;
      popularExperiences?: { destination?: string; searchTerms?: string[] };
    } | null;

    const destinations = config?.destinations?.map((d) => d.name) ?? [];
    const primaryDest = config?.popularExperiences?.destination;
    if (primaryDest && !destinations.includes(primaryDest)) {
      destinations.unshift(primaryDest);
    }
    const categories = config?.categories?.map((c) => c.name) ?? [];
    const searchTerms = config?.popularExperiences?.searchTerms ?? [];

    const allTerms = [...destinations, ...categories, ...searchTerms, site.name].map((t) =>
      t.toLowerCase()
    );

    return { id: site.id, name: site.name, destinations, categories, searchTerms, allTerms };
  });

  // Also build city→site lookup from supplier microsites.
  // Enrichment keywords mention cities — we can route them to a main site
  // that covers a similar region, and the scoring function will then match
  // the keyword to the actual microsite for the landing page.
  const supplierMicrosites = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE', entityType: 'SUPPLIER' },
    select: { supplier: { select: { cities: true } } },
  });
  // Collect all cities that ANY microsite covers
  const allMicrositeCities = new Set<string>();
  for (const ms of supplierMicrosites) {
    for (const city of ms.supplier?.cities ?? []) {
      allMicrositeCities.add(city.toLowerCase());
    }
  }

  // Build campaignGroup → siteId lookup from branded domain config.
  // When no site matches a keyword, we classify it by campaign group and route
  // to the correct branded domain's site instead of blindly defaulting to sites[0].
  const campaignGroupDomains = PAID_TRAFFIC_CONFIG.metaConsolidated.campaignGroupDomains ?? {};
  const allBrandedDomains = [...new Set(Object.values(campaignGroupDomains).flat())].filter(
    Boolean
  );

  const domainToSiteIdMap = new Map<string, string>();
  for (const site of sites) {
    if (site.primaryDomain) {
      domainToSiteIdMap.set(site.primaryDomain, site.id);
    }
  }
  if (allBrandedDomains.length > 0) {
    const domainRecords = await prisma.domain.findMany({
      where: { domain: { in: allBrandedDomains }, status: 'ACTIVE' },
      select: { domain: true, siteId: true },
    });
    for (const dr of domainRecords) {
      if (dr.siteId && !domainToSiteIdMap.has(dr.domain)) {
        domainToSiteIdMap.set(dr.domain, dr.siteId);
      }
    }
  }

  const campaignGroupToSiteId = new Map<string, string>();
  for (const [group, domains] of Object.entries(campaignGroupDomains)) {
    for (const d of domains as string[]) {
      const sid = domainToSiteIdMap.get(d);
      if (sid) {
        campaignGroupToSiteId.set(group, sid);
        break; // Use first matching domain for each group
      }
    }
  }

  // Fallback site: only used when campaign group also has no mapped domain
  const fallbackSiteId = sites[0]!.id;

  let assigned = 0;
  let assignedByMatch = 0;
  let assignedByCampaignGroup = 0;
  let assignedByDefault = 0;

  // Batch updates for performance
  const updates: Array<{ id: string; siteId: string }> = [];

  for (const kw of unassigned) {
    const kwLower = kw.keyword.toLowerCase();
    const locationLower = (kw.location || '').toLowerCase();

    // Score each main site for this keyword
    let bestSiteId: string | null = null;
    let bestScore = 0;

    for (const site of siteProfiles) {
      let score = 0;

      // Destination match (strongest)
      for (const dest of site.destinations) {
        if (kwLower.includes(dest.toLowerCase())) {
          score += 10;
          break;
        }
      }

      // Location match
      if (locationLower) {
        for (const dest of site.destinations) {
          if (
            locationLower.includes(dest.toLowerCase()) ||
            dest.toLowerCase().includes(locationLower)
          ) {
            score += 8;
            break;
          }
        }
      }

      // Category match
      for (const cat of site.categories) {
        if (kwLower.includes(cat.toLowerCase())) {
          score += 5;
          break;
        }
      }

      // Search term match
      for (const term of site.searchTerms) {
        if (kwLower.includes(term.toLowerCase())) {
          score += 3;
          break;
        }
      }

      // Site name match
      if (kwLower.includes(site.name.toLowerCase())) {
        score += 7;
      }

      if (score > bestScore) {
        bestScore = score;
        bestSiteId = site.id;
      }
    }

    // Assign: best match if found, otherwise classify by campaign group
    // and route to the correct branded domain's site.
    let targetSiteId: string;
    if (bestScore >= 3) {
      targetSiteId = bestSiteId!;
      assignedByMatch++;
    } else {
      // Use campaign group classification to find the right branded domain
      const kwCampaignGroup = classifyKeywordToCampaignGroup(kw.keyword, 50);
      const groupSiteId = campaignGroupToSiteId.get(kwCampaignGroup);
      targetSiteId = groupSiteId ?? fallbackSiteId;
      if (groupSiteId) assignedByCampaignGroup++;
      else assignedByDefault++;
    }

    updates.push({ id: kw.id, siteId: targetSiteId });
  }

  // Execute batch updates
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);
    await Promise.all(
      batch.map(
        (u) =>
          prisma.sEOOpportunity
            .update({
              where: { id: u.id },
              data: { siteId: u.siteId },
            })
            .catch(() => {}) // Skip errors
      )
    );
    assigned += batch.length;
  }

  console.info(
    `[BiddingEngine] Assigned ${assigned}/${unassigned.length} keywords ` +
      `(${assignedByMatch} by match, ${assignedByCampaignGroup} by campaign group, ` +
      `${assignedByDefault} to fallback)`
  );
  return assigned;
}

// --- Meta Consolidated Campaign Classification --------------------------------

/**
 * Classify a keyword into a campaign group using pattern matching.
 * Iterates categoryPatterns in order (first match wins).
 * Unmatched keywords fall into General Tours Tier 1 or Tier 2 based on profitability.
 */
export function classifyKeywordToCampaignGroup(
  keyword: string,
  profitabilityScore: number
): string {
  const kw = keyword.toLowerCase();
  for (const [group, patterns] of Object.entries(
    PAID_TRAFFIC_CONFIG.metaConsolidated.categoryPatterns
  )) {
    if ((patterns as string[]).some((p) => kw.includes(p))) return group;
  }
  // Default: General Tours, tiered by profitability
  return profitabilityScore >= PAID_TRAFFIC_CONFIG.metaConsolidated.generalToursTier1Threshold
    ? 'General Tours – Tier 1'
    : 'General Tours – Tier 2';
}

// --- Opportunity Scoring -----------------------------------------------------

/**
 * Score PAID_CANDIDATE keywords by profitability potential.
 * Matches keywords to sites AND microsites, calculates expected revenue per ad dollar.
 * When a keyword matches a microsite's discoveryConfig, uses the microsite as landing page
 * (better relevance → higher Quality Score → lower actual CPC).
 */
export async function scoreCampaignOpportunities(
  profiles: SiteProfitability[]
): Promise<CampaignCandidate[]> {
  // Per-group keyword selection: fetch top keywords from each campaign group
  // to ensure every group gets representation (not just globally top-scored keywords).
  const oppSelect = {
    id: true,
    keyword: true,
    searchVolume: true,
    cpc: true,
    intent: true,
    location: true,
    priorityScore: true,
    sourceData: true,
    siteId: true,
    site: { select: { name: true, primaryDomain: true } },
  } as const;

  const PER_GROUP_LIMIT = 1000;
  const UNGROUPED_LIMIT = 5000;

  const groups = await prisma.sEOOpportunity.groupBy({
    by: ['campaignGroup'],
    where: { status: 'PAID_CANDIDATE', campaignGroup: { not: null } },
  });

  // Fetch first group to establish the type, then fetch the rest
  const firstGroup = groups[0];
  const firstGroupOpps = firstGroup
    ? await prisma.sEOOpportunity.findMany({
        where: { status: 'PAID_CANDIDATE', campaignGroup: firstGroup.campaignGroup },
        select: oppSelect,
        orderBy: { priorityScore: 'desc' },
        take: PER_GROUP_LIMIT,
      })
    : [];
  const allOpportunities = [...firstGroupOpps];

  for (const { campaignGroup } of groups.slice(1)) {
    const groupOpps = await prisma.sEOOpportunity.findMany({
      where: { status: 'PAID_CANDIDATE', campaignGroup },
      select: oppSelect,
      orderBy: { priorityScore: 'desc' },
      take: PER_GROUP_LIMIT,
    });
    allOpportunities.push(...groupOpps);
  }

  // Legacy keywords without campaignGroup (from other sources like scanners/enrichment)
  const ungrouped = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE', campaignGroup: null },
    select: oppSelect,
    orderBy: { priorityScore: 'desc' },
    take: UNGROUPED_LIMIT,
  });
  allOpportunities.push(...ungrouped);

  console.info(
    `[BiddingEngine] Loaded ${allOpportunities.length} keywords ` +
      `(${groups.length} campaign groups + ungrouped)`
  );

  // Task 2.4: Only process keywords with AI decision = 'BID' (or not yet evaluated).
  // REVIEW keywords need manual approval before creating campaigns.
  const opportunities = allOpportunities.filter((opp) => {
    const sd = opp.sourceData as { aiEvaluation?: { decision?: string } } | null;
    const decision = sd?.aiEvaluation?.decision;
    // Allow: not yet evaluated (null) or explicitly approved (BID)
    return !decision || decision === 'BID';
  });
  const reviewFiltered = allOpportunities.length - opportunities.length;
  if (reviewFiltered > 0) {
    console.log(
      `[BiddingEngine] AI gate: ${opportunities.length} BID/unevaluated, ${reviewFiltered} REVIEW keywords excluded`
    );
  }

  // Load active microsites for keyword→microsite matching
  // 1) OPPORTUNITY microsites: have discoveryConfig with keywords
  const opportunityMicrosites = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE', entityType: 'OPPORTUNITY' },
    select: {
      id: true,
      siteName: true,
      fullDomain: true,
      discoveryConfig: true,
      opportunityId: true,
    },
  });

  // 2) SUPPLIER microsites: match via supplier cities + categories
  const supplierMicrosites = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE', entityType: 'SUPPLIER' },
    select: {
      id: true,
      supplierId: true,
      subdomain: true,
      siteName: true,
      fullDomain: true,
      cachedProductCount: true,
      supplier: { select: { cities: true, categories: true, holibobSupplierId: true } },
    },
  });

  // Merge for unified type
  // Task 2.2: Added categories for theme-aware city matching
  type MicrositeMatch = {
    id: string;
    siteName: string;
    fullDomain: string;
    productCount: number;
    categories?: string[];
  };

  // Build keyword→microsite lookup from OPPORTUNITY discoveryConfig
  const micrositeByTerm = new Map<string, MicrositeMatch>();
  for (const ms of opportunityMicrosites) {
    const disco = ms.discoveryConfig as {
      keyword?: string;
      destination?: string;
      niche?: string;
      searchTerms?: string[];
    } | null;
    const entry: MicrositeMatch = {
      id: ms.id,
      siteName: ms.siteName,
      fullDomain: ms.fullDomain,
      productCount: 0,
    };
    if (disco?.keyword) micrositeByTerm.set(disco.keyword.toLowerCase(), entry);
    for (const term of disco?.searchTerms ?? []) {
      micrositeByTerm.set(term.toLowerCase(), entry);
    }
  }

  // Build city→microsite[] lookup from SUPPLIER microsites
  // When a keyword mentions a city, we can route to a supplier microsite in that city
  const micrositesByCity = new Map<string, MicrositeMatch[]>();
  for (const ms of supplierMicrosites) {
    const cities = ms.supplier?.cities ?? [];
    if (cities.length === 0) continue;
    const entry: MicrositeMatch = {
      id: ms.id,
      siteName: ms.siteName,
      fullDomain: ms.fullDomain,
      productCount: ms.cachedProductCount,
      categories: ms.supplier?.categories ?? [], // Task 2.2: include for theme matching
    };
    for (const city of cities) {
      const cityLower = city.toLowerCase();
      const existing = micrositesByCity.get(cityLower) || [];
      existing.push(entry);
      micrositesByCity.set(cityLower, existing);
    }
  }

  // Build supplierId → microsite lookup for source supplier preference
  // When a keyword was extracted from a supplier's products, prefer that supplier's microsite
  const micrositeBySupplierId = new Map<string, MicrositeMatch>();
  for (const ms of supplierMicrosites) {
    if (ms.supplierId) {
      micrositeBySupplierId.set(ms.supplierId, {
        id: ms.id,
        siteName: ms.siteName,
        fullDomain: ms.fullDomain,
        productCount: ms.cachedProductCount,
      });
    }
  }

  // Build name-based lookup from supplier microsites for keyword↔name matching.
  // E.g. keyword "harry potter tours london" should match microsite "Harry Potter Tours"
  // because the subdomain "harry-potter-tours" appears in the keyword text.
  // Store as [nameSlug, MicrositeMatch] pairs sorted longest-first to prefer specific matches.
  const micrositeNameEntries: Array<{ slug: string; match: MicrositeMatch }> = [];
  for (const ms of supplierMicrosites) {
    const entry: MicrositeMatch = {
      id: ms.id,
      siteName: ms.siteName,
      fullDomain: ms.fullDomain,
      productCount: ms.cachedProductCount,
    };
    // Use subdomain as the slug (e.g. "harry-potter-tours")
    if (ms.subdomain && ms.subdomain.length >= 5) {
      // Convert slug to space-separated for keyword matching: "harry-potter-tours" → "harry potter tours"
      const nameFromSlug = ms.subdomain.replace(/-/g, ' ').toLowerCase();
      micrositeNameEntries.push({ slug: nameFromSlug, match: entry });
    }
  }
  // Sort longest first so "harry potter tours" matches before shorter slugs
  micrositeNameEntries.sort((a, b) => b.slug.length - a.slug.length);

  console.log(
    `[BiddingEngine] Microsite lookup: ${micrositeByTerm.size} keyword terms, ${micrositesByCity.size} cities, ${micrositeBySupplierId.size} supplier IDs, ${micrositeNameEntries.length} name slugs (${supplierMicrosites.length} supplier microsites)`
  );

  // --- Pre-load branded domain → site mapping for destination page candidates ---
  const campaignGroupDomains = PAID_TRAFFIC_CONFIG.metaConsolidated.campaignGroupDomains ?? {};
  const allBrandedDomains = [...new Set(Object.values(campaignGroupDomains).flat())].filter(
    Boolean
  );

  const domainRecords =
    allBrandedDomains.length > 0
      ? await prisma.domain.findMany({
          where: { domain: { in: allBrandedDomains }, status: 'ACTIVE' },
          select: { domain: true, siteId: true },
        })
      : [];

  const domainToSiteId = new Map<string, string>();
  for (const dr of domainRecords) {
    if (dr.siteId) domainToSiteId.set(dr.domain, dr.siteId);
  }

  // Build campaignGroup → branded site entries
  const campaignGroupSiteIds = new Map<string, Array<{ domain: string; siteId: string }>>();
  for (const [group, domains] of Object.entries(campaignGroupDomains)) {
    const entries: Array<{ domain: string; siteId: string }> = [];
    for (const domain of domains) {
      const sid = domainToSiteId.get(domain);
      if (sid) entries.push({ domain, siteId: sid });
    }
    if (entries.length > 0) campaignGroupSiteIds.set(group, entries);
  }

  // Load branded site names
  const brandedSiteIds = [
    ...new Set(domainRecords.map((d) => d.siteId).filter(Boolean) as string[]),
  ];
  const brandedSites =
    brandedSiteIds.length > 0
      ? await prisma.site.findMany({
          where: { id: { in: brandedSiteIds } },
          select: { id: true, name: true },
        })
      : [];
  const brandedSiteNameById = new Map(brandedSites.map((s) => [s.id, s.name]));

  console.info(
    `[BiddingEngine] Destination page lookup: ${domainRecords.length}/${allBrandedDomains.length} branded domains resolved, ${campaignGroupSiteIds.size} campaign groups with sites`
  );

  // --- Pre-load page caches for landing page routing ---
  const allSiteIds = [...new Set(opportunities.map((o) => o.siteId).filter(Boolean) as string[])];
  const combinedSiteIds = [...new Set([...allSiteIds, ...brandedSiteIds])];
  const allMicrositeIds = [
    ...new Set([...opportunityMicrosites.map((m) => m.id), ...supplierMicrosites.map((m) => m.id)]),
  ];
  const { pagesBySite, pagesByMicrosite, collectionsByMicrosite } = await loadPageCaches(
    combinedSiteIds,
    allMicrositeIds
  );
  console.log(
    `[BiddingEngine] Page cache: ${combinedSiteIds.length} sites (${brandedSiteIds.length} branded), ${allMicrositeIds.length} microsites, pages for ${pagesBySite.size} sites + ${pagesByMicrosite.size} microsites, collections for ${collectionsByMicrosite.size} microsites`
  );

  // Build microsite ID → config lookup for landing page context
  const supplierMicrositeById = new Map<string, (typeof supplierMicrosites)[number]>();
  for (const ms of supplierMicrosites) {
    supplierMicrositeById.set(ms.id, ms);
  }
  const opportunityMicrositeById = new Map<string, (typeof opportunityMicrosites)[number]>();
  for (const ms of opportunityMicrosites) {
    opportunityMicrositeById.set(ms.id, ms);
  }

  const candidates: CampaignCandidate[] = [];
  let destCandidatesCreated = 0;

  for (const opp of opportunities) {
    // Find matching site profile
    const siteId = opp.siteId;
    if (!siteId) continue;

    const profile = profiles.find((p) => p.siteId === siteId);
    if (!profile) continue;

    const estimatedCpc = Number(opp.cpc);
    if (estimatedCpc <= 0) continue;

    // Only bid if CPC is below our max profitable CPC
    const maxBid = Math.min(profile.maxProfitableCpc, estimatedCpc * 1.2); // Allow 20% above estimate
    if (maxBid < 0.01) continue; // Too low to be viable

    const rawDomain = opp.site?.primaryDomain;
    if (!rawDomain) continue;

    // Drop keywords matching negative patterns (non-commercial terms)
    const kwLowerEarly = opp.keyword.toLowerCase();
    const negPatterns = PAID_TRAFFIC_CONFIG.metaConsolidated.googleNegativePatterns;
    if (negPatterns.some((pat) => kwLowerEarly.includes(pat))) continue;

    // Classify keyword's campaign group and find its branded domain (if any).
    // Branded domain enforcement happens AFTER microsite matching below.
    let domain = rawDomain;
    let effectiveSiteId = siteId;
    const kwCampaignGroup = classifyKeywordToCampaignGroup(opp.keyword, 50);
    const expectedDomains = ((campaignGroupDomains[kwCampaignGroup] ?? []) as string[]).filter(
      Boolean
    );

    // Check if keyword matches a microsite for better landing page relevance
    const kwLower = opp.keyword.toLowerCase();
    let matchedMicrosite: MicrositeMatch | undefined;
    let matchedMicrositeEntityType: 'SUPPLIER' | 'OPPORTUNITY' | undefined;

    // 1) Exact match on OPPORTUNITY microsite keyword/searchTerms
    matchedMicrosite = micrositeByTerm.get(kwLower);
    if (matchedMicrosite) matchedMicrositeEntityType = 'OPPORTUNITY';

    // 2) Substring match on OPPORTUNITY microsite terms
    if (!matchedMicrosite) {
      for (const [term, ms] of micrositeByTerm) {
        if (kwLower.includes(term) || term.includes(kwLower)) {
          matchedMicrosite = ms;
          matchedMicrositeEntityType = 'OPPORTUNITY';
          break;
        }
      }
    }

    // 2.5) Source supplier preference — if keyword was extracted from a specific
    //       supplier's products, prefer that supplier's microsite over city-based matching
    if (!matchedMicrosite) {
      const sourceData = opp.sourceData as { sourceSupplierIds?: string[] } | null;
      const sourceSupplierIds = sourceData?.sourceSupplierIds ?? [];
      for (const sourceSupplierId of sourceSupplierIds) {
        const sourceMs = micrositeBySupplierId.get(sourceSupplierId);
        if (sourceMs) {
          matchedMicrosite = sourceMs;
          matchedMicrositeEntityType = 'SUPPLIER';
          break;
        }
      }
    }

    // 2.7) Name-based match — if keyword contains a microsite's name/subdomain,
    //       route to that microsite. E.g. "harry potter tours london" matches
    //       the "harry-potter-tours" microsite because "harry potter tours" ⊂ keyword.
    if (!matchedMicrosite) {
      for (const { slug, match } of micrositeNameEntries) {
        if (kwLower.includes(slug)) {
          matchedMicrosite = match;
          matchedMicrositeEntityType = 'SUPPLIER';
          break;
        }
      }
    }

    // 3) City-based match on SUPPLIER microsites — if keyword mentions a city,
    //    route to a supplier in that city.
    //    Task 2.2: Theme-aware matching — prefer supplier whose categories match the keyword
    //    over simply picking the one with the most products (avoids routing "walking tours london"
    //    to a taxi transfer company with 500 products instead of a walking tour company with 30).
    if (!matchedMicrosite) {
      for (const [city, micrositesInCity] of micrositesByCity) {
        if (keywordContainsAllWords(kwLower, city)) {
          // Score each microsite by category relevance to keyword
          let bestMs = micrositesInCity[0]!;
          let bestScore = 0;

          for (const ms of micrositesInCity) {
            // Count how many of the supplier's categories appear in the keyword
            const catMatches = (ms.categories ?? []).filter((cat) =>
              kwLower.includes(cat.toLowerCase())
            ).length;
            // Score: category matches (×100) + product count (tiebreaker)
            const score = catMatches * 100 + ms.productCount;
            if (score > bestScore) {
              bestScore = score;
              bestMs = ms;
            }
          }

          matchedMicrosite = bestMs;
          matchedMicrositeEntityType = 'SUPPLIER';
          break;
        }
      }
    }

    // If keyword belongs to a campaign group with a branded domain, ALWAYS use that
    // domain instead of any microsite match. Branded sites (harry-potter-tours.com,
    // water-tours.com, etc.) are more authoritative than supplier microsites.
    if (expectedDomains.length > 0) {
      const correctEntry = campaignGroupSiteIds.get(kwCampaignGroup);
      if (correctEntry && correctEntry.length > 0) {
        domain = correctEntry[0]!.domain;
        effectiveSiteId = correctEntry[0]!.siteId;
        matchedMicrosite = undefined;
        matchedMicrositeEntityType = undefined;
      }
    }

    // Use microsite profile if available, then overridden site profile, then original
    let effectiveProfile = profile;
    if (matchedMicrosite) {
      const msProfile = profiles.find((p) => p.siteId === `microsite:${matchedMicrosite!.id}`);
      if (msProfile) effectiveProfile = msProfile;
    } else if (effectiveSiteId !== siteId) {
      // Domain was overridden — use the correct site's profile if available
      const overrideProfile = profiles.find((p) => p.siteId === effectiveSiteId);
      if (overrideProfile) effectiveProfile = overrideProfile;
    }

    // --- Build landing page context for API-aware routing ---
    const targetDomain = matchedMicrosite ? matchedMicrosite.fullDomain : domain;
    let siteType: SiteType = 'MAIN';
    let lpContext: LandingPageContext;

    if (matchedMicrositeEntityType === 'SUPPLIER') {
      siteType = 'SUPPLIER_MICROSITE';
      const msId = matchedMicrosite!.id;
      const msConfig = supplierMicrositeById.get(msId);
      lpContext = {
        siteType,
        micrositeEntityType: 'SUPPLIER',
        cachedProductCount: matchedMicrosite!.productCount,
        supplierCities: msConfig?.supplier?.cities ?? [],
        supplierCategories: msConfig?.supplier?.categories ?? [],
        sitePages: pagesByMicrosite.get(msId) ?? [],
        collections: collectionsByMicrosite.get(msId) ?? [],
      };
    } else if (matchedMicrositeEntityType === 'OPPORTUNITY') {
      siteType = 'OPPORTUNITY_MICROSITE';
      const msId = matchedMicrosite!.id;
      const msConfig = opportunityMicrositeById.get(msId);
      const disco = msConfig?.discoveryConfig as {
        keyword?: string;
        destination?: string;
        searchTerms?: string[];
      } | null;
      lpContext = {
        siteType,
        micrositeEntityType: 'OPPORTUNITY',
        discoveryConfig: disco ?? undefined,
        sitePages: pagesByMicrosite.get(msId) ?? [],
        collections: collectionsByMicrosite.get(msId) ?? [],
      };
    } else {
      // Main site — no microsite match; use effectiveSiteId for correct page lookups
      lpContext = {
        siteType: 'MAIN',
        sitePages: pagesBySite.get(effectiveSiteId) ?? [],
        collections: [],
      };
    }

    // Route keyword to best landing page
    const landingPage = buildLandingPageUrl(
      targetDomain,
      opp.keyword,
      opp.intent,
      opp.location,
      lpContext
    );

    // Estimate daily metrics
    const searchVolume = opp.searchVolume;
    const estimatedDailySearches = searchVolume / 30;
    const estimatedCtr = 0.02; // Conservative 2% CTR for paid ads
    const expectedClicksPerDay = estimatedDailySearches * estimatedCtr;
    const expectedDailyCost = expectedClicksPerDay * estimatedCpc;
    const expectedDailyRevenue = expectedClicksPerDay * effectiveProfile.revenuePerClick;

    // Profitability score: expected revenue / cost ratio, weighted by volume
    const expectedRoas =
      expectedDailyRevenue > 0 && expectedDailyCost > 0
        ? expectedDailyRevenue / expectedDailyCost
        : 0;
    const volumeBonus = Math.min(20, Math.log10(searchVolume + 1) * 8);
    const roasBonus = Math.min(60, expectedRoas * 20);
    const intentBonus = opp.intent === 'TRANSACTIONAL' ? 20 : opp.intent === 'COMMERCIAL' ? 15 : 5;
    // Microsite landing page relevance bonus — niche site = better Quality Score
    const micrositeBonus = matchedMicrosite ? 10 : 0;
    // Landing page type bonus — dedicated pages drive better Quality Score
    const landingPageBonus = getLandingPageBonus(landingPage.type);
    const profitabilityScore = Math.round(
      Math.min(100, roasBonus + volumeBonus + intentBonus + micrositeBonus + landingPageBonus)
    );

    const utmCampaign = `auto_${opp.keyword.replace(/\s+/g, '_').substring(0, 40)}`;

    // Score for enabled platforms only
    for (const platform of PAID_TRAFFIC_CONFIG.enabledPlatforms) {
      const utmSource = platform === 'FACEBOOK' ? 'facebook_ads' : 'google_ads';
      const candidate: CampaignCandidate = {
        opportunityId: opp.id,
        keyword: opp.keyword,
        siteId: effectiveSiteId,
        siteName: matchedMicrosite
          ? matchedMicrosite.siteName
          : (brandedSiteNameById.get(effectiveSiteId) ?? opp.site?.name ?? ''),
        platform,
        estimatedCpc,
        maxBid,
        searchVolume,
        expectedClicksPerDay,
        expectedDailyCost,
        expectedDailyRevenue,
        profitabilityScore,
        intent: opp.intent,
        location: opp.location,
        targetUrl: landingPage.url,
        utmParams: { source: utmSource, medium: 'cpc', campaign: utmCampaign },
        micrositeId: matchedMicrosite?.id,
        micrositeDomain: matchedMicrosite?.fullDomain,
        isMicrosite: !!matchedMicrosite,
        landingPagePath: landingPage.path,
        landingPageType: landingPage.type,
        landingPageProducts: landingPage.productCount,
      };
      // Classify keyword into campaign group (used for both Meta and Google STAG grouping)
      const kwGroup = classifyKeywordToCampaignGroup(opp.keyword, profitabilityScore);
      candidate.campaignGroup = kwGroup;

      // Drop General Tours keywords for Google — too vague to convert
      if (
        platform === 'GOOGLE_SEARCH' &&
        (kwGroup === 'General Tours – Tier 1' || kwGroup === 'General Tours – Tier 2')
      ) {
        continue;
      }

      candidates.push(candidate);
    }

    // --- Sprint 2: Create ADDITIONAL destination page candidates ---
    // For each keyword, check if branded domains for this campaign group
    // have a destination page matching the keyword's city. These candidates
    // sit ALONGSIDE microsite candidates in the same consolidated campaign.
    const destProfile = profiles.find((p) => p.siteId === 'destination-pages');
    if (destProfile) {
      const kwCampaignGroup = classifyKeywordToCampaignGroup(opp.keyword, profitabilityScore);
      const brandedEntries = campaignGroupSiteIds.get(kwCampaignGroup);

      if (brandedEntries) {
        for (const { domain: brandedDomain, siteId: brandedSiteId } of brandedEntries) {
          const brandedPages = pagesBySite.get(brandedSiteId) ?? [];
          // Find destination page matching this keyword's city.
          // Use the FULL slug body (e.g. "london-england", "south-africa") to avoid
          // false positives where a single word like "south" or "los" matches incorrectly.
          const destPage = brandedPages.find((p) => {
            if (p.type !== 'LANDING' || !p.slug.startsWith('destinations/')) return false;
            const slugBody = p.slug.replace('destinations/', '');
            const dashParts = slugBody.split('-');
            // Match the FULL slug as a city name (all dash parts joined by spaces).
            // For single-part slugs like "london", match just that word.
            // For multi-part slugs like "los-angeles" or "south-africa", ALL parts
            // must appear in the keyword to prevent "south" matching "south queensferry".
            const fullCity = dashParts.join(' ');
            return keywordContainsAllWords(kwLower, fullCity);
          });

          if (!destPage) continue;

          // Apply destination profitability gate
          const destMaxBid = Math.min(destProfile.maxProfitableCpc, estimatedCpc * 1.2);
          if (destMaxBid < 0.01) continue;

          // Score using destination profile
          const destRevenue = expectedClicksPerDay * destProfile.revenuePerClick;
          const destRoas =
            destRevenue > 0 && expectedDailyCost > 0 ? destRevenue / expectedDailyCost : 0;
          const destRoasBonus = Math.min(60, destRoas * 20);
          const destLpBonus = getLandingPageBonus('DESTINATION'); // 12
          const destScore = Math.round(
            Math.min(100, destRoasBonus + volumeBonus + intentBonus + destLpBonus)
          );

          const destUtmCampaign = `dest_${opp.keyword.replace(/\s+/g, '_').substring(0, 40)}`;
          const destSiteName = brandedSiteNameById.get(brandedSiteId) || '';

          for (const platform of PAID_TRAFFIC_CONFIG.enabledPlatforms) {
            const utmSource = platform === 'FACEBOOK' ? 'facebook_ads' : 'google_ads';
            const destCandidate: CampaignCandidate = {
              opportunityId: opp.id,
              keyword: opp.keyword,
              siteId: brandedSiteId,
              siteName: destSiteName,
              platform,
              estimatedCpc,
              maxBid: destMaxBid,
              searchVolume,
              expectedClicksPerDay,
              expectedDailyCost,
              expectedDailyRevenue: destRevenue,
              profitabilityScore: destScore,
              intent: opp.intent,
              location: opp.location,
              targetUrl: `https://${brandedDomain}/${destPage.slug}`,
              utmParams: { source: utmSource, medium: 'cpc', campaign: destUtmCampaign },
              isMicrosite: false,
              landingPagePath: `/${destPage.slug}`,
              landingPageType: 'DESTINATION',
            };

            destCandidate.campaignGroup = kwCampaignGroup;

            // Drop General Tours keywords for Google — too vague to convert
            if (
              platform === 'GOOGLE_SEARCH' &&
              (kwCampaignGroup === 'General Tours – Tier 1' ||
                kwCampaignGroup === 'General Tours – Tier 2')
            ) {
              continue;
            }

            candidates.push(destCandidate);
            destCandidatesCreated++;
          }
        }
      }
    }
  }

  console.info(`[BiddingEngine] Destination page candidates: ${destCandidatesCreated} created`);

  // Filter out candidates whose landing page is unlikely to show relevant products.
  // These create ads that land on empty "no results" pages — wasted ad spend.
  const beforeFilter = candidates.length;
  const validCandidates = candidates.filter((c) => {
    // If landing page has a validated product count of 0, skip it
    if (c.landingPageProducts !== undefined && c.landingPageProducts <= 0) {
      return false;
    }
    // Task 2.3: Allow EXPERIENCES_FILTERED on main sites when a ?q= search term
    // is present. Main sites use the Product Discovery API, which searches across
    // all providers, so ?q=kayaking+tours will show relevant results.
    // Only reject EXPERIENCES_FILTERED pages that have NO search/filter params.
    if (c.landingPageType === 'EXPERIENCES_FILTERED' && !c.isMicrosite) {
      const hasSearchParam = c.landingPagePath.includes('q=');
      if (!hasSearchParam) return false;
    }
    return true;
  });
  if (validCandidates.length < beforeFilter) {
    console.log(
      `[Bidding Engine] Filtered out ${beforeFilter - validCandidates.length} candidates ` +
        `with empty/unvalidated landing pages (${validCandidates.length} remaining)`
    );
  }

  // Task 1.5: Validate city-filtered landing pages against the local Product table.
  // Replaces Holibob API calls with fast local DB queries.
  // supplier.cities may list cities where the supplier has no actual products.
  let cityValidated = 0;
  let cityRemoved = 0;
  const cityValidationCache = new Map<string, boolean>();

  const cityValidatedCandidates: CampaignCandidate[] = [];
  for (const c of validCandidates) {
    // Only validate EXPERIENCES_FILTERED pages with a ?cities= parameter on supplier microsites
    if (c.landingPageType !== 'EXPERIENCES_FILTERED' || !c.micrositeId) {
      cityValidatedCandidates.push(c);
      continue;
    }

    // Extract city from landing page path (e.g., "/experiences?cities=Paris")
    const cityParam = new URLSearchParams(c.landingPagePath.split('?')[1] ?? '').get('cities');
    if (!cityParam) {
      cityValidatedCandidates.push(c);
      continue;
    }

    // Get the supplier's local DB ID from the microsite config
    const msConfig = supplierMicrositeById.get(c.micrositeId);
    const supplierId = msConfig?.supplierId;
    if (!supplierId) {
      cityValidatedCandidates.push(c);
      continue;
    }

    // Cache key: supplierId|cityName — same supplier+city won't be re-checked
    const cacheKey = `${supplierId}|${cityParam}`;
    let hasProducts = cityValidationCache.get(cacheKey);

    if (hasProducts === undefined) {
      // Query local Product table instead of Holibob API
      const product = await prisma.product.findFirst({
        where: {
          supplierId,
          city: { equals: cityParam, mode: 'insensitive' },
        },
        select: { id: true },
      });
      hasProducts = product !== null;
      cityValidationCache.set(cacheKey, hasProducts);
    }

    if (hasProducts) {
      cityValidatedCandidates.push(c);
      cityValidated++;
    } else {
      cityRemoved++;
    }
  }

  if (cityRemoved > 0) {
    console.log(
      `[Bidding Engine] City product validation: ${cityValidated} passed, ${cityRemoved} removed ` +
        `(cities with 0 products in local Product cache). Cache entries: ${cityValidationCache.size}`
    );
  }

  // Deduplicate: keep only the best candidate per keyword+platform.
  // With branded domain routing, primary candidates and Sprint 2 destination candidates
  // can overlap. Prefer DESTINATION > CATEGORY > COLLECTION > BLOG > EXPERIENCES_FILTERED > HOMEPAGE.
  const LP_TYPE_PRIORITY: Record<string, number> = {
    DESTINATION: 6,
    CATEGORY: 5,
    COLLECTION: 4,
    BLOG: 3,
    EXPERIENCES_FILTERED: 2,
    HOMEPAGE: 1,
  };
  const bestByKeywordPlatform = new Map<string, CampaignCandidate>();
  for (const c of cityValidatedCandidates) {
    const dedupeKey = `${c.keyword}|${c.platform}`;
    const existing = bestByKeywordPlatform.get(dedupeKey);
    if (!existing) {
      bestByKeywordPlatform.set(dedupeKey, c);
      continue;
    }
    // Prefer higher landing page type priority, then higher profitability score
    const cPriority = LP_TYPE_PRIORITY[c.landingPageType ?? ''] ?? 0;
    const existPriority = LP_TYPE_PRIORITY[existing.landingPageType ?? ''] ?? 0;
    if (
      cPriority > existPriority ||
      (cPriority === existPriority && c.profitabilityScore > existing.profitabilityScore)
    ) {
      bestByKeywordPlatform.set(dedupeKey, c);
    }
  }
  const exactDedupedCandidates = Array.from(bestByKeywordPlatform.values());
  if (exactDedupedCandidates.length < cityValidatedCandidates.length) {
    console.info(
      `[Bidding Engine] Exact dedup: ${cityValidatedCandidates.length} → ${exactDedupedCandidates.length} ` +
        `(removed ${cityValidatedCandidates.length - exactDedupedCandidates.length} duplicate keyword+platform entries)`
    );
  }

  // Phase 2: Near-variant deduplication — catches singular/plural, word order swaps.
  // e.g., "halong bay cruises reviews" vs "halong bay cruise reviews",
  //        "snorkeling whale sharks" vs "whale shark snorkeling"
  const bestByNormalized = new Map<string, CampaignCandidate>();
  for (const c of exactDedupedCandidates) {
    const normKey = `${normalizeKeywordForDedup(c.keyword)}|${c.platform}`;
    const existing = bestByNormalized.get(normKey);
    if (!existing) {
      bestByNormalized.set(normKey, c);
      continue;
    }
    const cPriority = LP_TYPE_PRIORITY[c.landingPageType ?? ''] ?? 0;
    const existPriority = LP_TYPE_PRIORITY[existing.landingPageType ?? ''] ?? 0;
    if (
      cPriority > existPriority ||
      (cPriority === existPriority && c.profitabilityScore > existing.profitabilityScore)
    ) {
      bestByNormalized.set(normKey, c);
    }
  }
  const dedupedCandidates = Array.from(bestByNormalized.values());
  if (dedupedCandidates.length < exactDedupedCandidates.length) {
    console.info(
      `[Bidding Engine] Variant dedup: ${exactDedupedCandidates.length} → ${dedupedCandidates.length} ` +
        `(removed ${exactDedupedCandidates.length - dedupedCandidates.length} near-variant duplicates)`
    );
  }

  // Sort by profitability score descending
  dedupedCandidates.sort((a, b) => b.profitabilityScore - a.profitabilityScore);
  return dedupedCandidates;
}

// --- Grouping ----------------------------------------------------------------

/**
 * Group selected candidates into per-landing-page campaigns.
 * Each group = one campaign per site/microsite + platform + landing page.
 * This ensures all keywords in a campaign target the same destination page,
 * so the ad creative, targetUrl, and landing page all align.
 *
 * Previously grouped by (microsite|site)+platform only, which bundled Paris,
 * Cartagena, Cannes keywords into one campaign with a single arbitrary targetUrl.
 */
export function groupCandidatesIntoCampaigns(candidates: CampaignCandidate[]): CampaignGroup[] {
  // Build map keyed by grouping strategy:
  //   - Both platforms: group by campaign category (STAG structure)
  //   - Fallback: per landing page for candidates without a campaign group
  const groupMap = new Map<string, CampaignCandidate[]>();
  for (const c of candidates) {
    let key: string;
    if (c.campaignGroup) {
      // STAG: group by campaign category for both Meta and Google
      key = `${c.campaignGroup}|${c.platform}`;
    } else {
      // Legacy fallback: per landing page
      const groupId = c.micrositeId || c.siteId;
      const lpKey = c.landingPagePath || '/';
      key = `${groupId}|${c.platform}|${lpKey}`;
    }
    const existing = groupMap.get(key);
    if (existing) {
      existing.push(c);
    } else {
      groupMap.set(key, [c]);
    }
  }

  const groups: CampaignGroup[] = [];

  for (const [, groupCandidates] of groupMap) {
    const first = groupCandidates[0]!;

    const primaryCandidate = groupCandidates.reduce((best, c) =>
      c.profitabilityScore > best.profitabilityScore ? c : best
    );

    // Within each campaign group, candidates targeting different landing pages
    // become separate ad groups (STAG structure). For Meta, ad groups map to ad sets.
    // For Google, each ad group gets its own RSA and keywords.
    //
    // STAG consolidation: EXPERIENCES_FILTERED candidates are grouped by their
    // "activity type" (core search term minus city/location) rather than exact ?q= path.
    // This merges "wildlife portugal", "wildlife phuket", "wildlife iceland" into one
    // "wildlife" ad group landing on /experiences?q=wildlife.

    const adGroupsByLp = new Map<string, CampaignCandidate[]>();
    for (const c of groupCandidates) {
      let lpKey: string;
      if (c.landingPageType === 'EXPERIENCES_FILTERED') {
        // Extract activity type by stripping location from keyword
        const activity = extractSearchQuery(c.keyword, c.location);
        // Further strip city names: remove common city/place words that vary per keyword
        const activityCore = stripCityFromActivity(activity, c.keyword);
        // Build a canonical path for grouping
        const domain = c.targetUrl.split('/')[2] ?? '';
        const qParam = encodeURIComponent(activityCore).replace(/%20/g, '+');
        lpKey = `/experiences?q=${qParam}`;
        // Update the candidate's landing page to the consolidated URL (for ad-group-level RSA)
        c.landingPagePath = lpKey;
        c.targetUrl = `https://${domain}${lpKey}`;
      } else {
        lpKey = c.landingPagePath || '/';
      }
      const existing = adGroupsByLp.get(lpKey);
      if (existing) {
        existing.push(c);
      } else {
        adGroupsByLp.set(lpKey, [c]);
      }
    }

    // Keep ad groups small for RSA relevance — with multi-city keywords in the
    // same theme group, 7 max ensures the RSA can still reference specific cities.
    const MAX_KEYWORDS_PER_AD_GROUP = 7;
    const adGroups: CampaignGroupAdGroup[] = [];
    for (const [lpPath, lpCandidates] of adGroupsByLp) {
      // STAG: cap at 15 keywords per ad group, split into multiple if needed
      for (let chunk = 0; chunk < lpCandidates.length; chunk += MAX_KEYWORDS_PER_AD_GROUP) {
        const chunkCandidates = lpCandidates.slice(chunk, chunk + MAX_KEYWORDS_PER_AD_GROUP);
        const lpPrimary = chunkCandidates.reduce((best, c) =>
          c.profitabilityScore > best.profitabilityScore ? c : best
        );
        const suffix =
          lpCandidates.length > MAX_KEYWORDS_PER_AD_GROUP
            ? ` Group ${Math.floor(chunk / MAX_KEYWORDS_PER_AD_GROUP) + 1}`
            : '';
        // Build keyword-level final URLs for consolidated EXPERIENCES_FILTERED groups.
        // Each keyword gets a URL built from its RAW keyword text (preserving city/location)
        // so "wildlife portugal" lands on /experiences?q=wildlife+portugal, not just ?q=wildlife.
        const kwFinalUrls: Record<string, string> = {};
        if (lpPrimary.landingPageType === 'EXPERIENCES_FILTERED') {
          const domain = lpPrimary.targetUrl.split('/')[2] ?? '';
          for (const c of chunkCandidates) {
            // Build URL from the raw keyword, only stripping SEO market location words
            const rawQuery = extractSearchQuery(c.keyword, c.location);
            if (rawQuery) {
              const kwUrl = `https://${domain}/experiences?q=${encodeURIComponent(rawQuery).replace(/%20/g, '+')}`;
              if (kwUrl !== lpPrimary.targetUrl) {
                kwFinalUrls[c.keyword] = kwUrl;
              }
            }
          }
        }

        // If every keyword has its own final URL, use the homepage as the ad-level URL.
        // This avoids sending users to a generic activity-only page when their keyword
        // doesn't match (e.g., ad sitelink click uses ad-level URL).
        const allKeywordsHaveUrls =
          Object.keys(kwFinalUrls).length > 0 &&
          chunkCandidates.every((c) => kwFinalUrls[c.keyword]);
        const domain = lpPrimary.targetUrl.split('/')[2] ?? '';
        const adGroupTargetUrl = allKeywordsHaveUrls ? `https://${domain}/` : lpPrimary.targetUrl;

        adGroups.push({
          landingPagePath: allKeywordsHaveUrls ? '/' : lpPath,
          landingPageType: lpPrimary.landingPageType,
          targetUrl: adGroupTargetUrl,
          keywords: chunkCandidates.map((c) => c.keyword),
          primaryKeyword: lpPrimary.keyword + suffix,
          maxBid: Math.max(...chunkCandidates.map((c) => c.maxBid)),
          totalExpectedDailyCost: chunkCandidates.reduce((s, c) => s + c.expectedDailyCost, 0),
          siteId: lpPrimary.siteId,
          micrositeId: lpPrimary.micrositeId,
          keywordFinalUrls: Object.keys(kwFinalUrls).length > 0 ? kwFinalUrls : undefined,
        });
      }
    }

    // --- Generate booking-intent companion ad groups ---
    // For high-scoring EXPERIENCES_FILTERED ad groups, create a companion ad group
    // with "book {keyword}" variants. These target users with purchase intent and
    // get booking-focused RSA headlines. With phrase match, the base keyword already
    // captures these queries, but a dedicated ad group allows higher bids and better copy.
    const BOOKING_PREFIXES = ['book', 'reserve', 'buy tickets'];
    const bookingIntentAdGroups: CampaignGroupAdGroup[] = [];
    for (const ag of adGroups) {
      if (ag.landingPageType !== 'EXPERIENCES_FILTERED') continue;
      // Only create booking-intent AGs for groups with enough keywords to justify it
      if (ag.keywords.length < 2) continue;

      // Take top 5 keywords from the ad group (first ones are highest-scoring).
      // Skip keywords that already contain booking-intent words to avoid "book book ..."
      const BOOKING_WORDS = new Set(['book', 'reserve', 'buy', 'purchase', 'ticket', 'tickets']);
      const topKeywords = ag.keywords
        .filter((kw) => !kw.split(/\s+/).some((w) => BOOKING_WORDS.has(w)))
        .slice(0, 5);
      if (topKeywords.length === 0) continue;
      const prefix = BOOKING_PREFIXES[0]!; // "book"
      const bookingKeywords = topKeywords.map((kw) => `${prefix} ${kw}`);

      // Build keyword-level final URLs using the same pattern as the original
      const bookingFinalUrls: Record<string, string> = {};
      const agDomain = ag.targetUrl.split('/')[2] ?? '';
      for (let i = 0; i < bookingKeywords.length; i++) {
        const originalKw = topKeywords[i]!;
        // Use the original keyword's final URL (same landing page, better ad copy)
        const originalUrl = ag.keywordFinalUrls?.[originalKw];
        if (originalUrl) {
          bookingFinalUrls[bookingKeywords[i]!] = originalUrl;
        }
      }

      bookingIntentAdGroups.push({
        landingPagePath: ag.landingPagePath,
        landingPageType: ag.landingPageType,
        targetUrl: ag.targetUrl,
        keywords: bookingKeywords,
        primaryKeyword: `${prefix} ${ag.primaryKeyword}`,
        maxBid: Math.min(ag.maxBid * 1.2, PAID_TRAFFIC_CONFIG.maxCpc),
        totalExpectedDailyCost: ag.totalExpectedDailyCost * 0.3, // Estimate 30% of base
        siteId: ag.siteId,
        micrositeId: ag.micrositeId,
        keywordFinalUrls: Object.keys(bookingFinalUrls).length > 0 ? bookingFinalUrls : undefined,
        bookingIntent: true,
      });
    }
    adGroups.push(...bookingIntentAdGroups);

    // Compute group-level aggregates
    const totalExpectedDailyCost = groupCandidates.reduce((s, c) => s + c.expectedDailyCost, 0);
    const totalExpectedDailyRevenue = groupCandidates.reduce(
      (s, c) => s + c.expectedDailyRevenue,
      0
    );
    const avgProfitabilityScore =
      groupCandidates.reduce((s, c) => s + c.profitabilityScore, 0) / groupCandidates.length;

    groups.push({
      siteId: first.siteId,
      micrositeId: first.micrositeId,
      platform: first.platform,
      siteName: first.siteName,
      micrositeDomain: first.micrositeDomain,
      isMicrosite: first.isMicrosite,
      campaignGroup: first.campaignGroup, // Meta consolidated campaign category
      totalExpectedDailyCost,
      totalExpectedDailyRevenue,
      avgProfitabilityScore,
      maxBid: Math.max(...groupCandidates.map((c) => c.maxBid)),
      primaryKeyword: primaryCandidate.keyword,
      primaryTargetUrl: primaryCandidate.targetUrl,
      candidates: groupCandidates,
      adGroups,
    });
  }

  // Sort groups by avgProfitabilityScore DESC
  groups.sort((a, b) => b.avgProfitabilityScore - a.avgProfitabilityScore);

  return groups;
}

// --- Budget Allocation -------------------------------------------------------

/**
 * Select campaigns to run within the daily budget cap.
 * Allocates budget to highest-scoring candidates first.
 */
export function selectCampaignCandidates(
  candidates: CampaignCandidate[],
  maxBudget: number = PAID_TRAFFIC_CONFIG.maxDailyBudget
): { selected: CampaignCandidate[]; budgetAllocated: number; budgetRemaining: number } {
  const selected: CampaignCandidate[] = [];
  let budgetAllocated = 0;

  // Task 4.7: Reserve 15% of budget for exploration (lower-scoring campaigns)
  const explorationPct = 0.15;
  const primaryBudget = maxBudget * (1 - explorationPct);
  const explorationBudget = maxBudget * explorationPct;

  // Phase 1: Greedy allocation for top candidates (85% budget)
  const remaining: CampaignCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.expectedDailyRevenue < candidate.expectedDailyCost) continue;

    const campaignBudget = candidate.expectedDailyCost;
    if (budgetAllocated + campaignBudget > primaryBudget) {
      remaining.push(candidate);
      continue;
    }

    selected.push(candidate);
    budgetAllocated += campaignBudget;
  }

  // Phase 2: Exploration — randomly sample from remaining candidates (15% budget)
  if (remaining.length > 0 && explorationBudget > 0) {
    // Shuffle remaining candidates for random exploration
    const shuffled = [...remaining].sort(() => Math.random() - 0.5);
    for (const candidate of shuffled) {
      const campaignBudget = candidate.expectedDailyCost;
      if (budgetAllocated + campaignBudget > maxBudget) continue;
      selected.push(candidate);
      budgetAllocated += campaignBudget;
    }
  }

  return {
    selected,
    budgetAllocated,
    budgetRemaining: maxBudget - budgetAllocated,
  };
}

// --- Full Engine Run ---------------------------------------------------------

/**
 * Run the full bidding engine: profitability → scoring → selection.
 * Does NOT create campaigns — that's handled by the campaign creation step.
 */
export async function runBiddingEngine(options?: {
  mode?: 'full' | 'optimize_only' | 'report_only';
  maxDailyBudget?: number;
}): Promise<BiddingEngineResult> {
  const mode = options?.mode || 'full';
  const maxBudget = options?.maxDailyBudget || PAID_TRAFFIC_CONFIG.maxDailyBudget;

  console.log(`[BiddingEngine] Starting in ${mode} mode (budget cap: £${maxBudget}/day)`);

  // Step 0a: Archive low-intent keywords (e.g. "free")
  await archiveLowIntentKeywords();

  // Step 0b: Assign unassigned PAID_CANDIDATE keywords to sites
  const assignedCount = await assignKeywordsToSites();
  if (assignedCount > 0) {
    console.log(`[BiddingEngine] Assigned ${assignedCount} keywords to sites`);
  }

  // Step 0c: AI keyword quality evaluation — scores keywords for bidding worthiness
  // and auto-archives keywords that score below threshold
  try {
    const evalResult = await evaluateKeywordQuality();
    console.log(
      `[BiddingEngine] AI evaluation: ${evalResult.bidCount} BID, ${evalResult.reviewCount} REVIEW, ${evalResult.archivedCount} archived (~$${evalResult.costEstimate.toFixed(4)})`
    );
  } catch (err) {
    console.error('[BiddingEngine] AI evaluation failed (non-fatal):', err);
  }

  // Hint GC between phases to release intermediate data from Steps 0a-0c
  if (typeof global.gc === 'function') global.gc();

  // Step 1: Calculate profitability for all sites (including microsites)
  const profiles = await calculateAllSiteProfitability();
  const micrositeProfiles = await calculateMicrositeProfitability();
  const destinationProfile = await calculateDestinationPageProfitability();
  const allProfiles = [...profiles, ...micrositeProfiles, destinationProfile];
  console.log(
    `[BiddingEngine] Calculated profitability for ${profiles.length} sites + ${micrositeProfiles.length} microsites + destination pages (maxCpc: £${destinationProfile.maxProfitableCpc.toFixed(2)})`
  );

  for (const p of allProfiles) {
    console.log(
      `  ${p.siteName}: AOV=£${p.avgOrderValue.toFixed(2)}, commission=${p.avgCommissionRate.toFixed(1)}%, CVR=${(p.conversionRate * 100).toFixed(2)}%, maxCPC=£${p.maxProfitableCpc.toFixed(4)}`
    );
  }

  if (mode === 'report_only') {
    return {
      sitesAnalyzed: allProfiles.length,
      profiles: allProfiles,
      candidates: [],
      groups: [],
      budgetAllocated: 0,
      budgetRemaining: maxBudget,
    };
  }

  // Hint GC between phases — profiles are still needed, but Step 0 data can be released
  if (typeof global.gc === 'function') global.gc();

  // Step 2: Score keyword opportunities (uses all profiles including microsites)
  const allCandidates = await scoreCampaignOpportunities(allProfiles);
  console.log(`[BiddingEngine] Scored ${allCandidates.length} campaign candidates`);

  // Step 3: Select within budget
  const { selected, budgetAllocated, budgetRemaining } = selectCampaignCandidates(
    allCandidates,
    maxBudget
  );
  console.log(
    `[BiddingEngine] Selected ${selected.length} campaigns, budget: £${budgetAllocated.toFixed(2)} allocated, £${budgetRemaining.toFixed(2)} remaining`
  );

  // Step 3.5: Group selected candidates into per-microsite campaigns
  const groups = groupCandidatesIntoCampaigns(selected);
  const msGroups = groups.filter((g) => g.isMicrosite);
  const mainGroups = groups.filter((g) => !g.isMicrosite);
  console.log(
    `[BiddingEngine] Grouped into ${groups.length} campaigns (${msGroups.length} microsite, ${mainGroups.length} main site)`
  );

  return {
    sitesAnalyzed: allProfiles.length,
    profiles: allProfiles,
    candidates: selected,
    groups,
    budgetAllocated,
    budgetRemaining,
  };
}
