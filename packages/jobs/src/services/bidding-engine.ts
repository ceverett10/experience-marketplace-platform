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
import {
  type LandingPageType,
  type LandingPageContext,
  type SiteType,
  buildLandingPageUrl,
  loadPageCaches,
  getLandingPageBonus,
  LandingPageValidator,
} from './landing-page-routing';

// --- Configuration -----------------------------------------------------------

const MIN_BOOKINGS_FOR_AOV = 3; // Minimum bookings to use real AOV (else fall back to catalog)
const MIN_SESSIONS_FOR_CVR = 100; // Minimum sessions to use real conversion rate
const LOOKBACK_DAYS = 90; // Days of data to consider

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
}

export interface CampaignGroupAdGroup {
  landingPagePath: string;
  landingPageType: LandingPageType;
  targetUrl: string;
  keywords: string[];
  primaryKeyword: string;
  maxBid: number;
  totalExpectedDailyCost: number;
}

export interface CampaignGroup {
  siteId: string;
  micrositeId?: string;
  platform: 'FACEBOOK' | 'GOOGLE_SEARCH';
  siteName: string;
  micrositeDomain?: string;
  isMicrosite: boolean;
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
    conversionRate = snapshotBookings / sessionSampleSize;
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
  const microsites = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      siteName: true,
      fullDomain: true,
      homepageConfig: true,
      discoveryConfig: true,
      analyticsSnapshots: {
        where: {
          date: { gte: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) },
        },
        orderBy: { date: 'desc' },
      },
    },
  });

  if (microsites.length === 0) return [];
  console.log(`[BiddingEngine] Calculating profitability for ${microsites.length} microsites`);

  // Get portfolio-wide averages as fallback
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

  const profiles: SiteProfitability[] = [];

  for (const ms of microsites) {
    // Calculate conversion rate from microsite analytics.
    const totalSessions = ms.analyticsSnapshots.reduce((s, a) => s + a.sessions, 0);
    const conversionRate =
      totalSessions >= MIN_SESSIONS_FOR_CVR
        ? PAID_TRAFFIC_CONFIG.defaults.cvr * 1.2 // Slight niche boost with real data
        : PAID_TRAFFIC_CONFIG.defaults.cvr; // 1.5% default

    const avgOrderValue = portfolioAvg._count >= MIN_BOOKINGS_FOR_AOV ? portfolioAov : catalogAvg;
    const avgCommissionRate = portfolioCommission;

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
        bookingSampleSize: portfolioAvg._count,
        sessionSampleSize: totalSessions,
        usedCatalogFallback: portfolioAvg._count < MIN_BOOKINGS_FOR_AOV,
        usedDefaultCommission: true,
        usedDefaultCvr: totalSessions < MIN_SESSIONS_FOR_CVR,
      },
    });
  }

  return profiles;
}

// --- Low-Intent Keyword Cleanup -----------------------------------------------

/**
 * Words indicating zero purchase intent — keywords with these terms are
 * archived out of the PAID_CANDIDATE pool.
 */
const LOW_INTENT_TERMS = ['free', 'gratis', 'no cost', 'complimentary', 'freebie', 'for nothing'];

/**
 * Archive PAID_CANDIDATE keywords containing low-intent terms like "free".
 * These have no conversion potential for a paid experiences marketplace.
 */
export async function archiveLowIntentKeywords(): Promise<number> {
  // Build OR conditions for each term using word-boundary matching
  const conditions = LOW_INTENT_TERMS.flatMap((term) => [
    { keyword: { contains: ` ${term} `, mode: 'insensitive' as const } },
    { keyword: { startsWith: `${term} `, mode: 'insensitive' as const } },
    { keyword: { endsWith: ` ${term}`, mode: 'insensitive' as const } },
  ]);

  const result = await prisma.sEOOpportunity.updateMany({
    where: {
      status: 'PAID_CANDIDATE' as any,
      OR: conditions as any,
    },
    data: { status: 'ARCHIVED' as any },
  });

  if (result.count > 0) {
    console.log(
      `[BiddingEngine] Archived ${result.count} low-intent PAID_CANDIDATE keywords (containing "free" etc.)`
    );
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

  // Default site: used when no specific match found. The siteId is just a
  // routing container — the scoring function independently matches keywords
  // to microsites for the actual landing page and profitability calculation.
  const defaultSiteId = sites[0]!.id;

  let assigned = 0;
  let assignedByMatch = 0;
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

    // Assign: best match if found, otherwise default site.
    // The siteId is a routing container — the scoring function's microsite
    // matching handles the actual landing page selection based on keyword
    // content and supplier city data.
    const targetSiteId = bestScore >= 3 ? bestSiteId! : defaultSiteId;
    if (bestScore >= 3) assignedByMatch++;
    else assignedByDefault++;

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

  console.log(
    `[BiddingEngine] Assigned ${assigned}/${unassigned.length} keywords ` +
      `(${assignedByMatch} by match, ${assignedByDefault} by default route)`
  );
  return assigned;
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
  const opportunities = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE' },
    select: {
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
    },
    orderBy: { priorityScore: 'desc' },
    take: 10000, // Process all enriched keywords for microsite matching
  });

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
      siteName: true,
      fullDomain: true,
      cachedProductCount: true,
      supplier: { select: { cities: true, categories: true } },
    },
  });

  // Merge for unified type
  type MicrositeMatch = { id: string; siteName: string; fullDomain: string; productCount: number };

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
    };
    for (const city of cities) {
      const cityLower = city.toLowerCase();
      const existing = micrositesByCity.get(cityLower) || [];
      existing.push(entry);
      micrositesByCity.set(cityLower, existing);
    }
  }

  console.log(
    `[BiddingEngine] Microsite lookup: ${micrositeByTerm.size} keyword terms, ${micrositesByCity.size} cities (${supplierMicrosites.length} supplier microsites)`
  );

  // --- Pre-load page caches for landing page routing ---
  const allSiteIds = [...new Set(opportunities.map((o) => o.siteId).filter(Boolean) as string[])];
  const allMicrositeIds = [
    ...new Set([...opportunityMicrosites.map((m) => m.id), ...supplierMicrosites.map((m) => m.id)]),
  ];
  const { pagesBySite, pagesByMicrosite, collectionsByMicrosite } = await loadPageCaches(
    allSiteIds,
    allMicrositeIds
  );
  console.log(
    `[BiddingEngine] Page cache: ${allSiteIds.length} sites, ${allMicrositeIds.length} microsites, pages for ${pagesBySite.size} sites + ${pagesByMicrosite.size} microsites, collections for ${collectionsByMicrosite.size} microsites`
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

    const domain = opp.site?.primaryDomain;
    if (!domain) continue;

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

    // 3) City-based match on SUPPLIER microsites — if keyword mentions a city,
    //    route to a supplier in that city (prefer highest product count)
    if (!matchedMicrosite) {
      for (const [city, micrositesInCity] of micrositesByCity) {
        if (kwLower.includes(city)) {
          // Pick the supplier with the most products in this city
          matchedMicrosite = micrositesInCity.reduce((best, ms) =>
            ms.productCount > best.productCount ? ms : best
          );
          matchedMicrositeEntityType = 'SUPPLIER';
          break;
        }
      }
    }

    // Use microsite profile if available, otherwise fall back to main site profile
    let effectiveProfile = profile;
    if (matchedMicrosite) {
      const msProfile = profiles.find((p) => p.siteId === `microsite:${matchedMicrosite!.id}`);
      if (msProfile) effectiveProfile = msProfile;
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
      // Main site — no microsite match
      lpContext = {
        siteType: 'MAIN',
        sitePages: pagesBySite.get(siteId) ?? [],
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

    // Score for both platforms
    for (const platform of ['FACEBOOK', 'GOOGLE_SEARCH'] as const) {
      const utmSource = platform === 'FACEBOOK' ? 'facebook_ads' : 'google_ads';
      candidates.push({
        opportunityId: opp.id,
        keyword: opp.keyword,
        siteId,
        siteName: matchedMicrosite ? matchedMicrosite.siteName : opp.site?.name || '',
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
      });
    }
  }

  // Filter out candidates whose landing page is unlikely to show relevant products.
  // These create ads that land on empty "no results" pages — wasted ad spend.
  const beforeFilter = candidates.length;
  const validCandidates = candidates.filter((c) => {
    // If landing page has a validated product count of 0, skip it
    if (c.landingPageProducts !== undefined && c.landingPageProducts <= 0) {
      return false;
    }
    // Only allow EXPERIENCES_FILTERED pages on supplier microsites (which have
    // product catalogs). For main sites and opportunity microsites, these are
    // unvalidated search URLs (e.g., "/experiences?q=chessington") that often
    // show 0 results, wasting ad spend.
    if (c.landingPageType === 'EXPERIENCES_FILTERED' && !c.isMicrosite) {
      return false;
    }
    return true;
  });
  if (validCandidates.length < beforeFilter) {
    console.log(
      `[Bidding Engine] Filtered out ${beforeFilter - validCandidates.length} candidates ` +
        `with empty/unvalidated landing pages (${validCandidates.length} remaining)`
    );
  }

  // Sort by profitability score descending
  validCandidates.sort((a, b) => b.profitabilityScore - a.profitabilityScore);

  return validCandidates;
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
  // Build map keyed by "(micrositeId || siteId)|(platform)|(landingPagePath)"
  // Each landing page (city/category) becomes its own campaign
  const groupMap = new Map<string, CampaignCandidate[]>();
  for (const c of candidates) {
    const groupId = c.micrositeId || c.siteId;
    const lpKey = c.landingPagePath || '/';
    const key = `${groupId}|${c.platform}|${lpKey}`;
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

    // All candidates in this group share the same landing page path,
    // so there's effectively one ad group per campaign
    const primaryCandidate = groupCandidates.reduce((best, c) =>
      c.profitabilityScore > best.profitabilityScore ? c : best
    );

    const adGroups: CampaignGroupAdGroup[] = [
      {
        landingPagePath: first.landingPagePath || '/',
        landingPageType: primaryCandidate.landingPageType,
        targetUrl: primaryCandidate.targetUrl,
        keywords: groupCandidates.map((c) => c.keyword),
        primaryKeyword: primaryCandidate.keyword,
        maxBid: Math.max(...groupCandidates.map((c) => c.maxBid)),
        totalExpectedDailyCost: groupCandidates.reduce((s, c) => s + c.expectedDailyCost, 0),
      },
    ];

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

  for (const candidate of candidates) {
    // Skip if expected ROAS is below 1.0 (would lose money)
    if (candidate.expectedDailyRevenue < candidate.expectedDailyCost) continue;

    const campaignBudget = candidate.expectedDailyCost;
    if (budgetAllocated + campaignBudget > maxBudget) continue;

    selected.push(candidate);
    budgetAllocated += campaignBudget;
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

  // Step 1: Calculate profitability for all sites (including microsites)
  const profiles = await calculateAllSiteProfitability();
  const micrositeProfiles = await calculateMicrositeProfitability();
  const allProfiles = [...profiles, ...micrositeProfiles];
  console.log(
    `[BiddingEngine] Calculated profitability for ${profiles.length} sites + ${micrositeProfiles.length} microsites`
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
