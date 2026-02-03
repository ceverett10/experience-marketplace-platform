# Opportunity Scan Enhancement Proposal
## Balanced Hyper-Local + Generic Opportunities

### Overview
Enhance the opportunity scanner to identify BOTH hyper-local (e.g., "Amsterdam Food Tours") AND generic (e.g., "Food Tours", "Family Travel") opportunities, then rank them all together based on likelihood of success.

---

## Scan Mode Types

### 1. **Hyper-Local Mode** (EXISTING - Keep)
**Format:** `{City} + {Category}`
**Examples:**
- "london food tours"
- "new york wine tasting"
- "paris museum tickets"

**Inventory Check:** Single destination
**Success Factors:**
- Lower competition (niche + geographic)
- Specific buyer intent
- Easier to rank locally
- Lower domain costs

---

### 2. **Generic Activity Mode** (NEW)
**Format:** `{Activity}` (no location)
**Examples:**
- "food tours"
- "wine tasting"
- "museum tickets"
- "cooking classes"

**Inventory Check:** Must have inventory in 5+ destinations
**Success Factors:**
- High search volume
- Global reach
- Can build authority site
- LLM recommendation-friendly

**Scoring Adjustments:**
- Requires 3x more inventory (need multi-destination coverage)
- Higher competition penalty
- Domain availability critical (premium domains likely taken)
- Bonus for global applicability

---

### 3. **Demographic Mode** (NEW)
**Format:** `{Demographic} + {Activity/Travel}`
**Examples:**
- "family travel experiences"
- "senior-friendly tours"
- "accessible travel experiences"
- "pet-friendly activities"
- "solo traveler adventures"

**Inventory Check:** Must support demographic across destinations
**Success Factors:**
- Underserved markets = less competition
- Strong community potential
- Repeat customers
- Word-of-mouth growth

**Scoring Adjustments:**
- Bonus for underserved demographics (+10 points)
- Lower search volume acceptable (niche audience)
- Community engagement score

---

### 4. **Occasion-Based Mode** (NEW)
**Format:** `{Occasion} + {Activity/Experience}`
**Examples:**
- "bachelor party experiences"
- "corporate team building activities"
- "anniversary celebrations"
- "honeymoon experiences"

**Inventory Check:** Premium/group experiences available
**Success Factors:**
- High-value transactions
- B2B potential (corporate)
- Seasonal spikes (can plan for)
- Higher CPC = commercial intent

**Scoring Adjustments:**
- CPC weight increased (25% → 35%)
- Bonus for group booking capability
- B2B multiplier for corporate-focused

---

### 5. **Experience-Level Mode** (NEW)
**Format:** `{Level} + {Activity}`
**Examples:**
- "beginner cooking classes"
- "luxury wine tours"
- "budget-friendly activities"
- "expert photography workshops"

**Inventory Check:** Price tier availability
**Success Factors:**
- Clear buyer segmentation
- Less competition (specific audience)
- Premium = higher margins

**Scoring Adjustments:**
- Bonus for luxury (+5 points, higher margins)
- Budget tier requires high volume

---

### 6. **Regional Mode** (NEW)
**Format:** `{Region} + {Activity}` (broader than city)
**Examples:**
- "european city breaks"
- "caribbean island tours"
- "mediterranean cruises"
- "ski resort activities"

**Inventory Check:** Multi-destination inventory in region
**Success Factors:**
- Broader than hyper-local, narrower than generic
- Good balance of volume and specificity
- Regional authority

**Scoring Adjustments:**
- Sweet spot: lower competition than generic, higher volume than hyper-local
- Inventory spread bonus

---

## Enhanced Scoring Algorithm

### Current Factors (Keep)
```
Search Volume:    30%
Competition:      20%
Commercial Intent: 25%
Inventory Match:  15%
Seasonality:      10%
```

### New Success Factors to Add

#### 1. **Market Saturation Check** (10% weight)
```typescript
async function checkMarketSaturation(keyword: string): Promise<number> {
  // Check how many existing sites target this keyword
  const existingSites = await prisma.site.count({
    where: {
      seoConfig: {
        path: ['targetKeywords'],
        array_contains: keyword,
      },
    },
  });

  // Check if we already have a site for this
  const weHaveIt = existingSites > 0;

  // Penalty for oversaturation
  if (weHaveIt) return 0; // Don't create duplicate
  if (existingSites > 5) return 2; // Market saturated
  if (existingSites > 2) return 5; // Getting crowded
  return 10; // Clear opportunity
}
```

#### 2. **Domain Availability Score** (10% weight)
```typescript
async function scoreDomainAvailability(keyword: string): Promise<number> {
  const domains = generateDomainSuggestions(keyword);
  const checks = await Promise.all(
    domains.map(d => checkDomainAvailabilityForSite(d))
  );

  // Score based on best available option
  const available = checks.filter(c => c.available);
  if (available.length === 0) return 0; // No domains available

  const bestPrice = Math.min(...available.map(a => a.price || 999));
  if (bestPrice <= 10) return 10; // Cheap domain available
  if (bestPrice <= 20) return 7;  // Moderate price
  if (bestPrice <= 50) return 4;  // Expensive but feasible
  return 2; // Very expensive
}
```

#### 3. **Inventory Quality Score** (10% weight)
```typescript
function scoreInventoryQuality(inventory: any): number {
  let score = 0;

  // Diversity of products
  const uniqueSuppliers = new Set(inventory.products.map(p => p.supplierId)).size;
  score += Math.min(uniqueSuppliers / 10, 3); // Up to 3 points

  // Price range (good to have variety)
  const prices = inventory.products.map(p => p.price);
  const priceRange = Math.max(...prices) - Math.min(...prices);
  score += priceRange > 100 ? 3 : 1; // Up to 3 points

  // Availability (in-stock products)
  const availableCount = inventory.products.filter(p => p.available).length;
  score += Math.min(availableCount / 5, 4); // Up to 4 points

  return score;
}
```

#### 4. **Strategic Fit Score** (Adjust existing weights)
For generic opportunities, adjust the scoring:
```typescript
function calculateStrategicFitMultiplier(opp: Opportunity): number {
  if (opp.isGeneric) {
    // Generic opportunities need higher volume to justify
    if (opp.searchVolume < 5000) return 0.7; // 30% penalty
    if (opp.searchVolume > 20000) return 1.2; // 20% bonus
  }

  if (opp.isDemographic) {
    // Demographics can succeed with lower volume
    if (opp.difficulty < 40) return 1.3; // Underserved = bonus
  }

  if (opp.isOccasion) {
    // Occasions need high CPC
    if (opp.cpc > 5) return 1.2; // High value = bonus
  }

  return 1.0; // Neutral
}
```

### Updated Scoring Formula

```typescript
function calculateOpportunityScore(opp: Opportunity): number {
  // Base scores (70% total)
  const volumeScore = Math.min((opp.searchVolume / 10000) * 25, 25);
  const competitionScore = ((100 - opp.difficulty) / 100) * 15;
  const intentScore = INTENT_SCORES[opp.intent]; // Max 20
  const inventoryScore = Math.min((opp.inventoryCount / 50) * 10, 10);

  // New success factors (30% total)
  const marketSaturationScore = await checkMarketSaturation(opp.keyword); // Max 10
  const domainScore = await scoreDomainAvailability(opp.keyword); // Max 10
  const inventoryQualityScore = scoreInventoryQuality(opp.inventory); // Max 10

  const baseScore =
    volumeScore +
    competitionScore +
    intentScore +
    inventoryScore +
    marketSaturationScore +
    domainScore +
    inventoryQualityScore;

  // Apply strategic fit multiplier
  const multiplier = calculateStrategicFitMultiplier(opp);
  const finalScore = Math.min(baseScore * multiplier, 100);

  return Math.round(finalScore);
}
```

---

## Implementation Code Changes

### 1. Update `scanForOpportunities()` Function

```typescript
async function scanForOpportunities(
  holibobClient: ReturnType<typeof createHolibobClient>,
  destinations?: string[],
  categories?: string[],
  forceRescan?: boolean,
  aiSuggestedNiches?: Array<any>
): Promise<Opportunity[]> {
  const allOpportunities: Opportunity[] = [];

  // Mode 1: Hyper-Local (existing)
  console.log('[Scan] Running hyper-local scan...');
  const hyperLocal = await scanHyperLocal(holibobClient, destinations, categories);
  allOpportunities.push(...hyperLocal);

  // Mode 2: Generic Activities
  console.log('[Scan] Running generic activity scan...');
  const genericActivities = await scanGenericActivities(holibobClient);
  allOpportunities.push(...genericActivities);

  // Mode 3: Demographics
  console.log('[Scan] Running demographic scan...');
  const demographics = await scanDemographics(holibobClient);
  allOpportunities.push(...demographics);

  // Mode 4: Occasions
  console.log('[Scan] Running occasion-based scan...');
  const occasions = await scanOccasions(holibobClient);
  allOpportunities.push(...occasions);

  // Mode 5: Experience Levels
  console.log('[Scan] Running experience-level scan...');
  const experienceLevels = await scanExperienceLevels(holibobClient);
  allOpportunities.push(...experienceLevels);

  // Mode 6: Regional
  console.log('[Scan] Running regional scan...');
  const regional = await scanRegional(holibobClient);
  allOpportunities.push(...regional);

  console.log(`[Scan] Total opportunities found: ${allOpportunities.length}`);
  console.log(`[Scan] Breakdown:
    - Hyper-Local: ${hyperLocal.length}
    - Generic: ${genericActivities.length}
    - Demographic: ${demographics.length}
    - Occasion: ${occasions.length}
    - Experience-Level: ${experienceLevels.length}
    - Regional: ${regional.length}
  `);

  return allOpportunities;
}
```

### 2. Add New Scan Functions

```typescript
async function scanGenericActivities(
  holibobClient: ReturnType<typeof createHolibobClient>
): Promise<Opportunity[]> {
  const genericKeywords = [
    'food tours',
    'wine tours',
    'cooking classes',
    'museum tickets',
    'city tours',
    'boat tours',
    'bike tours',
    'walking tours',
    'photography tours',
    'art classes',
  ];

  const opportunities: Opportunity[] = [];

  for (const keyword of genericKeywords) {
    try {
      // Check global inventory (need presence in multiple destinations)
      const globalInventory = await checkGlobalInventory(holibobClient, keyword);

      // Require inventory in at least 5 destinations
      if (globalInventory.destinationCount >= 5 && globalInventory.totalCount >= 50) {
        const keywordData = await getKeywordData(keyword);

        opportunities.push({
          keyword,
          searchVolume: keywordData.searchVolume,
          difficulty: keywordData.keywordDifficulty,
          cpc: keywordData.cpc,
          intent: 'TRANSACTIONAL',
          niche: keyword,
          location: undefined, // Generic - no location
          inventoryCount: globalInventory.totalCount,
          inventory: globalInventory,
          isGeneric: true,
          scanMode: 'generic_activity',
          sourceData: {
            destinationCount: globalInventory.destinationCount,
            topDestinations: globalInventory.topDestinations,
            isGeneric: true,
          },
        });
      }
    } catch (error) {
      console.error(`[Generic Scan] Error for "${keyword}":`, error);
    }
  }

  return opportunities;
}

async function scanDemographics(
  holibobClient: ReturnType<typeof createHolibobClient>
): Promise<Opportunity[]> {
  const demographicKeywords = [
    'family travel experiences',
    'family-friendly activities',
    'kids activities',
    'senior travel tours',
    'senior-friendly activities',
    'accessible travel experiences',
    'wheelchair accessible tours',
    'pet-friendly travel',
    'solo travel activities',
    'couples activities',
    'romantic experiences',
    'group activities',
    'teen activities',
  ];

  const opportunities: Opportunity[] = [];

  for (const keyword of demographicKeywords) {
    try {
      const globalInventory = await checkGlobalInventory(holibobClient, keyword);

      if (globalInventory.totalCount >= 30) {
        const keywordData = await getKeywordData(keyword);

        opportunities.push({
          keyword,
          searchVolume: keywordData.searchVolume,
          difficulty: keywordData.keywordDifficulty,
          cpc: keywordData.cpc,
          intent: 'TRANSACTIONAL',
          niche: keyword,
          location: undefined,
          inventoryCount: globalInventory.totalCount,
          inventory: globalInventory,
          isDemographic: true,
          scanMode: 'demographic',
          sourceData: {
            demographic: extractDemographic(keyword),
            destinationCount: globalInventory.destinationCount,
            isUnderserved: keywordData.keywordDifficulty < 40,
          },
        });
      }
    } catch (error) {
      console.error(`[Demographic Scan] Error for "${keyword}":`, error);
    }
  }

  return opportunities;
}

async function scanOccasions(
  holibobClient: ReturnType<typeof createHolibobClient>
): Promise<Opportunity[]> {
  const occasionKeywords = [
    'bachelor party experiences',
    'bachelor party activities',
    'bachelorette party activities',
    'corporate team building',
    'team building activities',
    'anniversary experiences',
    'birthday activities',
    'honeymoon experiences',
    'romantic date ideas',
  ];

  const opportunities: Opportunity[] = [];

  for (const keyword of occasionKeywords) {
    try {
      const globalInventory = await checkGlobalInventory(holibobClient, keyword);

      if (globalInventory.totalCount >= 20) {
        const keywordData = await getKeywordData(keyword);

        opportunities.push({
          keyword,
          searchVolume: keywordData.searchVolume,
          difficulty: keywordData.keywordDifficulty,
          cpc: keywordData.cpc,
          intent: 'COMMERCIAL', // Occasions often research-heavy
          niche: keyword,
          location: undefined,
          inventoryCount: globalInventory.totalCount,
          inventory: globalInventory,
          isOccasion: true,
          scanMode: 'occasion',
          sourceData: {
            occasion: extractOccasion(keyword),
            highValue: keywordData.cpc > 5,
            b2bPotential: keyword.includes('corporate') || keyword.includes('team'),
          },
        });
      }
    } catch (error) {
      console.error(`[Occasion Scan] Error for "${keyword}":`, error);
    }
  }

  return opportunities;
}

// Helper function to check inventory across multiple destinations
async function checkGlobalInventory(
  holibobClient: ReturnType<typeof createHolibobClient>,
  searchTerm: string
): Promise<{
  totalCount: number;
  destinationCount: number;
  topDestinations: Array<{ destination: string; count: number }>;
  products: any[];
}> {
  const destinations = [
    'London, England',
    'Paris, France',
    'Rome, Italy',
    'Barcelona, Spain',
    'Amsterdam, Netherlands',
    'New York, USA',
    'Los Angeles, USA',
    'Tokyo, Japan',
    'Dubai, UAE',
    'Berlin, Germany',
  ];

  const results = await Promise.all(
    destinations.map(async (destination) => {
      try {
        const inventory = await holibobClient.discoverProducts(
          {
            freeText: destination,
            searchTerm,
            currency: 'GBP',
          },
          { pageSize: 50 }
        );
        return {
          destination,
          count: inventory.products.length,
          products: inventory.products,
        };
      } catch {
        return { destination, count: 0, products: [] };
      }
    })
  );

  const withInventory = results.filter(r => r.count > 0);
  const allProducts = results.flatMap(r => r.products);

  return {
    totalCount: allProducts.length,
    destinationCount: withInventory.length,
    topDestinations: withInventory
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(r => ({ destination: r.destination, count: r.count })),
    products: allProducts,
  };
}
```

---

## Admin UI Enhancements

### Display Opportunities with Type Indicators

```typescript
// In opportunities admin page
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Rank</TableHead>
      <TableHead>Keyword</TableHead>
      <TableHead>Type</TableHead>
      <TableHead>Score</TableHead>
      <TableHead>Volume</TableHead>
      <TableHead>Difficulty</TableHead>
      <TableHead>Domain Status</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {opportunities.map((opp, idx) => (
      <TableRow key={opp.id}>
        <TableCell>#{idx + 1}</TableCell>
        <TableCell>{opp.keyword}</TableCell>
        <TableCell>
          <Badge variant={getTypeVariant(opp.scanMode)}>
            {getTypeLabel(opp.scanMode)}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant={opp.priorityScore >= 75 ? 'success' : 'default'}>
            {opp.priorityScore}
          </Badge>
        </TableCell>
        <TableCell>{opp.searchVolume.toLocaleString()}/mo</TableCell>
        <TableCell>{opp.difficulty}/100</TableCell>
        <TableCell>{renderDomainStatus(opp)}</TableCell>
        <TableCell>
          <Button onClick={() => createSite(opp.id)}>
            Create Site
          </Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### Add Filters

```typescript
// Filter by opportunity type
<Select onValueChange={setTypeFilter}>
  <SelectTrigger>
    <SelectValue placeholder="All Types" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Types</SelectItem>
    <SelectItem value="hyper_local">Hyper-Local</SelectItem>
    <SelectItem value="generic_activity">Generic Activity</SelectItem>
    <SelectItem value="demographic">Demographic</SelectItem>
    <SelectItem value="occasion">Occasion-Based</SelectItem>
    <SelectItem value="experience_level">Experience Level</SelectItem>
    <SelectItem value="regional">Regional</SelectItem>
  </SelectContent>
</Select>
```

---

## Expected Results

After implementation, the daily scan would produce a ranked list like:

| Rank | Keyword | Type | Score | Volume | Difficulty | Domain |
|------|---------|------|-------|---------|-----------|--------|
| 1 | family travel experiences | Demographic | 89 | 12,500 | 38 | ✅ $8.99 |
| 2 | london food tours | Hyper-Local | 87 | 8,900 | 45 | ✅ $9.99 |
| 3 | barcelona walking tours | Hyper-Local | 86 | 6,200 | 42 | ✅ $8.99 |
| 4 | food tours | Generic | 84 | 45,000 | 68 | ❌ Taken |
| 5 | bachelor party activities | Occasion | 83 | 5,400 | 35 | ✅ $12.99 |
| 6 | pet-friendly travel | Demographic | 82 | 8,100 | 41 | ✅ $15.99 |
| 7 | paris wine tasting | Hyper-Local | 81 | 4,800 | 52 | ✅ $9.99 |
| 8 | senior travel tours | Demographic | 79 | 3,200 | 28 | ✅ $11.99 |
| 9 | luxury wine tours | Experience-Level | 78 | 2,900 | 45 | ✅ $18.99 |
| 10 | european city breaks | Regional | 76 | 15,000 | 62 | ❌ Taken |

The system automatically recommends the **top 10 highest-scoring opportunities** for site creation, regardless of whether they're hyper-local or generic.

---

## Benefits of Balanced Approach

1. **Diversified Portfolio**: Mix of quick-win local sites + authority generic sites
2. **Risk Mitigation**: If generic domains are taken/expensive, fall back to local
3. **Market Coverage**: Serve both specific intent ("london food tours") and broad ("food tours")
4. **Optimal Resource Allocation**: Auto-creates highest-ROI sites first
5. **Competitive Advantage**: TravelAI's strategy (generic) + your local strength

---

## Next Steps

1. Implement new scan modes
2. Update scoring algorithm with success factors
3. Add domain availability checking to scoring
4. Update admin UI with type filters
5. Test with sample runs to validate scoring
6. Deploy and monitor first 10 auto-created sites
