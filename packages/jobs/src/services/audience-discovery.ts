/**
 * Audience-First Opportunity Discovery
 *
 * Inverts the traditional approach: instead of starting from inventory (destination × category)
 * and validating with search data, we start from audience segments and discover
 * what keywords actually have search demand.
 *
 * Pipeline:
 * 1. AI generates audience segments (not keywords, not destinations)
 * 2. DataForSEO discovers real keywords per segment (with volume data included)
 * 3. Keywords clustered under parent segments with aggregate metrics
 * 4. Holibob inventory validates feasibility (late-stage signal, not a gate)
 * 5. AI evaluates top segments for marketplace viability
 * 6. Score and store as SEOOpportunity records
 */

import { DataForSEOClient } from './dataforseo-client';
import { circuitBreakers } from '../errors/circuit-breaker';
import { v4 as uuidv4 } from 'uuid';

// ==========================================
// CONFIGURATION
// ==========================================

const DEFAULT_LOCATION = 'United States';
const DEFAULT_LANGUAGE = 'English';
const KEYWORDS_PER_SEED = 50;
const MIN_SEGMENT_VOLUME = 500;
const TOP_SEGMENTS_FOR_INVENTORY = 30;
const TOP_SEGMENTS_FOR_EVALUATION = 25;
const DATAFORSEO_BATCH_SIZE = 10; // concurrent API calls per batch
const DATAFORSEO_BATCH_DELAY_MS = 500; // delay between batches

// ==========================================
// TYPES
// ==========================================

export interface AudienceSegment {
  id: string;
  name: string;
  description: string;
  dimension: string;
  searchSeeds: string[];
  targetAudience: string;
}

interface KeywordData {
  keyword: string;
  searchVolume: number;
  competition: number;
  competitionLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  cpc: number;
  trends?: number[];
}

export interface SegmentKeywordCluster {
  segment: AudienceSegment;
  keywords: KeywordData[];
  metrics: {
    totalVolume: number;
    weightedCpc: number;
    avgDifficulty: number;
    avgCompetition: number;
    keywordCount: number;
    topKeywords: Array<{ keyword: string; volume: number; cpc: number }>;
  };
}

export interface SegmentFeasibility {
  totalProducts: number;
  searchTermsUsed: string[];
  sampleProducts: Array<{ name: string; category?: string }>;
}

export interface SegmentEvaluation {
  viabilityScore: number;
  brandName: string;
  suggestedDomain: string;
  alternativeDomains: string[];
  positioning: string;
  contentStrategy: string;
  competitiveAdvantage: string;
  monthlyTrafficEstimate: number;
  revenueEstimate: number;
}

export interface EvaluatedSegment {
  segment: AudienceSegment;
  cluster: SegmentKeywordCluster;
  feasibility: SegmentFeasibility;
  evaluation: SegmentEvaluation;
  priorityScore: number;
}

export interface DiscoveryResult {
  success: boolean;
  segments: AudienceSegment[];
  clusters: SegmentKeywordCluster[];
  opportunities: EvaluatedSegment[];
  totalKeywordsDiscovered: number;
  apiCost: {
    anthropicCost: number;
    dataForSeoCost: number;
    totalCost: number;
  };
  executionTimeMs: number;
  summary: string;
}

// ==========================================
// PHASE 1: AI AUDIENCE SEGMENT GENERATION
// ==========================================

async function generateAudienceSegments(): Promise<{
  segments: AudienceSegment[];
  cost: number;
}> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = `You are a strategic advisor identifying underserved traveler audiences who would use a curated experience marketplace. Think about WHO travels, not WHERE they go.

## Context
We build micro-niche marketplace websites — each one serves a specific type of traveler. The marketplace aggregates bookable experiences (tours, activities, classes, adventures) globally. We need to find audience segments where:
1. People actively search Google for experiences/activities related to their interest or life stage
2. No dominant marketplace already owns that niche
3. The audience is large enough to sustain a standalone brand

## Dimensions to explore
- **Life stage**: Honeymooners, retirees, gap year travelers, new parents, empty nesters, students
- **Passion/Interest**: Foodies, wine enthusiasts, history buffs, photography lovers, wellness seekers, adventure junkies, art lovers, music fans, sports enthusiasts, craft beer lovers, scuba divers, hikers, cyclists
- **Values/Style**: Eco-conscious, luxury, budget, off-the-beaten-path, accessible/inclusive, solo female, LGBTQ+, digital nomad, slow travel
- **Occasion**: Bachelor/ette parties, corporate team building, anniversary trips, birthday celebrations, graduation trips, reunion travel, proposal planning
- **Group type**: Family with toddlers, family with teens, multi-generational, couples, friend groups, solo travelers, senior groups

## Rules
1. Each segment must be a PERSON TYPE or OCCASION, not a destination or activity category
2. For each segment, provide 2-3 search seeds — short (2-4 word) queries that this audience ACTUALLY types into Google
3. Search seeds should be experience/activity-focused, not flight/hotel-focused
4. Think globally — these audiences exist everywhere, not just in one country
5. Avoid segments that are just activity categories disguised as audiences (e.g., "food tour lovers" is just the food tours category)
6. Mix broad segments (large volume) with specific niches (lower competition)

## Required Output
Return EXACTLY 50 items as a JSON array. Each must have:
- name: Short segment name (e.g., "Honeymooners")
- description: One sentence describing this audience and what they look for
- dimension: One of "life_stage", "interest", "values", "occasion", "lifestyle", "group_type"
- searchSeeds: Array of 2-3 short Google search queries this audience types (e.g., ["honeymoon ideas", "romantic getaways", "honeymoon activities"])
- targetAudience: One sentence describing who this person is

Return ONLY a valid JSON array, no markdown fences, no explanation.`;

  console.log('[Audience Discovery] Calling AI for audience segment generation...');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const responseText = data.content?.[0]?.text;
  if (!responseText) {
    throw new Error('Empty AI response for segment generation');
  }

  // Estimate cost: Sonnet input ~$3/M tokens, output ~$15/M tokens
  const inputTokens = data.usage?.input_tokens || 800;
  const outputTokens = data.usage?.output_tokens || 8000;
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  // Parse JSON response
  const cleaned = responseText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  let jsonMatch = cleaned.match(/\[[\s\S]*\]/);

  // Repair truncated response
  if (!jsonMatch) {
    const arrayStart = cleaned.indexOf('[');
    if (arrayStart !== -1) {
      let truncated = cleaned.slice(arrayStart).trim();
      const lastBrace = truncated.lastIndexOf('}');
      if (lastBrace !== -1) {
        truncated = truncated.slice(0, lastBrace + 1) + ']';
        jsonMatch = [truncated];
        console.log('[Audience Discovery] Repaired truncated JSON response');
      }
    }
  }

  if (!jsonMatch) {
    console.error(
      '[Audience Discovery] Failed to extract JSON. Response preview:',
      responseText.slice(0, 500)
    );
    throw new Error('Could not extract JSON array from AI segment response');
  }

  const rawSegments = JSON.parse(jsonMatch[0]) as Array<{
    name: string;
    description: string;
    dimension: string;
    searchSeeds: string[];
    targetAudience: string;
  }>;

  const segments: AudienceSegment[] = rawSegments.map((s) => ({
    id: uuidv4(),
    name: s.name,
    description: s.description,
    dimension: s.dimension || 'interest',
    searchSeeds: Array.isArray(s.searchSeeds) ? s.searchSeeds.slice(0, 3) : [],
    targetAudience: s.targetAudience || s.description,
  }));

  console.log(
    `[Audience Discovery] AI generated ${segments.length} audience segments across dimensions: ${[...new Set(segments.map((s) => s.dimension))].join(', ')}`
  );

  return { segments, cost };
}

// ==========================================
// PHASE 2: KEYWORD DISCOVERY PER SEGMENT
// ==========================================

async function discoverSegmentKeywords(
  segments: AudienceSegment[],
  location: string,
  language: string
): Promise<{
  keywordMap: Map<string, KeywordData[]>;
  cost: number;
}> {
  const dataForSeo = new DataForSEOClient();
  const dataForSeoBreaker = circuitBreakers.getBreaker('dataforseo-api', {
    failureThreshold: 5,
    timeout: 60000,
  });

  const keywordMap = new Map<string, KeywordData[]>();
  let totalCalls = 0;

  // Collect all seed queries: segment ID → seed keywords
  const seedTasks: Array<{ segmentId: string; seed: string }> = [];
  for (const segment of segments) {
    for (const seed of segment.searchSeeds) {
      seedTasks.push({ segmentId: segment.id, seed });
    }
  }

  console.log(
    `[Audience Discovery] Discovering keywords for ${segments.length} segments (${seedTasks.length} seed queries)...`
  );

  // Process in batches to avoid rate limiting
  for (let i = 0; i < seedTasks.length; i += DATAFORSEO_BATCH_SIZE) {
    const batch = seedTasks.slice(i, i + DATAFORSEO_BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async ({ segmentId, seed }) => {
        const keywords = await dataForSeoBreaker.execute(async () => {
          return await dataForSeo.discoverKeywords(seed, location, language, KEYWORDS_PER_SEED);
        });
        return { segmentId, keywords };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { segmentId, keywords } = result.value;
        const existing = keywordMap.get(segmentId) || [];
        keywordMap.set(segmentId, [...existing, ...keywords]);
        totalCalls++;
      }
      // Silently skip failed seeds — other seeds for the same segment may succeed
    }

    // Brief delay between batches
    if (i + DATAFORSEO_BATCH_SIZE < seedTasks.length) {
      await new Promise((resolve) => setTimeout(resolve, DATAFORSEO_BATCH_DELAY_MS));
    }
  }

  // Deduplicate keywords within each segment
  for (const [segmentId, keywords] of keywordMap.entries()) {
    const seen = new Set<string>();
    const deduped = keywords.filter((k) => {
      const lower = k.keyword.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
    keywordMap.set(segmentId, deduped);
  }

  const totalKeywords = [...keywordMap.values()].reduce((sum, kws) => sum + kws.length, 0);
  console.log(
    `[Audience Discovery] Discovered ${totalKeywords} unique keywords across ${keywordMap.size} segments (${totalCalls} API calls)`
  );

  // Cost: ~$0.003 per discoverKeywords call
  const cost = totalCalls * 0.003;

  return { keywordMap, cost };
}

// ==========================================
// PHASE 3: BUILD SEGMENT CLUSTERS
// ==========================================

function buildSegmentClusters(
  segments: AudienceSegment[],
  keywordMap: Map<string, KeywordData[]>
): SegmentKeywordCluster[] {
  const clusters: SegmentKeywordCluster[] = [];

  for (const segment of segments) {
    const keywords = keywordMap.get(segment.id) || [];

    // Filter to keywords with actual search volume
    const withVolume = keywords.filter((k) => k.searchVolume > 0);

    if (withVolume.length === 0) continue;

    // Sort by volume descending
    withVolume.sort((a, b) => b.searchVolume - a.searchVolume);

    const totalVolume = withVolume.reduce((sum, k) => sum + k.searchVolume, 0);

    // Volume-weighted CPC
    const weightedCpc =
      totalVolume > 0
        ? withVolume.reduce((sum, k) => sum + k.searchVolume * k.cpc, 0) / totalVolume
        : 0;

    // Average competition (proxy for difficulty since we don't do SERP calls)
    const avgCompetition =
      withVolume.length > 0
        ? withVolume.reduce((sum, k) => sum + k.competition, 0) / withVolume.length
        : 0;

    const topKeywords = withVolume.slice(0, 10).map((k) => ({
      keyword: k.keyword,
      volume: k.searchVolume,
      cpc: k.cpc,
    }));

    clusters.push({
      segment,
      keywords: withVolume,
      metrics: {
        totalVolume,
        weightedCpc,
        avgDifficulty: Math.round(avgCompetition * 100), // Scale 0-1 to 0-100
        avgCompetition,
        keywordCount: withVolume.length,
        topKeywords,
      },
    });
  }

  // Sort by total volume descending
  clusters.sort((a, b) => b.metrics.totalVolume - a.metrics.totalVolume);

  // Filter out segments below minimum volume threshold
  const viable = clusters.filter((c) => c.metrics.totalVolume >= MIN_SEGMENT_VOLUME);

  console.log(
    `[Audience Discovery] Built ${viable.length} viable clusters (dropped ${clusters.length - viable.length} below ${MIN_SEGMENT_VOLUME} volume threshold)`
  );

  if (viable.length > 0) {
    console.log(
      `[Audience Discovery] Top 5 segments by volume: ${viable
        .slice(0, 5)
        .map(
          (c) =>
            `"${c.segment.name}": ${c.metrics.totalVolume.toLocaleString()}/mo (${c.metrics.keywordCount} keywords)`
        )
        .join(', ')}`
    );
  }

  return viable;
}

// ==========================================
// PHASE 4: INVENTORY FEASIBILITY CHECK
// ==========================================

async function checkInventoryFeasibility(
  clusters: SegmentKeywordCluster[],
  holibobClient: any
): Promise<Map<string, SegmentFeasibility>> {
  const feasibilityMap = new Map<string, SegmentFeasibility>();

  // Only check top segments to control API usage
  const toCheck = clusters.slice(0, TOP_SEGMENTS_FOR_INVENTORY);

  console.log(
    `[Audience Discovery] Checking inventory feasibility for top ${toCheck.length} segments...`
  );

  for (const cluster of toCheck) {
    // Use the segment's top keywords as search terms for Holibob
    // Take top 3 keywords by volume as search terms
    const searchTerms = cluster.metrics.topKeywords.slice(0, 3).map((k) => k.keyword);

    let totalProducts = 0;
    const sampleProducts: Array<{ name: string; category?: string }> = [];

    for (const term of searchTerms) {
      try {
        const result = await holibobClient.discoverProducts(
          { searchTerm: term, currency: 'GBP' },
          { pageSize: 10 }
        );
        totalProducts += result.products?.length || 0;
        if (result.products) {
          for (const p of result.products.slice(0, 3)) {
            sampleProducts.push({ name: p.name, category: p.category });
          }
        }
      } catch {
        // Continue — Holibob failure for one term shouldn't kill the segment
      }
    }

    feasibilityMap.set(cluster.segment.id, {
      totalProducts,
      searchTermsUsed: searchTerms,
      sampleProducts: sampleProducts.slice(0, 5),
    });
  }

  const withInventory = [...feasibilityMap.values()].filter((f) => f.totalProducts > 0).length;
  console.log(
    `[Audience Discovery] Inventory check: ${withInventory}/${toCheck.length} segments have matching products`
  );

  return feasibilityMap;
}

// ==========================================
// PHASE 5: AI STRATEGIC EVALUATION
// ==========================================

async function evaluateTopSegments(
  clusters: SegmentKeywordCluster[],
  feasibilityMap: Map<string, SegmentFeasibility>
): Promise<{
  evaluations: Map<string, SegmentEvaluation>;
  cost: number;
}> {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicApiKey) {
    // Return basic evaluations without AI
    const evaluations = new Map<string, SegmentEvaluation>();
    for (const cluster of clusters.slice(0, TOP_SEGMENTS_FOR_EVALUATION)) {
      evaluations.set(cluster.segment.id, createFallbackEvaluation(cluster));
    }
    return { evaluations, cost: 0 };
  }

  const toEvaluate = clusters.slice(0, TOP_SEGMENTS_FOR_EVALUATION);

  // Build context for AI
  const segmentSummaries = toEvaluate.map((cluster, i) => {
    const feasibility = feasibilityMap.get(cluster.segment.id);
    return {
      rank: i + 1,
      name: cluster.segment.name,
      dimension: cluster.segment.dimension,
      description: cluster.segment.description,
      totalMonthlySearchVolume: cluster.metrics.totalVolume,
      keywordCount: cluster.metrics.keywordCount,
      avgCpc: `$${cluster.metrics.weightedCpc.toFixed(2)}`,
      competitionLevel:
        cluster.metrics.avgCompetition < 0.3
          ? 'LOW'
          : cluster.metrics.avgCompetition < 0.6
            ? 'MEDIUM'
            : 'HIGH',
      topKeywords: cluster.metrics.topKeywords.slice(0, 5),
      inventoryProducts: feasibility?.totalProducts || 0,
      sampleProducts: feasibility?.sampleProducts?.slice(0, 3) || [],
    };
  });

  const prompt = `You are evaluating audience segments for a global travel experience marketplace. Each segment would become a standalone niche website (e.g., "honeymoon-adventures.com") that aggregates bookable tours, activities, and experiences.

## Segments with Real Search Data
${JSON.stringify(segmentSummaries, null, 2)}

## For each segment, evaluate:
1. **viabilityScore** (0-100): How viable is this as a standalone marketplace? Consider search volume, competition, monetization potential, and audience loyalty.
2. **brandName**: A memorable, short brand name for this niche site (e.g., "HoneyTrip", "WildPursuit", "CulinaryWanderer")
3. **suggestedDomain**: Primary domain (e.g., "honeytrip.com")
4. **alternativeDomains**: 2 alternatives
5. **positioning**: One sentence brand positioning statement
6. **contentStrategy**: What types of pages/content would this site have? (1-2 sentences)
7. **competitiveAdvantage**: What makes a niche site beat generic platforms for this audience? (1 sentence)
8. **monthlyTrafficEstimate**: Realistic monthly organic traffic after 12 months (number)
9. **revenueEstimate**: Estimated monthly revenue at maturity in USD (number)

Return a JSON array with one object per segment, in the same order. Each object has the segment name and all fields above.

Return ONLY a valid JSON array, no markdown fences, no explanation.`;

  console.log('[Audience Discovery] Calling AI for strategic evaluation of top segments...');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    console.error('[Audience Discovery] AI evaluation API error, using fallback scoring');
    const evaluations = new Map<string, SegmentEvaluation>();
    for (const cluster of toEvaluate) {
      evaluations.set(cluster.segment.id, createFallbackEvaluation(cluster));
    }
    return { evaluations, cost: 0 };
  }

  const aiData = (await response.json()) as {
    content: Array<{ text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const responseText = aiData.content?.[0]?.text;

  const inputTokens = aiData.usage?.input_tokens || 2000;
  const outputTokens = aiData.usage?.output_tokens || 8000;
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  if (!responseText) {
    console.error('[Audience Discovery] Empty AI evaluation response, using fallback');
    const evaluations = new Map<string, SegmentEvaluation>();
    for (const cluster of toEvaluate) {
      evaluations.set(cluster.segment.id, createFallbackEvaluation(cluster));
    }
    return { evaluations, cost };
  }

  // Parse response
  const cleaned = responseText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  let jsonMatch = cleaned.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    const arrayStart = cleaned.indexOf('[');
    if (arrayStart !== -1) {
      let truncated = cleaned.slice(arrayStart).trim();
      const lastBrace = truncated.lastIndexOf('}');
      if (lastBrace !== -1) {
        truncated = truncated.slice(0, lastBrace + 1) + ']';
        jsonMatch = [truncated];
      }
    }
  }

  const evaluations = new Map<string, SegmentEvaluation>();

  if (!jsonMatch) {
    console.error('[Audience Discovery] Could not parse AI evaluation, using fallback');
    for (const cluster of toEvaluate) {
      evaluations.set(cluster.segment.id, createFallbackEvaluation(cluster));
    }
    return { evaluations, cost };
  }

  try {
    const rawEvaluations = JSON.parse(jsonMatch[0]) as Array<Record<string, any>>;

    for (let i = 0; i < toEvaluate.length && i < rawEvaluations.length; i++) {
      const cluster = toEvaluate[i];
      if (!cluster) continue;
      const raw = rawEvaluations[i];
      if (!raw) continue;

      evaluations.set(cluster.segment.id, {
        viabilityScore: Number(raw['viabilityScore']) || 50,
        brandName: String(raw['brandName'] || cluster.segment.name),
        suggestedDomain: String(raw['suggestedDomain'] || `${cluster.segment.name.toLowerCase().replace(/\s+/g, '-')}.com`),
        alternativeDomains: Array.isArray(raw['alternativeDomains']) ? raw['alternativeDomains'] : [],
        positioning: String(raw['positioning'] || ''),
        contentStrategy: String(raw['contentStrategy'] || ''),
        competitiveAdvantage: String(raw['competitiveAdvantage'] || ''),
        monthlyTrafficEstimate: Number(raw['monthlyTrafficEstimate']) || 0,
        revenueEstimate: Number(raw['revenueEstimate']) || 0,
      });
    }
  } catch (parseError) {
    console.error('[Audience Discovery] Failed to parse AI evaluations:', parseError);
    for (const cluster of toEvaluate) {
      if (!evaluations.has(cluster.segment.id)) {
        evaluations.set(cluster.segment.id, createFallbackEvaluation(cluster));
      }
    }
  }

  console.log(`[Audience Discovery] AI evaluated ${evaluations.size} segments`);
  return { evaluations, cost };
}

function createFallbackEvaluation(cluster: SegmentKeywordCluster): SegmentEvaluation {
  const vol = cluster.metrics.totalVolume;
  const cpc = cluster.metrics.weightedCpc;
  const name = cluster.segment.name;

  return {
    viabilityScore: Math.min(100, Math.round((Math.log10(vol + 1) / 6) * 70 + (cpc / 5) * 30)),
    brandName: name,
    suggestedDomain: `${name.toLowerCase().replace(/\s+/g, '-')}.com`,
    alternativeDomains: [],
    positioning: `Curated experiences for ${name.toLowerCase()}`,
    contentStrategy: `Destination guides, experience reviews, and planning resources for ${name.toLowerCase()}`,
    competitiveAdvantage: 'Niche focus enables deeper curation than generic platforms',
    monthlyTrafficEstimate: Math.round(vol * 0.03), // ~3% CTR estimate
    revenueEstimate: Math.round(vol * 0.03 * cpc * 0.1), // Traffic × CPC × 10% conversion proxy
  };
}

// ==========================================
// PHASE 6: SCORING
// ==========================================

function calculateSegmentPriorityScore(
  cluster: SegmentKeywordCluster,
  feasibility: SegmentFeasibility | undefined,
  evaluation: SegmentEvaluation
): number {
  const vol = cluster.metrics.totalVolume;
  const cpc = cluster.metrics.weightedCpc;
  const competition = cluster.metrics.avgCompetition;
  const keywordDepth = cluster.metrics.keywordCount;
  const inventoryCount = feasibility?.totalProducts || 0;

  // Volume (35%) — log scale, clusters can reach 100K+
  const logVolume = vol > 0 ? Math.log10(vol) : 0;
  const volumeScore = Math.min((logVolume / 6) * 35, 35);

  // Competition (20%) — lower competition = higher score
  const competitionScore = ((1 - competition) / 1) * 20;

  // Commercial intent via CPC (20%)
  const cpcScore = Math.min((cpc / 5) * 20, 20);

  // Keyword depth (10%) — more keywords = more pages = more traffic ceiling
  const depthScore = Math.min((keywordDepth / 100) * 10, 10);

  // Inventory feasibility (10%) — signal, not gate
  const inventoryBase = 3;
  const inventoryBonus = Math.min((inventoryCount / 30) * 7, 7);
  const inventoryScore = inventoryBase + inventoryBonus;

  // AI viability assessment (5%)
  const viabilityScore = (evaluation.viabilityScore / 100) * 5;

  const totalScore =
    volumeScore + competitionScore + cpcScore + depthScore + inventoryScore + viabilityScore;

  return Math.round(Math.min(totalScore, 100));
}

// ==========================================
// MAIN PIPELINE
// ==========================================

export async function runAudienceFirstDiscovery(
  holibobClient: any,
  options?: {
    location?: string;
    language?: string;
  }
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const location = options?.location || DEFAULT_LOCATION;
  const language = options?.language || DEFAULT_LANGUAGE;

  let anthropicCost = 0;
  let dataForSeoCost = 0;

  // Phase 1: Generate audience segments via AI
  console.log('[Audience Discovery] === PHASE 1: Audience Segment Generation ===');
  const { segments, cost: segmentCost } = await generateAudienceSegments();
  anthropicCost += segmentCost;

  if (segments.length === 0) {
    return {
      success: false,
      segments: [],
      clusters: [],
      opportunities: [],
      totalKeywordsDiscovered: 0,
      apiCost: { anthropicCost, dataForSeoCost, totalCost: anthropicCost },
      executionTimeMs: Date.now() - startTime,
      summary: 'AI segment generation produced no results',
    };
  }

  // Phase 2: Discover keywords per segment via DataForSEO
  console.log('[Audience Discovery] === PHASE 2: Keyword Discovery ===');
  const { keywordMap, cost: discoveryCost } = await discoverSegmentKeywords(
    segments,
    location,
    language
  );
  dataForSeoCost += discoveryCost;

  // Phase 3: Build and score segment clusters
  console.log('[Audience Discovery] === PHASE 3: Cluster Building ===');
  const clusters = buildSegmentClusters(segments, keywordMap);

  if (clusters.length === 0) {
    return {
      success: false,
      segments,
      clusters: [],
      opportunities: [],
      totalKeywordsDiscovered: [...keywordMap.values()].reduce((sum, kws) => sum + kws.length, 0),
      apiCost: {
        anthropicCost,
        dataForSeoCost,
        totalCost: anthropicCost + dataForSeoCost,
      },
      executionTimeMs: Date.now() - startTime,
      summary: `Generated ${segments.length} segments but no clusters met the ${MIN_SEGMENT_VOLUME} volume threshold`,
    };
  }

  // Phase 4: Check inventory feasibility via Holibob
  console.log('[Audience Discovery] === PHASE 4: Inventory Feasibility ===');
  const feasibilityMap = await checkInventoryFeasibility(clusters, holibobClient);

  // Phase 5: AI strategic evaluation
  console.log('[Audience Discovery] === PHASE 5: AI Strategic Evaluation ===');
  const { evaluations, cost: evalCost } = await evaluateTopSegments(clusters, feasibilityMap);
  anthropicCost += evalCost;

  // Phase 6: Score and assemble final opportunities
  console.log('[Audience Discovery] === PHASE 6: Scoring ===');
  const opportunities: EvaluatedSegment[] = [];

  for (const cluster of clusters) {
    const feasibility = feasibilityMap.get(cluster.segment.id) || {
      totalProducts: 0,
      searchTermsUsed: [],
      sampleProducts: [],
    };
    const evaluation =
      evaluations.get(cluster.segment.id) || createFallbackEvaluation(cluster);

    const priorityScore = calculateSegmentPriorityScore(cluster, feasibility, evaluation);

    opportunities.push({
      segment: cluster.segment,
      cluster,
      feasibility,
      evaluation,
      priorityScore,
    });
  }

  // Sort by priority score
  opportunities.sort((a, b) => b.priorityScore - a.priorityScore);

  const totalKeywords = clusters.reduce((sum, c) => sum + c.metrics.keywordCount, 0);
  const totalCost = anthropicCost + dataForSeoCost;
  const executionTimeMs = Date.now() - startTime;

  const summary = `Discovered ${segments.length} audience segments, ${clusters.length} viable clusters with ${totalKeywords} keywords, ${opportunities.length} scored opportunities. Top: "${opportunities[0]?.segment.name}" (${opportunities[0]?.cluster.metrics.totalVolume.toLocaleString()}/mo, score ${opportunities[0]?.priorityScore}). Cost: $${totalCost.toFixed(2)}`;

  console.log(`[Audience Discovery] === COMPLETE ===`);
  console.log(`[Audience Discovery] ${summary}`);

  return {
    success: true,
    segments,
    clusters,
    opportunities,
    totalKeywordsDiscovered: totalKeywords,
    apiCost: { anthropicCost, dataForSeoCost, totalCost },
    executionTimeMs,
    summary,
  };
}
