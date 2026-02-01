import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import { createHolibobClient } from '@experience-marketplace/holibob-api';
import type { SeoOpportunityScanPayload, JobResult, SiteCreatePayload } from '../types';
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

    // Scan for opportunities
    const opportunities = await scanForOpportunities(
      holibobClient,
      destinations,
      categories,
      forceRescan
    );

    console.log(`[Opportunity Scan] Found ${opportunities.length} potential opportunities`);

    // Score and store opportunities
    let stored = 0;
    for (const opp of opportunities) {
      const priorityScore = calculateOpportunityScore(opp);

      // Only store opportunities with score > 50
      if (priorityScore >= 50) {
        await prisma.sEOOpportunity.upsert({
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
      }
    }

    console.log(`[Opportunity Scan] Stored ${stored} opportunities with score >= 50`);

    // Auto-action high-priority opportunities (score > 75)
    await autoActionOpportunities();

    return {
      success: true,
      message: `Scanned and found ${opportunities.length} opportunities, stored ${stored}`,
      data: {
        totalFound: opportunities.length,
        stored,
        highPriority: opportunities.filter((o) => calculateOpportunityScore(o) > 75).length,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);

    // Log error for tracking
    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'OPPORTUNITY_SCAN',
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
 * Scan for opportunities based on keyword research and inventory
 */
async function scanForOpportunities(
  holibobClient: ReturnType<typeof createHolibobClient>,
  destinations?: string[],
  categories?: string[],
  forceRescan?: boolean
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

  // Define target destinations
  const targetDestinations = destinations || [
    'London, England',
    'Paris, France',
    'Barcelona, Spain',
    'Rome, Italy',
    'Amsterdam, Netherlands',
    'New York, USA',
  ];

  // Define target categories
  const targetCategories = categories || [
    'food tours',
    'walking tours',
    'museum tickets',
    'wine tasting',
    'cooking classes',
  ];

  // For each destination + category combination
  for (const destination of targetDestinations) {
    for (const category of targetCategories) {
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
            niche: category,
            location: destination,
            sourceData: {
              inventoryCount,
              destination,
              category,
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
  }

  return opportunities;
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
    take: 5, // Limit to 5 at a time to avoid overwhelming the system
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
