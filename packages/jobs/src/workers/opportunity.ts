import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import { createHolibobClient } from '@experience-marketplace/holibob-api';
import type {
  SeoOpportunityScanPayload,
  SeoOpportunityOptimizePayload,
  JobResult,
  SiteCreatePayload,
  OpportunitySeed,
  ScanMode,
  InventoryLandscape,
} from '../types';
import { runRecursiveOptimization } from '../services/opportunity-optimizer';
import { KeywordResearchService } from '../services/keyword-research';
import { runAudienceFirstDiscovery } from '../services/audience-discovery';
import {
  toJobError,
  ExternalApiError,
  DatabaseError,
  NotFoundError,
  calculateRetryDelay,
  shouldMoveToDeadLetter,
} from '../errors';
import { errorTracking } from '../errors/tracking';
import { circuitBreakers } from '../errors/circuit-breaker';
import { addJob } from '../queues';
import { canExecuteAutonomousOperation } from '../services/pause-control';

/**
 * ========================================
 * INTEGRATED OPTIMIZATION FLOW
 * ========================================
 * Combines multi-mode seed generation with recursive optimization
 */

/**
 * Fetch existing opportunity keywords from the database for pre-filtering.
 * Returns a Set of "keyword|location" keys to quickly check for duplicates.
 * This saves DataForSEO API costs by not re-validating keywords we already have.
 */
async function getExistingOpportunityKeys(): Promise<Set<string>> {
  console.log('[Pre-Filter] Fetching existing opportunities from database...');

  const existingOpportunities = await prisma.sEOOpportunity.findMany({
    select: {
      keyword: true,
      location: true,
      status: true,
    },
  });

  // Build a Set of "keyword|location" keys for O(1) lookup
  const keys = new Set<string>();
  for (const opp of existingOpportunities) {
    const key = `${opp.keyword.toLowerCase()}|${(opp.location || '').toLowerCase()}`;
    keys.add(key);
  }

  console.log(`[Pre-Filter] Found ${keys.size} existing opportunities to exclude`);
  return keys;
}

/**
 * Run integrated optimization: generate multi-mode seeds + recursive refinement
 * This is the new default flow that combines all scan modes with AI optimization
 */
async function runIntegratedOptimization(
  holibobClient: ReturnType<typeof createHolibobClient>,
  options: {
    siteId?: string;
    maxIterations?: number;
    initialSuggestionsCount?: number;
    seedModes?: ScanMode[];
  }
): Promise<JobResult> {
  console.log('[Integrated Scan] Starting AI-driven opportunity discovery...');

  // Phase 1: Discover inventory landscape dynamically (no hardcoded lists)
  console.log('[Integrated Scan] Phase 1: Discovering inventory landscape...');
  const inventoryLandscape = await discoverInventoryLandscape(holibobClient);
  console.log(
    `[Integrated Scan] Found ${inventoryLandscape.totalCities} cities across ${inventoryLandscape.totalCountries} countries, ${inventoryLandscape.totalCategories} categories`
  );

  // Phase 2: AI-driven broad seed generation (120+ diverse ideas)
  console.log('[Integrated Scan] Phase 2: AI seed generation...');
  const allSeeds = await generateAISeeds(inventoryLandscape);
  console.log(
    `[Integrated Scan] AI generated ${allSeeds.length} seed opportunities across ${new Set(allSeeds.map((s) => s.scanMode)).size} modes`
  );

  // Filter seeds by requested modes if specified
  const modeFilteredSeeds = options.seedModes
    ? allSeeds.filter((seed) => options.seedModes?.includes(seed.scanMode))
    : allSeeds;

  // Pre-filter: exclude seeds that match existing opportunities in the database
  // This saves DataForSEO API costs by not re-validating keywords we already have
  const existingKeys = await getExistingOpportunityKeys();
  const seeds = modeFilteredSeeds.filter((seed) => {
    const key = `${seed.keyword.toLowerCase()}|${(seed.destination || '').toLowerCase()}`;
    return !existingKeys.has(key);
  });

  const filteredCount = modeFilteredSeeds.length - seeds.length;
  if (filteredCount > 0) {
    console.log(
      `[Integrated Scan] Pre-filtered ${filteredCount} seeds that match existing opportunities (${seeds.length} remaining)`
    );
  }

  if (seeds.length === 0) {
    return {
      success: true,
      message:
        'All generated seeds match existing opportunities - no new opportunities to validate',
      timestamp: new Date(),
    };
  }

  // Phase 3: Run recursive optimization with filtered seeds
  console.log('[Integrated Scan] Phase 3: Recursive optimization...');
  const result = await runRecursiveOptimization(holibobClient, {
    maxIterations: options.maxIterations || 5,
    initialSuggestionsCount: options.initialSuggestionsCount || 60,
    seeds,
    inventoryLandscape,
  });

  if (!result.success) {
    return {
      success: false,
      error: 'Recursive optimization failed',
      timestamp: new Date(),
    };
  }

  // Phase 3: Store optimized opportunities
  let storedCount = 0;
  let explanationsGenerated = 0;

  for (const ranked of result.finalOpportunities) {
    const opp = ranked.opportunity;

    // Flag as paid candidate if CPC < $3.00 and reasonable volume
    const isPaidCandidate =
      opp.dataForSeo.cpc > 0 && opp.dataForSeo.cpc < 3.0 && opp.dataForSeo.searchVolume >= 100;

    try {
      const opportunity = await prisma.sEOOpportunity.upsert({
        where: {
          keyword_location: {
            keyword: opp.suggestion.keyword,
            location: opp.suggestion.destination || '',
          },
        },
        create: {
          keyword: opp.suggestion.keyword,
          searchVolume: opp.dataForSeo.searchVolume,
          difficulty: opp.dataForSeo.difficulty,
          cpc: opp.dataForSeo.cpc,
          intent: 'TRANSACTIONAL',
          niche: opp.suggestion.niche,
          location: opp.suggestion.destination,
          priorityScore: opp.priorityScore,
          status: isPaidCandidate ? 'PAID_CANDIDATE' : 'IDENTIFIED',
          source: 'integrated_scan',
          explanation: ranked.explanation,
          sourceData: {
            scanMode: opp.suggestion.scanMode,
            optimizationRank: ranked.rank,
            optimizationJourney: ranked.journey,
            domainSuggestions: ranked.domainSuggestions,
            projectedValue: ranked.projectedValue,
            dataForSeo: opp.dataForSeo,
            keywordCluster: opp.clusterData ? JSON.parse(JSON.stringify(opp.clusterData)) : null,
            holibobInventory: opp.holibobInventory,
            iterationCount: result.iterations.length,
            totalApiCost: result.totalApiCost.totalCost,
            paidCandidate: isPaidCandidate,
          },
          siteId: options.siteId || undefined,
        },
        update: {
          searchVolume: opp.dataForSeo.searchVolume,
          difficulty: opp.dataForSeo.difficulty,
          cpc: opp.dataForSeo.cpc,
          priorityScore: opp.priorityScore,
          explanation: ranked.explanation,
          sourceData: {
            scanMode: opp.suggestion.scanMode,
            optimizationRank: ranked.rank,
            optimizationJourney: ranked.journey,
            domainSuggestions: ranked.domainSuggestions,
            projectedValue: ranked.projectedValue,
            dataForSeo: opp.dataForSeo,
            keywordCluster: opp.clusterData ? JSON.parse(JSON.stringify(opp.clusterData)) : null,
            holibobInventory: opp.holibobInventory,
            iterationCount: result.iterations.length,
            totalApiCost: result.totalApiCost.totalCost,
            paidCandidate: isPaidCandidate,
          },
        },
      });

      storedCount++;
      explanationsGenerated++; // Explanation comes from optimization
      console.log(
        `[Integrated Scan] Stored opportunity #${ranked.rank}: ${opp.suggestion.keyword} (score: ${opp.priorityScore})`
      );
    } catch (dbError) {
      console.error(
        `[Integrated Scan] Failed to store opportunity ${opp.suggestion.keyword}:`,
        dbError
      );
    }
  }

  console.log(`[Integrated Scan] Complete: ${result.summary}`);
  console.log(
    `[Integrated Scan] Stored ${storedCount} opportunities, generated ${explanationsGenerated} explanations`
  );

  // Auto-action: route high-score opportunities to main sites
  await autoActionOpportunities();
  // Auto-action: route mid-score opportunities to microsites
  const micrositesQueued = await autoActionMicrositeOpportunities();
  console.log(`[Integrated Scan] Queued ${micrositesQueued} opportunity microsites (score 50-69)`);

  return {
    success: true,
    message: `Integrated scan: ${result.summary}`,
    data: {
      mode: 'integrated',
      iterations: result.iterations.length,
      seedsGenerated: seeds.length,
      seedModes: Array.from(new Set(seeds.map((s) => s.scanMode))),
      opportunitiesFound: result.finalOpportunities.length,
      stored: storedCount,
      explanationsGenerated,
      topOpportunities: result.finalOpportunities.slice(0, 5).map((r) => ({
        rank: r.rank,
        keyword: r.opportunity.suggestion.keyword,
        score: r.opportunity.priorityScore,
        scanMode: r.opportunity.suggestion.scanMode,
        domain: r.domainSuggestions.primary,
      })),
      totalApiCost: result.totalApiCost.totalCost,
      executionTimeMs: result.executionTimeMs,
    },
    timestamp: new Date(),
  };
}

/**
 * SEO Opportunity Scanner Worker
 * Identifies content opportunities based on keyword research and Holibob inventory
 *
 * MODES:
 * 1. Integrated Mode (default): Multi-mode seed generation + recursive AI optimization
 * 2. Direct Scan Mode: Legacy direct scanning with AI suggestions
 */
export async function handleOpportunityScan(
  job: Job<SeoOpportunityScanPayload>
): Promise<JobResult> {
  const {
    siteId,
    destinations,
    categories,
    forceRescan,
    useRecursiveOptimization,
    optimizationConfig,
    scanVersion = 'standard',
    maxIterations: topLevelMaxIterations,
    initialSuggestionsCount: topLevelSuggestionsCount,
  } = job.data;

  // Merge top-level params with optimizationConfig (top-level takes precedence)
  const effectiveMaxIterations = topLevelMaxIterations ?? optimizationConfig?.maxIterations ?? 5;
  const effectiveSuggestionsCount =
    topLevelSuggestionsCount ?? optimizationConfig?.initialSuggestionsCount ?? 60;

  try {
    console.log('[Opportunity Scan] Starting opportunity scan');

    // Check if autonomous opportunity scanning is allowed
    const canProceed = await canExecuteAutonomousOperation({
      siteId,
      rateLimitType: 'OPPORTUNITY_SCAN',
    });

    if (!canProceed.allowed) {
      console.log(`[Opportunity Scan] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'Opportunity scanning is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    // If siteId provided, scan for that site specifically
    let targetSites: Array<{ id: string; name: string; holibobPartnerId: string }> = [];
    if (siteId) {
      const site = await prisma.site.findUnique({ where: { id: siteId } });
      if (!site) {
        throw new Error(`Site ${siteId} not found`);
      }
      targetSites = [site];
    }

    // Initialize Holibob client
    const holibobClient = createHolibobClient({
      apiUrl: process.env['HOLIBOB_API_URL'] || 'https://api.production.holibob.tech/graphql',
      partnerId: process.env['HOLIBOB_PARTNER_ID'] || '',
      apiKey: process.env['HOLIBOB_API_KEY'] || '',
      apiSecret: process.env['HOLIBOB_API_SECRET'],
      sandbox: process.env['HOLIBOB_ENV'] !== 'production',
      timeout: 30000,
    });

    // ========================================
    // ROUTING: Scan Version Selection
    // ========================================
    // - 'standard' (default): Full audience-first discovery (~$2.20)
    // - 'quick': Integrated optimization with fewer iterations (~$0.50)

    if (scanVersion === 'quick') {
      console.log(
        `[Opportunity Scan] Using QUICK mode (integrated optimization, ${effectiveMaxIterations} iterations)`
      );

      const integratedResult = await runIntegratedOptimization(holibobClient, {
        siteId,
        maxIterations: effectiveMaxIterations,
        initialSuggestionsCount: effectiveSuggestionsCount,
        seedModes: optimizationConfig?.seedModes,
      });

      return integratedResult;
    }

    // Standard scan: Full audience-first discovery
    if (useRecursiveOptimization !== false) {
      console.log('[Opportunity Scan] Using STANDARD mode (audience-first segment discovery)');

      const discoveryResult = await runAudienceFirstDiscovery(holibobClient);

      if (!discoveryResult.success) {
        return {
          success: false,
          error: discoveryResult.summary || 'Audience-first discovery failed',
          timestamp: new Date(),
        };
      }

      // Store discovered opportunities as SEOOpportunity records
      let storedCount = 0;
      for (const evaluated of discoveryResult.opportunities) {
        // Use the highest-volume keyword as the primary keyword
        const primaryKeyword =
          evaluated.cluster.metrics.topKeywords[0]?.keyword || evaluated.segment.name;

        try {
          await prisma.sEOOpportunity.upsert({
            where: {
              keyword_location: {
                keyword: primaryKeyword,
                location: '', // Audience segments are location-agnostic
              },
            },
            create: {
              keyword: primaryKeyword,
              searchVolume: evaluated.cluster.metrics.totalVolume,
              difficulty: evaluated.cluster.metrics.avgDifficulty,
              cpc: evaluated.cluster.metrics.weightedCpc,
              intent: 'TRANSACTIONAL',
              niche: evaluated.segment.name,
              location: '',
              priorityScore: evaluated.priorityScore,
              status: 'IDENTIFIED',
              source: 'audience_discovery',
              explanation: evaluated.evaluation.positioning,
              sourceData: {
                discoveryMode: 'audience_first',
                segment: {
                  name: evaluated.segment.name,
                  dimension: evaluated.segment.dimension,
                  description: evaluated.segment.description,
                  targetAudience: evaluated.segment.targetAudience,
                },
                keywordCluster: {
                  totalVolume: evaluated.cluster.metrics.totalVolume,
                  keywordCount: evaluated.cluster.metrics.keywordCount,
                  weightedCpc: evaluated.cluster.metrics.weightedCpc,
                  topKeywords: evaluated.cluster.metrics.topKeywords,
                },
                evaluation: {
                  brandName: evaluated.evaluation.brandName,
                  suggestedDomain: evaluated.evaluation.suggestedDomain,
                  alternativeDomains: evaluated.evaluation.alternativeDomains,
                  positioning: evaluated.evaluation.positioning,
                  contentStrategy: evaluated.evaluation.contentStrategy,
                  competitiveAdvantage: evaluated.evaluation.competitiveAdvantage,
                  monthlyTrafficEstimate: evaluated.evaluation.monthlyTrafficEstimate,
                  revenueEstimate: evaluated.evaluation.revenueEstimate,
                  viabilityScore: evaluated.evaluation.viabilityScore,
                },
                inventory: {
                  totalProducts: evaluated.feasibility.totalProducts,
                  sampleProducts: evaluated.feasibility.sampleProducts,
                },
              },
              siteId: siteId || undefined,
            },
            update: {
              searchVolume: evaluated.cluster.metrics.totalVolume,
              difficulty: evaluated.cluster.metrics.avgDifficulty,
              cpc: evaluated.cluster.metrics.weightedCpc,
              priorityScore: evaluated.priorityScore,
              explanation: evaluated.evaluation.positioning,
              sourceData: {
                discoveryMode: 'audience_first',
                segment: {
                  name: evaluated.segment.name,
                  dimension: evaluated.segment.dimension,
                  description: evaluated.segment.description,
                  targetAudience: evaluated.segment.targetAudience,
                },
                keywordCluster: {
                  totalVolume: evaluated.cluster.metrics.totalVolume,
                  keywordCount: evaluated.cluster.metrics.keywordCount,
                  weightedCpc: evaluated.cluster.metrics.weightedCpc,
                  topKeywords: evaluated.cluster.metrics.topKeywords,
                },
                evaluation: {
                  brandName: evaluated.evaluation.brandName,
                  suggestedDomain: evaluated.evaluation.suggestedDomain,
                  alternativeDomains: evaluated.evaluation.alternativeDomains,
                  positioning: evaluated.evaluation.positioning,
                  contentStrategy: evaluated.evaluation.contentStrategy,
                  competitiveAdvantage: evaluated.evaluation.competitiveAdvantage,
                  monthlyTrafficEstimate: evaluated.evaluation.monthlyTrafficEstimate,
                  revenueEstimate: evaluated.evaluation.revenueEstimate,
                  viabilityScore: evaluated.evaluation.viabilityScore,
                },
                inventory: {
                  totalProducts: evaluated.feasibility.totalProducts,
                  sampleProducts: evaluated.feasibility.sampleProducts,
                },
              },
            },
          });
          storedCount++;
        } catch (dbError) {
          console.error(
            `[Opportunity Scan] Failed to store segment opportunity "${evaluated.segment.name}":`,
            dbError
          );
        }
      }

      console.log(
        `[Opportunity Scan] Stored ${storedCount}/${discoveryResult.opportunities.length} segment opportunities`
      );

      // Auto-action: route high-score opportunities to main sites
      await autoActionOpportunities();
      // Auto-action: route mid-score opportunities to microsites
      const micrositesQueued = await autoActionMicrositeOpportunities();
      console.log(
        `[Audience-First Scan] Queued ${micrositesQueued} opportunity microsites (score 50-69)`
      );

      return {
        success: true,
        message: discoveryResult.summary,
        data: {
          mode: 'audience_first',
          segmentsGenerated: discoveryResult.segments.length,
          clustersViable: discoveryResult.clusters.length,
          keywordsDiscovered: discoveryResult.totalKeywordsDiscovered,
          opportunitiesFound: discoveryResult.opportunities.length,
          stored: storedCount,
          topOpportunities: discoveryResult.opportunities.slice(0, 5).map((o) => ({
            segment: o.segment.name,
            dimension: o.segment.dimension,
            totalVolume: o.cluster.metrics.totalVolume,
            keywordCount: o.cluster.metrics.keywordCount,
            score: o.priorityScore,
            domain: o.evaluation.suggestedDomain,
          })),
          totalApiCost: discoveryResult.apiCost.totalCost,
          executionTimeMs: discoveryResult.executionTimeMs,
        },
        timestamp: new Date(),
      };
    }

    // ========================================
    // DIRECT SCAN MODE (Legacy)
    // ========================================
    console.log('[Opportunity Scan] Using DIRECT SCAN mode (legacy AI suggestions)');

    // Phase 1: AI-Powered Niche Discovery (if no specific destinations/categories provided)
    let aiSuggestedNiches: Array<{
      destination: string;
      category: string;
      niche: string;
      rationale: string;
    }> = [];
    if (!destinations && !categories) {
      console.log('[Opportunity Scan] Generating AI-powered niche suggestions...');
      try {
        aiSuggestedNiches = await generateAINicheSuggestions(holibobClient);
        console.log(
          `[Opportunity Scan] AI suggested ${aiSuggestedNiches.length} niche opportunities`
        );
      } catch (aiError) {
        console.error(
          '[Opportunity Scan] AI niche generation failed, falling back to defaults:',
          aiError
        );
      }
    }

    // Phase 2: Scan for opportunities (using AI suggestions or defaults)
    const opportunities = await scanForOpportunities(
      holibobClient,
      destinations,
      categories,
      forceRescan,
      aiSuggestedNiches
    );

    console.log(`[Opportunity Scan] Found ${opportunities.length} potential opportunities`);

    // Score and store opportunities
    let stored = 0;
    let explanationsGenerated = 0;
    for (const opp of opportunities) {
      // Filter out "free" keywords — they don't convert to bookings
      if (/\bfree\b/i.test(opp.keyword)) {
        continue;
      }

      const priorityScore = calculateOpportunityScore(opp);

      // Only store opportunities with score > 50
      if (priorityScore >= 50) {
        // Flag as paid candidate if CPC < $3.00 and reasonable volume
        const isPaidCandidate = opp.cpc > 0 && opp.cpc < 3.0 && opp.searchVolume >= 100;

        const opportunity = await prisma.sEOOpportunity.upsert({
          where: {
            keyword_location: {
              keyword: opp.keyword,
              location: opp.location || '',
            },
          },
          create: {
            keyword: opp.keyword,
            searchVolume: opp.searchVolume,
            difficulty: opp.difficulty,
            cpc: opp.cpc,
            intent: opp.intent,
            niche: opp.niche,
            location: opp.location,
            priorityScore,
            status: isPaidCandidate ? 'PAID_CANDIDATE' : 'IDENTIFIED',
            source: 'direct_scan',
            sourceData: { ...((opp.sourceData as object) || {}), paidCandidate: isPaidCandidate },
            siteId: targetSites.length === 1 ? targetSites[0]?.id : undefined,
          },
          update: {
            searchVolume: opp.searchVolume,
            difficulty: opp.difficulty,
            cpc: opp.cpc,
            priorityScore,
            sourceData: { ...((opp.sourceData as object) || {}), paidCandidate: isPaidCandidate },
          },
        });
        stored++;

        // Auto-generate explanation for high-priority opportunities (score >= 75)
        if (priorityScore >= 75 && !opportunity.explanation) {
          try {
            const explanation = await generateOpportunityExplanation({
              keyword: opp.keyword,
              searchVolume: opp.searchVolume,
              difficulty: opp.difficulty,
              cpc: opp.cpc,
              intent: opp.intent,
              niche: opp.niche,
              location: opp.location,
              priorityScore,
              sourceData: opp.sourceData,
            });

            await prisma.sEOOpportunity.update({
              where: { id: opportunity.id },
              data: { explanation },
            });

            explanationsGenerated++;
            console.log(`[Opportunity] Generated explanation for "${opp.keyword}"`);
          } catch (explanationError) {
            // Don't fail the entire scan if explanation generation fails
            const errorMessage =
              explanationError instanceof Error
                ? explanationError.message
                : String(explanationError);
            console.error(
              `[Opportunity] Failed to generate explanation for "${opp.keyword}":`,
              errorMessage
            );
          }
        }
      }
    }

    console.log(`[Opportunity Scan] Stored ${stored} opportunities with score >= 50`);
    console.log(
      `[Opportunity Scan] Generated ${explanationsGenerated} AI explanations for high-priority opportunities`
    );

    // Auto-action: route high-score opportunities to main sites
    await autoActionOpportunities();
    // Auto-action: route mid-score opportunities to microsites
    const micrositesQueued = await autoActionMicrositeOpportunities();
    console.log(`[Direct Scan] Queued ${micrositesQueued} opportunity microsites (score 50-69)`);

    return {
      success: true,
      message: `Direct scan: found ${opportunities.length} opportunities, stored ${stored}, generated ${explanationsGenerated} explanations`,
      data: {
        mode: 'direct_scan',
        totalFound: opportunities.length,
        stored,
        explanationsGenerated,
        highPriority: opportunities.filter((o) => calculateOpportunityScore(o) >= 70).length,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);

    // Log error for tracking
    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'SEO_OPPORTUNITY_SCAN',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: jobError.context,
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });

    // Calculate retry delay if retryable
    if (jobError.retryable) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `[Opportunity Scan] Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
    }

    // Check if should move to dead letter queue
    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      console.error(
        `[Opportunity Scan] Moving to dead letter queue after ${job.attemptsMade} attempts`
      );
      await job.moveToFailed(
        new Error(`Permanent failure: ${jobError.message}`),
        '0',
        true // Remove from current queue
      );
    }

    console.error('[Opportunity Scan] Error:', jobError.toJSON());

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}

/**
 * Generate AI-powered niche suggestions using Anthropic API
 * Based on TravelAI micro-segmentation strategy and Holibob inventory analysis
 */
async function generateAINicheSuggestions(
  holibobClient: ReturnType<typeof createHolibobClient>
): Promise<Array<{ destination: string; category: string; niche: string; rationale: string }>> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Sample Holibob inventory to understand available experiences
  console.log('[AI Niche Discovery] Sampling Holibob inventory...');
  const inventorySample = await sampleHolibobInventory(holibobClient);

  const prompt = `You are a strategic advisor for an experience marketplace platform. We're building micro-niche websites to capture organic SEO and LLM-driven demand, following the TravelAI strategy which achieved 441% growth by creating 470+ niche sites.

## Our Strategy
- Build micro-segmented niche sites (NOT generic "all experiences" sites)
- Each site targets specific demographics, interests, or geographies
- Example: Instead of "london-experiences.com", we build "london-food-tours.com", "family-london.com", "accessible-london.com"
- Focus on profitable niches with strong search demand and available inventory

## TravelAI's Successful Niches (for inspiration)
- Demographics: Family travelers, pet owners, couples, solo travelers
- Interests: Pickleball players (PickleTrip), ski enthusiasts, beach lovers, cabin seekers
- Geographic: Hawaii specialists (20+ Hawaii brands), regional focuses
- Specific: Pet-friendly travel, accessible travel, luxury villas

## Available Holibob Inventory (sample of what we can sell)
${JSON.stringify(inventorySample, null, 2)}

## Your Task
Suggest 15-20 creative niche site opportunities that:
1. Target specific micro-segments (demographics, interests, geographies)
2. Match available Holibob inventory
3. Have strong SEO potential (searchable niches)
4. Would work well for LLM recommendations (ChatGPT/Claude suggesting these sites)
5. Follow TravelAI's micro-segmentation strategy

For each suggestion, provide:
- destination: The city/region (e.g., "Barcelona, Spain" or "Iceland")
- category: The experience type (e.g., "food tours", "adventure activities")
- niche: The specific micro-segment (e.g., "family-friendly food tours", "accessible wine tasting", "luxury culinary experiences")
- rationale: Why this niche is promising (1 sentence)

Think creatively about:
- Underserved demographics (seniors, accessibility needs, solo travelers, families with teens)
- Interest-based niches (photography tours, fitness activities, wellness retreats)
- Occasion-based (bachelor parties, corporate events, romantic getaways)
- Experience level (beginner-friendly, expert-led, luxury vs budget)

Return ONLY a valid JSON array with this structure:
[
  {
    "destination": "Barcelona, Spain",
    "category": "food tours",
    "niche": "family-friendly food tours",
    "rationale": "Families traveling to Barcelona seek kid-friendly culinary experiences that accommodate dietary restrictions and shorter attention spans"
  },
  ...
]`;

  console.log('[AI Niche Discovery] Calling Anthropic API for niche suggestions...');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', // Use Sonnet for strategic thinking
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  if (!data.content?.[0]?.text) {
    throw new Error('Invalid response from Anthropic API');
  }

  // Parse JSON response
  const responseText = data.content[0].text;
  console.log('[AI Niche Discovery] Received AI response, parsing suggestions...');

  // Extract JSON from response (handle markdown fences and truncation)
  const cleanedNiche = responseText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  let jsonMatch = cleanedNiche.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    const arrayStart = cleanedNiche.indexOf('[');
    if (arrayStart !== -1) {
      let truncated = cleanedNiche.slice(arrayStart).trim();
      const lastBrace = truncated.lastIndexOf('}');
      if (lastBrace !== -1) {
        truncated = truncated.slice(0, lastBrace + 1) + ']';
        jsonMatch = [truncated];
      }
    }
  }

  if (!jsonMatch) {
    throw new Error('Could not extract JSON array from AI response');
  }

  const suggestions = JSON.parse(jsonMatch[0]);
  console.log(`[AI Niche Discovery] Successfully parsed ${suggestions.length} niche suggestions`);

  return suggestions;
}

/**
 * Discover the full Holibob inventory landscape dynamically
 * Uses getPlaces() and getCategories() APIs instead of hardcoded lists
 */
async function discoverInventoryLandscape(
  holibobClient: ReturnType<typeof createHolibobClient>
): Promise<InventoryLandscape> {
  console.log('[Inventory Discovery] Fetching places and categories from Holibob...');

  // Step 1: Get all countries with inventory
  let countries: Array<{ id: string; name: string; productCount?: number }> = [];
  try {
    countries = await holibobClient.getPlaces({ type: 'COUNTRY' });
    countries = countries
      .filter((c) => (c.productCount || 0) > 0)
      .sort((a, b) => (b.productCount || 0) - (a.productCount || 0));
    console.log(`[Inventory Discovery] Found ${countries.length} countries with inventory`);
  } catch (error) {
    console.error('[Inventory Discovery] Failed to fetch countries:', error);
  }

  // Step 2: For top countries, get their cities
  const topCountries = countries.slice(0, 15);
  const allCities: Array<{ name: string; country: string; productCount: number }> = [];

  for (const country of topCountries) {
    try {
      const cities = await holibobClient.getPlaces({
        parentId: country.id,
        type: 'CITY',
      });
      for (const city of cities) {
        if ((city.productCount || 0) > 0) {
          allCities.push({
            name: city.name,
            country: country.name,
            productCount: city.productCount || 0,
          });
        }
      }
    } catch {
      // Skip country on error
    }
  }

  allCities.sort((a, b) => b.productCount - a.productCount);
  console.log(`[Inventory Discovery] Found ${allCities.length} cities with inventory`);

  // Step 3: Get all categories
  let categories: Array<{ name: string; productCount: number }> = [];
  try {
    const rawCategories = await holibobClient.getCategories();
    categories = rawCategories
      .filter((c) => (c.productCount || 0) > 0)
      .sort((a, b) => (b.productCount || 0) - (a.productCount || 0))
      .map((c) => ({ name: c.name, productCount: c.productCount || 0 }));
    console.log(`[Inventory Discovery] Found ${categories.length} active categories`);
  } catch (error) {
    console.error('[Inventory Discovery] Failed to fetch categories:', error);
  }

  // Step 4: Sample products from top 5 diverse cities for richer AI context
  const sampleCities = allCities.slice(0, 5);
  const productSamples: InventoryLandscape['productSamples'] = [];

  for (const city of sampleCities) {
    try {
      const result = await holibobClient.discoverProducts(
        { freeText: city.name, currency: 'GBP' },
        { pageSize: 20 }
      );
      if (result.products.length > 0) {
        productSamples.push({
          city: city.name,
          country: city.country,
          productCount: city.productCount,
          sampleProducts: result.products.slice(0, 5).map((p: any) => ({
            name: p.name,
            category: p.category,
            tags: p.tags,
          })),
        });
      }
    } catch {
      // Skip on error
    }
  }

  return {
    totalCountries: topCountries.length,
    totalCities: allCities.length,
    totalCategories: categories.length,
    topDestinations: allCities.slice(0, 30),
    categories,
    productSamples,
  };
}

/**
 * AI-driven seed generation - asks Claude for 120+ diverse opportunity ideas
 * informed by the real inventory landscape
 */
async function generateAISeeds(inventoryLandscape: InventoryLandscape): Promise<OpportunitySeed[]> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Build prompt sections
  const destinationsList = inventoryLandscape.topDestinations
    .slice(0, 25)
    .map((d) => `- ${d.name}, ${d.country} (${d.productCount} products)`)
    .join('\n');

  const categoriesList = inventoryLandscape.categories
    .slice(0, 25)
    .map((c) => `- ${c.name} (${c.productCount} products)`)
    .join('\n');

  const prompt = [
    'You are a strategic SEO advisor for a travel experience marketplace. Your goal: identify the 120 BEST micro-niche website opportunities that could collectively drive millions of monthly visitors.',
    '',
    '## Our Inventory Reality',
    `We sell experiences in ${inventoryLandscape.totalCities} cities across ${inventoryLandscape.totalCountries} countries, organized into ${inventoryLandscape.totalCategories} categories.`,
    '',
    '### Top Destinations by Inventory Volume',
    destinationsList,
    '',
    '### Available Categories',
    categoriesList,
    '',
    '### Sample Products (to understand what we sell)',
    JSON.stringify(inventoryLandscape.productSamples, null, 2),
    '',
    '## Strategy Context',
    "We follow TravelAI's micro-segmentation approach: 470+ niche sites achieving 441% growth. Each site is a tightly focused brand targeting a specific audience, interest, geography, or occasion.",
    '',
    '## CRITICAL: KEYWORD SELECTION RULES',
    'The keyword field is THE MOST IMPORTANT field. It MUST be a real Google search query that thousands of people actually type. DataForSEO must return real search volume data for it.',
    '',
    '### Good keywords (high volume, real searches):',
    '- "things to do in london" (100K+ monthly)',
    '- "rome tours" (40K+ monthly)',
    '- "cooking classes near me" (30K+ monthly)',
    '- "best food tours paris" (5K+ monthly)',
    '- "family activities barcelona" (3K+ monthly)',
    '- "wine tasting napa valley" (10K+ monthly)',
    '- "boat trips amsterdam" (5K+ monthly)',
    '- "adventure holidays europe" (8K+ monthly)',
    '- "harry potter tour london" (50K+ monthly) ← THEMATIC/FANDOM',
    '- "friends tour new york" (15K+ monthly) ← THEMATIC/FANDOM',
    '- "game of thrones tour" (25K+ monthly) ← THEMATIC/FANDOM',
    '- "beatles tour liverpool" (10K+ monthly) ← THEMATIC/FANDOM',
    '- "downton abbey tour" (8K+ monthly) ← THEMATIC/FANDOM',
    '',
    '### BAD keywords (zero volume, too specific):',
    '- "Bangkok night market food tour for couples" (TOO SPECIFIC - no one searches this)',
    '- "Thai curry cooking class Bangkok with local chef" (TOO LONG - not a real search)',
    '- "luxury accessible wheelchair friendly wine tours" (TOO COMPOUND)',
    '- "senior-friendly historical walking experience Rome" (NOT A REAL QUERY)',
    '',
    '### Keyword guidelines:',
    '- 2-5 words maximum. Shorter keywords have more search volume.',
    '- Use words real travelers type into Google, not marketing descriptions.',
    '- Think: what would someone type to find this? "food tours rome" NOT "artisanal Italian culinary experience Rome".',
    '- Prefer broad match keywords with proven search demand.',
    '- Include the destination name for local keywords.',
    '- For category keywords, use the most common phrasing (e.g., "cooking classes" not "culinary workshops").',
    '',
    '## RULES',
    '1. Think GLOBALLY. Include destinations beyond the obvious tourist cities.',
    '2. Think about WHERE search demand exists, not just where our deepest inventory is.',
    '3. Include at least 15 destination-agnostic opportunities (category/audience platforms).',
    '4. Mix these dimensions freely:',
    '   - **Geographic**: City-specific, region-specific, country-specific, multi-country',
    '   - **Demographic**: Families, seniors, solo travelers, couples, groups, disabled travelers, LGBTQ+, students, digital nomads, expats',
    '   - **Interest**: Food, art, adventure, wellness, photography, history, architecture, music, sports, nightlife, nature, wine, craft beer',
    '   - **Pop Culture & Fandom**: Film/TV locations (Harry Potter, Game of Thrones, Friends, Downton Abbey, Bridgerton, The Crown, Outlander, Lord of the Rings), literary tourism (Jane Austen, Sherlock Holmes, Agatha Christie), music pilgrimage (Beatles, ABBA), anime/gaming locations',
    '   - **Occasion**: Weddings, birthdays, corporate events, bachelor/ette parties, anniversaries, honeymoons, graduation trips, holiday activities',
    '   - **Price/Style**: Budget, luxury, off-the-beaten-path, private, VIP, immersive, local-led',
    '   - **Seasonal**: Summer, winter, weekend breaks, day trips, rainy-day activities',
    '   - **Cross-cutting**: "food tours rome", "luxury tours london", "family holidays spain", "harry potter tour london", "friends tour new york"',
    '5. Prioritize BLUE OCEAN opportunities - underserved niches where competition is low but demand exists.',
    '6. EVERY keyword MUST be a real, commonly-searched Google query. If you are unsure whether people search for it, use a simpler, broader keyword.',
    '',
    '## Required Output',
    'Return EXACTLY 120 items as a JSON array. Each must have:',
    '- keyword: A SHORT (2-5 word) Google search term that real people type (e.g., "food tours rome", "things to do london", "wine tasting tours")',
    '- clusterKeywords: Array of 5-8 related Google search terms that a niche site for this keyword would ALSO rank for. These represent the broader keyword cluster. Each must be a real search query.',
    '  Example: for keyword "honeymoon activities" → clusterKeywords: ["honeymoon ideas", "honeymoon things to do", "romantic trip activities", "best honeymoon experiences", "honeymoon planning", "honeymoon destinations"]',
    '  Example: for keyword "food tours rome" → clusterKeywords: ["rome food tour", "best restaurants rome", "rome cooking class", "rome street food", "italian food tour", "trastevere food tour"]',
    '  Example: for keyword "harry potter tour london" → clusterKeywords: ["harry potter studio tour", "harry potter experience london", "warner bros studio tour", "harry potter walking tour", "harry potter filming locations", "diagon alley tour"]',
    '  Example: for keyword "friends tour new york" → clusterKeywords: ["friends apartment nyc", "friends filming locations", "friends experience new york", "central perk tour", "friends tv show tour"]',
    '- destination: Specific location or null for location-agnostic',
    '- category: Primary experience category',
    '- niche: The micro-segment description',
    '- scanMode: One of "hyper_local", "generic_activity", "demographic", "occasion", "experience_level", "regional", "thematic"',
    '- rationale: One sentence on why this is a strong opportunity',
    '',
    'The clusterKeywords are CRITICAL - we evaluate opportunities by TOTAL cluster volume, not just the primary keyword. A site ranks for many related terms.',
    '',
    'Aim for roughly: 35 hyper_local, 15 generic_activity, 15 demographic, 15 occasion, 10 experience_level, 10 regional, 20 thematic (pop culture/fandom).',
    '',
    'IMPORTANT: The "thematic" scanMode is for pop culture, film/TV, literary, and fandom tourism - these are HUGE untapped markets:',
    '- Film/TV: Harry Potter, Game of Thrones, Friends, Downton Abbey, Bridgerton, Outlander, The Crown, Peaky Blinders, Sex and the City',
    '- Literary: Jane Austen, Sherlock Holmes, Agatha Christie, Beatrix Potter, Shakespeare',
    '- Music: Beatles, ABBA, Elvis, classical music, jazz',
    '- These have dedicated fan bases who actively search and are willing to pay premium prices',
    '',
    'Return ONLY a valid JSON array, no markdown fences, no explanation.',
  ].join('\n');

  console.log('[AI Seeds] Calling Anthropic API for broad opportunity discovery...');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 32000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  const responseText = data.content?.[0]?.text;
  if (!responseText) {
    throw new Error('Empty AI response for seed generation');
  }

  // Strip markdown fences if present
  const cleaned = responseText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');

  // Try to extract JSON array
  let jsonMatch = cleaned.match(/\[[\s\S]*\]/);

  // If no closing bracket found, the response was likely truncated — repair it
  if (!jsonMatch) {
    const arrayStart = cleaned.indexOf('[');
    if (arrayStart !== -1) {
      let truncated = cleaned.slice(arrayStart).trim();
      // Find the last complete object (ending with })
      const lastBrace = truncated.lastIndexOf('}');
      if (lastBrace !== -1) {
        truncated = truncated.slice(0, lastBrace + 1) + ']';
        jsonMatch = [truncated];
        console.log('[AI Seeds] Repaired truncated JSON response');
      }
    }
  }

  if (!jsonMatch) {
    console.error(
      '[AI Seeds] Failed to extract JSON. Response preview:',
      responseText.slice(0, 500)
    );
    throw new Error('Could not extract JSON array from AI seed response');
  }

  const rawSeeds = JSON.parse(jsonMatch[0]) as Array<{
    keyword: string;
    clusterKeywords?: string[];
    destination: string | null;
    category: string;
    niche: string;
    scanMode: string;
    rationale: string;
  }>;

  console.log(`[AI Seeds] Parsed ${rawSeeds.length} seed opportunities from AI`);

  // Convert to OpportunitySeed format - NO inventory gating
  return rawSeeds.map((seed) => ({
    keyword: seed.keyword,
    clusterKeywords: Array.isArray(seed.clusterKeywords) ? seed.clusterKeywords : [],
    destination: seed.destination || undefined,
    category: seed.category,
    niche: seed.niche,
    scanMode: (seed.scanMode || 'generic_activity') as ScanMode,
    rationale: seed.rationale,
    inventoryCount: 0, // Will be populated during validation, not used as gate
  }));
}

/**
 * Sample Holibob inventory for AI context (legacy direct scan path)
 */
async function sampleHolibobInventory(
  holibobClient: ReturnType<typeof createHolibobClient>
): Promise<{
  destinations: Array<{
    destination: string;
    productCount: number;
    sampleProducts: Array<{ name: string; category?: string; tags?: string[] }>;
  }>;
  totalProducts: number;
}> {
  const sampleDestinations = [
    'London, England',
    'Paris, France',
    'Rome, Italy',
    'Barcelona, Spain',
    'Amsterdam, Netherlands',
    'New York, USA',
  ];

  const inventory: {
    destinations: Array<{
      destination: string;
      productCount: number;
      sampleProducts: Array<{ name: string; category?: string; tags?: string[] }>;
    }>;
    totalProducts: number;
  } = {
    destinations: [],
    totalProducts: 0,
  };

  for (const destination of sampleDestinations) {
    try {
      const result = await holibobClient.discoverProducts(
        { freeText: destination, currency: 'GBP' },
        { pageSize: 5 }
      );

      if (result.products.length > 0) {
        inventory.destinations.push({
          destination,
          productCount: result.products.length,
          sampleProducts: result.products.slice(0, 3).map((p: any) => ({
            name: p.name,
            category: p.category,
            tags: p.tags,
          })),
        });
        inventory.totalProducts += result.products.length;
      }
    } catch {
      // Skip failed destinations
    }
  }

  return inventory;
}

/**
 * Scan for opportunities based on keyword research and inventory
 */
async function scanForOpportunities(
  holibobClient: ReturnType<typeof createHolibobClient>,
  destinations?: string[],
  categories?: string[],
  forceRescan?: boolean,
  aiSuggestedNiches?: Array<{
    destination: string;
    category: string;
    niche: string;
    rationale: string;
  }>
): Promise<
  Array<{
    keyword: string;
    searchVolume: number;
    difficulty: number;
    cpc: number;
    intent: 'INFORMATIONAL' | 'NAVIGATIONAL' | 'TRANSACTIONAL' | 'COMMERCIAL';
    niche: string;
    location?: string;
    sourceData: any;
  }>
> {
  const opportunities: Array<{
    keyword: string;
    searchVolume: number;
    difficulty: number;
    cpc: number;
    intent: 'INFORMATIONAL' | 'NAVIGATIONAL' | 'TRANSACTIONAL' | 'COMMERCIAL';
    niche: string;
    location?: string;
    sourceData: any;
  }> = [];

  // Use AI-suggested niches if available, otherwise use defaults
  let searchCombinations: Array<{ destination: string; category: string; niche: string }> = [];

  if (aiSuggestedNiches && aiSuggestedNiches.length > 0) {
    // Use AI suggestions
    searchCombinations = aiSuggestedNiches.map((suggestion) => ({
      destination: suggestion.destination,
      category: suggestion.category,
      niche: suggestion.niche,
    }));
    console.log('[Opportunity Scan] Using AI-generated niche suggestions');
  } else {
    // Fall back to default combinations
    const targetDestinations = destinations || [
      'London, England',
      'Paris, France',
      'Barcelona, Spain',
      'Rome, Italy',
      'Amsterdam, Netherlands',
      'New York, USA',
    ];

    const targetCategories = categories || [
      'food tours',
      'walking tours',
      'museum tickets',
      'wine tasting',
      'cooking classes',
    ];

    // Generate combinations from defaults
    for (const destination of targetDestinations) {
      for (const category of targetCategories) {
        searchCombinations.push({
          destination,
          category,
          niche: category, // For defaults, niche same as category
        });
      }
    }
    console.log('[Opportunity Scan] Using default destination/category combinations');
  }

  // For each search combination
  for (const combination of searchCombinations) {
    const { destination, category, niche } = combination;
    const destinationCity = destination.split(',')[0] || destination;
    const keyword = `${destinationCity.toLowerCase()} ${category}`;

    try {
      // Check Holibob inventory for this destination + category
      const holibobBreaker = circuitBreakers.getBreaker('holibob-api');

      const inventory = await holibobBreaker.execute(async () => {
        return await holibobClient.discoverProducts(
          {
            freeText: destination,
            searchTerm: category,
            currency: 'GBP',
          },
          { pageSize: 10 }
        );
      });

      const inventoryCount = inventory.products.length;

      // Only create opportunity if we have inventory
      if (inventoryCount > 0) {
        // Get real keyword data from DataForSEO
        const keywordService = new KeywordResearchService();
        const dataForSeoBreaker = circuitBreakers.getBreaker('dataforseo-api');
        let keywordData;

        try {
          keywordData = await dataForSeoBreaker.execute(async () => {
            return await keywordService.getKeywordData(
              keyword,
              destination.split(',')[1]?.trim() || 'United States'
            );
          });

          console.log(`[Opportunity] Real keyword data for "${keyword}":`, {
            searchVolume: keywordData.searchVolume,
            difficulty: keywordData.keywordDifficulty,
            cpc: keywordData.cpc,
            trend: keywordData.trend,
          });
        } catch (keywordError) {
          const jobError = toJobError(keywordError);
          console.error(
            `[Opportunity] Error getting keyword data for "${keyword}" — skipping (no fallback to random estimates):`,
            jobError.toJSON()
          );
          continue;
        }

        opportunities.push({
          keyword,
          searchVolume: keywordData.searchVolume,
          difficulty: keywordData.keywordDifficulty,
          cpc: keywordData.cpc,
          intent: 'TRANSACTIONAL',
          niche: niche, // Use the niche from combination (may be AI-generated or default category)
          location: destination,
          sourceData: {
            inventoryCount,
            destination,
            category,
            niche, // Store the niche for reference
            scannedAt: new Date().toISOString(),
            keywordTrend: keywordData.trend,
            competition: keywordData.competition,
            seasonality: keywordData.seasonality,
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Opportunity Scan] Error checking inventory for ${keyword}:`, errorMessage);
    }
  }

  return opportunities;
}

/**
 * Generate AI explanation for why an opportunity is attractive
 * Uses Anthropic API to analyze the opportunity data
 */
async function generateOpportunityExplanation(opportunityData: {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc: number;
  intent: string;
  niche: string;
  location?: string;
  priorityScore: number;
  sourceData: any;
}): Promise<string> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = `Analyze this SEO opportunity and explain in 2-3 concise sentences why this is an attractive keyword to target:

Keyword: ${opportunityData.keyword}
Search Volume: ${opportunityData.searchVolume.toLocaleString()}/month
Keyword Difficulty: ${opportunityData.difficulty}/100
Cost Per Click: $${opportunityData.cpc}
Search Intent: ${opportunityData.intent}
Niche: ${opportunityData.niche}
Location: ${opportunityData.location || 'Not specified'}
Priority Score: ${opportunityData.priorityScore}/100

${opportunityData.sourceData ? `Additional Data from DataForSEO:\n${JSON.stringify(opportunityData.sourceData, null, 2)}` : ''}

Provide a clear, actionable explanation focusing on:
1. The commercial opportunity (search volume, CPC, competition balance)
2. Why this fits well for the ${opportunityData.niche} niche
3. Any location-specific advantages

Keep it concise and business-focused.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  if (!data.content?.[0]?.text) {
    throw new Error('Invalid response from Anthropic API');
  }
  return data.content[0].text;
}

/**
 * Calculate opportunity priority score (0-100)
 * Based on: search volume (30%), competition (20%), commercial intent (25%), inventory (15%), seasonality (10%)
 */
function calculateOpportunityScore(opp: {
  searchVolume: number;
  difficulty: number;
  cpc: number;
  intent: string;
  sourceData: any;
}): number {
  // Search volume score (30%)
  const volumeScore = Math.min((opp.searchVolume / 10000) * 30, 30);

  // Competition score (20%) - lower difficulty = higher score
  const competitionScore = ((100 - opp.difficulty) / 100) * 20;

  // Commercial intent score (25%)
  const intentScores = {
    TRANSACTIONAL: 25,
    COMMERCIAL: 20,
    NAVIGATIONAL: 10,
    INFORMATIONAL: 5,
  };
  const intentScore = intentScores[opp.intent as keyof typeof intentScores] || 0;

  // Inventory match score (15%)
  const inventoryCount = opp.sourceData?.inventoryCount || 0;
  const inventoryScore = Math.min((inventoryCount / 50) * 15, 15);

  // Seasonality score (10%) - TODO: implement actual seasonality analysis
  const seasonalityScore = 10; // Default to 10 for now

  const totalScore =
    volumeScore + competitionScore + intentScore + inventoryScore + seasonalityScore;

  return Math.round(Math.min(totalScore, 100));
}

/**
 * Auto-action high-priority opportunities (score >= 70)
 * Creates sites and generates content automatically
 */
async function autoActionOpportunities(): Promise<void> {
  const highPriorityOpps = await prisma.sEOOpportunity.findMany({
    where: {
      priorityScore: { gte: 70 },
      status: 'IDENTIFIED',
      siteId: null, // Not yet assigned to a site
    },
    orderBy: {
      priorityScore: 'desc', // Get highest-value opportunities first
    },
    take: 50, // Process top 50 highest-value opportunities per scan
  });

  console.log(
    `[Opportunity] Found ${highPriorityOpps.length} high-priority opportunities to auto-action`
  );

  for (const opp of highPriorityOpps) {
    console.log(
      `[Opportunity] Auto-actioning high-priority opportunity: ${opp.keyword} (score: ${opp.priorityScore})`
    );

    try {
      // Generate a brand name suggestion based on the destination and niche
      const destination = opp.location?.split(',')[0] || 'Experiences';
      const niche = opp.niche;

      // Queue SITE_CREATE job - this will create the site, brand, and initial content
      const payload: SiteCreatePayload = {
        opportunityId: opp.id,
        brandConfig: {
          name: `${destination} ${niche.charAt(0).toUpperCase() + niche.slice(1)}`,
          tagline: `Discover the best ${niche} in ${destination}`,
        },
        autoPublish: false, // Start with staging deployment
      };

      const jobId = await addJob('SITE_CREATE', payload, {
        priority: 3, // Higher priority for auto-actioned opportunities
      });

      console.log(`[Opportunity] Queued SITE_CREATE job ${jobId} for opportunity ${opp.id}`);

      // Mark opportunity as assigned (site creation in progress)
      await prisma.sEOOpportunity.update({
        where: { id: opp.id },
        data: { status: 'ASSIGNED' },
      });

      console.log(`[Opportunity] Marked opportunity ${opp.id} as ASSIGNED`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[Opportunity] Failed to queue SITE_CREATE for opportunity ${opp.id}:`,
        errorMessage
      );

      // Mark as evaluated so we don't retry immediately, but can be manually actioned
      await prisma.sEOOpportunity.update({
        where: { id: opp.id },
        data: { status: 'EVALUATED' },
      });
    }
  }
}

/**
 * Auto-action mid-priority opportunities (score 50-69)
 * Routes them to opportunity microsites on subdomains
 */
async function autoActionMicrositeOpportunities(): Promise<number> {
  const micrositeOpps = await prisma.sEOOpportunity.findMany({
    where: {
      priorityScore: { gte: 50, lt: 70 },
      status: 'IDENTIFIED',
      siteId: null,
      micrositeConfig: null, // No microsite already created
    },
    orderBy: { priorityScore: 'desc' },
    take: 50, // Process 50 per scan run
  });

  console.log(
    `[Opportunity] Found ${micrositeOpps.length} mid-priority opportunities for microsites (score 50-69)`
  );

  let queued = 0;
  for (const opp of micrositeOpps) {
    // Generate subdomain from keyword (e.g., "london-food-tours")
    const subdomain = opp.keyword
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    // Check if subdomain already exists
    const existing = await prisma.micrositeConfig.findFirst({
      where: { subdomain, parentDomain: 'experiencess.com' },
    });
    if (existing) {
      console.log(`[Opportunity] Subdomain ${subdomain}.experiencess.com already exists, skipping`);
      continue;
    }

    try {
      await addJob('MICROSITE_CREATE', {
        opportunityId: opp.id,
        parentDomain: 'experiencess.com',
        subdomain,
        entityType: 'OPPORTUNITY',
        discoveryConfig: {
          keyword: opp.keyword,
          destination: opp.location || undefined,
          niche: opp.niche,
          searchTerms: [opp.keyword],
        },
      });

      await prisma.sEOOpportunity.update({
        where: { id: opp.id },
        data: { status: 'MICROSITE_ASSIGNED' },
      });

      console.log(
        `[Opportunity] Queued MICROSITE_CREATE for "${opp.keyword}" → ${subdomain}.experiencess.com (score: ${opp.priorityScore})`
      );
      queued++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[Opportunity] Failed to queue MICROSITE_CREATE for "${opp.keyword}":`,
        errorMessage
      );
    }
  }
  return queued;
}

/**
 * SEO Opportunity Optimizer Worker
 * Runs 5-iteration recursive AI optimization to discover highest-value opportunities
 */
export async function handleOpportunityOptimize(
  job: Job<SeoOpportunityOptimizePayload>
): Promise<JobResult> {
  const { siteId, maxIterations, destinationFocus, categoryFocus } = job.data;

  try {
    console.log('[Opportunity Optimize] Starting recursive optimization');

    // Check if autonomous opportunity optimization is allowed
    const canProceed = await canExecuteAutonomousOperation({
      siteId,
      rateLimitType: 'OPPORTUNITY_SCAN',
    });

    if (!canProceed.allowed) {
      console.log(`[Opportunity Optimize] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'Opportunity optimization is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    // Initialize Holibob client
    const holibobClient = createHolibobClient({
      apiUrl: process.env['HOLIBOB_API_URL'] || 'https://api.production.holibob.tech/graphql',
      partnerId: process.env['HOLIBOB_PARTNER_ID'] || '',
      apiKey: process.env['HOLIBOB_API_KEY'] || '',
      apiSecret: process.env['HOLIBOB_API_SECRET'],
      sandbox: process.env['HOLIBOB_ENV'] !== 'production',
      timeout: 30000,
    });

    // Run recursive optimization
    const result = await runRecursiveOptimization(holibobClient, {
      maxIterations: maxIterations || 5,
    });

    if (!result.success) {
      return {
        success: false,
        error: 'Optimization failed',
        timestamp: new Date(),
      };
    }

    // Store top opportunities in database with OPTIMIZED status
    let storedCount = 0;
    for (const ranked of result.finalOpportunities) {
      const opp = ranked.opportunity;

      try {
        await prisma.sEOOpportunity.upsert({
          where: {
            keyword_location: {
              keyword: opp.suggestion.keyword,
              location: opp.suggestion.destination || '',
            },
          },
          create: {
            keyword: opp.suggestion.keyword,
            searchVolume: opp.dataForSeo.searchVolume,
            difficulty: opp.dataForSeo.difficulty,
            cpc: opp.dataForSeo.cpc,
            intent: 'TRANSACTIONAL',
            niche: opp.suggestion.niche,
            location: opp.suggestion.destination,
            priorityScore: opp.priorityScore,
            status: 'IDENTIFIED',
            source: 'optimized_scan',
            explanation: ranked.explanation,
            sourceData: {
              optimizationRank: ranked.rank,
              optimizationJourney: ranked.journey,
              domainSuggestions: ranked.domainSuggestions,
              projectedValue: ranked.projectedValue,
              dataForSeo: opp.dataForSeo,
              holibobInventory: opp.holibobInventory,
              iterationCount: result.iterations.length,
              totalApiCost: result.totalApiCost.totalCost,
            },
            siteId: siteId || undefined,
          },
          update: {
            searchVolume: opp.dataForSeo.searchVolume,
            difficulty: opp.dataForSeo.difficulty,
            cpc: opp.dataForSeo.cpc,
            priorityScore: opp.priorityScore,
            explanation: ranked.explanation,
            sourceData: {
              optimizationRank: ranked.rank,
              optimizationJourney: ranked.journey,
              domainSuggestions: ranked.domainSuggestions,
              projectedValue: ranked.projectedValue,
              dataForSeo: opp.dataForSeo,
              holibobInventory: opp.holibobInventory,
              iterationCount: result.iterations.length,
              totalApiCost: result.totalApiCost.totalCost,
            },
          },
        });

        storedCount++;
        console.log(
          `[Opportunity Optimize] Stored opportunity #${ranked.rank}: ${opp.suggestion.keyword} (score: ${opp.priorityScore})`
        );
      } catch (dbError) {
        console.error(
          `[Opportunity Optimize] Failed to store opportunity ${opp.suggestion.keyword}:`,
          dbError
        );
      }
    }

    console.log(`[Opportunity Optimize] Complete: ${result.summary}`);

    return {
      success: true,
      message: result.summary,
      data: {
        iterations: result.iterations.length,
        opportunitiesFound: result.finalOpportunities.length,
        storedCount,
        improvementHistory: result.improvementHistory,
        topOpportunities: result.finalOpportunities.slice(0, 5).map((r) => ({
          rank: r.rank,
          keyword: r.opportunity.suggestion.keyword,
          score: r.opportunity.priorityScore,
          domain: r.domainSuggestions.primary,
        })),
        totalApiCost: result.totalApiCost.totalCost,
        executionTimeMs: result.executionTimeMs,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);

    // Log error for tracking
    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'SEO_OPPORTUNITY_OPTIMIZE',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: jobError.context,
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });

    console.error('[Opportunity Optimize] Error:', jobError.toJSON());

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}
