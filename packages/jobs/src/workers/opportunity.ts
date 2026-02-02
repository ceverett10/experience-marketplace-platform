import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import { createHolibobClient } from '@experience-marketplace/holibob-api';
import type { SeoOpportunityScanPayload, SeoOpportunityOptimizePayload, JobResult, SiteCreatePayload } from '../types';
import { runRecursiveOptimization } from '../services/opportunity-optimizer';
import { KeywordResearchService } from '../services/keyword-research';
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
 * SEO Opportunity Scanner Worker
 * Identifies content opportunities based on keyword research and Holibob inventory
 */
export async function handleOpportunityScan(
  job: Job<SeoOpportunityScanPayload>
): Promise<JobResult> {
  const { siteId, destinations, categories, forceRescan } = job.data;

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
      apiUrl: process.env['HOLIBOB_API_URL'] || 'https://api.sandbox.holibob.tech/graphql',
      partnerId: process.env['HOLIBOB_PARTNER_ID'] || '',
      apiKey: process.env['HOLIBOB_API_KEY'] || '',
      apiSecret: process.env['HOLIBOB_API_SECRET'],
      sandbox: process.env['HOLIBOB_ENV'] !== 'production',
      timeout: 30000,
    });

    // Phase 1: AI-Powered Niche Discovery (if no specific destinations/categories provided)
    let aiSuggestedNiches: Array<{ destination: string; category: string; niche: string; rationale: string }> = [];
    if (!destinations && !categories) {
      console.log('[Opportunity Scan] Generating AI-powered niche suggestions...');
      try {
        aiSuggestedNiches = await generateAINicheSuggestions(holibobClient);
        console.log(`[Opportunity Scan] AI suggested ${aiSuggestedNiches.length} niche opportunities`);
      } catch (aiError) {
        console.error('[Opportunity Scan] AI niche generation failed, falling back to defaults:', aiError);
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
      const priorityScore = calculateOpportunityScore(opp);

      // Only store opportunities with score > 50
      if (priorityScore >= 50) {
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
            status: 'IDENTIFIED',
            source: 'opportunity_scan',
            sourceData: opp.sourceData,
            siteId: targetSites.length === 1 ? targetSites[0]?.id : undefined,
          },
          update: {
            searchVolume: opp.searchVolume,
            difficulty: opp.difficulty,
            cpc: opp.cpc,
            priorityScore,
            sourceData: opp.sourceData,
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
            const errorMessage = explanationError instanceof Error ? explanationError.message : String(explanationError);
            console.error(`[Opportunity] Failed to generate explanation for "${opp.keyword}":`, errorMessage);
          }
        }
      }
    }

    console.log(`[Opportunity Scan] Stored ${stored} opportunities with score >= 50`);
    console.log(`[Opportunity Scan] Generated ${explanationsGenerated} AI explanations for high-priority opportunities`);

    // Auto-action high-priority opportunities (score > 75)
    await autoActionOpportunities();

    return {
      success: true,
      message: `Scanned and found ${opportunities.length} opportunities, stored ${stored}, generated ${explanationsGenerated} explanations`,
      data: {
        totalFound: opportunities.length,
        stored,
        explanationsGenerated,
        highPriority: opportunities.filter((o) => calculateOpportunityScore(o) > 75).length,
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
      model: 'claude-3-5-sonnet-20241022', // Use Sonnet for strategic thinking
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

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Could not extract JSON array from AI response');
  }

  const suggestions = JSON.parse(jsonMatch[0]);
  console.log(`[AI Niche Discovery] Successfully parsed ${suggestions.length} niche suggestions`);

  return suggestions;
}

/**
 * Sample Holibob inventory to understand available experiences
 * This helps AI make informed suggestions based on actual inventory
 */
async function sampleHolibobInventory(
  holibobClient: ReturnType<typeof createHolibobClient>
): Promise<any> {
  const sampleDestinations = [
    'London, England',
    'Paris, France',
    'Rome, Italy',
    'Barcelona, Spain',
    'Madrid, Spain',
    'New York, USA',
    'San Francisco, USA',
    'Tokyo, Japan',
    'Dubai, UAE',
  ];
  const sampleCategories = ['tours', 'activities', 'food'];

  const inventory: any = {
    destinations: [],
    totalProducts: 0,
    categories: {},
  };

  for (const destination of sampleDestinations) {
    try {
      const result = await holibobClient.discoverProducts(
        {
          freeText: destination,
          currency: 'GBP',
        },
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
    } catch (error) {
      console.error(`[Inventory Sample] Error sampling ${destination}:`, error);
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
  aiSuggestedNiches?: Array<{ destination: string; category: string; niche: string; rationale: string }>
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
    searchCombinations = aiSuggestedNiches.map(suggestion => ({
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
              `[Opportunity] Error getting keyword data for "${keyword}":`,
              jobError.toJSON()
            );

            // Fallback to estimates if API fails
            keywordData = {
              searchVolume: estimateSearchVolume(destination, category),
              keywordDifficulty: estimateDifficulty(destination, category),
              cpc: estimateCpc(category),
              trend: 'stable' as const,
              competition: 0.5,
            };
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
      model: 'claude-3-5-haiku-20241022',
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
 * Auto-action high-priority opportunities (score > 75)
 * Creates sites and generates content automatically
 */
async function autoActionOpportunities(): Promise<void> {
  const highPriorityOpps = await prisma.sEOOpportunity.findMany({
    where: {
      priorityScore: { gte: 75 },
      status: 'IDENTIFIED',
      siteId: null, // Not yet assigned to a site
    },
    orderBy: {
      priorityScore: 'desc', // Get highest-value opportunities first
    },
    take: 10, // Process top 10 highest-value opportunities per scan
  });

  console.log(`[Opportunity] Found ${highPriorityOpps.length} high-priority opportunities to auto-action`);

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
      console.error(`[Opportunity] Failed to queue SITE_CREATE for opportunity ${opp.id}:`, errorMessage);

      // Mark as evaluated so we don't retry immediately, but can be manually actioned
      await prisma.sEOOpportunity.update({
        where: { id: opp.id },
        data: { status: 'EVALUATED' },
      });
    }
  }
}

/**
 * Estimate search volume - TODO: Replace with actual keyword research API
 */
function estimateSearchVolume(destination: string, category: string): number {
  const popularDestinations = ['london', 'paris', 'barcelona', 'rome', 'new york'];
  const popularCategories = ['food tours', 'walking tours', 'museum tickets'];

  const destLower = destination.toLowerCase();
  const catLower = category.toLowerCase();

  let baseVolume = 1000;

  if (popularDestinations.some((d) => destLower.includes(d))) {
    baseVolume *= 5;
  }

  if (popularCategories.includes(catLower)) {
    baseVolume *= 3;
  }

  return baseVolume + Math.floor(Math.random() * 2000);
}

/**
 * Estimate keyword difficulty - TODO: Replace with actual SEO API
 */
function estimateDifficulty(destination: string, category: string): number {
  return Math.floor(Math.random() * 40) + 30; // 30-70 range
}

/**
 * Estimate CPC - TODO: Replace with actual keyword research API
 */
function estimateCpc(category: string): number {
  const premiumCategories = ['wine tasting', 'cooking classes', 'private tours'];
  const base = 1.5;

  if (premiumCategories.some((c) => category.toLowerCase().includes(c))) {
    return base * 2 + Math.random() * 2;
  }

  return base + Math.random();
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
      apiUrl: process.env['HOLIBOB_API_URL'] || 'https://api.sandbox.holibob.tech/graphql',
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
        console.log(`[Opportunity Optimize] Stored opportunity #${ranked.rank}: ${opp.suggestion.keyword} (score: ${opp.priorityScore})`);
      } catch (dbError) {
        console.error(`[Opportunity Optimize] Failed to store opportunity ${opp.suggestion.keyword}:`, dbError);
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
