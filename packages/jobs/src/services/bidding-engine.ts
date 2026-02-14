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

// --- Configuration -----------------------------------------------------------

const DEFAULT_COMMISSION_RATE = 18; // Fallback percentage when no booking data (Holibob avg ~18%)
const TARGET_ROAS = 3.0; // Target return on ad spend (3x = £3 revenue per £1 spent)
const MIN_BOOKINGS_FOR_AOV = 3; // Minimum bookings to use real AOV (else fall back to catalog)
const MIN_SESSIONS_FOR_CVR = 100; // Minimum sessions to use real conversion rate
const DEFAULT_CONVERSION_RATE = 0.015; // 1.5% fallback
const LOOKBACK_DAYS = 90; // Days of data to consider
const MAX_DAILY_BUDGET = parseFloat(process.env['BIDDING_MAX_DAILY_BUDGET'] || '200');

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
}

export interface BiddingEngineResult {
  sitesAnalyzed: number;
  profiles: SiteProfitability[];
  candidates: CampaignCandidate[];
  budgetAllocated: number;
  budgetRemaining: number;
}

// --- Profitability Calculation -----------------------------------------------

/**
 * Calculate profitability metrics for a single site.
 * Uses real booking/analytics data where available, falls back to catalog/defaults.
 */
export async function calculateSiteProfitability(siteId: string): Promise<SiteProfitability | null> {
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
    avgOrderValue = productAvg._avg.priceFrom ? Number(productAvg._avg.priceFrom) : 60;
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
      avgCommissionRate = DEFAULT_COMMISSION_RATE;
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
    conversionRate = DEFAULT_CONVERSION_RATE;
    usedDefaultCvr = true;
  }

  // --- Max Profitable CPC ---
  const commissionDecimal = avgCommissionRate / 100;
  const revenuePerClick = avgOrderValue * conversionRate * commissionDecimal;
  const maxProfitableCpc = revenuePerClick / TARGET_ROAS;

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

  const portfolioAov = portfolioAvg._avg.totalAmount ? Number(portfolioAvg._avg.totalAmount) : 60;
  const portfolioCommission = portfolioAvg._avg.commissionRate || DEFAULT_COMMISSION_RATE;

  // Product catalog fallback
  const productAvg = await prisma.product.aggregate({
    where: { priceFrom: { not: null } },
    _avg: { priceFrom: true },
  });
  const catalogAvg = productAvg._avg.priceFrom ? Number(productAvg._avg.priceFrom) : 60;

  const profiles: SiteProfitability[] = [];

  for (const ms of microsites) {
    // Calculate conversion rate from microsite analytics
    const totalSessions = ms.analyticsSnapshots.reduce((s, a) => s + a.sessions, 0);
    // Microsites don't track bookings directly in analytics snapshots;
    // use portfolio-wide conversion rate as estimate
    const conversionRate = totalSessions >= MIN_SESSIONS_FOR_CVR
      ? DEFAULT_CONVERSION_RATE * 1.2 // Microsites are niche-focused, slightly higher CVR
      : DEFAULT_CONVERSION_RATE;

    const avgOrderValue = portfolioAvg._count >= MIN_BOOKINGS_FOR_AOV ? portfolioAov : catalogAvg;
    const avgCommissionRate = portfolioCommission;

    const commissionDecimal = avgCommissionRate / 100;
    const revenuePerClick = avgOrderValue * conversionRate * commissionDecimal;
    const maxProfitableCpc = revenuePerClick / TARGET_ROAS;

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
    console.log(`[BiddingEngine] Archived ${result.count} low-intent PAID_CANDIDATE keywords (containing "free" etc.)`);
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

  // Load all active sites with their homepage config for matching
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      primaryDomain: true,
      homepageConfig: true,
    },
  });

  // Also load active microsites for matching
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

  // Build site matching profiles: destinations, categories, searchTerms
  interface SiteMatchProfile {
    id: string; // siteId or `microsite:${id}`
    name: string;
    destinations: string[];
    categories: string[];
    searchTerms: string[];
    allTerms: string[]; // Lowercase terms for matching
  }

  const siteProfiles: SiteMatchProfile[] = sites.map((site) => {
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

    const allTerms = [
      ...destinations,
      ...categories,
      ...searchTerms,
      site.name,
    ].map((t) => t.toLowerCase());

    return { id: site.id, name: site.name, destinations, categories, searchTerms, allTerms };
  });

  // Add microsite profiles for keyword matching
  for (const ms of microsites) {
    const config = ms.homepageConfig as {
      destinations?: Array<{ name: string }>;
      categories?: Array<{ name: string }>;
      popularExperiences?: { destination?: string; searchTerms?: string[] };
    } | null;
    const disco = ms.discoveryConfig as {
      keyword?: string;
      destination?: string;
      niche?: string;
      searchTerms?: string[];
    } | null;

    const destinations = config?.destinations?.map((d) => d.name) ?? [];
    if (disco?.destination && !destinations.includes(disco.destination)) {
      destinations.unshift(disco.destination);
    }
    const primaryDest = config?.popularExperiences?.destination;
    if (primaryDest && !destinations.includes(primaryDest)) {
      destinations.unshift(primaryDest);
    }
    const categories = config?.categories?.map((c) => c.name) ?? [];
    const searchTerms = [
      ...(config?.popularExperiences?.searchTerms ?? []),
      ...(disco?.searchTerms ?? []),
    ];
    if (disco?.keyword) searchTerms.unshift(disco.keyword);

    const allTerms = [
      ...destinations,
      ...categories,
      ...searchTerms,
      ms.siteName,
      ...(disco?.niche ? [disco.niche] : []),
    ].map((t) => t.toLowerCase());

    // Microsites don't have a siteId in the Site table, so we can't assign
    // keywords to them via the siteId FK. Instead, we match keywords to the
    // closest main site that covers the same destination. This ensures keywords
    // still get assigned and can benefit from microsite landing pages later.
    // We add microsite terms to the matching pool to improve assignment accuracy.
    // For now, microsites boost the scoring of their parent destination's site.
  }

  let assigned = 0;

  for (const kw of unassigned) {
    const kwLower = kw.keyword.toLowerCase();
    const locationLower = (kw.location || '').toLowerCase();

    // Score each site for this keyword
    let bestSiteId: string | null = null;
    let bestScore = 0;

    for (const site of siteProfiles) {
      let score = 0;

      // Check if keyword contains any of the site's destinations (strongest signal)
      for (const dest of site.destinations) {
        if (kwLower.includes(dest.toLowerCase())) {
          score += 10;
          break;
        }
      }

      // Check if location matches a destination
      if (locationLower) {
        for (const dest of site.destinations) {
          if (locationLower.includes(dest.toLowerCase()) || dest.toLowerCase().includes(locationLower)) {
            score += 8;
            break;
          }
        }
      }

      // Check categories match
      for (const cat of site.categories) {
        if (kwLower.includes(cat.toLowerCase())) {
          score += 5;
          break;
        }
      }

      // Check search terms match
      for (const term of site.searchTerms) {
        if (kwLower.includes(term.toLowerCase())) {
          score += 3;
          break;
        }
      }

      // Check site name match
      if (kwLower.includes(site.name.toLowerCase())) {
        score += 7;
      }

      // Check if the keyword's sourceData.seedQuery hints at which site generated it
      const seedQuery = (kw.sourceData as { seedQuery?: string } | null)?.seedQuery;
      if (seedQuery) {
        for (const term of site.allTerms) {
          if (seedQuery.toLowerCase().includes(term)) {
            score += 4;
            break;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestSiteId = site.id;
      }
    }

    // Only assign if we have at least a minimal match
    if (bestSiteId && bestScore >= 3) {
      try {
        await prisma.sEOOpportunity.update({
          where: { id: kw.id },
          data: { siteId: bestSiteId },
        });
        assigned++;
      } catch {
        // Skip errors (e.g. concurrent updates)
      }
    }
  }

  console.log(`[BiddingEngine] Assigned ${assigned}/${unassigned.length} keywords to sites`);
  return assigned;
}

// --- Opportunity Scoring -----------------------------------------------------

/**
 * Score PAID_CANDIDATE keywords by profitability potential.
 * Matches keywords to sites and calculates expected revenue per ad dollar.
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
    take: 500, // Top 500 candidates
  });

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

    // Estimate daily metrics
    const searchVolume = opp.searchVolume;
    const estimatedDailySearches = searchVolume / 30;
    const estimatedCtr = 0.02; // Conservative 2% CTR for paid ads
    const expectedClicksPerDay = estimatedDailySearches * estimatedCtr;
    const expectedDailyCost = expectedClicksPerDay * estimatedCpc;
    const expectedDailyRevenue = expectedClicksPerDay * profile.revenuePerClick;

    // Profitability score: expected revenue / cost ratio, weighted by volume
    const expectedRoas = expectedDailyRevenue > 0 && expectedDailyCost > 0
      ? expectedDailyRevenue / expectedDailyCost
      : 0;
    const volumeBonus = Math.min(20, Math.log10(searchVolume + 1) * 8);
    const roasBonus = Math.min(60, expectedRoas * 20);
    const intentBonus = opp.intent === 'TRANSACTIONAL' ? 20 : opp.intent === 'COMMERCIAL' ? 15 : 5;
    const profitabilityScore = Math.round(Math.min(100, roasBonus + volumeBonus + intentBonus));

    // Determine best landing page
    const targetUrl = `https://${domain}`;
    const utmCampaign = `auto_${opp.keyword.replace(/\s+/g, '_').substring(0, 40)}`;

    // Score for both platforms
    for (const platform of ['FACEBOOK', 'GOOGLE_SEARCH'] as const) {
      const utmSource = platform === 'FACEBOOK' ? 'facebook_ads' : 'google_ads';
      candidates.push({
        opportunityId: opp.id,
        keyword: opp.keyword,
        siteId,
        siteName: opp.site?.name || '',
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
        targetUrl,
        utmParams: { source: utmSource, medium: 'cpc', campaign: utmCampaign },
      });
    }
  }

  // Sort by profitability score descending
  candidates.sort((a, b) => b.profitabilityScore - a.profitabilityScore);

  return candidates;
}

// --- Budget Allocation -------------------------------------------------------

/**
 * Select campaigns to run within the daily budget cap.
 * Allocates budget to highest-scoring candidates first.
 */
export function selectCampaignCandidates(
  candidates: CampaignCandidate[],
  maxBudget: number = MAX_DAILY_BUDGET
): { selected: CampaignCandidate[]; budgetAllocated: number; budgetRemaining: number } {
  const selected: CampaignCandidate[] = [];
  let budgetAllocated = 0;

  // Minimum daily budget per campaign (platform minimums)
  const MIN_CAMPAIGN_BUDGET = 5; // £5/day minimum per campaign

  for (const candidate of candidates) {
    const campaignBudget = Math.max(MIN_CAMPAIGN_BUDGET, candidate.expectedDailyCost);
    if (budgetAllocated + campaignBudget > maxBudget) continue;

    // Skip if expected ROAS is below 1.0 (would lose money)
    if (candidate.expectedDailyRevenue < candidate.expectedDailyCost) continue;

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
  const maxBudget = options?.maxDailyBudget || MAX_DAILY_BUDGET;

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
  console.log(`[BiddingEngine] Calculated profitability for ${profiles.length} sites + ${micrositeProfiles.length} microsites`);

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
      budgetAllocated: 0,
      budgetRemaining: maxBudget,
    };
  }

  // Step 2: Score keyword opportunities (uses main site profiles for bidding)
  const allCandidates = await scoreCampaignOpportunities(profiles);
  console.log(`[BiddingEngine] Scored ${allCandidates.length} campaign candidates`);

  // Step 3: Select within budget
  const { selected, budgetAllocated, budgetRemaining } = selectCampaignCandidates(
    allCandidates,
    maxBudget
  );
  console.log(
    `[BiddingEngine] Selected ${selected.length} campaigns, budget: £${budgetAllocated.toFixed(2)} allocated, £${budgetRemaining.toFixed(2)} remaining`
  );

  return {
    sitesAnalyzed: allProfiles.length,
    profiles: allProfiles,
    candidates: selected,
    budgetAllocated,
    budgetRemaining,
  };
}
