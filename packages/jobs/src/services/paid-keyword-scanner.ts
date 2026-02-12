/**
 * Paid Keyword Scanner
 *
 * Discovers new keyword opportunities for paid traffic acquisition.
 * Runs twice a week (Tuesdays & Fridays) with five discovery modes:
 *
 * 1. GSC Mining — Keywords we get impressions for but rank poorly on
 * 2. Keyword Expansion — Related keywords from existing high-value opportunities
 * 3. Category Discovery — Broad destination × category combinations
 * 4. Pinterest CPC — Enrich opportunities with Pinterest bid estimates + discover new keywords
 * 5. Meta Audiences — Discover interest-based audiences with Meta CPC estimates
 *
 * All discovered keywords are stored in SEOOpportunity with status PAID_CANDIDATE.
 */

import { prisma } from '@experience-marketplace/database';
import { DataForSEOClient } from './dataforseo-client';
import { KeywordResearchService } from './keyword-research';
import { PinterestAdsClient } from './social/pinterest-ads-client';
import { MetaAdsClient } from './social/meta-ads-client';
import { refreshTokenIfNeeded } from './social/token-refresh';

type ScanMode = 'gsc' | 'expansion' | 'discovery' | 'pinterest' | 'meta';

interface ScanConfig {
  siteId?: string;
  maxCpc: number;
  minVolume: number;
  modes: ScanMode[];
}

interface ScanResult {
  mode: string;
  keywordsDiscovered: number;
  keywordsStored: number;
  apiCost: number;
}

export interface PaidKeywordScanResult {
  totalKeywordsDiscovered: number;
  totalKeywordsStored: number;
  totalApiCost: number;
  modeResults: ScanResult[];
  duration: number;
}

/**
 * Run the paid keyword scan across all configured modes.
 */
export async function runPaidKeywordScan(options?: {
  siteId?: string;
  maxCpc?: number;
  minVolume?: number;
  modes?: ScanMode[];
}): Promise<PaidKeywordScanResult> {
  const startTime = Date.now();

  const config: ScanConfig = {
    siteId: options?.siteId,
    maxCpc: options?.maxCpc ?? 3.0,
    minVolume: options?.minVolume ?? 100,
    modes: options?.modes ?? ['gsc', 'expansion', 'discovery', 'pinterest', 'meta'],
  };

  console.log('[PaidKeywordScan] Starting scan with config:', {
    maxCpc: config.maxCpc,
    minVolume: config.minVolume,
    modes: config.modes,
    siteId: config.siteId ?? 'all',
  });

  // Load existing keyword keys for deduplication
  const existingKeys = await getExistingKeywordKeys();
  console.log(`[PaidKeywordScan] ${existingKeys.size} existing keywords in database`);

  const modeResults: ScanResult[] = [];

  for (const mode of config.modes) {
    try {
      let result: ScanResult;
      switch (mode) {
        case 'gsc':
          result = await mineGSCKeywords(config, existingKeys);
          break;
        case 'expansion':
          result = await expandExistingKeywords(config, existingKeys);
          break;
        case 'discovery':
          result = await discoverCategoryKeywords(config, existingKeys);
          break;
        case 'pinterest':
          result = await scanPinterestCpc(config, existingKeys);
          break;
        case 'meta':
          result = await scanMetaAudiences(config, existingKeys);
          break;
        default:
          continue;
      }
      modeResults.push(result);
      console.log(
        `[PaidKeywordScan] Mode "${mode}": discovered ${result.keywordsDiscovered}, stored ${result.keywordsStored}, cost $${result.apiCost.toFixed(3)}`
      );
    } catch (error) {
      console.error(`[PaidKeywordScan] Mode "${mode}" failed:`, error);
      modeResults.push({
        mode,
        keywordsDiscovered: 0,
        keywordsStored: 0,
        apiCost: 0,
      });
    }
  }

  const duration = Date.now() - startTime;
  const totalResult: PaidKeywordScanResult = {
    totalKeywordsDiscovered: modeResults.reduce((sum, r) => sum + r.keywordsDiscovered, 0),
    totalKeywordsStored: modeResults.reduce((sum, r) => sum + r.keywordsStored, 0),
    totalApiCost: modeResults.reduce((sum, r) => sum + r.apiCost, 0),
    modeResults,
    duration,
  };

  console.log(
    `[PaidKeywordScan] Complete: ${totalResult.totalKeywordsStored} new keywords stored, $${totalResult.totalApiCost.toFixed(3)} API cost, ${(duration / 1000).toFixed(1)}s`
  );

  return totalResult;
}

// ============================================================================
// MODE 1: GSC Mining
// ============================================================================

/**
 * Mine Google Search Console data for keywords with high impressions but poor ranking.
 * These are ideal paid candidates — Google already associates the site with them.
 */
async function mineGSCKeywords(
  config: ScanConfig,
  existingKeys: Set<string>
): Promise<ScanResult> {
  console.log('[PaidKeywordScan/GSC] Mining GSC data for underperforming keywords...');

  // Query recent GSC data: keywords with impressions but poor organic position
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const siteFilter = config.siteId ? { siteId: config.siteId } : {};

  const gscKeywords = await prisma.performanceMetric.groupBy({
    by: ['query'],
    where: {
      ...siteFilter,
      date: { gte: thirtyDaysAgo },
      query: { not: null },
      impressions: { gt: 0 },
    },
    _sum: {
      impressions: true,
      clicks: true,
    },
    _avg: {
      position: true,
      ctr: true,
    },
    having: {
      impressions: { _sum: { gte: 50 } }, // At least 50 impressions in 30 days
    },
    orderBy: {
      _sum: { impressions: 'desc' },
    },
    take: 500,
  });

  // Filter to poorly ranking keywords (position > 15) and not already in DB
  const candidates = gscKeywords.filter((kw) => {
    if (!kw.query) return false;
    const avgPosition = kw._avg.position ?? 0;
    if (avgPosition <= 15) return false; // Already ranking well — skip
    const key = `${kw.query.toLowerCase()}|`;
    return !existingKeys.has(key);
  });

  if (candidates.length === 0) {
    console.log('[PaidKeywordScan/GSC] No new GSC candidates found');
    return { mode: 'gsc', keywordsDiscovered: 0, keywordsStored: 0, apiCost: 0 };
  }

  console.log(`[PaidKeywordScan/GSC] Found ${candidates.length} GSC candidates, validating via DataForSEO...`);

  // Validate via DataForSEO to get CPC + volume data
  const keywordResearch = new KeywordResearchService();
  const keywords = candidates.map((c) => c.query!);
  const batchSize = 200; // Process in batches
  let stored = 0;
  const apiCostPerKeyword = 0.002;

  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);
    try {
      const metrics = await keywordResearch.getBulkKeywordData(batch);

      for (const metric of metrics) {
        if (metric.cpc <= 0 || metric.cpc > config.maxCpc) continue;
        if (metric.searchVolume < config.minVolume) continue;

        const key = `${metric.keyword.toLowerCase()}|`;
        if (existingKeys.has(key)) continue;

        // Find matching GSC data
        const gscData = candidates.find(
          (c) => c.query?.toLowerCase() === metric.keyword.toLowerCase()
        );

        const score = calculatePaidScore(metric.searchVolume, metric.cpc, metric.keywordDifficulty ?? 50);

        await upsertOpportunity({
          keyword: metric.keyword,
          searchVolume: metric.searchVolume,
          difficulty: metric.keywordDifficulty ?? 50,
          cpc: metric.cpc,
          priorityScore: score,
          source: 'paid_keyword_scan_gsc',
          sourceData: {
            scanMode: 'gsc_mining',
            paidCandidate: true,
            gscImpressions: gscData?._sum.impressions ?? 0,
            gscClicks: gscData?._sum.clicks ?? 0,
            gscPosition: gscData?._avg.position ?? 0,
            gscCtr: gscData?._avg.ctr ?? 0,
            competition: metric.competition ?? 0,
            trend: metric.trend ?? 'stable',
          },
        });

        existingKeys.add(key);
        stored++;
      }
    } catch (error) {
      console.error(`[PaidKeywordScan/GSC] Batch validation failed:`, error);
    }
  }

  return {
    mode: 'gsc',
    keywordsDiscovered: candidates.length,
    keywordsStored: stored,
    apiCost: keywords.length * apiCostPerKeyword,
  };
}

// ============================================================================
// MODE 2: Keyword Expansion
// ============================================================================

/**
 * Expand from existing high-performing keywords to discover related opportunities.
 */
async function expandExistingKeywords(
  config: ScanConfig,
  existingKeys: Set<string>
): Promise<ScanResult> {
  console.log('[PaidKeywordScan/Expansion] Expanding from existing top keywords...');

  // Get top-performing keywords as seeds
  const siteFilter = config.siteId ? { siteId: config.siteId } : {};

  const seeds = await prisma.sEOOpportunity.findMany({
    where: {
      ...siteFilter,
      status: { in: ['PUBLISHED', 'MONITORING', 'PAID_CANDIDATE'] },
      searchVolume: { gte: 200 },
    },
    orderBy: { priorityScore: 'desc' },
    take: 50,
    select: { keyword: true, location: true },
  });

  if (seeds.length === 0) {
    console.log('[PaidKeywordScan/Expansion] No seed keywords found');
    return { mode: 'expansion', keywordsDiscovered: 0, keywordsStored: 0, apiCost: 0 };
  }

  // Use top 10 seeds for cost control ($0.003 per discoverKeywords call)
  const topSeeds = seeds.slice(0, 10);
  console.log(`[PaidKeywordScan/Expansion] Using ${topSeeds.length} seed keywords`);

  const dataForSeo = new DataForSEOClient();
  let totalDiscovered = 0;
  let stored = 0;
  let apiCost = 0;

  for (const seed of topSeeds) {
    try {
      const related = await dataForSeo.discoverKeywords(seed.keyword, 'United Kingdom', 'English', 30);
      apiCost += 0.003;

      const newKeywords = related.filter((kw) => {
        if (kw.cpc <= 0 || kw.cpc > config.maxCpc) return false;
        if (kw.searchVolume < config.minVolume) return false;
        const key = `${kw.keyword.toLowerCase()}|`;
        return !existingKeys.has(key);
      });

      totalDiscovered += newKeywords.length;

      for (const kw of newKeywords) {
        const score = calculatePaidScore(kw.searchVolume, kw.cpc, kw.competition * 100);

        await upsertOpportunity({
          keyword: kw.keyword,
          searchVolume: kw.searchVolume,
          difficulty: Math.round(kw.competition * 100),
          cpc: kw.cpc,
          priorityScore: score,
          source: 'paid_keyword_scan_expansion',
          sourceData: {
            scanMode: 'keyword_expansion',
            paidCandidate: true,
            seedKeyword: seed.keyword,
            competition: kw.competition,
            competitionLevel: kw.competitionLevel ?? 'MEDIUM',
          },
        });

        existingKeys.add(`${kw.keyword.toLowerCase()}|`);
        stored++;
      }
    } catch (error) {
      console.error(`[PaidKeywordScan/Expansion] Failed for seed "${seed.keyword}":`, error);
    }
  }

  return {
    mode: 'expansion',
    keywordsDiscovered: totalDiscovered,
    keywordsStored: stored,
    apiCost,
  };
}

// ============================================================================
// MODE 3: Broad Category Discovery
// ============================================================================

/**
 * Discover keywords from site destination × category combinations.
 */
async function discoverCategoryKeywords(
  config: ScanConfig,
  existingKeys: Set<string>
): Promise<ScanResult> {
  console.log('[PaidKeywordScan/Discovery] Discovering category × destination keywords...');

  // Get active sites with homepage config
  const siteFilter = config.siteId ? { id: config.siteId } : {};

  const sites = await prisma.site.findMany({
    where: {
      ...siteFilter,
      status: 'ACTIVE',
      homepageConfig: { not: null as unknown as undefined },
    },
    select: {
      id: true,
      name: true,
      homepageConfig: true,
    },
    take: 20,
  });

  // Build seed queries from site configs
  const seedQueries: string[] = [];

  for (const site of sites) {
    const homepage = site.homepageConfig as {
      destinations?: Array<{ name: string }>;
      categories?: Array<{ name: string }>;
      popularExperiences?: { destination?: string; searchTerms?: string[] };
    } | null;

    if (!homepage) continue;

    const destinations = homepage.destinations?.map((d) => d.name) ?? [];
    const primaryDest = homepage.popularExperiences?.destination;
    if (primaryDest && !destinations.includes(primaryDest)) {
      destinations.unshift(primaryDest);
    }

    const categories = homepage.categories?.map((c) => c.name) ?? [];

    // Build seed queries: "category in destination"
    for (const dest of destinations.slice(0, 4)) {
      for (const cat of categories.slice(0, 3)) {
        seedQueries.push(`${cat} in ${dest}`);
      }
      // Also add broad queries
      seedQueries.push(`things to do in ${dest}`);
      seedQueries.push(`best tours ${dest}`);
    }
  }

  // Deduplicate and cap at 20 seeds ($0.003 each = $0.06 max)
  const uniqueSeeds = [...new Set(seedQueries.map((s) => s.toLowerCase()))].slice(0, 20);

  if (uniqueSeeds.length === 0) {
    console.log('[PaidKeywordScan/Discovery] No seed queries generated from site configs');
    return { mode: 'discovery', keywordsDiscovered: 0, keywordsStored: 0, apiCost: 0 };
  }

  console.log(`[PaidKeywordScan/Discovery] Exploring ${uniqueSeeds.length} seed queries`);

  const dataForSeo = new DataForSEOClient();
  let totalDiscovered = 0;
  let stored = 0;
  let apiCost = 0;

  for (const seed of uniqueSeeds) {
    try {
      const keywords = await dataForSeo.discoverKeywords(seed, 'United Kingdom', 'English', 30);
      apiCost += 0.003;

      const newKeywords = keywords.filter((kw) => {
        if (kw.cpc <= 0 || kw.cpc > config.maxCpc) return false;
        if (kw.searchVolume < config.minVolume) return false;
        const key = `${kw.keyword.toLowerCase()}|`;
        return !existingKeys.has(key);
      });

      totalDiscovered += newKeywords.length;

      for (const kw of newKeywords) {
        const score = calculatePaidScore(kw.searchVolume, kw.cpc, kw.competition * 100);

        await upsertOpportunity({
          keyword: kw.keyword,
          searchVolume: kw.searchVolume,
          difficulty: Math.round(kw.competition * 100),
          cpc: kw.cpc,
          priorityScore: score,
          source: 'paid_keyword_scan_discovery',
          sourceData: {
            scanMode: 'category_discovery',
            paidCandidate: true,
            seedQuery: seed,
            competition: kw.competition,
            competitionLevel: kw.competitionLevel ?? 'MEDIUM',
          },
        });

        existingKeys.add(`${kw.keyword.toLowerCase()}|`);
        stored++;
      }
    } catch (error) {
      console.error(`[PaidKeywordScan/Discovery] Failed for seed "${seed}":`, error);
    }
  }

  return {
    mode: 'discovery',
    keywordsDiscovered: totalDiscovered,
    keywordsStored: stored,
    apiCost,
  };
}

// ============================================================================
// MODE 4: Pinterest CPC Discovery
// ============================================================================

/**
 * Enrich existing PAID_CANDIDATE opportunities with Pinterest bid estimates,
 * and discover new keywords that Pinterest surfaces.
 *
 * Requires: PINTEREST_AD_ACCOUNT_ID env var + active Pinterest SocialAccount.
 * Skips gracefully if not configured.
 */
async function scanPinterestCpc(
  config: ScanConfig,
  existingKeys: Set<string>
): Promise<ScanResult> {
  const adAccountId = process.env['PINTEREST_AD_ACCOUNT_ID'];
  if (!adAccountId) {
    console.log('[PaidKeywordScan/Pinterest] No PINTEREST_AD_ACCOUNT_ID configured, skipping');
    return { mode: 'pinterest', keywordsDiscovered: 0, keywordsStored: 0, apiCost: 0 };
  }

  // Get Pinterest OAuth token from any active social account
  const account = await prisma.socialAccount.findFirst({
    where: { platform: 'PINTEREST', isActive: true },
    select: { id: true, platform: true, accountId: true, accessToken: true, refreshToken: true, tokenExpiresAt: true },
  });

  if (!account || !account.accessToken) {
    console.log('[PaidKeywordScan/Pinterest] No active Pinterest account found, skipping');
    return { mode: 'pinterest', keywordsDiscovered: 0, keywordsStored: 0, apiCost: 0 };
  }

  const { accessToken } = await refreshTokenIfNeeded(account);
  const client = new PinterestAdsClient({ accessToken, adAccountId });

  // Load existing PAID_CANDIDATE opportunities to enrich with Pinterest CPC
  const existingOpportunities = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE' },
    select: { id: true, keyword: true, sourceData: true },
    orderBy: { priorityScore: 'desc' },
    take: 200,
  });

  console.log(
    `[PaidKeywordScan/Pinterest] Enriching ${existingOpportunities.length} opportunities with Pinterest CPC data`
  );

  let enriched = 0;
  let newStored = 0;
  let apiCost = 0;
  let consecutiveFailures = 0;
  const batchSize = 5;

  for (let i = 0; i < existingOpportunities.length; i += batchSize) {
    // Bail out early if API is consistently failing (e.g., missing OAuth scope)
    if (consecutiveFailures >= 3) {
      console.log('[PaidKeywordScan/Pinterest] 3 consecutive API failures — aborting (check OAuth scopes)');
      break;
    }

    const batch = existingOpportunities.slice(i, i + batchSize);
    const keywords = batch.map((o) => o.keyword);

    try {
      const metrics = await client.getKeywordMetrics(keywords);
      apiCost += 0.001; // Pinterest Ads API — free tier, tracked for consistency
      consecutiveFailures = 0; // Reset on success

      for (const metric of metrics) {
        if (metric.bidSuggested <= 0) continue;

        // Enrich existing opportunity with Pinterest CPC data
        const existing = batch.find(
          (o) => o.keyword.toLowerCase() === metric.keyword.toLowerCase()
        );
        if (existing) {
          const currentData = (existing.sourceData as Record<string, unknown>) ?? {};
          await prisma.sEOOpportunity.update({
            where: { id: existing.id },
            data: {
              sourceData: {
                ...currentData,
                pinterestCpc: metric.bidSuggested,
                pinterestMinBid: metric.bidMin,
                pinterestMaxBid: metric.bidMax,
                pinterestVolume: metric.monthlySearches,
                pinterestCompetition: metric.competition,
                pinterestEnrichedAt: new Date().toISOString(),
              } as object,
            },
          });
          enriched++;
        }

        // Store as new opportunity if it's a novel keyword
        const key = `${metric.keyword.toLowerCase()}|`;
        if (!existingKeys.has(key) && metric.bidSuggested <= config.maxCpc) {
          const score = calculatePaidScore(metric.monthlySearches, metric.bidSuggested, 50);
          await upsertOpportunity({
            keyword: metric.keyword,
            searchVolume: metric.monthlySearches,
            difficulty: 50,
            cpc: metric.bidSuggested,
            priorityScore: score,
            source: 'paid_keyword_scan_pinterest',
            sourceData: {
              scanMode: 'pinterest_cpc',
              paidCandidate: true,
              pinterestCpc: metric.bidSuggested,
              pinterestMinBid: metric.bidMin,
              pinterestMaxBid: metric.bidMax,
              pinterestVolume: metric.monthlySearches,
              pinterestCompetition: metric.competition,
            },
          });
          existingKeys.add(key);
          newStored++;
        }
      }
    } catch (error) {
      consecutiveFailures++;
      console.error('[PaidKeywordScan/Pinterest] Batch failed:', error);
    }
  }

  console.log(
    `[PaidKeywordScan/Pinterest] Enriched ${enriched} existing opportunities, stored ${newStored} new`
  );

  return {
    mode: 'pinterest',
    keywordsDiscovered: enriched + newStored,
    keywordsStored: newStored,
    apiCost,
  };
}

// ============================================================================
// MODE 5: Meta Audience Discovery
// ============================================================================

/**
 * Discover interest-based audiences on Meta/Facebook with CPC estimates.
 * Enriches existing opportunities with Meta CPC data and discovers new
 * interest-based keyword opportunities.
 *
 * Requires: META_AD_ACCOUNT_ID env var + active Facebook SocialAccount.
 * Skips gracefully if not configured.
 */
async function scanMetaAudiences(
  config: ScanConfig,
  existingKeys: Set<string>
): Promise<ScanResult> {
  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) {
    console.log('[PaidKeywordScan/Meta] No META_AD_ACCOUNT_ID configured, skipping');
    return { mode: 'meta', keywordsDiscovered: 0, keywordsStored: 0, apiCost: 0 };
  }

  // Get Facebook OAuth token from any active social account
  const account = await prisma.socialAccount.findFirst({
    where: { platform: 'FACEBOOK', isActive: true },
    select: { id: true, platform: true, accountId: true, accessToken: true, refreshToken: true, tokenExpiresAt: true },
  });

  if (!account || !account.accessToken) {
    console.log('[PaidKeywordScan/Meta] No active Facebook account found, skipping');
    return { mode: 'meta', keywordsDiscovered: 0, keywordsStored: 0, apiCost: 0 };
  }

  const { accessToken } = await refreshTokenIfNeeded(account);
  const client = new MetaAdsClient({ accessToken, adAccountId });

  // Load top PAID_CANDIDATE opportunities as seed keywords
  const seeds = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE' },
    select: { id: true, keyword: true, sourceData: true },
    orderBy: { priorityScore: 'desc' },
    take: 50,
  });

  // Use top 20 for cost control (2 API calls per seed: interest search + delivery estimate)
  const topSeeds = seeds.slice(0, 20);
  console.log(
    `[PaidKeywordScan/Meta] Scanning ${topSeeds.length} seed keywords for Meta audience opportunities`
  );

  let enriched = 0;
  let newStored = 0;
  let apiCost = 0;
  let consecutiveFailures = 0;

  for (const seed of topSeeds) {
    // Bail out early if API is consistently failing (e.g., missing OAuth scope)
    if (consecutiveFailures >= 3) {
      console.log('[PaidKeywordScan/Meta] 3 consecutive API failures — aborting (check OAuth scopes)');
      break;
    }

    try {
      // Step 1: Find interests related to keyword
      const interests = await client.searchInterests(seed.keyword);
      apiCost += 0.001;
      consecutiveFailures = 0; // Reset on success

      if (interests.length === 0) continue;

      // Step 2: Get delivery estimates for top 5 interests
      const topInterests = interests.slice(0, 5);
      const estimates = await client.getDeliveryEstimate(
        topInterests.map((i) => ({ id: i.id, name: i.name })),
        'LINK_CLICKS',
        'GB'
      );
      apiCost += 0.001;

      // Enrich the seed opportunity with best Meta CPC
      if (estimates.length > 0) {
        const bestEstimate = estimates.reduce((a, b) =>
          a.estimatedCpc < b.estimatedCpc ? a : b
        );
        const currentData = (seed.sourceData as Record<string, unknown>) ?? {};
        await prisma.sEOOpportunity.update({
          where: { id: seed.id },
          data: {
            sourceData: {
              ...currentData,
              metaCpc: bestEstimate.estimatedCpc,
              metaMinBid: bestEstimate.suggestedBid.min,
              metaMaxBid: bestEstimate.suggestedBid.max,
              metaReach: bestEstimate.audienceSize,
              metaInterestId: bestEstimate.interestId,
              metaInterestName: bestEstimate.interestName,
              metaEnrichedAt: new Date().toISOString(),
            } as object,
          },
        });
        enriched++;
      }

      // Create new opportunities for interest-based keywords not already in DB
      for (const interest of topInterests) {
        const key = `${interest.name.toLowerCase()}|`;
        if (existingKeys.has(key)) continue;

        const estimate = estimates.find((e) => e.interestId === interest.id);
        if (!estimate || estimate.estimatedCpc <= 0 || estimate.estimatedCpc > config.maxCpc)
          continue;

        // Approximate monthly search volume from audience size (rough: audience / 30)
        const approxVolume = Math.round(interest.audienceSize / 30);
        if (approxVolume < config.minVolume) continue;

        const score = calculatePaidScore(approxVolume, estimate.estimatedCpc, 50);

        await upsertOpportunity({
          keyword: interest.name,
          searchVolume: approxVolume,
          difficulty: 50,
          cpc: estimate.estimatedCpc,
          priorityScore: score,
          source: 'paid_keyword_scan_meta',
          sourceData: {
            scanMode: 'meta_audience',
            paidCandidate: true,
            metaCpc: estimate.estimatedCpc,
            metaMinBid: estimate.suggestedBid.min,
            metaMaxBid: estimate.suggestedBid.max,
            metaReach: estimate.audienceSize,
            metaInterestId: interest.id,
            metaInterestName: interest.name,
            metaTopic: interest.topic,
            metaPath: interest.path,
            seedKeyword: seed.keyword,
          },
        });
        existingKeys.add(key);
        newStored++;
      }
    } catch (error) {
      consecutiveFailures++;
      console.error(`[PaidKeywordScan/Meta] Failed for seed "${seed.keyword}":`, error);
    }
  }

  console.log(
    `[PaidKeywordScan/Meta] Enriched ${enriched} existing opportunities, stored ${newStored} new`
  );

  return {
    mode: 'meta',
    keywordsDiscovered: enriched + newStored,
    keywordsStored: newStored,
    apiCost,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Load all existing keyword|location keys from the database for deduplication.
 */
async function getExistingKeywordKeys(): Promise<Set<string>> {
  const existing = await prisma.sEOOpportunity.findMany({
    select: { keyword: true, location: true },
  });
  return new Set(
    existing.map((opp) => `${opp.keyword.toLowerCase()}|${(opp.location ?? '').toLowerCase()}`)
  );
}

/**
 * Calculate a priority score optimized for paid traffic.
 * Weighs volume and low CPC more heavily than organic scoring does.
 *
 * Score breakdown (100 points max):
 *   - Search volume: 40pts (log scale)
 *   - Low CPC: 30pts (lower = better for paid)
 *   - Low competition: 20pts
 *   - Base: 10pts
 */
function calculatePaidScore(volume: number, cpc: number, difficulty: number): number {
  // Volume: 0-40 points (log scale, 100/mo = ~13pts, 1000/mo = ~27pts, 10000/mo = ~40pts)
  const volumeScore = Math.min(40, (Math.log10(Math.max(volume, 1)) / 5) * 40);

  // CPC: 0-30 points (lower is better for paid — $0.05 = 30pts, $1.00 = 15pts, $3.00 = 5pts)
  const cpcScore = Math.max(0, Math.min(30, 30 * (1 - cpc / 4)));

  // Competition: 0-20 points (lower = better)
  const competitionScore = ((100 - difficulty) / 100) * 20;

  return Math.round(volumeScore + cpcScore + competitionScore + 10);
}

/**
 * Upsert a keyword opportunity into the database.
 * Uses the unique [keyword, location] constraint for dedup.
 */
async function upsertOpportunity(data: {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc: number;
  priorityScore: number;
  source: string;
  sourceData: Record<string, unknown>;
  location?: string;
}): Promise<void> {
  try {
    await prisma.sEOOpportunity.upsert({
      where: {
        keyword_location: {
          keyword: data.keyword,
          location: data.location ?? '',
        },
      },
      create: {
        keyword: data.keyword,
        searchVolume: data.searchVolume,
        difficulty: data.difficulty,
        cpc: data.cpc,
        intent: 'COMMERCIAL',
        niche: 'paid_traffic',
        location: data.location ?? '',
        priorityScore: data.priorityScore,
        status: 'PAID_CANDIDATE',
        source: data.source,
        sourceData: data.sourceData as object,
      },
      update: {
        searchVolume: data.searchVolume,
        cpc: data.cpc,
        difficulty: data.difficulty,
        priorityScore: data.priorityScore,
        sourceData: data.sourceData as object,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    // Silently skip constraint violations (race conditions)
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Unique constraint')) {
      console.error(`[PaidKeywordScan] Failed to upsert "${data.keyword}":`, error);
    }
  }
}
