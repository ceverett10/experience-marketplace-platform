/**
 * Opportunity Optimizer Service
 * Implements a 5-iteration recursive AI optimization loop for discovering
 * high-value SEO opportunities through progressive refinement.
 *
 * Flow: AI suggests → DataForSEO validates → Extract learnings → Feed back to AI
 */

import { KeywordResearchService, KeywordMetrics } from './keyword-research';
import { circuitBreakers } from '../errors/circuit-breaker';
import { v4 as uuidv4 } from 'uuid';
import type { OpportunitySeed, ScanMode, InventoryLandscape } from '../types';
import { prisma } from '@experience-marketplace/database';

// Cache for existing opportunity keys - populated once per optimization run
let existingOpportunityKeysCache: Set<string> | null = null;

// ==========================================
// CONFIGURATION
// ==========================================

export interface OptimizationConfig {
  maxIterations: number;
  initialSuggestionsCount: number;
  narrowingFactor: number;
  minScoreThreshold: number;
  targetScoreThreshold: number;
  earlyStopImprovementThreshold: number;
  batchSize: number;
  seeds?: OpportunitySeed[];
  inventoryLandscape?: InventoryLandscape;
}

const DEFAULT_CONFIG: OptimizationConfig = {
  maxIterations: 5,
  initialSuggestionsCount: 60,
  narrowingFactor: 0.7,
  minScoreThreshold: 40,
  targetScoreThreshold: 75,
  earlyStopImprovementThreshold: 2,
  batchSize: 100,
};

// ==========================================
// DATA STRUCTURES
// ==========================================

export interface OpportunitySuggestion {
  id: string;
  destination: string;
  category: string;
  niche: string;
  keyword: string;
  clusterKeywords?: string[];
  rationale: string;
  suggestedDomain?: string;
  alternativeDomains?: string[];
  confidenceScore: number;
  iterationSource: number;
  scanMode?: ScanMode; // NEW: Track which scan mode generated this suggestion
  domainAvailability?: {
    primaryAvailable: boolean;
    alternativesAvailable: number;
    checkedDomains: Array<{ domain: string; available: boolean }>;
  };
}

export interface ClusterData {
  primaryKeyword: string;
  primaryVolume: number;
  clusterKeywords: Array<{ keyword: string; searchVolume: number; cpc: number }>;
  clusterTotalVolume: number;
  clusterKeywordCount: number;
  clusterAvgCpc: number;
}

export interface ValidatedOpportunity {
  suggestion: OpportunitySuggestion;
  dataForSeo: {
    searchVolume: number;
    difficulty: number;
    cpc: number;
    competition: number;
    competitionLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    trend: 'rising' | 'stable' | 'declining';
    seasonality: boolean;
    monthlyTrends?: number[];
  };
  clusterData?: ClusterData;
  holibobInventory: {
    productCount: number;
    categories: string[];
  };
  priorityScore: number;
  validatedAt: Date;
}

export interface IterationMetrics {
  totalSuggestions: number;
  validatedCount: number;
  aboveThreshold: number;
  averageScore: number;
  medianScore: number;
  maxScore: number;
  minScore: number;
  scoreDistribution: {
    excellent: number;
    good: number;
    moderate: number;
    poor: number;
  };
  improvementFromPrevious: number;
  apiCallsMade: number;
  apiCostUsd: number;
  executionTimeMs: number;
}

export interface IterationLearnings {
  topPerformers: ValidatedOpportunity[];
  bottomPerformers: ValidatedOpportunity[];
  patterns: {
    highScorePatterns: string[];
    lowScorePatterns: string[];
    optimalDifficultyRange: { min: number; max: number };
    optimalVolumeRange: { min: number; max: number };
    bestDestinations: string[];
    bestCategories: string[];
    avoidDestinations: string[];
    avoidCategories: string[];
  };
  recommendations: string[];
  metricsSummary: string;
}

export interface IterationResult {
  iterationNumber: number;
  suggestions: OpportunitySuggestion[];
  validatedOpportunities: ValidatedOpportunity[];
  learnings: IterationLearnings;
  metrics: IterationMetrics;
  timestamp: Date;
}

export interface RankedOpportunity {
  rank: number;
  opportunity: ValidatedOpportunity;
  domainSuggestions: {
    primary: string;
    alternatives: string[];
  };
  journey: {
    firstSeenIteration: number;
    iterationScores: number[];
    wasRefined: boolean;
    refinementSource?: string;
  };
  explanation: string;
  projectedValue: {
    monthlyTraffic: number;
    monthlyRevenue: number;
    paybackPeriod: number;
  };
}

export interface ApiCostBreakdown {
  anthropic: {
    sonnetCalls: number;
    sonnetTokens: number;
    sonnetCost: number;
    haikuCalls: number;
    haikuTokens: number;
    haikuCost: number;
  };
  dataForSeo: {
    searchVolumeCalls: number;
    searchVolumeCost: number;
    serpCalls: number;
    serpCost: number;
  };
  totalCost: number;
}

export interface OptimizationResult {
  success: boolean;
  iterations: IterationResult[];
  finalOpportunities: RankedOpportunity[];
  totalApiCost: ApiCostBreakdown;
  improvementHistory: number[];
  executionTimeMs: number;
  summary: string;
}

// ==========================================
// MAIN OPTIMIZATION FUNCTION
// ==========================================

export async function runRecursiveOptimization(
  holibobClient: any,
  config?: Partial<OptimizationConfig>
): Promise<OptimizationResult> {
  const startTime = Date.now();

  // Clear the existing opportunity keys cache at the start of each optimization run
  clearExistingOpportunityKeysCache();

  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const iterations: IterationResult[] = [];
  const improvementHistory: number[] = [];
  const apiCost: ApiCostBreakdown = {
    anthropic: {
      sonnetCalls: 0,
      sonnetTokens: 0,
      sonnetCost: 0,
      haikuCalls: 0,
      haikuTokens: 0,
      haikuCost: 0,
    },
    dataForSeo: { searchVolumeCalls: 0, searchVolumeCost: 0, serpCalls: 0, serpCost: 0 },
    totalCost: 0,
  };

  console.log('[Optimizer] Starting recursive optimization with config:', finalConfig);

  // Use inventory landscape from config (populated by discoverInventoryLandscape in opportunity.ts)
  const inventoryContext = finalConfig.inventoryLandscape
    ? {
        totalCities: finalConfig.inventoryLandscape.totalCities,
        totalCountries: finalConfig.inventoryLandscape.totalCountries,
        totalCategories: finalConfig.inventoryLandscape.totalCategories,
        topDestinations: finalConfig.inventoryLandscape.topDestinations.slice(0, 15),
        categories: finalConfig.inventoryLandscape.categories.slice(0, 15),
        productSamples: finalConfig.inventoryLandscape.productSamples,
      }
    : null;
  console.log(
    '[Optimizer] Inventory context:',
    inventoryContext
      ? `${inventoryContext.totalCities} cities, ${inventoryContext.totalCategories} categories`
      : 'none provided'
  );

  let previousLearnings: IterationLearnings | null = null;

  for (let i = 1; i <= finalConfig.maxIterations; i++) {
    const iterationStartTime = Date.now();
    const suggestionsCount = Math.round(
      finalConfig.initialSuggestionsCount * Math.pow(finalConfig.narrowingFactor, i - 1)
    );

    console.log(
      `[Optimizer] === ITERATION ${i}/${finalConfig.maxIterations} (${suggestionsCount} suggestions) ===`
    );

    try {
      // Step 1: Generate suggestions (AI participates in ALL iterations)
      const rawSuggestions = await generateRefinedSuggestions(
        i,
        previousLearnings,
        suggestionsCount,
        inventoryContext,
        apiCost,
        finalConfig.seeds
      );
      console.log(`[Optimizer] Generated ${rawSuggestions.length} suggestions`);

      // Step 1.5: Pre-filter suggestions that already exist in the database
      // This saves DataForSEO API costs by not re-validating existing keywords
      const suggestions = await filterExistingSuggestions(rawSuggestions);

      if (suggestions.length === 0) {
        console.log('[Optimizer] All suggestions already exist - skipping validation');
        continue;
      }

      // Step 2: Validate with DataForSEO
      const validated = await batchValidateOpportunities(
        suggestions,
        holibobClient,
        finalConfig.batchSize,
        apiCost
      );
      console.log(`[Optimizer] Validated ${validated.length} opportunities`);

      // Step 3: Extract learnings for next iteration
      const learnings = extractIterationLearnings(validated, finalConfig);

      // Step 4: Calculate metrics
      const previousIteration = iterations.length > 0 ? iterations[iterations.length - 1] : null;
      const metrics = calculateIterationMetrics(
        suggestions,
        validated,
        previousIteration ?? null,
        Date.now() - iterationStartTime,
        apiCost
      );

      const iterationResult: IterationResult = {
        iterationNumber: i,
        suggestions,
        validatedOpportunities: validated,
        learnings,
        metrics,
        timestamp: new Date(),
      };

      iterations.push(iterationResult);
      improvementHistory.push(metrics.improvementFromPrevious);
      previousLearnings = learnings;

      console.log(`[Optimizer] Iteration ${i} complete:`, {
        avgScore: metrics.averageScore.toFixed(1),
        aboveThreshold: metrics.aboveThreshold,
        improvement: metrics.improvementFromPrevious.toFixed(1) + '%',
      });

      // Early stopping check
      if (shouldStopEarly(iterations, finalConfig.earlyStopImprovementThreshold)) {
        console.log('[Optimizer] Early stopping: improvement below threshold');
        break;
      }
    } catch (error) {
      console.error(`[Optimizer] Iteration ${i} failed:`, error);
      // Continue with next iteration if one fails
    }
  }

  // Generate final rankings
  const finalOpportunities = await generateFinalRankings(iterations, apiCost);

  // Calculate total cost
  apiCost.totalCost =
    apiCost.anthropic.sonnetCost +
    apiCost.anthropic.haikuCost +
    apiCost.dataForSeo.searchVolumeCost +
    apiCost.dataForSeo.serpCost;

  const executionTimeMs = Date.now() - startTime;

  const result: OptimizationResult = {
    success: true,
    iterations,
    finalOpportunities,
    totalApiCost: apiCost,
    improvementHistory,
    executionTimeMs,
    summary: `Completed ${iterations.length} iterations in ${(executionTimeMs / 1000).toFixed(1)}s. Found ${finalOpportunities.length} high-value opportunities. Total API cost: $${apiCost.totalCost.toFixed(2)}`,
  };

  console.log('[Optimizer] Optimization complete:', result.summary);

  return result;
}

// ==========================================
// SUGGESTION GENERATION
// ==========================================

async function generateRefinedSuggestions(
  iterationNumber: number,
  previousLearnings: IterationLearnings | null,
  suggestionsCount: number,
  inventoryContext: any,
  apiCost: ApiCostBreakdown,
  seeds?: OpportunitySeed[]
): Promise<OpportunitySuggestion[]> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // AI participates in ALL iterations (no bypass)
  const anthropicBreaker = circuitBreakers.getBreaker('anthropic-api', {
    failureThreshold: 3,
    timeout: 120000,
  });

  const prompt = buildIterationPrompt(
    iterationNumber,
    previousLearnings,
    suggestionsCount,
    inventoryContext,
    seeds
  );

  const response = await anthropicBreaker.execute(async () => {
    return await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  // Track API cost
  apiCost.anthropic.sonnetCalls++;
  if (data.usage) {
    apiCost.anthropic.sonnetTokens += data.usage.input_tokens + data.usage.output_tokens;
    apiCost.anthropic.sonnetCost +=
      (data.usage.input_tokens * 0.003 + data.usage.output_tokens * 0.015) / 1000;
  }

  if (!data.content?.[0]?.text) {
    throw new Error('Invalid response from Anthropic API');
  }

  // Parse JSON response - handle markdown fences and truncated output
  const responseText = data.content[0].text;
  const cleanedResponse = responseText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  let jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    const arrayStart = cleanedResponse.indexOf('[');
    if (arrayStart !== -1) {
      let truncated = cleanedResponse.slice(arrayStart).trim();
      const lastBrace = truncated.lastIndexOf('}');
      if (lastBrace !== -1) {
        truncated = truncated.slice(0, lastBrace + 1) + ']';
        jsonMatch = [truncated];
        console.log('[Optimizer] Repaired truncated JSON response');
      }
    }
  }

  if (!jsonMatch) {
    console.error(
      '[Optimizer] Failed to extract JSON. Response preview:',
      responseText.slice(0, 500)
    );
    throw new Error('Could not extract JSON array from AI response');
  }

  const suggestions = JSON.parse(jsonMatch[0]) as Array<{
    destination: string;
    category: string;
    niche: string;
    keyword: string;
    clusterKeywords?: string[];
    rationale: string;
    suggestedDomain?: string;
    alternativeDomains?: string[];
    confidenceScore: number;
  }>;

  return suggestions.map((s) => ({
    id: uuidv4(),
    ...s,
    clusterKeywords: Array.isArray(s.clusterKeywords) ? s.clusterKeywords : [],
    iterationSource: iterationNumber,
  }));
}

function buildIterationPrompt(
  iterationNumber: number,
  previousLearnings: IterationLearnings | null,
  suggestionsCount: number,
  inventoryContext: any,
  seeds?: OpportunitySeed[]
): string {
  if (iterationNumber === 1 || !previousLearnings) {
    // First iteration: AI evaluates seeds, enriches them, and fills gaps
    if (seeds && seeds.length > 0) {
      // Seed-aware iteration 1: AI evaluates + enriches + selects best seeds + generates gap-fillers
      const seedsByMode = new Map<string, OpportunitySeed[]>();
      for (const seed of seeds) {
        if (!seedsByMode.has(seed.scanMode)) seedsByMode.set(seed.scanMode, []);
        seedsByMode.get(seed.scanMode)!.push(seed);
      }

      return `You are a strategic SEO advisor evaluating opportunity seeds for a travel experience marketplace.

## Context
We have ${seeds.length} AI-generated seed opportunities from a broad discovery phase. Your job is to:
1. EVALUATE each seed: Is this keyword actually searchable? Is the niche viable?
2. SELECT the best ${suggestionsCount} opportunities
3. ENRICH each selected opportunity with domain name suggestions
4. FILL GAPS: If you notice underrepresented niches or high-potential areas not covered, add new suggestions

## Seed Opportunities by Mode
${Array.from(seedsByMode.entries())
  .map(
    ([mode, modeSeeds]) => `### ${mode} (${modeSeeds.length} seeds)
${modeSeeds
  .slice(0, 8)
  .map((s) => `- "${s.keyword}" [${s.destination || 'Global'}] - ${s.rationale}`)
  .join('\n')}${modeSeeds.length > 8 ? `\n... and ${modeSeeds.length - 8} more` : ''}`
  )
  .join('\n\n')}

${
  inventoryContext
    ? `## Inventory Reality
- ${inventoryContext.totalCities} cities across ${inventoryContext.totalCountries} countries
- ${inventoryContext.totalCategories} active categories
- Top destinations: ${inventoryContext.topDestinations
        .slice(0, 10)
        .map((d: any) => `${d.name} (${d.productCount})`)
        .join(', ')}
- Top categories: ${inventoryContext.categories
        .slice(0, 10)
        .map((c: any) => `${c.name} (${c.productCount})`)
        .join(', ')}`
    : ''
}

## Selection Criteria
- Prefer keywords real users actually search on Google (not made-up compound phrases)
- Favor niches with high commercial intent and low competition
- Ensure diversity across geographies, demographics, occasions, and price tiers
- Domain names should be short, memorable, and .com where possible
- Include confidence score (0-100) based on your assessment of SEO viability

## Output
Return EXACTLY ${suggestionsCount} items as a JSON array:
[
  {
    "destination": "London, UK",
    "category": "food tours",
    "niche": "family-friendly food tours",
    "keyword": "london family food tours",
    "clusterKeywords": ["family food tours london", "kids food tour london", "london food tours for families", "family cooking class london", "child friendly restaurants london"],
    "rationale": "Families seek kid-friendly culinary experiences",
    "suggestedDomain": "london-family-food-tours.com",
    "alternativeDomains": ["familyfoodtourslondon.com", "london-family-foodie.com"],
    "confidenceScore": 75
  }
]
Include 5-8 clusterKeywords per item — related search terms a niche site would also rank for.

Return ONLY valid JSON, no markdown fences.`;
    }

    // No seeds: broad discovery
    return `You are a strategic advisor for an experience marketplace platform following the TravelAI micro-segmentation strategy (441% growth through 470+ niche sites).

## Your Task
Suggest ${suggestionsCount} creative niche site opportunities. Be DIVERSE and EXPLORATORY.

${inventoryContext ? `## Available Inventory\n${JSON.stringify(inventoryContext, null, 2)}` : ''}

## Guidelines
- Target micro-segments (demographics, interests, geographies)
- Each site should focus on ONE specific niche
- Suggest domain-friendly keywords (e.g., "london food tours" not "culinary experiences in the london area")
- Include confidence score (0-100) based on your assessment
- Suggest a domain name for each opportunity

## Output Format
Return ONLY valid JSON array:
[
  {
    "destination": "London, UK",
    "category": "food tours",
    "niche": "family-friendly food tours",
    "keyword": "london family food tours",
    "clusterKeywords": ["family food tours london", "kids food tour london", "london food tours for families", "family cooking class london", "child friendly restaurants london"],
    "rationale": "Families seek kid-friendly culinary experiences",
    "suggestedDomain": "london-family-food-tours.com",
    "alternativeDomains": ["familyfoodtourslondon.com", "london-family-foodie.com"],
    "confidenceScore": 75
  }
]
Include 5-8 clusterKeywords per item — related search terms a niche site would also rank for.`;
  }

  if (iterationNumber === 5) {
    // Final iteration: High precision with domain focus
    return `You are performing the FINAL iteration of opportunity optimization. Generate only the BEST opportunities.

## Previous Results Summary
${previousLearnings.metricsSummary}

## Top Performers from Previous Iterations
${previousLearnings.topPerformers
  .slice(0, 5)
  .map(
    (t, i) => `
${i + 1}. "${t.suggestion.keyword}" (Score: ${t.priorityScore})
   - Volume: ${t.dataForSeo.searchVolume}/mo | Difficulty: ${t.dataForSeo.difficulty} | CPC: $${t.dataForSeo.cpc.toFixed(2)}
   - Trend: ${t.dataForSeo.trend} | Products: ${t.holibobInventory.productCount}
`
  )
  .join('')}

## Successful Patterns
${previousLearnings.patterns.highScorePatterns.join('\n')}

## Best Performing
- Destinations: ${previousLearnings.patterns.bestDestinations.join(', ')}
- Categories: ${previousLearnings.patterns.bestCategories.join(', ')}

## Your Task
Generate ${suggestionsCount} FINAL high-confidence suggestions that:
1. Build on the most successful patterns
2. Target optimal ranges: difficulty ${previousLearnings.patterns.optimalDifficultyRange.min}-${previousLearnings.patterns.optimalDifficultyRange.max}, volume ${previousLearnings.patterns.optimalVolumeRange.min}+
3. Suggest EXACT domain names that are likely available
4. Provide detailed rationale including projected value

## Output Format
Return ONLY valid JSON array with the same structure as before (including clusterKeywords with 5-8 related search terms), but with higher confidence scores (aim for 80+).`;
  }

  // Iterations 2-4: Refinement with learning context
  return `You are refining opportunity suggestions based on DataForSEO validation results.

## Iteration ${iterationNumber}/5

## Previous Results
### TOP PERFORMERS (learn from these)
${previousLearnings.topPerformers
  .slice(0, 5)
  .map(
    (t) => `
- "${t.suggestion.keyword}" (Score: ${t.priorityScore})
  - Search Volume: ${t.dataForSeo.searchVolume}/mo
  - Difficulty: ${t.dataForSeo.difficulty}/100
  - CPC: $${t.dataForSeo.cpc.toFixed(2)}
  - Trend: ${t.dataForSeo.trend}
  - Why it worked: ${t.suggestion.rationale}
`
  )
  .join('')}

### BOTTOM PERFORMERS (avoid these patterns)
${previousLearnings.bottomPerformers
  .slice(0, 5)
  .map(
    (b) => `
- "${b.suggestion.keyword}" (Score: ${b.priorityScore})
  - Volume: ${b.dataForSeo.searchVolume}/mo | Difficulty: ${b.dataForSeo.difficulty}
  - Issue: ${b.dataForSeo.difficulty > 70 ? 'Too competitive' : b.dataForSeo.searchVolume < 500 ? 'Low volume' : 'Poor commercial fit'}
`
  )
  .join('')}

### PATTERNS IDENTIFIED
- High-scoring patterns: ${previousLearnings.patterns.highScorePatterns.join(', ')}
- Low-scoring patterns: ${previousLearnings.patterns.lowScorePatterns.join(', ')}
- Optimal difficulty: ${previousLearnings.patterns.optimalDifficultyRange.min}-${previousLearnings.patterns.optimalDifficultyRange.max}
- Optimal volume: ${previousLearnings.patterns.optimalVolumeRange.min}+/month
- Best destinations: ${previousLearnings.patterns.bestDestinations.join(', ')}
- Best categories: ${previousLearnings.patterns.bestCategories.join(', ')}

### STRATEGIC RECOMMENDATIONS
${previousLearnings.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## Your Task
Generate ${suggestionsCount} REFINED suggestions that:
1. Build on successful patterns from top performers
2. Avoid patterns that led to low scores
3. Explore variations of high-scoring niches
4. Target the optimal difficulty/volume ranges

Focus on QUALITY over novelty. Deepen what works.

## Output Format
Return ONLY valid JSON array:
[
  {
    "destination": "...",
    "category": "...",
    "niche": "...",
    "keyword": "short search term",
    "clusterKeywords": ["related term 1", "related term 2", "related term 3", "related term 4", "related term 5"],
    "rationale": "...",
    "suggestedDomain": "...",
    "alternativeDomains": ["...", "..."],
    "confidenceScore": 75
  }
]
Include 5-8 clusterKeywords per item — related search terms a niche site would also rank for.`;
}

// ==========================================
// DOMAIN AVAILABILITY CHECKING
// ==========================================

/**
 * Check domain availability for opportunity suggestions
 * Uses DNS lookup as a proxy for availability (not 100% accurate but fast and free)
 */
async function checkDomainAvailability(suggestion: OpportunitySuggestion): Promise<{
  primaryAvailable: boolean;
  alternativesAvailable: number;
  checkedDomains: Array<{ domain: string; available: boolean }>;
}> {
  const domainsToCheck: string[] = [];

  // Add suggested domain if provided
  if (suggestion.suggestedDomain) {
    domainsToCheck.push(suggestion.suggestedDomain);
  }

  // Add alternative domains
  if (suggestion.alternativeDomains && suggestion.alternativeDomains.length > 0) {
    domainsToCheck.push(...suggestion.alternativeDomains.slice(0, 3)); // Check up to 3 alternatives
  }

  // If no domains suggested, generate a basic one from keyword
  if (domainsToCheck.length === 0) {
    const baseDomain = suggestion.keyword.toLowerCase().replace(/\s+/g, '-') + '.com';
    domainsToCheck.push(baseDomain);
  }

  const checkedDomains: Array<{ domain: string; available: boolean }> = [];

  // Check each domain (with timeout to avoid hanging)
  for (const domain of domainsToCheck) {
    try {
      const available = await isDomainAvailable(domain);
      checkedDomains.push({ domain, available });
    } catch (error) {
      // If check fails, assume unavailable (conservative approach)
      checkedDomains.push({ domain, available: false });
    }
  }

  const primaryAvailable = checkedDomains[0]?.available || false;
  const alternativesAvailable = checkedDomains.slice(1).filter((d) => d.available).length;

  return {
    primaryAvailable,
    alternativesAvailable,
    checkedDomains,
  };
}

/**
 * Check if a single domain is likely available using DNS lookup
 * Note: This is a heuristic - a domain with no DNS records is LIKELY available,
 * but this is not definitive. For production, use a proper domain availability API.
 */
async function isDomainAvailable(domain: string): Promise<boolean> {
  // Remove protocol if included
  domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Simple DNS lookup using fetch with timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const response = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeout);

    // If site responds, domain is registered
    if (response && response.ok) {
      return false; // Domain is registered
    }

    // If no response or error, likely available (but not guaranteed)
    return true;
  } catch (error) {
    // Timeout or network error - assume available (optimistic)
    return true;
  }
}

// ==========================================
// PRE-FILTERING
// ==========================================

/**
 * Get existing opportunity keys from the database.
 * Caches the result for the duration of an optimization run.
 * This saves DataForSEO API costs by not re-validating keywords we already have.
 */
async function getExistingOpportunityKeys(): Promise<Set<string>> {
  if (existingOpportunityKeysCache !== null) {
    return existingOpportunityKeysCache;
  }

  console.log('[Optimizer Pre-Filter] Fetching existing opportunities from database...');

  const existingOpportunities = await prisma.sEOOpportunity.findMany({
    select: {
      keyword: true,
      location: true,
    },
  });

  // Build a Set of "keyword|location" keys for O(1) lookup
  const keys = new Set<string>();
  for (const opp of existingOpportunities) {
    const key = `${opp.keyword.toLowerCase()}|${(opp.location || '').toLowerCase()}`;
    keys.add(key);
  }

  console.log(`[Optimizer Pre-Filter] Found ${keys.size} existing opportunities to exclude`);
  existingOpportunityKeysCache = keys;
  return keys;
}

/**
 * Clear the existing opportunity keys cache.
 * Call this at the start of a new optimization run.
 */
export function clearExistingOpportunityKeysCache(): void {
  existingOpportunityKeysCache = null;
}

/**
 * Filter suggestions to exclude those that already exist in the database.
 */
async function filterExistingSuggestions(
  suggestions: OpportunitySuggestion[]
): Promise<OpportunitySuggestion[]> {
  const existingKeys = await getExistingOpportunityKeys();

  const filtered = suggestions.filter((suggestion) => {
    const key = `${suggestion.keyword.toLowerCase()}|${(suggestion.destination || '').toLowerCase()}`;
    return !existingKeys.has(key);
  });

  const skipped = suggestions.length - filtered.length;
  if (skipped > 0) {
    console.log(
      `[Optimizer Pre-Filter] Skipped ${skipped} suggestions that match existing opportunities (${filtered.length} remaining)`
    );
  }

  return filtered;
}

// ==========================================
// VALIDATION
// ==========================================

async function batchValidateOpportunities(
  suggestions: OpportunitySuggestion[],
  holibobClient: any,
  batchSize: number,
  apiCost: ApiCostBreakdown
): Promise<ValidatedOpportunity[]> {
  const keywordService = new KeywordResearchService();
  const dataForSeoBreaker = circuitBreakers.getBreaker('dataforseo-api', {
    failureThreshold: 5,
    timeout: 60000,
  });

  const validated: ValidatedOpportunity[] = [];

  // Collect ALL keywords (primary + cluster) for a single bulk validation call
  const allKeywords = new Set<string>();
  for (const suggestion of suggestions) {
    allKeywords.add(suggestion.keyword.toLowerCase());
    if (suggestion.clusterKeywords) {
      suggestion.clusterKeywords.forEach((k) => allKeywords.add(k.toLowerCase()));
    }
  }
  const uniqueKeywords = [...allKeywords];

  console.info(
    `[Optimizer] Validating ${uniqueKeywords.length} keywords (${suggestions.length} primary + cluster keywords)`
  );

  try {
    // Single bulk DataForSEO validation for all keywords (primary + cluster)
    const keywordData = await dataForSeoBreaker.execute(async () => {
      return await keywordService.getBulkKeywordData(uniqueKeywords);
    });

    apiCost.dataForSeo.searchVolumeCalls += Math.ceil(uniqueKeywords.length / batchSize);
    apiCost.dataForSeo.searchVolumeCost += uniqueKeywords.length * 0.002;

    // Map keyword data back by lowercase keyword
    const keywordMap = new Map(keywordData.map((k) => [k.keyword.toLowerCase(), k]));

    let skippedZeroCluster = 0;
    for (const suggestion of suggestions) {
      const primaryMetrics = keywordMap.get(suggestion.keyword.toLowerCase());
      if (!primaryMetrics) continue;

      // Assemble cluster data from validated keywords
      const clusterResults = (suggestion.clusterKeywords || [])
        .map((k) => {
          const m = keywordMap.get(k.toLowerCase());
          return m && m.searchVolume > 0
            ? { keyword: m.keyword, searchVolume: m.searchVolume, cpc: m.cpc }
            : null;
        })
        .filter((r): r is { keyword: string; searchVolume: number; cpc: number } => r !== null);

      const primaryVolume = primaryMetrics.searchVolume;
      const clusterTotalVolume =
        primaryVolume + clusterResults.reduce((sum, r) => sum + r.searchVolume, 0);

      // Skip if entire cluster (primary + related) has zero volume
      if (clusterTotalVolume === 0) {
        skippedZeroCluster++;
        continue;
      }

      // Calculate volume-weighted average CPC across cluster
      const totalWeightedCpc =
        primaryVolume * primaryMetrics.cpc +
        clusterResults.reduce((sum, r) => sum + r.searchVolume * r.cpc, 0);
      const clusterAvgCpc = clusterTotalVolume > 0 ? totalWeightedCpc / clusterTotalVolume : 0;

      const clusterData: ClusterData = {
        primaryKeyword: suggestion.keyword,
        primaryVolume,
        clusterKeywords: clusterResults,
        clusterTotalVolume,
        clusterKeywordCount: clusterResults.length + 1, // +1 for primary
        clusterAvgCpc,
      };

      // Get Holibob inventory for this destination/category
      let inventory = { productCount: 0, categories: [] as string[] };
      try {
        const holibobResult = await holibobClient.discoverProducts(
          {
            freeText: suggestion.destination,
            searchTerm: suggestion.category,
            currency: 'GBP',
          },
          { pageSize: 10 }
        );
        inventory = {
          productCount: holibobResult.products.length,
          categories: [
            ...new Set(
              holibobResult.products.map((p: any) => p.category as string).filter(Boolean)
            ),
          ] as string[],
        };
      } catch (e) {
        // Continue with zero inventory
      }

      // Check domain availability for suggested domains
      const domainAvailability = await checkDomainAvailability(suggestion);

      // Calculate priority score using CLUSTER volume and CPC
      const priorityScore = calculateEnhancedScore({
        searchVolume: primaryMetrics.searchVolume,
        clusterTotalVolume,
        difficulty: primaryMetrics.keywordDifficulty,
        cpc: primaryMetrics.cpc,
        clusterAvgCpc,
        competition: primaryMetrics.competition,
        trend: primaryMetrics.trend,
        inventoryCount: inventory.productCount,
        confidenceScore: suggestion.confidenceScore,
        domainAvailable: domainAvailability.primaryAvailable,
        alternativesAvailable: domainAvailability.alternativesAvailable,
      });

      validated.push({
        suggestion: {
          ...suggestion,
          domainAvailability: domainAvailability,
        },
        dataForSeo: {
          searchVolume: primaryMetrics.searchVolume,
          difficulty: primaryMetrics.keywordDifficulty,
          cpc: primaryMetrics.cpc,
          competition: primaryMetrics.competition,
          competitionLevel: primaryMetrics.competitionLevel,
          trend: primaryMetrics.trend,
          seasonality: primaryMetrics.seasonality,
          monthlyTrends: primaryMetrics.monthlyTrends,
        },
        clusterData,
        holibobInventory: inventory,
        priorityScore,
        validatedAt: new Date(),
      });
    }

    // Log cluster volume stats for diagnostics
    if (validated.length > 0) {
      const topByCluster = [...validated]
        .sort(
          (a, b) =>
            (b.clusterData?.clusterTotalVolume || b.dataForSeo.searchVolume) -
            (a.clusterData?.clusterTotalVolume || a.dataForSeo.searchVolume)
        )
        .slice(0, 5);
      console.info(
        `[Optimizer] Top cluster volumes: ${topByCluster
          .map(
            (v) =>
              `"${v.suggestion.keyword}": primary=${v.dataForSeo.searchVolume}, cluster=${v.clusterData?.clusterTotalVolume || v.dataForSeo.searchVolume} (${v.clusterData?.clusterKeywordCount || 1} kws)`
          )
          .join(' | ')}`
      );
    }

    if (skippedZeroCluster > 0) {
      console.info(
        `[Optimizer] Skipped ${skippedZeroCluster}/${suggestions.length} opportunities with zero cluster volume`
      );
    }
  } catch (error) {
    console.error('[Optimizer] Batch validation error — skipping batch (no fallback to random estimates):', error);
    // Return empty validated array — do not generate fake metrics
  }

  return validated.sort((a, b) => b.priorityScore - a.priorityScore);
}

function calculateEnhancedScore(data: {
  searchVolume: number;
  clusterTotalVolume?: number;
  difficulty: number;
  cpc: number;
  clusterAvgCpc?: number;
  competition: number;
  trend: 'rising' | 'stable' | 'declining';
  inventoryCount: number;
  confidenceScore: number;
  domainAvailable?: boolean;
  alternativesAvailable?: number;
}): number {
  // Search Volume (35%) - use CLUSTER total volume for scoring (the real addressable volume)
  // log10(1000)=3, log10(10000)=4, log10(100000)=5, log10(1000000)=6
  const effectiveVolume = data.clusterTotalVolume || data.searchVolume;
  const logVolume = effectiveVolume > 0 ? Math.log10(effectiveVolume) : 0;
  const volumeScore = Math.min((logVolume / 6) * 35, 35); // /6 instead of /5 to account for larger cluster volumes

  // Competition / Difficulty (20%) - lower difficulty = higher score
  const competitionScore = ((100 - data.difficulty) / 100) * 20;

  // Commercial Intent via CPC (20%) - use cluster average CPC for broader signal
  // $0=0pts, $1=8pts, $3=14pts, $5+=20pts
  const effectiveCpc = data.clusterAvgCpc || data.cpc;
  const cpcScore = Math.min((effectiveCpc / 5) * 20, 20);

  // Inventory (10%) - signal, not a gate. Zero inventory gets 3pts minimum
  const inventoryBase = 3; // Minimum score even with zero inventory
  const inventoryBonus = Math.min((data.inventoryCount / 30) * 7, 7);
  const inventoryScore = inventoryBase + inventoryBonus;

  // Trend / Seasonality (5%)
  const trendScore = data.trend === 'rising' ? 5 : data.trend === 'stable' ? 3 : 1;

  // Domain availability (5%)
  let domainScore = 2.5; // neutral default
  if (data.domainAvailable !== undefined) {
    if (data.domainAvailable) {
      domainScore = 5;
    } else if ((data.alternativesAvailable || 0) > 0) {
      domainScore = 3;
    } else {
      domainScore = 0;
    }
  }

  // Competition density (5%) - low competition index = blue ocean
  const densityScore = data.competition < 0.3 ? 5 : data.competition < 0.6 ? 3 : 1;

  const totalScore =
    volumeScore +
    competitionScore +
    cpcScore +
    inventoryScore +
    trendScore +
    domainScore +
    densityScore;

  // AI confidence factor (0.85-1.15 multiplier) - tighter range than before
  const confidenceFactor = 0.85 + (data.confidenceScore / 100) * 0.3;

  return Math.round(Math.min(totalScore * confidenceFactor, 100));
}

// ==========================================
// LEARNING EXTRACTION
// ==========================================

function extractIterationLearnings(
  validated: ValidatedOpportunity[],
  config: OptimizationConfig
): IterationLearnings {
  const sorted = [...validated].sort((a, b) => b.priorityScore - a.priorityScore);
  const topPerformers = sorted
    .filter((v) => v.priorityScore >= config.targetScoreThreshold)
    .slice(0, 5);
  const bottomPerformers = sorted
    .filter((v) => v.priorityScore < config.minScoreThreshold)
    .slice(-5);

  // Analyze patterns
  const highScorePatterns: string[] = [];
  const lowScorePatterns: string[] = [];

  // Extract patterns from top performers
  if (topPerformers.length > 0) {
    const topDestinations = [...new Set(topPerformers.map((t) => t.suggestion.destination))];
    const topCategories = [...new Set(topPerformers.map((t) => t.suggestion.category))];
    const avgDifficulty =
      topPerformers.reduce((sum, t) => sum + t.dataForSeo.difficulty, 0) / topPerformers.length;
    const avgVolume =
      topPerformers.reduce((sum, t) => sum + t.dataForSeo.searchVolume, 0) / topPerformers.length;

    highScorePatterns.push(`Destinations that work: ${topDestinations.join(', ')}`);
    highScorePatterns.push(`Categories that work: ${topCategories.join(', ')}`);
    highScorePatterns.push(`Average difficulty of winners: ${avgDifficulty.toFixed(0)}`);
    highScorePatterns.push(`Average volume of winners: ${avgVolume.toFixed(0)}/mo`);
  }

  // Extract patterns from bottom performers
  if (bottomPerformers.length > 0) {
    const bottomDestinations = [...new Set(bottomPerformers.map((b) => b.suggestion.destination))];
    const bottomCategories = [...new Set(bottomPerformers.map((b) => b.suggestion.category))];

    lowScorePatterns.push(`Destinations to avoid: ${bottomDestinations.join(', ')}`);
    lowScorePatterns.push(`Categories to avoid: ${bottomCategories.join(', ')}`);

    // Identify why they failed
    for (const b of bottomPerformers) {
      if (b.dataForSeo.difficulty > 70)
        lowScorePatterns.push(
          `"${b.suggestion.keyword}" failed: too competitive (${b.dataForSeo.difficulty})`
        );
      if (b.dataForSeo.searchVolume < 500)
        lowScorePatterns.push(
          `"${b.suggestion.keyword}" failed: low volume (${b.dataForSeo.searchVolume})`
        );
    }
  }

  // Calculate optimal ranges from all data
  const goodOpportunities = validated.filter((v) => v.priorityScore >= config.minScoreThreshold);
  const difficulties = goodOpportunities.map((v) => v.dataForSeo.difficulty);
  const volumes = goodOpportunities.map((v) => v.dataForSeo.searchVolume);

  const optimalDifficultyRange = {
    min: Math.min(...difficulties) || 20,
    max: Math.max(...difficulties.filter((d) => d < 70)) || 60,
  };

  const optimalVolumeRange = {
    min: Math.max(500, Math.min(...volumes) || 500),
    max: Math.max(...volumes) || 10000,
  };

  // Best performing destinations/categories
  const destinationScores = new Map<string, number[]>();
  const categoryScores = new Map<string, number[]>();
  for (const v of validated) {
    if (!destinationScores.has(v.suggestion.destination))
      destinationScores.set(v.suggestion.destination, []);
    destinationScores.get(v.suggestion.destination)!.push(v.priorityScore);
    if (!categoryScores.has(v.suggestion.category)) categoryScores.set(v.suggestion.category, []);
    categoryScores.get(v.suggestion.category)!.push(v.priorityScore);
  }

  const avgDestinationScores = [...destinationScores.entries()].map(([d, scores]) => ({
    destination: d,
    avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
  }));
  const avgCategoryScores = [...categoryScores.entries()].map(([c, scores]) => ({
    category: c,
    avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
  }));

  const bestDestinations = avgDestinationScores
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 3)
    .map((d) => d.destination);
  const bestCategories = avgCategoryScores
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 3)
    .map((c) => c.category);
  const avoidDestinations = avgDestinationScores
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 2)
    .map((d) => d.destination);
  const avoidCategories = avgCategoryScores
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 2)
    .map((c) => c.category);

  // Generate recommendations
  const recommendations: string[] = [];
  if (bestDestinations.length > 0) {
    recommendations.push(
      `Focus on ${bestDestinations.join(', ')} - these destinations scored highest`
    );
  }
  if (bestCategories.length > 0) {
    recommendations.push(`Prioritize ${bestCategories.join(', ')} categories`);
  }
  recommendations.push(
    `Target difficulty ${optimalDifficultyRange.min}-${optimalDifficultyRange.max} for best results`
  );
  recommendations.push(`Look for keywords with ${optimalVolumeRange.min}+ monthly searches`);
  if (topPerformers.some((t) => t.dataForSeo.trend === 'rising')) {
    recommendations.push('Rising trends correlate with higher scores - look for growing niches');
  }

  // Summary for prompt
  const metricsSummary = `
Iteration Results:
- Total validated: ${validated.length}
- Above threshold (${config.targetScoreThreshold}+): ${topPerformers.length}
- Average score: ${(validated.reduce((sum, v) => sum + v.priorityScore, 0) / validated.length).toFixed(1)}
- Best score: ${sorted[0]?.priorityScore || 0}
- Optimal difficulty range: ${optimalDifficultyRange.min}-${optimalDifficultyRange.max}
- Optimal volume range: ${optimalVolumeRange.min}+/mo
`;

  return {
    topPerformers,
    bottomPerformers,
    patterns: {
      highScorePatterns,
      lowScorePatterns,
      optimalDifficultyRange,
      optimalVolumeRange,
      bestDestinations,
      bestCategories,
      avoidDestinations,
      avoidCategories,
    },
    recommendations,
    metricsSummary,
  };
}

// ==========================================
// METRICS CALCULATION
// ==========================================

function calculateIterationMetrics(
  suggestions: OpportunitySuggestion[],
  validated: ValidatedOpportunity[],
  previousIteration: IterationResult | null,
  executionTimeMs: number,
  apiCost: ApiCostBreakdown
): IterationMetrics {
  const scores = validated.map((v) => v.priorityScore);
  const sortedScores = [...scores].sort((a, b) => a - b);

  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const medianIndex = Math.floor(sortedScores.length / 2);
  const medianScore = sortedScores.length > 0 ? (sortedScores[medianIndex] ?? 0) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;

  const previousAvg = previousIteration?.metrics.averageScore || averageScore;
  const improvementFromPrevious = previousIteration
    ? ((averageScore - previousAvg) / previousAvg) * 100
    : 0;

  return {
    totalSuggestions: suggestions.length,
    validatedCount: validated.length,
    aboveThreshold: validated.filter((v) => v.priorityScore >= 75).length,
    averageScore,
    medianScore,
    maxScore,
    minScore,
    scoreDistribution: {
      excellent: validated.filter((v) => v.priorityScore >= 85).length,
      good: validated.filter((v) => v.priorityScore >= 70 && v.priorityScore < 85).length,
      moderate: validated.filter((v) => v.priorityScore >= 50 && v.priorityScore < 70).length,
      poor: validated.filter((v) => v.priorityScore < 50).length,
    },
    improvementFromPrevious,
    apiCallsMade: apiCost.anthropic.sonnetCalls + apiCost.dataForSeo.searchVolumeCalls,
    apiCostUsd: apiCost.totalCost,
    executionTimeMs,
  };
}

// ==========================================
// FINAL RANKING
// ==========================================

async function generateFinalRankings(
  iterations: IterationResult[],
  apiCost: ApiCostBreakdown
): Promise<RankedOpportunity[]> {
  // Collect all validated opportunities across iterations
  const allOpportunities = new Map<
    string,
    { opportunity: ValidatedOpportunity; iterationScores: number[]; firstSeen: number }
  >();

  for (const iteration of iterations) {
    for (const validated of iteration.validatedOpportunities) {
      const key = validated.suggestion.keyword.toLowerCase();
      if (!allOpportunities.has(key)) {
        allOpportunities.set(key, {
          opportunity: validated,
          iterationScores: [validated.priorityScore],
          firstSeen: iteration.iterationNumber,
        });
      } else {
        const existing = allOpportunities.get(key)!;
        existing.iterationScores.push(validated.priorityScore);
        // Keep the best version
        if (validated.priorityScore > existing.opportunity.priorityScore) {
          existing.opportunity = validated;
        }
      }
    }
  }

  // Log volume distribution for diagnostics
  const allVols = [...allOpportunities.values()].map((item) => {
    const vol =
      item.opportunity.clusterData?.clusterTotalVolume || item.opportunity.dataForSeo.searchVolume;
    return {
      keyword: item.opportunity.suggestion.keyword,
      clusterVol: vol,
      score: item.opportunity.priorityScore,
    };
  });
  allVols.sort((a, b) => b.clusterVol - a.clusterVol);
  console.info(
    `[Optimizer] Volume distribution (top 10): ${allVols
      .slice(0, 10)
      .map((v) => `"${v.keyword}": ${v.clusterVol.toLocaleString()}/mo (score ${v.score})`)
      .join(', ')}`
  );

  // Keep opportunities with real search volume and score above 40
  // Threshold: 1K cluster volume — niche travel keywords rarely exceed 20K individually
  const MIN_CLUSTER_VOLUME = 1000;
  const sorted = [...allOpportunities.values()]
    .filter((item) => {
      const clusterVol =
        item.opportunity.clusterData?.clusterTotalVolume ||
        item.opportunity.dataForSeo.searchVolume;
      return clusterVol >= MIN_CLUSTER_VOLUME;
    })
    .sort((a, b) => b.opportunity.priorityScore - a.opportunity.priorityScore)
    .filter((item) => item.opportunity.priorityScore >= 40);

  const droppedCount = allOpportunities.size - sorted.length;
  console.info(
    `[Optimizer] Final ranking: ${sorted.length} opportunities above score 40 with cluster volume >= ${MIN_CLUSTER_VOLUME} (dropped ${droppedCount} from ${allOpportunities.size} total)`
  );

  // Generate explanations only for top 20 (to control API costs)
  const ranked: RankedOpportunity[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (!item) continue;
    const opp = item.opportunity;

    const clusterVol = opp.clusterData?.clusterTotalVolume || opp.dataForSeo.searchVolume;
    const clusterCount = opp.clusterData?.clusterKeywordCount || 1;

    // Only generate AI explanations for top 20
    const explanation =
      i < 20
        ? await generateOpportunityExplanation(opp, apiCost)
        : `Score ${opp.priorityScore}: ${clusterVol.toLocaleString()}/mo cluster volume (${clusterCount} keywords), difficulty ${opp.dataForSeo.difficulty}, CPC $${opp.dataForSeo.cpc.toFixed(2)}`;

    const projectedValue = calculateProjectedValue(opp);

    ranked.push({
      rank: i + 1,
      opportunity: opp,
      domainSuggestions: {
        primary:
          opp.suggestion.suggestedDomain || `${opp.suggestion.keyword.replace(/\s+/g, '-')}.com`,
        alternatives: opp.suggestion.alternativeDomains || [],
      },
      journey: {
        firstSeenIteration: item.firstSeen,
        iterationScores: item.iterationScores,
        wasRefined: item.iterationScores.length > 1,
        refinementSource: item.iterationScores.length > 1 ? opp.suggestion.keyword : undefined,
      },
      explanation,
      projectedValue,
    });
  }

  return ranked;
}

async function generateOpportunityExplanation(
  opp: ValidatedOpportunity,
  apiCost: ApiCostBreakdown
): Promise<string> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) {
    return `High-value opportunity with ${opp.dataForSeo.searchVolume} monthly searches and ${opp.dataForSeo.difficulty} difficulty score.`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `In 2-3 sentences, explain why "${opp.suggestion.keyword}" is a high-value opportunity for an experience marketplace. Key metrics: ${opp.dataForSeo.searchVolume}/mo searches, ${opp.dataForSeo.difficulty} difficulty, $${opp.dataForSeo.cpc.toFixed(2)} CPC, ${opp.dataForSeo.trend} trend, ${opp.holibobInventory.productCount} available products. Focus on commercial potential and competitive positioning.`,
          },
        ],
      }),
    });

    const data = (await response.json()) as {
      content: Array<{ text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    apiCost.anthropic.haikuCalls++;
    if (data.usage) {
      apiCost.anthropic.haikuTokens += data.usage.input_tokens + data.usage.output_tokens;
      apiCost.anthropic.haikuCost +=
        (data.usage.input_tokens * 0.00025 + data.usage.output_tokens * 0.00125) / 1000;
    }

    return (
      data.content?.[0]?.text ||
      `High-value opportunity with ${opp.dataForSeo.searchVolume} monthly searches.`
    );
  } catch {
    return `High-value opportunity with ${opp.dataForSeo.searchVolume} monthly searches and ${opp.dataForSeo.difficulty} difficulty score.`;
  }
}

function calculateProjectedValue(opp: ValidatedOpportunity): {
  monthlyTraffic: number;
  monthlyRevenue: number;
  paybackPeriod: number;
} {
  // Blended CTR model: primary keyword ranks higher, cluster keywords at lower positions
  const primaryVolume = opp.dataForSeo.searchVolume;
  const clusterTotalVolume = opp.clusterData?.clusterTotalVolume || primaryVolume;
  const secondaryVolume = clusterTotalVolume - primaryVolume;

  const primaryCtr = 0.05; // 5% CTR for primary keyword (~position 5)
  const secondaryCtr = 0.03; // 3% CTR for cluster keywords (~position 7-8)

  const monthlyTraffic = Math.round(primaryVolume * primaryCtr + secondaryVolume * secondaryCtr);

  // Estimate conversion rate for travel experiences
  const conversionRate = 0.02; // 2% booking conversion
  const avgBookingValue = 75; // Average booking value in GBP
  const monthlyRevenue = Math.round(monthlyTraffic * conversionRate * avgBookingValue);

  // Estimate setup cost (domain + initial content)
  const setupCost = 500; // Approximate cost
  const paybackPeriod = monthlyRevenue > 0 ? Math.ceil(setupCost / monthlyRevenue) : 999;

  return {
    monthlyTraffic,
    monthlyRevenue,
    paybackPeriod: Math.min(paybackPeriod, 36), // Cap at 36 months
  };
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function shouldStopEarly(iterations: IterationResult[], threshold: number): boolean {
  if (iterations.length < 3) return false;

  const last2Improvements = iterations.slice(-2).map((it) => it.metrics.improvementFromPrevious);
  return last2Improvements.every((imp) => Math.abs(imp) < threshold);
}

