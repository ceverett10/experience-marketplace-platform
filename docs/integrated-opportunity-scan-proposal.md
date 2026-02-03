# Integrated Multi-Mode Scan + Recursive Optimization

## Overview
Combine the new multi-mode scanning (hyper-local, generic, demographic, occasion, etc.) with the existing 5-iteration recursive optimization to produce the highest-quality opportunities.

---

## Flow Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 1: DIVERSE SEED GENERATION (Multi-Mode Scan)                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Run All Scan Modes in Parallel:                                    │
│  ├─ Hyper-Local:     "london food tours", "paris wine tasting"      │
│  ├─ Generic:         "food tours", "wine tasting"                   │
│  ├─ Demographic:     "family travel", "senior tours"                │
│  ├─ Occasion:        "bachelor parties", "corporate events"         │
│  ├─ Experience:      "luxury wine tours", "beginner cooking"        │
│  └─ Regional:        "european city breaks", "caribbean islands"    │
│                                                                      │
│  Output: ~100-150 diverse seed opportunities                        │
│                                                                      │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 2: RECURSIVE OPTIMIZATION (5 Iterations)                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Iteration 1: EXPLORATION (20 suggestions from seeds)               │
│  ├─ AI: Take seeds + inventory → Generate creative variations       │
│  ├─ DataForSEO: Validate search volume, difficulty, CPC             │
│  ├─ Score: Calculate priority scores                                │
│  └─ Learn: Extract patterns from what works                         │
│                                                                      │
│  Iteration 2-4: REFINEMENT (16-13 suggestions)                      │
│  ├─ AI: "Top performers were X, avoid Y patterns"                   │
│  ├─ Validate: Re-check with DataForSEO                              │
│  ├─ Score: Progressive improvement                                  │
│  └─ Learn: Deeper pattern recognition                               │
│                                                                      │
│  Iteration 5: PRECISION (10 suggestions)                            │
│  ├─ AI: "Final iteration - only best opportunities"                 │
│  ├─ Domain Check: Verify availability & pricing                     │
│  ├─ Score: Final scoring with all factors                           │
│  └─ Rank: Sort by success likelihood                                │
│                                                                      │
│  Output: Top 10 ranked opportunities (all types balanced)           │
│                                                                      │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 3: USER PRESENTATION                                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Display to User:                                                    │
│  Rank 1: "Family Travel Experiences" (Demographic, Score: 92)       │
│  Rank 2: "London Food Tours" (Hyper-Local, Score: 89)               │
│  Rank 3: "Pet-Friendly Travel" (Demographic, Score: 87)             │
│  ...                                                                 │
│                                                                      │
│  Auto-Action: Queue SITE_CREATE for top opportunities               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Changes

### 1. Update `handleOpportunityScan()` to Use Both Systems

```typescript
export async function handleOpportunityScan(
  job: Job<SeoOpportunityScanPayload>
): Promise<JobResult> {
  const { siteId, destinations, categories, forceRescan, useRecursiveOptimization } = job.data;

  try {
    console.log('[Opportunity Scan] Starting opportunity scan');

    // Permission check
    const canProceed = await canExecuteAutonomousOperation({
      siteId,
      rateLimitType: 'OPPORTUNITY_SCAN',
    });
    if (!canProceed.allowed) {
      return {
        success: false,
        error: canProceed.reason || 'Opportunity scanning is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    const holibobClient = createHolibobClient({
      apiUrl: process.env['HOLIBOB_API_URL'] || 'https://api.sandbox.holibob.tech/graphql',
      partnerId: process.env['HOLIBOB_PARTNER_ID'] || '',
      apiKey: process.env['HOLIBOB_API_KEY'] || '',
      apiSecret: process.env['HOLIBOB_API_SECRET'],
      sandbox: process.env['HOLIBOB_ENV'] !== 'production',
      timeout: 30000,
    });

    // DECISION POINT: Use recursive optimization or direct scan?
    if (useRecursiveOptimization !== false) { // Default to true
      console.log('[Opportunity Scan] Using RECURSIVE OPTIMIZATION mode');
      return await runIntegratedOptimization(holibobClient, { siteId });
    } else {
      console.log('[Opportunity Scan] Using DIRECT SCAN mode (fast)');
      return await runDirectScan(holibobClient, { destinations, categories, siteId });
    }
  } catch (error) {
    // Error handling...
  }
}
```

### 2. New Function: `runIntegratedOptimization()`

This combines multi-mode seed generation with recursive optimization:

```typescript
/**
 * Integrated multi-mode scan + recursive optimization
 *
 * Flow:
 * 1. Generate diverse seeds from all scan modes
 * 2. Feed to recursive optimizer for 5-iteration refinement
 * 3. Return top 10 opportunities across all types
 */
async function runIntegratedOptimization(
  holibobClient: any,
  options: { siteId?: string }
): Promise<JobResult> {
  const startTime = Date.now();

  // PHASE 1: Generate diverse seeds from all modes
  console.log('[Integrated] PHASE 1: Generating diverse seed opportunities...');

  const seeds = await generateMultiModeSeeds(holibobClient);

  console.log(`[Integrated] Generated ${seeds.length} seed opportunities:
    - Hyper-Local: ${seeds.filter(s => s.scanMode === 'hyper_local').length}
    - Generic: ${seeds.filter(s => s.scanMode === 'generic_activity').length}
    - Demographic: ${seeds.filter(s => s.scanMode === 'demographic').length}
    - Occasion: ${seeds.filter(s => s.scanMode === 'occasion').length}
    - Experience-Level: ${seeds.filter(s => s.scanMode === 'experience_level').length}
    - Regional: ${seeds.filter(s => s.scanMode === 'regional').length}
  `);

  // PHASE 2: Run recursive optimization with seeds as context
  console.log('[Integrated] PHASE 2: Running 5-iteration recursive optimization...');

  const optimizationResult = await runRecursiveOptimizationWithSeeds(
    holibobClient,
    seeds,
    {
      maxIterations: 5,
      initialSuggestionsCount: 20,
      narrowingFactor: 0.8,
      minScoreThreshold: 50,
      targetScoreThreshold: 75,
      earlyStopImprovementThreshold: 2,
      batchSize: 50,
    }
  );

  if (!optimizationResult.success) {
    throw new Error('Optimization failed');
  }

  // PHASE 3: Store and auto-action top opportunities
  console.log('[Integrated] PHASE 3: Storing and auto-actioning top opportunities...');

  let stored = 0;
  for (const ranked of optimizationResult.finalOpportunities) {
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
          source: 'integrated_scan',
          explanation: ranked.explanation,
          sourceData: {
            scanMode: determineScanMode(opp.suggestion),
            optimizationRank: ranked.rank,
            journey: ranked.journey,
            domainSuggestions: ranked.domainSuggestions,
            projectedValue: ranked.projectedValue,
            dataForSeo: opp.dataForSeo,
            holibobInventory: opp.holibobInventory,
            iterationCount: optimizationResult.iterations.length,
            totalApiCost: optimizationResult.totalApiCost.totalCost,
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
            scanMode: determineScanMode(opp.suggestion),
            optimizationRank: ranked.rank,
            journey: ranked.journey,
            domainSuggestions: ranked.domainSuggestions,
            projectedValue: ranked.projectedValue,
            dataForSeo: opp.dataForSeo,
            holibobInventory: opp.holibobInventory,
            iterationCount: optimizationResult.iterations.length,
            totalApiCost: optimizationResult.totalApiCost.totalCost,
          },
        },
      });

      stored++;
      console.log(`[Integrated] Stored #${ranked.rank}: ${opp.suggestion.keyword} (score: ${opp.priorityScore})`);
    } catch (dbError) {
      console.error(`[Integrated] Failed to store ${opp.suggestion.keyword}:`, dbError);
    }
  }

  // Auto-action top opportunities
  await autoActionOpportunities();

  const executionTimeMs = Date.now() - startTime;

  return {
    success: true,
    message: optimizationResult.summary,
    data: {
      phase1Seeds: seeds.length,
      phase2Iterations: optimizationResult.iterations.length,
      phase3Stored: stored,
      topOpportunities: optimizationResult.finalOpportunities.map(r => ({
        rank: r.rank,
        keyword: r.opportunity.suggestion.keyword,
        type: determineScanMode(r.opportunity.suggestion),
        score: r.opportunity.priorityScore,
        domain: r.domainSuggestions.primary,
        projectedRevenue: r.projectedValue.monthlyRevenue,
      })),
      totalApiCost: optimizationResult.totalApiCost.totalCost,
      executionTimeMs,
    },
    timestamp: new Date(),
  };
}
```

### 3. New Function: `generateMultiModeSeeds()`

Generates diverse initial seeds from all scan modes:

```typescript
/**
 * Generate diverse seed opportunities from all scan modes
 * These serve as the starting point for recursive optimization
 */
async function generateMultiModeSeeds(
  holibobClient: any
): Promise<OpportunitySeed[]> {
  const seeds: OpportunitySeed[] = [];

  // Mode 1: Hyper-Local (top cities x top categories)
  const hyperLocalSeeds = await generateHyperLocalSeeds(holibobClient);
  seeds.push(...hyperLocalSeeds);

  // Mode 2: Generic Activities
  const genericSeeds = await generateGenericSeeds(holibobClient);
  seeds.push(...genericSeeds);

  // Mode 3: Demographics
  const demographicSeeds = await generateDemographicSeeds(holibobClient);
  seeds.push(...demographicSeeds);

  // Mode 4: Occasions
  const occasionSeeds = await generateOccasionSeeds(holibobClient);
  seeds.push(...occasionSeeds);

  // Mode 5: Experience Levels
  const experienceSeeds = await generateExperienceLevelSeeds(holibobClient);
  seeds.push(...experienceSeeds);

  // Mode 6: Regional
  const regionalSeeds = await generateRegionalSeeds(holibobClient);
  seeds.push(...regionalSeeds);

  return seeds;
}

interface OpportunitySeed {
  keyword: string;
  destination?: string;
  category: string;
  niche: string;
  scanMode: 'hyper_local' | 'generic_activity' | 'demographic' | 'occasion' | 'experience_level' | 'regional';
  rationale: string;
  inventoryCount: number;
}

async function generateHyperLocalSeeds(client: any): Promise<OpportunitySeed[]> {
  const destinations = ['London, England', 'Paris, France', 'Barcelona, Spain', 'Rome, Italy', 'New York, USA'];
  const categories = ['food tours', 'walking tours', 'museum tickets', 'wine tasting'];

  const seeds: OpportunitySeed[] = [];

  for (const destination of destinations) {
    for (const category of categories) {
      const city = destination.split(',')[0] || destination;
      const keyword = `${city.toLowerCase()} ${category}`;

      try {
        const inventory = await client.discoverProducts(
          { freeText: destination, searchTerm: category, currency: 'GBP' },
          { pageSize: 10 }
        );

        if (inventory.products.length > 0) {
          seeds.push({
            keyword,
            destination,
            category,
            niche: category,
            scanMode: 'hyper_local',
            rationale: `High-demand ${category} in major tourist destination ${city}`,
            inventoryCount: inventory.products.length,
          });
        }
      } catch (error) {
        console.error(`[Seeds] Error checking ${keyword}:`, error);
      }
    }
  }

  return seeds;
}

async function generateGenericSeeds(client: any): Promise<OpportunitySeed[]> {
  const genericKeywords = [
    'food tours',
    'wine tours',
    'cooking classes',
    'museum tickets',
    'city tours',
    'boat tours',
    'photography tours',
  ];

  const seeds: OpportunitySeed[] = [];

  for (const keyword of genericKeywords) {
    const globalInventory = await checkGlobalInventory(client, keyword);

    // Generic needs broad inventory
    if (globalInventory.destinationCount >= 5 && globalInventory.totalCount >= 50) {
      seeds.push({
        keyword,
        destination: undefined, // Generic - no location
        category: keyword,
        niche: keyword,
        scanMode: 'generic_activity',
        rationale: `Global ${keyword} platform aggregating ${globalInventory.destinationCount} destinations`,
        inventoryCount: globalInventory.totalCount,
      });
    }
  }

  return seeds;
}

async function generateDemographicSeeds(client: any): Promise<OpportunitySeed[]> {
  const demographics = [
    { keyword: 'family travel experiences', category: 'travel', niche: 'family travel' },
    { keyword: 'senior-friendly tours', category: 'tours', niche: 'senior travel' },
    { keyword: 'accessible travel', category: 'travel', niche: 'accessible tourism' },
    { keyword: 'pet-friendly travel', category: 'travel', niche: 'pet travel' },
    { keyword: 'solo travel activities', category: 'activities', niche: 'solo travelers' },
  ];

  const seeds: OpportunitySeed[] = [];

  for (const demo of demographics) {
    const globalInventory = await checkGlobalInventory(client, demo.category);

    if (globalInventory.totalCount >= 30) {
      seeds.push({
        keyword: demo.keyword,
        destination: undefined,
        category: demo.category,
        niche: demo.niche,
        scanMode: 'demographic',
        rationale: `Underserved ${demo.niche} demographic with growing demand`,
        inventoryCount: globalInventory.totalCount,
      });
    }
  }

  return seeds;
}

// Similar functions for occasions, experience levels, and regional...
```

### 4. Update `runRecursiveOptimization()` to Accept Seeds

Modify the optimizer to use seeds as context in Iteration 1:

```typescript
/**
 * Enhanced recursive optimization that uses seed opportunities as starting context
 */
export async function runRecursiveOptimizationWithSeeds(
  holibobClient: any,
  seeds: OpportunitySeed[],
  config?: Partial<OptimizationConfig>
): Promise<OptimizationResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  // ... existing setup code ...

  let previousLearnings: IterationLearnings | null = null;
  let seedContext: OpportunitySeed[] | null = seeds;

  for (let i = 1; i <= finalConfig.maxIterations; i++) {
    // ... iteration setup ...

    // Step 1: Generate suggestions WITH SEED CONTEXT for iteration 1
    const suggestions = await generateRefinedSuggestions(
      i,
      previousLearnings,
      suggestionsCount,
      inventorySample,
      apiCost,
      seedContext // NEW: Pass seeds to first iteration
    );

    seedContext = null; // Only use seeds in iteration 1

    // ... rest of iteration logic ...
  }

  // ... final ranking and return ...
}
```

### 5. Update AI Prompt for Iteration 1 to Use Seeds

```typescript
function buildIterationPrompt(
  iterationNumber: number,
  previousLearnings: IterationLearnings | null,
  suggestionsCount: number,
  inventorySample: any,
  seedContext?: OpportunitySeed[] | null
): string {
  if (iterationNumber === 1 && seedContext && seedContext.length > 0) {
    // NEW: First iteration with seed context
    const seedsByMode = groupBy(seedContext, s => s.scanMode);

    return `You are a strategic advisor for an experience marketplace platform following the TravelAI micro-segmentation strategy.

## Your Task
Generate ${suggestionsCount} creative niche site opportunities. You have SEED OPPORTUNITIES from multiple scan modes as starting points.

## Seed Opportunities (${seedContext.length} total)

### Hyper-Local Seeds (${seedsByMode.hyper_local?.length || 0})
${seedsByMode.hyper_local?.slice(0, 5).map(s => `- ${s.keyword} (${s.inventoryCount} products)`).join('\n') || 'None'}

### Generic Activity Seeds (${seedsByMode.generic_activity?.length || 0})
${seedsByMode.generic_activity?.slice(0, 5).map(s => `- ${s.keyword} (${s.inventoryCount} products globally)`).join('\n') || 'None'}

### Demographic Seeds (${seedsByMode.demographic?.length || 0})
${seedsByMode.demographic?.slice(0, 5).map(s => `- ${s.keyword} (${s.rationale})`).join('\n') || 'None'}

### Occasion Seeds (${seedsByMode.occasion?.length || 0})
${seedsByMode.occasion?.slice(0, 5).map(s => `- ${s.keyword} (${s.rationale})`).join('\n') || 'None'}

## Available Holibob Inventory
${JSON.stringify(inventorySample, null, 2)}

## Guidelines
- Use seeds as inspiration - build on them, refine them, or explore variations
- Balance different opportunity types (don't over-index on one mode)
- Target micro-segments with strong search demand AND available inventory
- Suggest domain-friendly keywords
- Include confidence score (0-100)

## Output Format
Return ONLY valid JSON array:
[
  {
    "destination": "London, UK" or null for generic,
    "category": "food tours",
    "niche": "family-friendly food tours",
    "keyword": "london family food tours",
    "rationale": "Strong seed + growing family travel segment",
    "suggestedDomain": "london-family-food-tours.com",
    "alternativeDomains": ["familyfoodtourslondon.com"],
    "confidenceScore": 75
  }
]`;
  }

  // Existing prompts for iterations 2-5...
}

// Helper function
function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
```

---

## Benefits of Integrated Approach

### 1. **Diversity + Quality**
- Seeds ensure all opportunity types (hyper-local, generic, demographic) are considered
- Recursive optimization ensures only the BEST of each type survive

### 2. **Data-Driven Refinement**
- Iteration 1: "Here's a diverse portfolio - let's validate"
- Iteration 2-4: "Generic domains are taken, hyper-local works better"
- Iteration 5: "Top 10 = 6 hyper-local, 2 demographic, 2 occasion-based"

### 3. **Automatic Balancing**
- If generic "food tours" domain is unavailable/expensive → score drops
- If hyper-local "london food tours" has great metrics → score rises
- Natural selection finds the best opportunities regardless of type

### 4. **Progressive Learning**
Example learning progression:
```
Iteration 1:
- Tried 20 opportunities (mix of all types)
- Top scorer: "london food tours" (hyper-local, 87)
- Learning: London + food works well

Iteration 2:
- AI: "Let's try more London + X and food + Y variations"
- Tried: "london wine tours", "paris food tours", "food tours" (generic)
- Top scorer: "paris food tours" (hyper-local, 89)
- Learning: European cities + food consistently high

Iteration 3:
- AI: "Focus on European cities + culinary"
- Also explored: "family food tours barcelona" (demographic niche)
- Top scorer: "family food tours barcelona" (92)
- Learning: Demographic niches within strong categories win

Iterations 4-5:
- Refined variations of winning patterns
- Final top 10 balances types based on actual performance
```

---

## Expected Results

After running integrated optimization, the final ranked list might look like:

| Rank | Keyword | Type | Score | Volume | Difficulty | Domain | Revenue/mo |
|------|---------|------|-------|---------|-----------|--------|------------|
| 1 | family food tours barcelona | Demographic + Local | 92 | 4,200 | 38 | ✅ $9.99 | $315 |
| 2 | paris food tours | Hyper-Local | 89 | 6,800 | 42 | ✅ $9.99 | $510 |
| 3 | senior-friendly tours | Demographic | 87 | 3,100 | 28 | ✅ $11.99 | $232 |
| 4 | london wine tasting | Hyper-Local | 86 | 5,400 | 45 | ✅ $9.99 | $405 |
| 5 | bachelor party experiences | Occasion | 84 | 8,200 | 35 | ✅ $14.99 | $615 |
| 6 | rome walking tours | Hyper-Local | 83 | 7,100 | 48 | ✅ $8.99 | $532 |
| 7 | accessible travel experiences | Demographic | 82 | 2,900 | 32 | ✅ $12.99 | $217 |
| 8 | luxury wine tours | Experience-Level | 81 | 1,800 | 42 | ✅ $24.99 | $270 |
| 9 | amsterdam bike tours | Hyper-Local | 79 | 4,500 | 51 | ✅ $9.99 | $337 |
| 10 | european city breaks | Regional | 78 | 18,000 | 64 | ❌ Taken | $0 |

**Portfolio Breakdown:**
- Hyper-Local: 4 opportunities (40%)
- Demographic: 3 opportunities (30%)
- Occasion: 1 opportunity (10%)
- Experience-Level: 1 opportunity (10%)
- Regional: 1 opportunity (10%)

**Why This Mix?**
- Hyper-local won because: Good domains available, lower competition, clear inventory match
- Demographics won because: Underserved markets, reasonable volume, community potential
- Generic struggled because: Domains taken, very high competition
- Regional struggled because: High competition, domain unavailable

---

## Implementation Timeline

### Phase 1: Core Integration (Week 1)
- Update `handleOpportunityScan()` with integrated mode
- Implement `generateMultiModeSeeds()` and mode-specific seed functions
- Update `runRecursiveOptimization()` to accept seeds

### Phase 2: Enhanced Scoring (Week 2)
- Add domain availability checking to scoring
- Implement market saturation checks
- Update scoring formula with strategic fit multipliers

### Phase 3: Testing & Tuning (Week 3)
- Run test scans with integrated mode
- Analyze results and tune scoring weights
- Validate that diverse opportunities are balanced fairly

### Phase 4: Production Deployment (Week 4)
- Deploy to production
- Monitor first automated scan results
- Iterate on scoring based on real performance

---

## Configuration

Add to environment variables or job payload:

```typescript
interface SeoOpportunityScanPayload {
  siteId?: string;
  destinations?: string[];
  categories?: string[];
  forceRescan?: boolean;

  // NEW: Optimization mode
  useRecursiveOptimization?: boolean; // Default: true
  optimizationConfig?: {
    maxIterations?: number; // Default: 5
    initialSuggestionsCount?: number; // Default: 20
    seedModes?: ('hyper_local' | 'generic_activity' | 'demographic' | 'occasion' | 'experience_level' | 'regional')[];
    // Default: all modes
  };
}
```

---

## Cost Estimates

### Per Daily Scan (Integrated Mode):
- **Phase 1 (Seeds)**: ~60 Holibob API calls × $0.001 = $0.06
- **Phase 2 (Optimization)**:
  - Anthropic (5 iterations): ~$0.50
  - DataForSEO (batch validation): ~$0.40
- **Phase 3 (Domain checks)**: ~10 checks × $0.01 = $0.10
- **Total per scan**: ~$1.06

### Monthly Cost:
- 30 daily scans × $1.06 = ~$31.80/month

**ROI**: If each top-10 opportunity generates $300/month revenue, monthly value = $3,000.
Cost to find them: $31.80. **ROI = 94x**

---

## Next Steps

Ready to implement? I can start with:

1. **Phase 1**: Update the scanner to support integrated mode with seed generation
2. **Phase 2**: Modify recursive optimizer to accept and use seeds
3. **Phase 3**: Add enhanced scoring with domain availability

Let me know when to proceed!
