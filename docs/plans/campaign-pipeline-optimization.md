# End-to-End Campaign Pipeline: Comprehensive Analysis & Gap Assessment

## Overview

This document maps the entire paid advertising pipeline from product seeding through to live campaign monitoring, identifies gaps at each stage, and proposes improvements.

---

## CROSS-CUTTING ISSUE: UK/GBP Bias Throughout Pipeline

**The platform targets GLOBAL audiences** — tourists worldwide searching for bookable experiences in any destination. However, the codebase was originally built for UK market only and retains UK bias at **24+ locations** across the pipeline.

### Geo-Targeting Bias (CRITICAL — blocks global expansion)

| Location | File | Issue |
|----------|------|-------|
| `SOURCE_MARKETS = ['GB','US','CA','AU','IE','NZ']` | [ads.ts](packages/jobs/src/workers/ads.ts):902 | All Meta/Google campaigns hardcoded to 6 anglophone countries. Zero reach in EU, APAC, LatAm. |
| `country: 'GB'` default | [meta-ads-client.ts](packages/jobs/src/services/social/meta-ads-client.ts):117 | Meta delivery estimates only for GB |
| `country: 'GB'` default | [pinterest-ads-client.ts](packages/jobs/src/services/social/pinterest-ads-client.ts):51 | Pinterest CPC estimates only for GB |
| `'United Kingdom'` hardcoded | [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts):319,488 | Keyword discovery locked to UK market |
| `location: 'United Kingdom'` default | [keyword-enrichment.ts](packages/jobs/src/services/keyword-enrichment.ts):679 | Enrichment locked to UK market |
| `'United States'` default | [keyword-research.ts](packages/jobs/src/services/keyword-research.ts):42 | GSC keyword research defaults to US |
| `DISCOVERY_MARKETS = [US, UK]` only | [audience-discovery.ts](packages/jobs/src/services/audience-discovery.ts):35-38 | Audience research covers only 2 markets |
| `'United Kingdom'` hardcoded | [content-gap-analysis.ts](packages/jobs/src/services/content-gap-analysis.ts):85,99 | Content gap analysis UK-only |
| `'United Kingdom'` hardcoded | [competitor-discovery.ts](packages/jobs/src/services/competitor-discovery.ts):84 | Competitor analysis UK-only |
| Fallback to US (2840) | [dataforseo-client.ts](packages/jobs/src/services/dataforseo-client.ts):373 | Unknown location silently defaults to US market |

### Currency Bias (MEDIUM — incorrect cost calculations)

| Location | File | Issue |
|----------|------|-------|
| `currency: 'GBP'` | [opportunity.ts](packages/jobs/src/workers/opportunity.ts):888,1149,1268 | Product queries hardcoded GBP |
| `currency: 'GBP'` | [audience-discovery.ts](packages/jobs/src/services/audience-discovery.ts):813 | Audience discovery hardcoded GBP |
| `priceCurrency: 'GBP'` fallback | [product-sync.ts](packages/jobs/src/services/product-sync.ts):442 | Product sync defaults to GBP |
| `timeZone: 'Europe/London'` | [analytics.ts](packages/jobs/src/workers/analytics.ts):356 | GA4 properties default to London timezone |
| `aov: 197` (GBP) | [paid-traffic.ts](packages/jobs/src/config/paid-traffic.ts):48 | Default AOV assumes GBP |
| `addressCountry: 'GB'` | [structured-data.ts](packages/jobs/src/services/structured-data.ts):407 | Schema.org defaults to GB |

### Content Bias (LOW — affects user trust)

| Location | File | Issue |
|----------|------|-------|
| UK consumer law references | [site.ts](packages/jobs/src/workers/site.ts):429-1233 | T&Cs reference UK GDPR, UK consumer law |
| London default testimonials | [brand-identity.ts](packages/jobs/src/services/brand-identity.ts):940-994 | Default destination is London, UK |

### Proposed Fix: Global Market Configuration

| # | Fix | Implementation |
|---|-----|---------------|
| G1 | **Add `targetMarkets` to Site model** | `targetMarkets: String[]` (e.g. `['GB','US','DE','FR','ES']`). Default: all supported markets. Used by all downstream stages. |
| G2 | **Make SOURCE_MARKETS configurable per campaign** | Read from site's `targetMarkets` instead of hardcoded array. |
| G3 | **Keyword research per destination** | DataForSEO location should match the **keyword's destination** (e.g. "Barcelona tours" → Spain), not a fixed country. Extract destination from keyword or use product city. |
| G4 | **Multi-currency support** | Add `primaryCurrency` to Site model. Use for product queries, analytics, budget calculations. |
| G5 | **Region-appropriate legal content** | Generate T&Cs based on site's jurisdiction. Use AI to adapt legal frameworks. |
| G6 | **Remove silent location fallbacks** | `getLocationCode()` should throw on unknown location, not silently default to US. |

---

## STAGE 1: Product & Supplier Seeding

### Purpose

Stage 1 exists to build and maintain a **complete, accurate local cache of the Holibob product catalog** so that all downstream stages can operate without live API calls. Specifically:

1. **Every product in Holibob must exist in our local `Product` table** — with title, description, city, categories, and supplier mapping. We do **not** cache pricing or images locally; these are dynamic values fetched at runtime from Holibob when users browse products. The local cache is the single source of truth for:
   - **Keyword Discovery (Stage 2)**: Extracting keyword seeds from product titles/descriptions
   - **Campaign Building (Stage 4)**: Validating that a landing page will show relevant products before creating a campaign
   - **Landing Page Routing (Stage 4)**: Choosing the right URL based on what products actually exist for a given keyword + location + supplier combination

2. **Every supplier must have accurate `cities[]` and `categories[]`** derived from their actual products (not self-declared). This drives:
   - **Microsite matching (Stage 4, step 3)**: City-based keyword → supplier matching
   - **Landing page params**: `?cities=X&categories=Y` on supplier microsites

3. **Every Main Site must have a `homepageConfig` that reflects its real product coverage** — destinations, categories, and search terms should correspond to products that actually exist. This drives:
   - **Keyword-to-site assignment (Stage 4)**: Scoring keywords against site profiles
   - **Landing page routing**: `/destinations/`, `/categories/`, `/experiences?q=` page selection

**Without Stage 1 being complete and accurate, every downstream stage is guessing.**

### Two Entity Types: Main Sites vs Microsites

**Main Sites** are themed marketplace wrappers around the Holibob API. They aggregate products from **multiple suppliers** under a thematic umbrella (e.g. "Harry Potter Tours" — category-themed, not city-specific). Main Sites define their scope through `homepageConfig` JSON:
- `popularExperiences.destination` — primary location (e.g. "London")
- `popularExperiences.categoryPath` — Holibob category (e.g. "sightseeing-tours")
- `popularExperiences.searchTerms` — niche terms (e.g. ["harry potter", "wizarding world"])
- `destinations[]` — sub-locations / neighborhoods
- `categories[]` — activity types within the theme

**Microsites** are single-supplier showcases (`MicrositeConfig` with `entityType: SUPPLIER`). They are locked to one supplier and use that supplier's `cities[]` and `categories[]` for routing. Microsites use the Product List by Provider API.

**Key distinction for campaigns:**
| Aspect | Main Site | Supplier Microsite |
|--------|-----------|-------------------|
| Products | From ANY supplier via Discovery API | From ONE supplier via Provider API |
| Theme | `homepageConfig` (category/destination/searchTerms) | `supplier.cities[]` + `supplier.categories[]` |
| Landing pages | `/destinations/`, `/categories/`, `/experiences?q=` | `/experiences?cities=X&categories=Y` |
| Keyword routing | `assignKeywordsToSites()` — scores by destination (+10), site name (+7), category (+5), search term (+3) | 5-step microsite matching (exact → substring → source supplier → name → city) |
| Example | Harry Potter Tours (multi-supplier, category-themed) | Secret Food Tours London (single supplier, city-specific) |

### How It Works

**Supplier Onboarding:**
- Suppliers created in `Supplier` model with `holibobSupplierId` linking to Holibob API
- Key fields: `name`, `cities: String[]`, `categories: String[]`, `heroImageUrl`, `rating`, `reviewCount`
- Microsites created per supplier with `entityType: SUPPLIER`
- Main Sites created separately with `homepageConfig` generated by AI ([brand-identity.ts](packages/jobs/src/services/brand-identity.ts):543-669)

**Product Sync (Current — Weekly Per-Supplier):**
- `PRODUCT_SYNC` runs weekly Sundays 3:30 AM ([schedulers/index.ts](packages/jobs/src/schedulers/index.ts):334)
- Calls `getAllProductsByProvider(supplierId)` per supplier — paginated, pageSize 500
- Smart incremental: only updates if `title`, `city`, `categories`, or `supplierId` changed
- Products store: `holibobProductId`, `title`, `description`, `city`, `categories`, `supplierId` (no pricing or images — these are runtime concerns fetched fresh from Holibob)
- Aggregates supplier metadata (cities, categories) from product data after sync

**Product Sync (Proposed — One-Time Full Cache + Monthly Refresh):**
- **Initial bulk load**: Use `getAllProducts()` endpoint (fetches ALL products, no pagination) to cache entire Holibob catalog
- **Monthly refresh**: Re-fetch per supplier via `getAllProductsByProvider()`, compare against local DB to detect new/updated/deleted products
- **No `updated_after` param available** in Holibob API — must use comparison-based detection
- **Benefit**: Complete product database enables keyword enrichment, city validation, and landing page routing without live API calls

**Key Files:**
- [schema.prisma](packages/database/prisma/schema.prisma) — Supplier (line 1430), Product (line 1470), MicrositeConfig (line 1534), Site (line 128)
- [product-sync.ts](packages/jobs/src/services/product-sync.ts) — Sync logic (lines 130-319)
- [holibob-api client](packages/holibob-api/src/client/index.ts) — `getAllProducts()` (line 905), `getAllProductsByProvider()` (line 872)
- [brand-identity.ts](packages/jobs/src/services/brand-identity.ts) — `generateHomepageConfig()` (line 543)
- [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts) — `assignKeywordsToSites()` (line 420)

### Gaps at Stage 1

| Gap | Impact | Severity |
|-----|--------|----------|
| **No full product cache** — bidding engine relies on live Holibob API calls for city validation (max 100/run), limiting campaign coverage | Can't validate all landing pages; campaigns skipped when API limit reached | HIGH |
| **Supplier `cities`/`categories` often empty** — derived from products at sync time, but sync runs infrequently and some suppliers have no products cached yet | Supplier invisible to city-based microsite matching (Stage 4 step 3) | HIGH |
| **Main Site keyword routing lacks product awareness** — `assignKeywordsToSites()` scores by `homepageConfig` text matching, not by actual product availability | Keywords may route to Main Sites that have 0 relevant products | MEDIUM |
| **No validation that supplier data matches product data** — cities/categories are aggregated from cached products, which may be stale | Mismatches between what supplier claims and what products actually exist | MEDIUM |
| **New products take up to a month to appear** — monthly sync means newly added products won't be discoverable for keyword seeding or campaign validation until next refresh | Missing campaign opportunities for new product launches | LOW |

### Proposed Fixes for Stage 1

| # | Fix | Implementation |
|---|-----|---------------|
| 1a | **One-time full product cache** | Script using `getAllProducts()` → bulk upsert into `Product` table. Est. 1-3 hours, 1 API call |
| 1b | **Monthly incremental refresh** | Change `PRODUCT_SYNC` schedule to monthly. Compare fetched products vs local DB to detect new/updated/deleted |
| 1c | **Backfill supplier cities/categories** | After bulk sync, re-aggregate supplier metadata from their cached products |
| 1d | **Product-aware site scoring** | In `assignKeywordsToSites()`, query local `Product` table to verify relevant products exist before assigning keyword to site |

---

## STAGE 2: Keyword Discovery & Enrichment

### Purpose

Stage 2 exists to **discover commercially viable keywords that real people are searching for** and that we can profitably bid on. Specifically:

1. **Find keywords with buying intent** — people searching for experiences/tours/activities who are ready to book. Each keyword must have validated search volume and CPC data from DataForSEO.

2. **Attribute keywords to their source suppliers** — via `sourceData.sourceSupplierIds`. This is critical because it tells Stage 4 which supplier's microsite should host the campaign landing page. Without attribution, keywords fall to generic city-based matching which is less precise.

3. **Filter out waste** — low-intent keywords ("free walking tours"), low-volume keywords (< 100/month), and uneconomic keywords (CPC > £3) must be excluded before they consume budget in downstream stages.

**Stage 2 feeds directly into Stage 3 (AI quality review) and Stage 4 (campaign building). The quality and attribution of keywords here determines the quality and relevance of every campaign we create.**

### How It Works

**All 8 PAID_CANDIDATE sources:**

| # | Source | File | Trigger | How keywords are born | Sets `sourceSupplierIds`? |
|---|--------|------|---------|-----------------------|--------------------------|
| 1 | **GSC Mining** | [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts):155-272 | Scheduled (Tue/Fri) | Queries our Google Search Console for terms where we rank position > 15 with 50+ impressions — real searches we're losing organically | No |
| 2 | **Expansion** | [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts):281-368 | Scheduled (Tue/Fri) | Takes top 50 existing PAID_CANDIDATEs as seeds → DataForSEO `discoverKeywords()` for related terms | No (stores `seedKeyword` but doesn't inherit seed's suppliers) |
| 3 | **Category Discovery** | [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts):377-539 | Scheduled (Tue/Fri) | Programmatically crosses category terms × destinations from site `homepageConfig` → validates via DataForSEO. Max 20 queries/run | No (but sets `siteId` from originating site) |
| 4 | **Pinterest CPC** | [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts):552-689 | Scheduled (Tue/Fri) | Gets Pinterest bid estimates for top 200 existing keywords. Also creates NEW candidates from Pinterest trends | No |
| 5 | **Meta Audience** | [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts):703-857 | Scheduled (Tue/Fri) | Searches Meta interests related to our keywords → delivery estimates → creates candidates from novel interest terms | No |
| 6 | **Bulk Enrichment** | [keyword-enrichment.ts](packages/jobs/src/services/keyword-enrichment.ts) | Manual / one-time | **Product-led**: extracts keyword seeds from product titles/descriptions (Stage 1 data) → DataForSEO bulk validation (~$60-100/run) | **YES — the only source** |
| 7 | **Direct Scan** | [opportunity.ts](packages/jobs/src/workers/opportunity.ts):541-620 | Manual job queue | Standard SEO scanning — if discovered keyword has CPC < £3 and volume >= 100, auto-flagged as PAID_CANDIDATE | No |
| 8 | **Integrated Optimization** | [opportunity.ts](packages/jobs/src/workers/opportunity.ts):142-217 | Manual job queue | Same logic as #7, triggered via `runIntegratedOptimization()` | No |

**Bulk Enrichment (#6) — the bridge from Stage 1 (products) to Stage 2 (keywords):**
- **Source**: Our local `Product` table (Stage 1 output). Extracts keyword seeds from product titles/descriptions:
  - `"activity in city"` (e.g. "kayaking tour in Barcelona")
  - `"activity city"` (e.g. "kayaking tour Barcelona")
  - Category-based stems (e.g. "water activities Barcelona")
  - Discovery stems (e.g. "things to do in Barcelona", "best tours in Barcelona")
  - Branded searches (e.g. "brand reviews", "brand city")
  - Max 100 seeds per supplier, normalized (max 8 words, min 5 chars)
- **Validation**: DataForSEO bulk search volume API at ~$0.002/keyword
- **Output**: `PAID_CANDIDATE` records with `sourceData.sourceSupplierIds` linking each keyword to source supplier(s)
- **This is the ONLY pipeline that populates `sourceSupplierIds`** — enabling precise microsite routing in Stage 4 (step 2.5)
- **Depends on Stage 1 being complete** — if products aren't cached, keyword seeds can't be extracted

**Common gate — all sources must pass:**
- `CPC > 0` and `CPC < £3.00` (configurable via `PAID_TRAFFIC_CONFIG.maxCpc`)
- `searchVolume >= 100` (configurable via `PAID_TRAFFIC_CONFIG.minVolume`)
- Not a low-intent keyword (`isLowIntentKeyword()` filters "free", "gratis", etc.)

**Keyword Storage:**
- All keywords stored as `SEOOpportunity` records with `status: 'PAID_CANDIDATE'`, `intent: 'COMMERCIAL'`, `niche: 'paid_traffic'`
- Unique constraint: `keyword + location` (same keyword can't exist twice for same location)
- Fields: `keyword`, `searchVolume`, `cpc`, `difficulty`, `location`, `sourceData` (JSON with mode-specific enrichment), `priorityScore`

**Scoring Formula:**
```
score = calculatePaidScore(searchVolume, cpc, competition)
  volumeScore  = min(40, log10(volume) / 5 × 40)     — high volume = better (log scale)
  cpcScore     = max(0, min(30, 30 × (1 - cpc/4)))    — low CPC = much better
  competitionScore = (100 - difficulty) / 100 × 20     — low competition = better
  total = volumeScore + cpcScore + competitionScore + 10 (base)
```

**Scheduling:**
- Sources 1-5: `PAID_KEYWORD_SCAN` runs Tuesday & Friday (via scheduler)
- Source 6: `KEYWORD_ENRICHMENT` is manual/one-time with optional quarterly refresh
- Sources 7-8: Manual job queue triggers

### Gaps at Stage 2

**CRITICAL:**

| Gap | Impact |
|-----|--------|
| **ALL keyword discovery is PAUSED** — `PAID_KEYWORD_SCAN` commented out in scheduler. Opportunity scanner also paused. No admin API trigger exists for PAID_KEYWORD_SCAN (unlike enrichment/bidding). **No automated keyword discovery is currently running.** | Zero new keywords being generated. Pipeline frozen. |
| **Bulk Enrichment is manual-only** — the ONLY source that sets `sourceSupplierIds` has no schedule. Only fires as side effect of microsite publish (single-supplier) or manual admin action | Unbounded gap between "supplier has products" and "keywords exist" |
| **Random number fallbacks in production** — when DataForSEO fails, [opportunity.ts](packages/jobs/src/workers/opportunity.ts):1598-1636 falls back to `estimateSearchVolume()` / `estimateCpc()` which use `Math.random()`. Stored as real data with no `isEstimated` flag. Marked with TODO comments. | Random numbers flowing into bidding decisions. A keyword could get `searchVolume: 7284, cpc: 2.37` from a dice roll |
| **GSC mode queries US market only** — [KeywordResearchService](packages/jobs/src/services/keyword-research.ts) defaults to "United States" (location_code 2840). GSC mode never overrides this. Platform targets global audiences. | All GSC-sourced keywords have US-only volume/CPC data. Keywords for Barcelona, Tokyo, etc. validated against US market |

**HIGH:**

| Gap | Impact |
|-----|--------|
| **Same keyword stored 3x with different locations** — scanner stores `location: ''`, enrichment stores `'United Kingdom'`, opportunity stores `'London, England'`. DB unique constraint is `[keyword, location]` so all three are valid separate records | 3 PAID_CANDIDATE records → 6 campaign candidates for one keyword. Triples budget consumed |
| **Dedup key mismatch** — scanner checks `keyword|` (empty location suffix), but enrichment records have `keyword|united kingdom`. Scanner never detects enrichment-sourced keywords as existing | Scanner re-stores ALL enrichment keywords as new empty-location records. Doubles the keyword pool |
| **Keywords with null siteId silently dropped** — bidding engine does `if (!siteId) continue;` at [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts):762. `assignKeywordsToSites()` error handler is `.catch(() => {})` | If site assignment fails, keywords permanently invisible to campaign pipeline. No error, no alert |
| **Discovery mode passes micrositeId as siteId** — [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts):447,514 stores `ms.id` (MicrositeConfig ID) as `siteId` FK to `Site` table → FK violation | Keywords from microsite-seeded discovery silently dropped on create |
| **DataForSEO task failures → silent empty results** — [dataforseo-client.ts](packages/jobs/src/services/dataforseo-client.ts):241 logs error but returns empty array. Caller can't distinguish "no results" from "API failure" | Keywords in failed batches silently vanish from pipeline |
| **`calculatePaidScore` CPC divisor differs** — scanner uses `cpc/4`, enrichment uses `cpc/10`. At £3 CPC: scanner gives 7.5 CPC points, enrichment gives 21 points | 13-point systematic bias toward enrichment keywords. Enrichment keywords always rank higher in bidding engine |
| **Suppliers permanently marked enriched on credential failure** — if DataForSEO creds fail, zero keywords stored but `keywordsEnrichedAt` set for all suppliers | One credential failure permanently blocks all suppliers from future enrichment |
| **ARCHIVED keywords re-enter via enrichment** — enrichment dedup checks `status: 'PAID_CANDIDATE'` only, not `ARCHIVED`. Archived keyword re-extracted from products → costs DataForSEO → stored as new PAID_CANDIDATE → AI archives again | Wasteful archive→enrich→archive cycle. Each cycle costs ~$0.002 per keyword |
| **Bulk Enrichment fetches from Holibob API, not local DB** — calls `getProductsByProvider()` against live API despite Stage 1's purpose of building a local cache | Stage 1 cache unused. Enrichment slower, API-dependent, and won't work offline |
| **`sourceData` fully overwritten, not merged** — GSC metadata lost when enrichment updates. Pinterest/Meta CPC data lost when scanner re-discovers. No cross-mode data survives | Can't build multi-source intelligence ("found via GSC + has Pinterest bid + has Meta audience") |
| **Status is CREATE-only, never updated** — `upsertOpportunity()` only sets status on INSERT. Opportunity.ts `IDENTIFIED` records can never be promoted to `PAID_CANDIDATE` | Keywords stuck as IDENTIFIED forever, invisible to bidding engine |
| **sourceSupplierIds only populated by bulk_enrichment** — 7 of 8 sources never set it | Keywords can't route to source supplier microsite (Stage 4 step 2.5) |
| **Expansion mode doesn't inherit seed's sourceSupplierIds** | Expanded variants lose supplier lineage |

**MEDIUM:**

| Gap | Impact |
|-----|--------|
| **`isLowIntentKeyword()` is incomplete** — missing: cheap, discount, coupon, DIY, "how to", reviews, wiki, "near me". Two different lists exist: scanner has 6 terms, enrichment has 5 (missing "for nothing") | Low-intent keywords pass filters and consume bidding budget |
| **`${brandName} reviews` actively seeded** — [keyword-enrichment.ts](packages/jobs/src/services/keyword-enrichment.ts):1090 generates "brand reviews" as a keyword seed. Research queries unlikely to convert | Paying to bid on review-seeking queries |
| **`niche: 'paid_traffic'` gives AI evaluator no context** — evaluator passes niche to Claude prompt, but 'paid_traffic' is meaningless. AI can't judge relevance without knowing the actual category | AI quality scores degraded for all scanner-sourced keywords |
| **Scanner hardcodes `intent: COMMERCIAL`** — 5-point scoring penalty vs `TRANSACTIONAL` from opportunity scanner in bidding engine intent bonus | Scanner keywords systematically disadvantaged |
| **Two incompatible scoring formulas** — `calculatePaidScore()` vs `calculateOpportunityScore()`. Last-write-wins on `priorityScore` | Keyword ranking depends on which system touched it last |
| **Inconsistent DataForSEO locations across modes** — GSC=US, Expansion/Discovery=UK, Enrichment=UK. All hardcoded instead of matching keyword's destination. Platform targets global audiences. | Volume/CPC data not comparable across modes AND wrong market for non-UK/US destinations |
| **`getLocationCode` silently falls back to US** on typo or unknown location — [dataforseo-client.ts](packages/jobs/src/services/dataforseo-client.ts):373 returns 2840 with no warning | Wrong market data with no indication |
| **Hardcoded thresholds in opportunity.ts** — `3.0` and `100` are literals, not from `PAID_TRAFFIC_CONFIG` | Config drift between systems |
| **`set_budget_cap` admin action silently triggers full bidding engine run** — includes `archiveLowIntentKeywords()` and `evaluateKeywordQuality()` | Unexpected side effects from what looks like a config change |
| **`getScheduledJobs()` docs don't match scheduler reality** — shows paused jobs as active | Operators may believe jobs are running when they're not |
| **No negative keyword management** — no way to permanently exclude terms | Wasted DataForSEO spend on rediscovered bad keywords |

**LOW:**

| Gap | Impact |
|-----|--------|
| **Pinterest mode has no volume floor** — accepts keywords at any search volume | Low-quality keywords enter pipeline |
| **Transfer-heavy suppliers permanently blocked** — `keywordsEnrichedAt` set with empty seeds | Can never re-enrich if product mix changes |
| **Meta interest names stored in original case** — "Food And Drink" vs "food and drink" create separate records (Postgres unique constraint is case-sensitive) | Potential duplicates from mixed-case sources |
| **Rate limiter is per-process, not per-cluster** — multi-dyno deployment multiplies effective rate | Could exceed DataForSEO/Google Ads API limits |
| **`potentialValue` field never populated** — schema field, read by admin API, always null | Dead code / dead field |

### Proposed Fixes for Stage 2

**Pipeline activation:**

| # | Fix | Implementation |
|---|-----|---------------|
| 2a | **Re-enable PAID_KEYWORD_SCAN** | Uncomment in scheduler. Weekly (~$1.13/run) or split: free modes (Pinterest/Meta) Tue/Fri, paid modes (GSC/Expansion/Discovery) weekly |
| 2b | **Auto-chain Bulk Enrichment after product sync** | After `PRODUCT_SYNC` completes, auto-queue `KEYWORD_ENRICHMENT`. Pipeline: Products → Keywords → Campaigns |
| 2c | **Add admin API trigger for PAID_KEYWORD_SCAN** | Add `action: 'run_scan'` to `/api/analytics/bidding` POST handler |

**Data integrity:**

| # | Fix | Implementation |
|---|-----|---------------|
| 2d | **Standardize location field** | All sources must use consistent location values. Location should reflect the **keyword's destination market** (e.g. `'London, England'`, `'Barcelona, Spain'`), NOT a fixed country. Migrate existing `location: ''` records. Add location strategy to `PAID_TRAFFIC_CONFIG` |
| 2e | **Enrichment should read from local Product table** | Replace `getProductsByProvider()` API call with `prisma.product.findMany({ where: { supplierId } })` |
| 2f | **Merge `sourceData` instead of overwriting** | On UPDATE: `{ ...existingRecord.sourceData, ...newSourceData }`. Preserves cross-mode data |
| 2g | **Allow status promotion on UPDATE** | If existing status is `IDENTIFIED` and new data qualifies, promote to `PAID_CANDIDATE` |
| 2h | **Unify `calculatePaidScore` formula** | Extract to shared function in `paid-traffic.ts`. Use same CPC divisor everywhere |
| 2i | **Fix GSC mode to use correct location** | Pass site-appropriate location to `KeywordResearchService.getBulkKeywordData()` instead of hardcoded US default. Location should derive from keyword's destination city/country, not a fixed market. |
| 2j | **Fix discovery mode siteId bug** | Don't pass `ms.id` (microsite ID) as `siteId`. Either pass the parent site's ID or leave null for `assignKeywordsToSites()` to handle |
| 2k | **Remove random number fallbacks** | Delete `estimateSearchVolume/Difficulty/Cpc` functions. If DataForSEO fails, skip the keyword (don't store fake data) |
| 2l | **Don't mark suppliers enriched on failure** | Only set `keywordsEnrichedAt` if Phase 2+3 succeed. Add error state tracking |

**Keyword quality:**

| # | Fix | Implementation |
|---|-----|---------------|
| 2m | **Expand `isLowIntentKeyword()` list** | Add: cheap, discount, coupon, DIY, "how to", wiki, "near me". Unify list across scanner + enrichment |
| 2n | **Remove `${brandName} reviews` from seed generation** | Or add "reviews" to low-intent filter. Research queries shouldn't be paid candidates |
| 2o | **Inherit sourceSupplierIds in Expansion mode** | Look up seed's `sourceData.sourceSupplierIds` and copy to expanded variant |
| 2p | **Set real niche on scanner keywords** | Instead of `'paid_traffic'`, infer niche from keyword content or seed source site's homepageConfig |
| 2q | **Dedup enrichment against ARCHIVED status** | Add `OR: [{ status: 'PAID_CANDIDATE' }, { status: 'ARCHIVED' }]` to enrichment dedup query. Don't re-enrich archived keywords |
| 2r | **Use config references, not hardcoded thresholds** | Import `PAID_TRAFFIC_CONFIG` in opportunity.ts |
| 2s | **Add negative keyword list** | DB table for permanently excluded terms. Check before DataForSEO calls |
| 2t | **Allow re-enrichment of transfer-heavy suppliers** | Don't set `keywordsEnrichedAt` for skipped suppliers |

**Error handling & resilience:**

| # | Fix | Implementation |
|---|-----|---------------|
| 2u | **Log and retry on null siteId** | Replace silent `continue` in bidding-engine.ts:762 with logging + retry `assignKeywordsToSites()`. Replace `.catch(() => {})` with real error handler that logs failed keywords |
| 2v | **Surface DataForSEO task failures** | Return `{ results: [], errors: ['task xyz failed'] }` from dataforseo-client.ts instead of empty array. Callers can distinguish "no results" from "API failure" and retry failed batches |
| 2w | **Fix scanner `intent` to use TRANSACTIONAL** | Change default from `COMMERCIAL` to `TRANSACTIONAL` for scanner keywords — these are buying-intent queries. Removes 5-point penalty in bidding engine |
| 2x | **Warn on `getLocationCode` fallback** | Log a warning when falling back to US location code. Better: throw an error instead of silently using wrong market |
| 2y | **Decouple `set_budget_cap` from full engine run** | `set_budget_cap` admin action should ONLY update the budget config, not trigger `archiveLowIntentKeywords()` + `evaluateKeywordQuality()`. Separate concerns |
| 2z | **Fix `getScheduledJobs()` to reflect reality** | Read actual scheduler state (paused/active) instead of hardcoded list. Or add a `paused` flag to job definitions |

**Data hygiene:**

| # | Fix | Implementation |
|---|-----|---------------|
| 2aa | **Add volume floor to Pinterest mode** | Apply same `minVolume: 100` gate from `PAID_TRAFFIC_CONFIG` to Pinterest-sourced keywords |
| 2ab | **Normalize Meta interest case** | Lowercase all keyword text before storage/dedup. Apply to Meta mode and any other sources with inconsistent casing |
| 2ac | **Cluster-aware rate limiting** | Use Redis-backed rate limiter (already have Redis via BullMQ) instead of per-process counter. Prevents multi-dyno rate limit violations |
| 2ad | **Remove dead `potentialValue` field** | Drop column from schema, remove from admin API reads. Or populate it: `potentialValue = searchVolume × cpc × 0.03` (estimated monthly click value) |
| 2ae | **Product-aware supplier attribution for ALL keyword sources** | After keyword creation (all sources), run a **product-cache-backed matching pass**: (1) Extract city from keyword → find suppliers with products in that city from local `Product` table (Stage 1 cache). (2) Score each supplier by keyword-category relevance — how many of their products in that city match the keyword's theme (category terms in product titles). (3) Set `sourceSupplierIds` to the top-scoring supplier(s). This replaces the naive "name contains" matching and eliminates the need for Stage 4's heuristic 5-step microsite matching for most keywords. **Depends on Stage 1 product cache being complete.** |

---

## STAGE 3: Keyword Quality Evaluation (AI Review)

### Purpose

Stage 3 is the **AI quality gate** between keyword discovery (Stage 2) and campaign building (Stage 4). Its job is to:

1. **Filter out waste before it reaches campaign creation** — keywords that passed Stage 2's numeric gates (CPC < £3, volume ≥ 100) but are semantically poor. Examples: informational queries ("what is kayaking"), wrong-niche keywords ("flights to London"), or keywords that don't match their assigned site's content.

2. **Score keywords on 4 quality axes** — Relevance, Commercial Intent, Competition Viability, Landing Page Fit — giving downstream stages richer data than raw search volume + CPC alone.

3. **Auto-archive clearly bad keywords** — SKIP decisions (score < 30) are immediately archived, permanently removing them from the campaign pipeline without human intervention.

**The evaluator is the last checkpoint before budget gets allocated.** Anything that passes here will be scored for profitability and potentially deployed as a live campaign spending real money.

### How It Works

**Pipeline Position** in [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts):1177-1260:
```
Step 0a: archiveLowIntentKeywords()     ← Regex: removes "free", "gratis", etc. (6 terms)
Step 0b: assignKeywordsToSites()        ← Routes unassigned keywords to best-match site
Step 0c: evaluateKeywordQuality()       ← AI scores keywords, archives SKIP (THIS STAGE)
Step 1:  calculateAllSiteProfitability()
Step 2:  scoreCampaignOpportunities()   ← Scores ALL remaining PAID_CANDIDATE (BID + REVIEW + unevaluated)
Step 3:  selectCampaignCandidates()     ← Budget allocation
Step 3.5: groupCandidatesIntoCampaigns()
```

**AI Model & Cost:**
- Model: `claude-haiku-4-5-20251001` (Haiku — optimized for cost)
- Cost: ~$0.0002 per keyword (~$0.01 per batch of 50)
- Annual cost at daily cadence: ~$110/year (negligible vs ad spend)

**Batch Processing:**
- Batch size: 50 keywords per AI call
- Max batches per run: 40 (caps at 2,000 keywords/run)
- Inter-batch delay: 500ms
- Keywords ordered by `priorityScore DESC` (highest priority evaluated first)
- If a batch fails, it's skipped — remaining batches continue

**What the AI Receives** (per keyword in prompt):
```
1. "kayaking tours London" | vol=450 | maxProfitCPC: £0.12, CPC: £0.45 | diff=62 | intent=COMMERCIAL | loc=London | niche=paid_traffic | Site: "London Experiences" (destinations: London, Westminster; categories: Water Sports, Tours)
```

**4 Scoring Axes (0-100 each):**
| Axis | High Score | Low Score |
|------|-----------|-----------|
| **Relevance** | "tours", "tickets", "things to do" | "flights", "hotels", "visa info", "DIY" |
| **Commercial Intent** | "best kayaking tours London" (booking intent) | "what is kayaking" (informational) |
| **Competition Viability** | Low CPC + low difficulty | High CPC + big brand dominance |
| **Landing Page Fit** | Keyword matches assigned site's destinations/categories | "Barcelona kayaking" on a London site |

**Decisions:**
| Score | Decision | Action |
|-------|----------|--------|
| ≥ 60 | **BID** | Keep as PAID_CANDIDATE. Ready for campaign scoring. |
| 30-59 | **REVIEW** | Keep as PAID_CANDIDATE. Flagged for human review — but **no review workflow exists**. |
| < 30 | **SKIP** | Immediately archived (`status: ARCHIVED`). Permanently removed from pipeline. |

**State Storage** — writes to `sourceData.aiEvaluation`:
```json
{
  "score": 75,
  "decision": "BID",
  "reasoning": "Commercial intent for bookable experiences, good CPC/difficulty ratio",
  "signals": { "relevance": 80, "commercialIntent": 70, "competitionViability": 75, "landingPageFit": 80 },
  "evaluatedAt": "2026-02-18T03:00:00Z",
  "model": "claude-haiku-4-5-20251001"
}
```

**Re-evaluation:** 72-hour cooldown. After 3 days, keywords become eligible for re-evaluation on the next run. SKIP keywords won't be re-evaluated (already ARCHIVED).

**Scheduling:** Currently **PAUSED** (scheduler commented out). Only runs when `BIDDING_ENGINE_RUN` is manually triggered from admin dashboard.

**What the AI does NOT receive:**
- `sourceData.sourceSupplierIds` — can't assess supplier relevance
- Product catalog data — can't verify products actually exist
- Campaign performance history — can't learn from past ROAS
- Context for `niche: 'paid_traffic'` — meaningless string to the AI

### Key Files
- [keyword-quality-evaluator.ts](packages/jobs/src/services/keyword-quality-evaluator.ts) — Full evaluator (411 lines)
- [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts):1177-1260 — Pipeline integration
- [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts):388-411 — `archiveLowIntentKeywords()` (runs before evaluator)

### Critical Finding: AI Decision Does NOT Gate Campaign Creation

**Both BID and REVIEW keywords enter campaign scoring identically.** The scoring function at `scoreCampaignOpportunities()` queries:
```typescript
where: { status: 'PAID_CANDIDATE' }  // No filter on aiEvaluation.decision
```

This means:
- A keyword scored **BID (75)** and one scored **REVIEW (35)** both go through full profitability scoring
- The AI evaluation is **informative but non-blocking** (except for SKIP/archive)
- The REVIEW bucket has no practical effect — it's a label, not a gate
- Keywords that have **never been evaluated** (null aiEvaluation) also pass through

The AI evaluator is essentially a **garbage collector** (removes SKIP) rather than a **quality gate** (promotes BID). This is a fundamental design gap.

### Gaps at Stage 3

**CRITICAL:**

| Gap | Impact |
|-----|--------|
| **AI decision doesn't gate campaign creation** — BID, REVIEW, and unevaluated keywords all enter campaign scoring identically. Only SKIP (archive) has any effect. | REVIEW keywords (score 30-59) consume budget alongside BID keywords. The quality evaluation is largely decorative. |

**HIGH:**

| Gap | Impact |
|-----|--------|
| **REVIEW keywords (30-59) have no workflow** — flagged but never reviewed by a human. No admin UI to approve/reject. No way to promote REVIEW→BID or demote REVIEW→SKIP. | ~20-30% of keywords sit in limbo with a label that means nothing |
| **No human override mechanism** — operators can SEE AI decisions in dashboard but cannot change them. Can't un-archive a SKIP, can't force-approve a REVIEW, can't veto a BID. | Operators powerless to correct AI mistakes |
| **`niche: 'paid_traffic'` gives AI no useful context** — every PAID_CANDIDATE has this niche. AI prompt doesn't explain what it means. | AI evaluates all keywords without understanding they're for paid search campaigns vs organic SEO |
| **sourceSupplierIds not passed to AI** — evaluator doesn't tell AI which supplier's products the keyword originates from | AI can't assess whether keyword matches supplier's actual offering |

**MEDIUM:**

| Gap | Impact |
|-----|--------|
| **No feedback loop from campaign performance** — AI evaluates keywords in isolation. Doesn't know which similar keywords generated bookings vs wasted spend. | Same keyword patterns keep being approved despite poor historical ROAS |
| **Configuration entirely hardcoded** — BID_THRESHOLD (60), SKIP_THRESHOLD (30), BATCH_SIZE (50), MAX_BATCHES (40), COOLDOWN (72h) — all literals, no env vars | Can't tune without code deployment |
| **No circuit breaker** — if Anthropic API is down, all batches fail silently. Unlike ad creative generator which has circuit breaker after 5 failures. | 40 failed API calls before pipeline moves on. Wasted time + no keywords evaluated |
| **Overlapping concerns with archiveLowIntentKeywords()** — regex-based archival runs BEFORE AI evaluation. AI also catches low-intent keywords. Two systems doing similar work with different logic. | Confusing ownership. If regex misses "cheap tours", does AI catch it? Sometimes. |
| **Keywords without site assignment evaluated as "Unassigned"** — if `assignKeywordsToSites()` fails or doesn't match, keyword shows `Site: "Unassigned"` in prompt | Landing Page Fit score degraded for unassigned keywords. May unfairly SKIP viable keywords. |
| **No persistent metrics** — evaluation outcomes logged to console only. No database metrics table, no time-series tracking of BID/REVIEW/SKIP ratios. | Can't track evaluation quality over time. Can't detect drift in AI scoring. |

**LOW:**

| Gap | Impact |
|-----|--------|
| **Re-evaluation can't rescue SKIP keywords** — SKIP immediately archives. 72-hour cooldown only applies to BID/REVIEW keywords. | If AI mistakenly SKIPs a good keyword, it's permanently gone unless manually un-archived |
| **Truncated response recovery is fragile** — attempts to repair cut-off JSON by finding last `}` | May silently drop keywords from end of truncated batch |
| **Score clamping hides AI uncertainty** — scores clamped to [0,100]. If AI returns 105 (very confident) or -5 (very uncertain), information is lost | Minor — rare edge case |

### Proposed Fixes for Stage 3

**Make evaluation a real gate:**

| # | Fix | Implementation |
|---|-----|---------------|
| 3a | **Filter by AI decision in campaign scoring** | Add `sourceData.aiEvaluation.decision = 'BID'` check in `scoreCampaignOpportunities()`. Only BID keywords create campaigns. REVIEW keywords need explicit human approval. |
| 3b | **Add REVIEW approval workflow** | Admin UI: show REVIEW keywords with AI reasoning + signals. Buttons: "Approve" (promotes to BID decision), "Reject" (archives). Bulk actions for efficiency. |
| 3c | **Add human override API** | Admin endpoint: `POST /api/analytics/bidding` with `action: 'override_evaluation'`, `keywordId`, `decision: 'BID'|'SKIP'`. Stores `sourceData.aiEvaluation.humanOverride: true` |

**Improve AI context:**

| # | Fix | Implementation |
|---|-----|---------------|
| 3d | **Pass sourceSupplierIds to AI prompt** | Include supplier name(s) in prompt line. AI can assess keyword↔supplier relevance. |
| 3e | **Replace `niche: 'paid_traffic'` with meaningful context** | Either remove niche from prompt or replace with: "This keyword will be used for a paid Google/Meta ad campaign targeting global tourists searching for bookable experiences" |
| 3f | **Add campaign performance context** | For re-evaluations: include "Similar keywords in past 30 days: avg ROAS X.X, avg CTR Y.Y%". Requires aggregating from AdDailyMetric. |

**Operational improvements:**

| # | Fix | Implementation |
|---|-----|---------------|
| 3g | **Make thresholds configurable** | Move BID_THRESHOLD, SKIP_THRESHOLD, BATCH_SIZE, MAX_BATCHES, COOLDOWN to `PAID_TRAFFIC_CONFIG` or env vars |
| 3h | **Add circuit breaker** | After 3 consecutive batch failures, abort evaluation (like ad creative generator pattern). Log warning. |
| 3i | **Persist evaluation metrics** | After each run, write to a metrics table: `{ timestamp, totalEvaluated, bidCount, reviewCount, skipCount, costEstimate }`. Powers time-series dashboard. |
| 3j | **Consolidate low-intent filtering** | Move regex-based `archiveLowIntentKeywords()` INTO the evaluator as a pre-filter. Single system owns the "is this keyword worth bidding on?" decision. |
| 3k | **Allow SKIP keyword rescue** | Don't immediately archive. Instead: set `decision: SKIP` but leave as PAID_CANDIDATE for 7 days. If not rescued by human, THEN archive. Or: add "un-archive" admin action. |

---

## STAGE 4: Campaign Building (Bidding Engine)

### Purpose

Stage 4 exists to **convert keywords into deployable campaign structures with profitable bids and relevant landing pages.** It handles two distinct concerns:

**Concern A — Microsite Selection (should ideally be done in Stage 2):**
Currently, the 5-step microsite matching runs inside Stage 4's scoring function. This determines which specific supplier microsite hosts a campaign. However, if Stage 2 properly populated `sourceSupplierIds` on every keyword (fix 2ae), this matching would be unnecessary — each keyword would already know its supplier. Today, only ~12% of keywords have `sourceSupplierIds` (from Bulk Enrichment), so the other 88% rely on Stage 4's heuristic matching.

**Concern B — Landing Page URL Routing (must stay in Stage 4):**
Even when we know which site/microsite a keyword belongs to, we still need to choose the **best landing page URL** — which page type (destination, category, search, homepage) and which URL params (`?q=`, `?cities=`, `?categories=`). This decision depends on the keyword's intent, available published pages, and product availability, all of which are Stage 4 concerns.

**The remaining Stage 4 responsibilities:**
1. **Calculate profitability per site/microsite** — determine the maximum CPC we can afford while remaining profitable
2. **Build the optimal landing page URL** — for each keyword, choose the page type and params that will show the most relevant products
3. **Score and rank all campaign candidates** — combining ROAS, volume, intent, microsite quality, and landing page type
4. **Allocate budget across the portfolio** — select highest-scoring campaigns within the daily cap
5. **Group keywords into deployable campaigns** — one campaign per site × platform × landing page

**Stage 4 is where money decisions are made.** Every gap here directly impacts ROI — wrong landing page = wasted clicks, wrong microsite = irrelevant products, wrong bid = unprofitable spend.

### How It Works

**Pipeline Steps** in [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts):
```
Step 1:  calculateAllSiteProfitability()     ← Per-site AOV, CVR, commission → maxProfitableCpc
Step 1b: calculateMicrositeProfitability()   ← Per-microsite (uses portfolio-wide averages)
Step 2:  scoreCampaignOpportunities()        ← Microsite selection + landing page routing + scoring
Step 3:  selectCampaignCandidates()          ← Greedy budget allocation
Step 3.5: groupCandidatesIntoCampaigns()     ← Group by site×platform×landingPage → DRAFT campaigns
```

#### Profitability Calculation (Lines 236-374)

```
revenuePerClick = AOV × CVR × commissionRate
maxProfitableCpc = revenuePerClick / targetROAS (1.0)
```

**Data sources (waterfall):**

| Metric | Real Data (≥3 bookings in 90 days) | Fallback 1 | Fallback 2 (default) |
|--------|-----------------------------------|------------|---------------------|
| **AOV** | `Booking._avg.totalAmount` | Product catalog `_avg.priceFrom` | £197 |
| **Commission** | `Booking._avg.commissionRate` | Portfolio-wide average | 18% |
| **CVR** | `sessions / bookings` (≥100 sessions) | — | 1.5% |

- Main sites: per-site booking data
- Microsites: virtual siteId `microsite:{id}`, always uses portfolio-wide averages (microsites share parent's booking data)
- Microsite CVR boosted: `default × 1.2 = 1.8%` when sessions ≥ 100

#### Concern A: Microsite Selection — 5-Step Priority (Lines 778-839)

**Why this exists today:** Only ~12% of keywords have `sourceSupplierIds` from Stage 2 (Bulk Enrichment). The remaining 88% need heuristic matching to find the right supplier microsite.

**If fix 2ae is implemented** (product-cache-backed supplier attribution across ALL keyword sources), Step 2.5 handles most keywords with high-quality, theme-aware matching. Steps 1, 2, 2.7, 3 become fallbacks for edge cases only. Fix 2ae depends on Stage 1's product cache being complete — without it, supplier attribution can't score by product relevance.

**Long-term goal:** Microsite selection becomes a Stage 2 concern entirely. Stage 4 only handles landing page URL routing.

```
Step 1:   OPPORTUNITY microsite — exact keyword/searchTerms match
Step 2:   OPPORTUNITY microsite — substring match (keyword contains term OR term contains keyword)
Step 2.5: Source supplier preference — sourceSupplierIds → supplier's microsite    ← RECENTLY ADDED
Step 2.7: Name-based match — keyword contains microsite subdomain slug (min 5 chars, longest-first)  ← RECENTLY ADDED
Step 3:   SUPPLIER microsite — city-based match — picks supplier with HIGHEST cachedProductCount in that city
```

First match wins at each step. If no microsite matches → falls through to main site landing page routing.

#### Concern B: Landing Page URL Routing ([landing-page-routing.ts](packages/jobs/src/services/landing-page-routing.ts))

**This always needs to happen regardless of how the microsite was selected.** Even if we know the keyword belongs to "Secret Food Tours London", we still need to build the right URL with the right params.

**Supplier Microsites** — `buildSupplierMicrositeLandingPage()` (lines 488-523):
- Matches keyword against `supplier.cities[]` → adds `?cities=CityName`
- Matches keyword against `supplier.categories[]` → adds `?categories=CategoryName`
- **NEVER adds `?search=` or `?q=`** despite full website support for search params
- No match → falls back to homepage `/`

**Main Sites** — `buildDiscoveryLandingPage()` (lines 531-630), priority order:
1. **BLOG** — informational intent ("best time to visit", "how to", "tips for")
2. **COLLECTION** — audience/seasonal ("romantic", "family", "christmas") — requires ≥3 products
3. **DESTINATION** — "things to do in" phrases → `/destinations/{slug}`
4. **CATEGORY** — activity type → `/categories/{slug}`
5. **EXPERIENCES_FILTERED** — fallback → `/experiences?q={searchQuery}` (uses `extractSearchQuery()`)
6. **HOMEPAGE** — absolute fallback (small catalog <50 products)

**`extractSearchQuery()`** (lines 305-332): Strips location names and generic words from keyword to produce clean search query. Example: "best food tours paris" → "food tours". **Used for main site EXPERIENCES_FILTERED routing but NOT for supplier microsites.**

**Website support** — [experiences/page.tsx](apps/website-platform/src/app/experiences/page.tsx) supports all params:
- `?q=` → search query (passed to Holibob Discovery API as `searchTerm`)
- `?cities=` → city filter (comma-separated)
- `?categories=` → category filter (comma-separated)
- `?destination=` → location filter

#### Scoring Formula (Lines 908-922)

```
profitabilityScore = min(100, roasBonus + volumeBonus + intentBonus + micrositeBonus + landingPageBonus)

roasBonus     = min(60, expectedRoas × 20)                  — max 60 pts
volumeBonus   = min(20, log10(searchVolume + 1) × 8)        — max 20 pts
intentBonus   = TRANSACTIONAL: 20, COMMERCIAL: 15, other: 5 — 5-20 pts
micrositeBonus = matchedMicrosite ? 10 : 0                   — 0 or 10 pts
landingPageBonus = {DESTINATION/CATEGORY: 12, COLLECTION: 10, EXPERIENCES_FILTERED: 8, BLOG: 5, HOMEPAGE: 0}
```

#### Candidate Filtering (Lines 959-1044)

Before budget allocation, candidates are filtered out if:
- `landingPageProducts <= 0` — empty landing page
- `EXPERIENCES_FILTERED on non-microsite` — always rejected (often shows 0 results)
- City validation fails (0 products for supplier + city on Holibob API) — uses `LandingPageValidator` (max 200 API calls, fail-safe: accept on error)

**Every keyword gets BOTH a Facebook AND a Google_SEARCH candidate** (lines 927-953).

#### Budget Allocation — Greedy Algorithm (Lines 1146-1169)

- Candidates sorted by `profitabilityScore DESC`
- **Greedy**: processes in order, allocates first-fit
- **All-or-nothing**: each campaign gets its full `expectedDailyCost` or nothing
- **Hard ROAS floor**: `expectedDailyRevenue ≥ expectedDailyCost` (ROAS ≥ 1.0)
- Portfolio cap: £1,200/day (configurable via `BIDDING_MAX_DAILY_BUDGET`)
- Per-campaign: min £1/day, max £50/day

#### Campaign Grouping (Lines 1068-1138)

Grouping key: `(micrositeId || siteId) | platform | landingPagePath`

- All keywords sharing the same landing page + platform = one campaign
- **Always 1 ad group per campaign** (no keyword clustering)
- Campaign name: `"${siteName} - ${primaryKeyword} - ${platform}"`
- Status: **DRAFT** (must be deployed in Stage 6)

### Key Files
- [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts) — Core engine (1,400+ lines)
- [landing-page-routing.ts](packages/jobs/src/services/landing-page-routing.ts) — URL construction + validation (740 lines)
- [paid-traffic.ts](packages/jobs/src/config/paid-traffic.ts) — Configuration constants
- [experiences/page.tsx](apps/website-platform/src/app/experiences/page.tsx) — Website query param handling

### Gaps at Stage 4

**CRITICAL:**

| Gap | Impact |
|-----|--------|
| **Supplier microsite landing pages lose keyword theme** — `buildSupplierMicrositeLandingPage()` only adds `?cities=` and `?categories=`, never `?q=` or `?search=`. The website fully supports `?q=` for search filtering. `extractSearchQuery()` exists but is only used for main site EXPERIENCES_FILTERED routing, not supplier microsites. | User searches "kayaking tours Barcelona" → lands on `/experiences?cities=Barcelona` showing ALL Barcelona products (taxi transfers, museum tickets, etc.) instead of kayaking-relevant ones. Kills conversion rate. |
| **City-based matching (step 3) ignores keyword theme** — picks supplier with highest `cachedProductCount` in the city, regardless of what the keyword is about. "harry potter tours london" → Book Taxi Group (most London products = transfers). | Campaigns route to completely irrelevant supplier microsites. Money spent on clicks that land on wrong products. |

**HIGH:**

| Gap | Impact |
|-----|--------|
| **EXPERIENCES_FILTERED always rejected on non-microsites** — line 968: `if (landingPageType === 'EXPERIENCES_FILTERED' && !micrositeId) continue`. Main site search pages are blanket-rejected even when they'd show relevant products. | Main sites can only campaign on destination/category/collection/blog pages. If a keyword doesn't match a published page, it's discarded even though `/experiences?q=keyword` would work fine. |
| **Profitability defaults dominate** — most sites/microsites have < 3 bookings in 90 days, so AOV (£197), CVR (1.5%), commission (18%) are used uniformly. All campaigns bid essentially the same maxCPC. | No price differentiation. A luxury tour site (real AOV £500) bids the same as a budget activities site. Can't learn from actual performance. |
| **assignKeywordsToSites() errors silently swallowed** — `.catch(() => {})` at line 572-584. If batch keyword updates fail, no logging, no retry. | Keywords may remain unassigned after "successful" assignment run. Silently dropped from pipeline (null siteId → skipped in scoring). |
| **Greedy budget = starvation for lower-scoring campaigns** — all-or-nothing allocation means high-scoring campaigns consume the entire £1,200 budget. Lower-scoring but potentially profitable campaigns get zero budget. | No budget diversity. Top 50 campaigns get everything, remaining 1,000+ get nothing. Can't discover which lower-scoring campaigns might actually convert. |

**MEDIUM:**

| Gap | Impact |
|-----|--------|
| **Always 1 ad group per campaign** — no semantic keyword clustering. All keywords in a campaign share the same ad creative and landing page. | Google Quality Score suffers when ad copy doesn't match specific keyword intent. "luxury food tour" and "cheap walking tour" grouped together. |
| **First-match-wins for equal microsites** — steps 1-3 use `break` on first match. No tie-breaking logic when multiple microsites score equally. | Arbitrary microsite selection. "London walking tours" could route to any London supplier, not necessarily the best one for walking tours. |
| **Validation optimistic fallback** — when 200 API call budget exhausted, remaining pages validated as `{ valid: true, productCount: -1 }`. | Campaigns may deploy to landing pages with 0 products. Wastes ad spend on bounce traffic. |
| **No landing page relevance check** — validation only counts products, never checks if those products match the keyword. A page with 50 taxi transfers is "valid" for a "walking tours" keyword. | **Resolved by fixes 2ae + 4a + 4b**: correct supplier matching + `?q=` search param means API filters by relevance. Validator just needs product count ≥3. |
| **Zero search volume keywords processed** — no early exit for `searchVolume === 0`. Results in `expectedRoas = 0/0 = 0`, caught by ROAS filter but wastes processing time. | Minor inefficiency. ~10-20% of keywords have 0 volume (from random fallbacks in Stage 2). |

**LOW:**

| Gap | Impact |
|-----|--------|
| **No multi-city matching** — if keyword mentions "london to paris", only one city matched | Misses cross-city/multi-destination experience keywords |
| **No seasonal or time-based scoring** — "christmas markets december" scored the same in January as in November | Budget allocated to off-season keywords that won't convert |

### Proposed Fixes for Stage 4

**Landing page quality (CRITICAL):**

| # | Fix | Implementation |
|---|-----|---------------|
| 4a | **Add `?q=` search param to supplier microsite landing pages** | In `buildSupplierMicrositeLandingPage()`: call `extractSearchQuery(keyword, location)` and add result as `?q=` param alongside `?cities=` and `?categories=`. Confirmed: Holibob Product List by Provider API supports `filters.search` param ([client/index.ts:862](packages/holibob-api/src/client/index.ts#L862)). Website already passes `?q=` → `filters.search` for microsites. PPC fallback redirects to homepage if 0 results. |
| 4b | **Theme-aware city matching in step 3** | When multiple suppliers serve the same city, score by keyword-category relevance (does supplier's `categories[]` match keyword theme?) not just product count. E.g., "walking tours london" → prefer supplier with "Walking Tours" category over one with "Transfers". |
| 4c | **Allow EXPERIENCES_FILTERED on main sites with validation** | Remove blanket rejection (line 968). Instead: validate that `/experiences?q=keyword` returns ≥3 products via LandingPageValidator. The keyword is passed to Product Discovery API as `what.data.searchTerm` (already wired: [experiences/page.tsx:256](apps/website-platform/src/app/experiences/page.tsx#L256) → [client/index.ts:1068-1069](packages/holibob-api/src/client/index.ts#L1068-L1069)). If ≥3 products match, allow the candidate. |
| 4d | ~~**Add product relevance to landing page validation**~~ | **REMOVED** — redundant if 2ae (correct supplier matching), 4a (`?q=` search param), and 4b (theme-aware city matching) are implemented. The Holibob API handles relevance filtering via the `search` / `searchTerm` params. LandingPageValidator only needs to confirm ≥3 products returned, which it already does. |

**Budget & profitability:**

| # | Fix | Implementation |
|---|-----|---------------|
| 4e | **Portfolio-wide profitability learning** | When a site has < 3 bookings, use aggregate data from similar sites (same category/destination) instead of flat defaults. E.g., all "food tour" sites share an average AOV. |
| 4f | **Exploration budget** | Reserve 10-20% of daily budget for lower-scoring campaigns (random selection from remaining candidates). Prevents starvation and enables discovery of hidden winners. |
| 4g | **Early exit for zero-volume keywords** | Add `if (searchVolume <= 0) continue` at start of scoring loop. Skip processing waste. |

**Keyword-to-campaign quality:**

| # | Fix | Implementation |
|---|-----|---------------|
| 4h | **Semantic keyword clustering for ad groups** | Group keywords by theme (NLP similarity or shared category) within a campaign. Each cluster gets its own ad group with tailored copy. E.g., "luxury food tour" and "cheap walking tour" → separate ad groups. |
| 4i | **Tie-breaking for equally-scoring microsites** | When multiple microsites match equally at any step, prefer: (1) keyword-category relevance, (2) higher review rating, (3) more recent products. |
| 4j | **Log assignKeywordsToSites() errors** | Replace `.catch(() => {})` with real error handler that logs failed keyword IDs and reasons. Re-attempt assignment in next run. |

**Validation improvements:**

| # | Fix | Implementation |
|---|-----|---------------|
| 4k | **Increase validation API budget or use local cache** | With Stage 1's full product cache, validate supplier city product counts from local `Product` table instead of Holibob API calls. Unlimited validation, zero API cost. |
| 4l | **Flag optimistic validations** | When validation budget exhausted, mark campaigns with `validationStatus: 'UNVERIFIED'`. Show in admin dashboard. Don't deploy unverified campaigns without human approval. |

---

## STAGE 5: Creative Generation (AI)

### Purpose

Stage 5 exists to **generate compelling ad creative (text + images) that converts clicks into bookings.** Specifically:

1. **Generate platform-appropriate ad copy** — Meta ads need AI-generated headlines (40 chars) + body (125 chars). Google Search Ads use template-based Responsive Search Ads (6 headlines × 30 chars, 2 descriptions × 90 chars).
2. **Select the best image** — from 4 candidate sources (product images, supplier hero, Unsplash, brand), scored by AI multimodal review.
3. **Validate creative coherence** — a separate AI check ensures headline, body, image, and landing page all tell a consistent story. If incoherent, the system regenerates with explicit constraints.

**Good creative = higher CTR = lower CPC = better ROI.** Template fallbacks produce generic copy that wastes budget on low-engagement clicks.

### How It Works

**Three AI services with independent circuit breakers:**

| Service | File | Model | Circuit Breaker Key |
|---------|------|-------|-------------------|
| **Text Generation** | [ad-creative-generator.ts](packages/jobs/src/services/ad-creative-generator.ts) | Claude Haiku 4.5 | `'ad-creative-ai'` |
| **Image Review** | [ad-image-reviewer.ts](packages/jobs/src/services/ad-image-reviewer.ts) | Claude Haiku 4.5 (multimodal) | `'ad-image-review-ai'` |
| **Coherence Check** | [ad-coherence-checker.ts](packages/jobs/src/services/ad-coherence-checker.ts) | Claude Haiku 4.5 | `'ad-coherence-ai'` |

All circuit breakers: 5 consecutive failures → open (60s timeout).

#### Meta Text Creative

**AI prompt receives:**
- Brand context (name, tone of voice, tagline)
- Destination (extracted from keyword — strips "things to do in", etc.)
- Landing page content (first 600 chars, markdown-stripped)
- Product count, page type, geo targets, related keywords
- Rules: must reference destination, must NOT mention unrelated activities, must NOT invent numbers or claim "free cancellation"

**Output:** `HEADLINE: (max 40 chars) | BODY: (max 125 chars) | CTA: BOOK_TRAVEL|LEARN_MORE|SHOP_NOW`

**Template fallback** (if AI fails): `"Explore {Destination} Today"` + `"{Destination}: Tours, activities & experiences. Book today!"`

#### Image Selection

**4 candidate sources** (priority order):
1. **Product images** (up to 2) — from products matching destination, sorted by rating
2. **Supplier hero image** — from `micrositeConfig.supplier.heroImageUrl`
3. **Unsplash destination** — API search with in-memory cache, lazy-loaded
4. **Site brand image** — hero background or OG image (fallback filler)

**AI multimodal scoring** (1-10): Relevance, Quality, Emotion, Coherence with ad text.

#### Coherence Checker + Remediation Loop

After text + image are generated, coherence check validates alignment across:
1. Ad text ↔ keywords (does copy represent search intent?)
2. Ad text ↔ landing page (will user find what ad promises?)
3. Image ↔ content (does image suit the landing page?)
4. Keywords ↔ landing page (are keywords in page content?)

**Pass threshold:** Score ≥ 6 out of 10. If fails:
1. Extract specific issues from AI response
2. Regenerate text with issues as explicit constraints
3. Re-review image with updated text
4. Re-check coherence (accept result, no further looping)
5. Mark creative as `remediated: true`

#### Google Search Ads (Template-Based)

**Responsive Search Ad headlines** — `generateHeadlines(keyword, siteName)`:
```
1. {Keyword}                    (title-cased)
2. Book {Keyword}
3. {Keyword} | {SiteName}
4. Best Prices Guaranteed
5. Instant Confirmation
6. Book Online Today
```

**Descriptions** — `generateDescriptions(keyword)`:
```
1. "Discover and book amazing {keyword} experiences. Best prices, instant confirmation."
2. "Browse {keyword} from top-rated local providers. Free cancellation available."
```

**All truncated** to character limits via `.substring(0, X)` — no validation errors, silent truncation.

#### AD_CREATIVE_REFRESH

**NOT currently scheduled** — exists but no cron job. Can be manually triggered.
- **If coherent (score ≥ 6):** Re-reviews image only, updates on Meta if new image selected
- **If incoherent (score < 6):** Full remediation — regenerates text, re-reviews image, re-derives interest targeting, updates ad + ad set on Meta

### Key Files
- [ad-creative-generator.ts](packages/jobs/src/services/ad-creative-generator.ts) — AI text generation
- [ad-image-reviewer.ts](packages/jobs/src/services/ad-image-reviewer.ts) — AI image scoring
- [ad-coherence-checker.ts](packages/jobs/src/services/ad-coherence-checker.ts) — Coherence validation + remediation
- [ads.ts](packages/jobs/src/workers/ads.ts):782-849 — Interest targeting extraction

### Gaps at Stage 5

**HIGH:**

| Gap | Impact |
|-----|--------|
| **Google description claims "Free cancellation available"** — hardcoded in `generateDescriptions()` template. This may be FALSE for many products. | Misleading ad copy → poor user experience, potential policy violation |
| **Google ad copy is entirely template-based** — no AI generation. Headlines 4-6 are generic ("Best Prices Guaranteed", "Instant Confirmation", "Book Online Today") regardless of keyword | Lower Quality Score, weaker CTR vs competitors. Same headlines on all 1,000+ campaigns |

**MEDIUM:**

| Gap | Impact |
|-----|--------|
| **Image candidate pool is limited** — only 4 sources, often falls back to generic brand image when no products match destination | Poor visual relevance hurts CTR |
| **Creative refresh NOT scheduled** — exists but never runs automatically. Text copy frozen at creation time | Copy degrades over time as market context changes |
| **Same image used for Meta and Google** — no platform-specific sizing or format optimization | Suboptimal image presentation per platform |
| **Coherence check can't validate "Best Prices Guaranteed"** — template strings bypass coherence checker entirely (only runs for Meta AI-generated copy) | Google ads with potentially false claims never checked |

**LOW:**

| Gap | Impact |
|-----|--------|
| **Character truncation is silent** — `.substring(0, X)` may cut mid-word | "Kayaking Tours Barcel" instead of clean truncation |

### Proposed Fixes for Stage 5

| # | Fix | Implementation |
|---|-----|---------------|
| 5a | **Remove "Free cancellation available" from Google templates** | Replace with factual, verifiable claim. E.g., "Browse verified local providers." |
| 5b | **Apply AI generation to Google RSA** | Use same Claude Haiku to generate keyword-specific headlines/descriptions instead of generic templates. Keep templates as fallback. |
| 5c | **Schedule creative refresh** | Add `AD_CREATIVE_REFRESH` to scheduler (weekly). Includes both text regeneration and image refresh. |
| 5d | **Expand image sourcing** | Add: landing page screenshot, top product gallery images (not just primary), destination photos from site's own content. |
| 5e | **Apply coherence check to Google templates** | Run coherence checker on template-generated copy before deployment. Flag "Best Prices Guaranteed" etc. as potential issues. |

---

## STAGE 6: Campaign Deployment

### Purpose

Stage 6 exists to **translate DRAFT campaign records into live platform deployments** on Meta and Google. Specifically:

1. **Create platform campaign shells** — with budget, objective, and PAUSED status (safety: no money flows until activated)
2. **Set up targeting** — geo markets, interest targeting (Meta), keyword match types (Google)
3. **Attach creative** — AI-generated text + image (Meta), template RSA (Google)
4. **Build tracking** — UTM params for booking attribution, landing URL construction

**Campaigns deploy as PAUSED by design.** Activation is a separate concern (currently manual, should be automated in Stage 8).

### How It Works

**Entry point:** `deployDraftCampaigns()` in [ads.ts](packages/jobs/src/workers/ads.ts):1184-1291

#### Meta Deployment (`deployToMeta()`, lines 857-1029)

1. **Create campaign** — OUTCOME_TRAFFIC objective, daily budget, PAUSED
2. **Create ad set** — interest targeting, geo (SOURCE_MARKETS: GB/US/CA/AU/IE/NZ), ages 18-65, DSA compliance (`dsa_beneficiary` + `dsa_payor` for EU)
3. **Generate creative** — full AI pipeline (text → image review → coherence → remediation)
4. **Create ad** — headline, body, image, CTA, landing URL with UTMs, PAUSED
5. **Cleanup on failure** — deletes orphan campaign shells if ad set or ad creation fails

**Interest targeting** (`findRelevantInterests()`, lines 782-849):
- Extracts destination/activity core from long-tail keywords by stripping prefixes ("things to do in") and suffixes ("opening hours", "tickets")
- Splits remaining text into individual words (min 4 chars) — e.g. "kayaking tours Barcelona" → `["kayaking tours Barcelona", "kayaking", "Barcelona"]`
- Searches Meta interests API per term (max 4 terms) — returns all interests matching that text
- **No relevance scoring on results** — accepts ALL returned interests if they pass irrelevant filter
- Irrelevant filter is a hardcoded regex blocklist (department store, cryptocurrency, soccer, etc.) — blocklist approach, NOT allowlist
- Broadens if no results: `"{destination} travel"`, `"{destination} tourism"`, `"travel"` (enormous unfocused audience)
- Returns max 10 interests per campaign — first 10 win regardless of audience size or relevance
- **Discards audience size data** — Meta returns `audience_size_lower_bound`/`upper_bound` but these are never used
- **No interest layering** — "food tours Rome" should combine travel + food + Rome interests, but all interests are flat/unstructured
- **audience-discovery.ts exists but is disconnected** — generates AI-driven audience segments but output never feeds into deployment targeting

#### Google Deployment (`deployToGoogle()`, lines 1062-1176)

1. **Create campaign budget + campaign** — MANUAL_CPC, daily budget in micros (£1 = 1M micros), PAUSED
2. **Create ad groups** — one per `audiences.adGroups` entry (or single fallback)
3. **Add keywords** — both PHRASE and EXACT match types per keyword
4. **Create RSA** — 6 template headlines + 2 template descriptions, `path1: 'experiences'`, `path2: keyword first word`

#### UTM Structure

- `utm_source`: `facebook_ads` or `google_ads`
- `utm_medium`: `cpc`
- `utm_campaign`: `auto_{siteName}` (derived from campaign grouping)

#### Fail-Fast Mechanism

After 10 consecutive failures per platform → skip all remaining campaigns on that platform. Prevents hours of retries when platform-wide issues (API down, token expired).

#### Rate Limits

- Meta: 3 calls/min (conservative — actual Meta limit ~200/hour)
- Google: 5 calls/min

### Key Files
- [ads.ts](packages/jobs/src/workers/ads.ts):728-1291 — Deployment logic
- [meta-ads-client.ts](packages/jobs/src/services/social/meta-ads-client.ts) — Meta API client
- [google-ads-client.ts](packages/jobs/src/services/google-ads-client.ts) — Google API client

### Gaps at Stage 6

**HIGH:**

| Gap | Impact |
|-----|--------|
| **Campaigns always deploy PAUSED with no auto-activation** — pipeline stops at deployment. Campaigns sit PAUSED indefinitely until manually activated. | Fully automated pipeline broken. Requires human intervention to start spending. |
| **Google uses MANUAL_CPC only** — no Smart Bidding (tCPA, tROAS) despite Google's ML advantage | Leaving performance on the table. Google recommends tROAS after 15+ conversions. |


**CRITICAL:**

| Gap | Impact |
|-----|--------|
| **Interest targeting is naive and unscored** — `findRelevantInterests()` accepts ALL Meta interests that pass a basic blocklist regex. No relevance scoring, no audience size filtering, no interest layering (travel + activity + destination). Searching "Barcelona" returns "FC Barcelona" (soccer fans), "Barcelona nightlife" (clubbers) etc. — none indicating tour-booking intent. Fallback to bare `"travel"` gives enormous unfocused audiences. Audience size data from Meta is fetched but discarded. `audience-discovery.ts` generates AI-driven audience segments but its output is never used in deployment. | Money spent showing ads to wrong audiences. Soccer fans, nightlife seekers, and generic "travel" interests dilute targeting precision. Every campaign with poor keyword→interest mapping wastes budget on irrelevant impressions. This is potentially the biggest source of wasted Meta ad spend. |

**MEDIUM:**

| Gap | Impact |
|-----|--------|
| **No staging/preview** — campaigns deploy directly to production ad accounts | No way to preview what will go live before it exists on the platform |
| **Meta rate limit too conservative (3/min)** — Meta allows ~200/hour. 318 campaigns × 4 API calls = 1,272 calls → ~7 hours at current rate | Deployment takes hours when it could take ~30 minutes |

### Proposed Fixes for Stage 6

| # | Fix | Implementation |
|---|-----|---------------|
| 6a | **Rebuild interest targeting with AI + relevance scoring** | Replace naive `findRelevantInterests()` with an AI-assisted approach: (1) Use Claude to extract 3-5 **intent-relevant interest concepts** from the keyword + landing page context (e.g. "food tours Rome" → `["Italian cuisine", "culinary travel", "Rome tourism", "food tours"]`). (2) Search Meta interests API for each concept. (3) **Score returned interests** by: audience size (filter out < 10K and > 50M — too niche or too broad), topic path relevance (Meta returns `path[]` — prefer "Travel" or "Food & Drink" paths over "Sports" or "Entertainment"), and name coherence with the keyword. (4) **Layer interests** — combine travel-intent + activity-type + destination interests. (5) Use `audience_size_lower_bound` data that's already being fetched but discarded. Consider connecting `audience-discovery.ts` output as a higher-quality interest source for campaigns that match discovered segments. |
| 6b | **Auto-activate campaigns after observation period** | After deploy as PAUSED: wait 24h for coherence check, then auto-activate if coherence score ≥ 6 AND landing page validated. Add `activateAfter` timestamp to campaign. |
| 6c | **Migrate Google to Smart Bidding** | After sufficient conversion data (15+ per campaign), migrate from MANUAL_CPC to tROAS. Keep MANUAL_CPC as default for new campaigns. |
| 6d | **Increase Meta rate limit** | Change from 3/min to 30/min (still well under Meta's ~200/hour limit). Reduces deployment time from ~7 hours to ~45 minutes. |
| 6e | **Add campaign preview in admin** | Before deployment, show admin preview of: landing page URL, creative (headline + body + image), targeting, budget. Allow approve/reject. |

---

## STAGE 7: Performance Monitoring & Sync

### Purpose

Stage 7 exists to **track how campaigns actually perform once live** — syncing spend/click/conversion data from platforms, attributing bookings to campaigns, and alerting on problems.

### How It Works

**Performance Sync** (`handleAdCampaignSync()` in [ads.ts](packages/jobs/src/workers/ads.ts):125-312):
- Runs **daily** (not every 3 hours — previous plan was incorrect)
- Fetches ACTIVE + PAUSED campaigns from DB
- For each campaign: fetches platform insights → matches bookings by UTM → upserts `AdDailyMetric` → recalculates campaign totals

**Conversion Upload** (`handleAdConversionUpload()` in [ads.ts](packages/jobs/src/workers/ads.ts):1480-1600):
- Queries bookings with `gclid`/`fbclid` from last 24h
- **Meta CAPI**: Uploads `Purchase` events with SHA256(email), fbclid, commission value
- **Google Conversion Import**: Uploads gclid + conversion value + order ID
- **Critical**: Meta browser pixel returns conversions=0 for offsite bookings. CAPI is the only reliable Meta conversion source.

**Attribution**: Revenue = commission amount (not total booking value). Joins bookings on `utmCampaign` field.

**Alert System** in [ad-alerting.ts](packages/jobs/src/services/ad-alerting.ts):

| Alert Type | Threshold | Severity |
|-----------|-----------|----------|
| `BUDGET_OVERSPEND` | Daily spend > 110% of budget | CRITICAL |
| `ROAS_DROP` | ROAS < 0.5 for 3+ consecutive days | WARNING |
| `PORTFOLIO_ROAS_DROP` | Portfolio ROAS < 1.0 over 7 days | CRITICAL |
| `HIGH_CPC` | Avg CPC > 2x maxCPC | WARNING |
| `NO_IMPRESSIONS` | 0 impressions for 48+ hours | WARNING |
| `SYNC_FAILURE` | Sync job fails | CRITICAL |

### Gaps at Stage 7

**HIGH:**

| Gap | Impact |
|-----|--------|
| **Daily sync only** — overspend detection lags up to 24 hours. A campaign spending £50/day could overspend by £50+ before detection. | Budget waste. No real-time safety net beyond platform-side daily budgets. |
| **Meta CAPI rate limit (3 req/min)** — same conservative limit as deployment. With 300+ campaigns, conversion upload takes hours. | Delayed conversion data → delayed optimization decisions |

**MEDIUM:**

| Gap | Impact |
|-----|--------|
| **Conversion attribution is last-click only via UTM** — no multi-touch, no view-through, no assisted conversions | Overvalues last-click campaigns. Upper-funnel campaigns appear to have 0 ROAS. |
| **No click ID capture verification** — code assumes `gclid`/`fbclid` populated on bookings, no validation | If click IDs not captured (JS disabled, redirect issue), conversions silently unattributed |
| **Alert dedup is too aggressive** — one alert per type per campaign, no re-alert after recovery | ROAS drops → alert → recovers → drops again → no new alert |
| **No creative fatigue detection** — no frequency monitoring or CTR degradation tracking | Ads shown too often to same users, CTR declines unnoticed |
| **Portfolio ROAS calculated on-the-fly** — no stored `AdPortfolioMetric` model | Recalculated each sync run — inefficient and no historical tracking |

### Proposed Fixes for Stage 7

| # | Fix | Implementation |
|---|-----|---------------|
| 7a | **Increase sync frequency for ACTIVE campaigns** | Hourly sync for ACTIVE campaigns, daily for PAUSED. Reduces overspend detection lag to ~1 hour. |
| 7b | **Increase CAPI rate limit** | Same as 6d — 30/min instead of 3/min. Conversion upload completes in minutes, not hours. |
| 7c | **Add click ID capture verification** | On booking creation, log warning if UTM params present but gclid/fbclid missing. Dashboard alert for unattributed bookings. |
| 7d | **Allow alert re-firing after recovery** | Track alert resolution (ROAS recovered above threshold). If same condition recurs, create new alert. |
| 7e | **Add creative fatigue detection** | Track CTR trend per campaign. If CTR drops >20% over 7 days, trigger creative refresh and alert. |

---

## STAGE 8: Automated Optimization

### Purpose

Stage 8 exists to **continuously improve campaign performance without human intervention** — pausing losers, scaling winners, checking landing page health, and adjusting bids.

### How It Works

**Budget Optimizer** (`handleAdBudgetOptimizer()` in [ads.ts](packages/jobs/src/workers/ads.ts):445-717):

**Step 1: Pause underperformers**
- ROAS < 0.5 after 7-day observation period AND spend > £5
- Pauses in both DB AND on platform (Meta/Google API call)

**Step 2: Scale winners**
- ROAS ≥ 2.5 with ≥3 days of data
- Increases `dailyBudget` by 15% (capped at £50/campaign, £1,200 portfolio)
- **BUG: Updates DB only, does NOT sync new budget to Meta/Google APIs**

**Step 3: Landing page health**
- Checks ACTIVE campaigns with non-homepage landing pages
- Validates collections (≥3 products), destinations/categories (page exists and is PUBLISHED)
- Pauses campaigns with `pauseReason: 'LANDING_PAGE_LOW_INVENTORY'`
- **Does NOT check** `/experiences?cities=` or `/experiences?categories=` pages

**Step 4: Auto-resume**
- Re-checks campaigns paused for `LANDING_PAGE_LOW_INVENTORY`
- If products restored → resumes campaign + clears pause reason

**Configuration** (from [paid-traffic.ts](packages/jobs/src/config/paid-traffic.ts)):
```
roasPauseThreshold: 0.5      observationDays: 7
roasScaleThreshold: 2.5       scaleIncrement: 0.15 (+15%)
maxDailyBudget: 1200          maxPerCampaignBudget: 50
```

### Critical Finding: updateBid() is NEVER called

Both `MetaAdsClient.updateBid()` and Google's bid adjustment methods **exist in the codebase but are never invoked**. Bids are set at campaign creation and remain static forever. The optimizer only adjusts daily budgets (and even those don't sync to platforms).

### Key Files
- [ads.ts](packages/jobs/src/workers/ads.ts):445-717 — Budget optimizer
- [paid-traffic.ts](packages/jobs/src/config/paid-traffic.ts) — Configuration

### Gaps at Stage 8

**CRITICAL:**

| Gap | Impact |
|-----|--------|
| **No bid adjustment on live campaigns** — `updateBid()` exists in both Meta/Google clients but is NEVER called anywhere | Bids static forever. Can't optimize CPC based on performance. A campaign doing 5x ROAS should bid higher to capture more volume. |
| **No automated campaign activation** — campaigns deploy PAUSED (Stage 6), no logic to auto-activate | Pipeline completely stops at deployment. No money spent without manual intervention. |
| **Budget changes don't sync to platforms** — optimizer updates DB `dailyBudget` but never calls Meta/Google APIs to update the actual campaign budget | Scale decisions are invisible to platforms. Campaign continues spending at old budget. |

**HIGH:**

| Gap | Impact |
|-----|--------|
| **No keyword-level bid management** — optimizer works at campaign level only | Within a campaign, winning keywords subsidize losing ones. Can't pause/scale individual keywords. |
| **No creative A/B testing** — one variant per campaign, no experiments | Can't discover better-performing creative. Industry standard is 2-3 variants. |
| **Landing page health check incomplete** — doesn't validate `/experiences?cities=` or `/experiences?categories=` (microsite filter pages) | Microsite campaigns with stale city data may send traffic to empty pages |

**MEDIUM:**

| Gap | Impact |
|-----|--------|
| **7-day observation before pause** — slow to react to clearly bad campaigns | Wastes budget for a full week on campaigns with 0 conversions. £50 × 7 = £350 wasted per bad campaign. |
| **No cross-platform optimization** — Meta and Google managed independently | Can't shift budget from poor Meta performance to strong Google performance (or vice versa) |
| **No audience refinement** — demographics/interests set at creation, never updated based on conversion data | Can't narrow to high-converting audience segments |
| **Scale stuck at £50 cap** — winners can't scale beyond £50/day even with 10x ROAS | Revenue left on the table for top performers |

### Proposed Fixes for Stage 8

| # | Fix | Implementation |
|---|-----|---------------|
| 8a | **Implement bid adjustment** | After 7 days: if ROAS > 2.0, increase bid by 10%. If ROAS < 0.8, decrease bid by 10%. Call `updateBid()` on both Meta and Google clients. Weekly cadence. |
| 8b | **Auto-activate campaigns** | Same as 6a — activate after 24h observation + coherence ≥ 6 + landing page valid. |
| 8c | **Sync budget changes to platforms** | After budget scale: call `MetaAdsClient.updateCampaignBudget()` and Google equivalent. Verify update succeeded. |
| 8d | **Fast-fail for zero-conversion campaigns** | If spend > £20 AND 0 conversions after 3 days → pause. Don't wait 7 days. |
| 8e | **Add microsite landing page health checks** | Validate `/experiences?cities=X` pages against local Product table (Stage 1 cache). Pause if 0 products for city. |
| 8f | **Keyword-level optimization** | Track per-keyword metrics via ad group performance. Pause keywords with CPC > 2× maxProfitableCpc and 0 conversions after 14 days. |
| 8g | **Raise per-campaign budget cap** | Increase from £50 to £200 for campaigns with ROAS ≥ 3.0. Or make configurable per site. |

---

## STAGE 9: Admin Dashboard & Controls

### Purpose

Stage 9 provides **operator visibility and control** over the entire campaign pipeline — from keyword opportunities through live campaign performance.

### How It Works

**Bidding Dashboard** ([operations/bidding/page.tsx](apps/admin/src/app/(dashboard)/operations/bidding/page.tsx)):

| Tab | Shows |
|-----|-------|
| **Overview** | Portfolio KPIs, budget utilization, ROAS trend |
| **Campaigns** | Per-campaign performance with pause/resume controls, keyword breakdown |
| **Opportunities** | PAID_CANDIDATE keywords ranked by priority score, AI evaluation scores |
| **Profitability** | Site-level AOV, commission, CVR, maxProfitableCPC |
| **Enrichment** | Keyword pool stats, supplier enrichment progress |

**Campaign-Level Controls:**
- Pause/resume individual campaigns (syncs to Meta/Google)
- View proposal data (keyword breakdown, profitability score)
- View creative (headline, body, image, coherence score)
- Expand daily performance trend

**Portfolio-Level Controls:**
- Set budget cap (updates `BIDDING_MAX_DAILY_BUDGET`)
- Filter by site, platform, status
- Sort by ROAS, spend, revenue, CTR

**Keyword visibility:**
- Search volume, CPC, difficulty, priority score
- AI evaluation: score, decision (BID/REVIEW), reasoning
- Site assignment

**API:** [/api/analytics/bidding/route.ts](apps/admin/src/app/api/analytics/bidding/route.ts) — 637 lines

### Gaps at Stage 9

**HIGH:**

| Gap | Impact |
|-----|--------|
| **No keyword-level pause/scale** — can only manage at campaign level | Can't pause a losing keyword without pausing entire campaign |
| **No manual bid override** — can view maxCpc but can't change it | Operators can't fine-tune bids based on business knowledge |

**MEDIUM:**

| Gap | Impact |
|-----|--------|
| **No landing page preview** — shows path/type/product count but not actual page content or screenshot | Can't QA landing pages from dashboard |
| **No CPA display** — shows revenue and conversions separately, doesn't calculate Cost Per Acquisition | Missing basic metric. CPA = spend / conversions. |
| **1-day attribution lag** — dashboard shows yesterday's data only | Can't see today's performance until tomorrow's sync |
| **No cost tracking for AI/API calls** — DataForSEO (~$60-100/enrichment), Unsplash, Claude costs invisible | Hidden costs accumulate without visibility |

### Proposed Fixes for Stage 9

| # | Fix | Implementation |
|---|-----|---------------|
| 9a | **Keyword-level management** | Add keyword table per campaign showing per-keyword impressions, clicks, CPC, conversions. Allow pause/resume individual keywords (adds to negative keywords list). |
| 9b | **Manual bid override** | Add bid adjustment slider/input per campaign. Overrides bidding engine's calculated maxCpc. |
| 9c | **Landing page preview** | Embed iframe or screenshot of landing page URL in campaign detail view. Allow click-through to live page. |
| 9d | **Add CPA metric** | Calculate and display CPA = spend / conversions in campaign summary and portfolio overview. |
| 9e | **Add API cost tracking** | Log cost per DataForSEO call, Claude call, Unsplash call. Daily aggregate in dashboard. |

---

## Summary: Priority Gap Matrix

### CRITICAL (fix immediately — blocking revenue or wasting budget)

| # | Gap | Stage | Fix |
|---|-----|-------|-----|
| 1 | Landing page URL loses keyword theme — `?q=` never added to supplier microsites | 4 | 4a: Add `extractSearchQuery()` to `buildSupplierMicrositeLandingPage()` |
| 2 | City matching ignores keyword theme — picks highest product count not best match | 4 | 4b: Score by keyword-category relevance, not just count |
| 3 | Interest targeting is naive and unscored — accepts all Meta interests, falls back to "travel" | 6 | 6a: AI-assisted interest extraction + relevance scoring + audience size filtering |
| 4 | No bid adjustment on live campaigns — `updateBid()` exists but never called | 8 | 8a: Weekly bid adjustment based on ROAS |
| 5 | No automated campaign activation — deploys PAUSED, stays PAUSED forever | 6/8 | 6b/8b: Auto-activate after 24h + coherence ≥ 6 + landing page valid |
| 6 | Budget changes don't sync to platforms — DB updated but Meta/Google never told | 8 | 8c: Call platform APIs after budget scale |
| 7 | AI evaluation doesn't gate campaign creation — BID and REVIEW treated identically | 3 | 3a: Filter by `decision = 'BID'` in `scoreCampaignOpportunities()` |
| 8 | All keyword discovery PAUSED — no automated keyword pipeline running | 2 | 2a: Re-enable `PAID_KEYWORD_SCAN` in scheduler |
| 9 | UK/GBP bias across 24+ locations — hardcoded geo, currency, location defaults | Cross | G1-G6: Site-level `targetMarkets` + `primaryCurrency`, remove hardcoded defaults |

### HIGH (significant impact on campaign quality and ROI)

| # | Gap | Stage | Fix |
|---|-----|-------|-----|
| 10 | sourceSupplierIds only set by bulk enrichment (~12% of keywords) | 2 | 2ae: Product-cache-backed supplier attribution for ALL sources |
| 11 | Supplier cities/categories often empty — derived from stale/missing product sync | 1 | 1c: Backfill from product cache after bulk sync |
| 12 | No full product cache — bidding engine relies on live API calls (max 100/run) | 1 | 1a: One-time full cache via `getAllProducts()` |
| 13 | Random number fallbacks in production — `Math.random()` for search volume/CPC | 2 | 2k: Delete estimator functions, skip keyword if DataForSEO fails |
| 14 | Location field inconsistent — same keyword stored 3x with different locations | 2 | 2d: Standardize to keyword's destination market |
| 15 | REVIEW keywords (30-59) have no workflow — flagged but never reviewed | 3 | 3b: Admin approval/reject workflow |
| 16 | Google description claims "Free cancellation available" — may be false | 5 | 5a: Replace with verifiable claim |
| 17 | Google ad copy entirely template-based — no AI | 5 | 5b: Apply Claude Haiku generation |
| 18 | Google uses MANUAL_CPC only — no Smart Bidding | 6 | 6c: Migrate to tROAS after 15+ conversions |
| 19 | No keyword-level bid management — optimizer works at campaign level only | 8 | 8f: Per-keyword metrics, pause losing keywords |
| 20 | EXPERIENCES_FILTERED always rejected on main sites | 4 | 4c: Allow with validation (≥3 products) |
| 21 | Greedy budget allocation starves lower-scoring campaigns | 4 | 4f: Reserve 10-20% exploration budget |
| 22 | Enrichment fetches from Holibob API, not local Product table | 2 | 2e: Read from `prisma.product.findMany()` |

### MEDIUM (improve over time)

| # | Gap | Stage | Fix |
|---|-----|-------|-----|
| 23 | Profitability defaults dominate (most sites < 3 bookings) | 4 | 4e: Portfolio-wide learning from similar sites |
| 24 | Creative refresh not scheduled — copy frozen at creation | 5 | 5c: Weekly `AD_CREATIVE_REFRESH` cron |
| 25 | Coherence check never runs on Google templates | 5 | 5e: Apply coherence checker to template copy |
| 26 | 7-day observation too slow for bad campaigns | 8 | 8d: Fast-fail after 3 days if £20+ spend, 0 conversions |
| 27 | Daily sync only — overspend detection lags 24 hours | 7 | 7a: Hourly sync for ACTIVE campaigns |
| 28 | Meta CAPI rate limit too conservative (3/min) | 7 | 7b: Increase to 30/min |
| 29 | Landing page health check misses microsite filter pages | 8 | 8e: Validate against local Product table |
| 30 | No CPA display in dashboard | 9 | 9d: Calculate CPA = spend / conversions |
| 31 | No keyword-level pause/scale in admin | 9 | 9a: Keyword table per campaign with controls |
| 32 | No manual bid override in admin | 9 | 9b: Bid adjustment input per campaign |

---

## Implementation Strategy

### Phase 0 — Pipeline Optimization Tracker (Build First)

**Goal:** Build a live admin dashboard that tracks every task across all phases, so you can see at a glance what's done, what's in progress, and what's failing.

**This is built FIRST before any pipeline fixes, so every subsequent change is tracked from the start.**

#### Database Model

Add `PipelineTask` to Prisma schema:

```prisma
model PipelineTask {
  id              String   @id @default(uuid())
  phase           Int                     // 1, 2, 3, 4
  taskNumber      String                  // "1.1", "2.3", etc.
  title           String                  // "Full product cache"
  description     String                  // Detailed description
  fixRefs         String[]                // ["1a", "1c"] — links to plan fix IDs
  keyFiles        String[]                // Files being modified
  status          PipelineTaskStatus @default(PENDING)
  severity        String   @default("MEDIUM") // CRITICAL, HIGH, MEDIUM

  // Progress tracking
  implementedAt   DateTime?
  testedAt        DateTime?
  deployedAt      DateTime?
  verifiedAt      DateTime?

  // Verification
  verificationQuery  String?              // SQL query that proves the fix works
  verificationTarget String?              // Expected result (e.g. "> 80%", "= 0")
  lastCheckResult    String?              // Last run result
  lastCheckAt        DateTime?
  lastCheckPassed    Boolean?

  // Context
  prUrl           String?                 // Pull request URL
  notes           String?                 // Implementation notes / blockers

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum PipelineTaskStatus {
  PENDING          // Not started
  IN_PROGRESS      // Being implemented
  IMPLEMENTED      // Code written, not yet tested
  TESTING          // Running verification
  DEPLOYED         // In production
  VERIFIED         // Post-deploy verification passed
  BLOCKED          // Blocked by dependency or issue
  FAILED           // Verification failed
}
```

#### Admin Page: `/operations/pipeline-tracker/`

**Layout:** 4 tabs matching the existing admin pattern (tab nav from bidding dashboard)

**Tab 1: Overview**
- Phase progress bars: Phase 1 [████░░] 4/6 tasks, Phase 2 [░░░░░░] 0/6 tasks, etc.
- Overall completion: 4/24 tasks (17%)
- Health check summary: 14/18 checks passing
- Critical items needing attention (FAILED or BLOCKED tasks)
- Last verification run timestamp + trigger button

**Tab 2: Tasks**
- Table of ALL tasks across all phases, sortable by phase/status/severity
- Columns: Phase | # | Task | Severity | Status | PR | Verified | Last Check
- Status badges using existing color patterns:
  - PENDING: slate, IN_PROGRESS: blue, IMPLEMENTED: amber, TESTING: purple
  - DEPLOYED: sky, VERIFIED: green, BLOCKED: red, FAILED: red
- Expandable rows showing: description, fix refs, key files, verification query, verification result, notes
- Filter by phase (1-4), status, severity

**Tab 3: Verification**
- Live health check results — same format as the pipeline health check script but rendered in UI
- Each check shows: name, expected value, actual value, pass/fail badge, last checked timestamp
- "Run All Checks" button triggers verification queries against production DB
- Grouped by phase with phase-level pass/fail summary
- Historical trend: did any check that was passing start failing? (regression detection)

**Tab 4: Timeline**
- Chronological view of all status changes
- Shows: timestamp, task, old status → new status, who/what triggered it
- Helps answer "what changed recently?" and "when did this get deployed?"

#### API Route: `/api/operations/pipeline-tracker/route.ts`

**GET** — returns all tasks + latest verification results:
```typescript
{
  tasks: PipelineTask[],
  phases: {
    1: { total: 6, completed: 4, inProgress: 1, blocked: 0 },
    2: { total: 6, completed: 0, inProgress: 0, blocked: 0 },
    ...
  },
  healthChecks: {
    phase1: [
      { name: "Product cache completeness", expected: "> 99%", actual: "99.98%", passed: true, checkedAt: "..." },
      ...
    ],
    ...
  },
  overallProgress: { total: 24, verified: 4, percentage: 17 },
  lastVerificationRun: "2026-02-20T09:00:00Z"
}
```

**POST** — handles actions:
- `action: 'update_status'` — move task to new status (with timestamp)
- `action: 'run_verification'` — execute all verification queries, update results
- `action: 'add_note'` — append implementation note to a task
- `action: 'set_pr'` — link a PR URL to a task

#### How It Stays Updated

**During implementation**, after completing each task, I will:
1. Update the task status via the admin API (PENDING → IN_PROGRESS → IMPLEMENTED → TESTING → DEPLOYED)
2. Run the verification check to confirm the fix works
3. Update the task to VERIFIED once post-deploy check passes
4. Add the PR URL and any implementation notes

**Automated checks** run on a schedule:
- Verification queries run daily at 9 AM (or on-demand via "Run All Checks" button)
- If any VERIFIED task's check starts failing → status changes to FAILED + alert

**Seed data**: On first deploy, seed all 24 tasks from the plan with their descriptions, fix refs, key files, and verification queries. This populates the tracker before any pipeline work begins.

#### Navigation

Add to sidebar in [layout.tsx](apps/admin/src/app/layout.tsx) under Operations:
```
{ href: '/operations/pipeline-tracker', label: 'Pipeline Tracker', icon: '🔧' }
```

#### Key Files to Create/Modify

| File | Action |
|------|--------|
| [schema.prisma](packages/database/prisma/schema.prisma) | Add `PipelineTask` model + enum |
| `apps/admin/src/app/(dashboard)/operations/pipeline-tracker/page.tsx` | New page (follows bidding dashboard patterns) |
| `apps/admin/src/app/api/operations/pipeline-tracker/route.ts` | New API route |
| `packages/jobs/src/scripts/seed-pipeline-tasks.ts` | Seed script to populate initial 24 tasks from plan |
| [layout.tsx](apps/admin/src/app/layout.tsx) | Add nav item |

---

### Phase 1 — Foundation & Data Quality (Week 1-2)

**Goal:** Fix the data layer so all downstream stages work from accurate, complete information.

| # | Task | Fix Refs | Key Files | Test |
|---|------|----------|-----------|------|
| 1.1 | **Full product cache** — one-time bulk load via `getAllProducts()` | 1a | [product-sync.ts](packages/jobs/src/services/product-sync.ts) | Verify Product count matches Holibob API total. Spot-check 20 products for correct title/city/categories. |
| 1.2 | **Backfill supplier cities/categories** from cached products | 1c | [product-sync.ts](packages/jobs/src/services/product-sync.ts) | Query suppliers with empty cities[]. Verify all now populated. Cross-check 10 suppliers against Holibob dashboard. |
| 1.3 | **Standardize keyword locations** — migrate empty/inconsistent location fields | 2d | [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts), [keyword-enrichment.ts](packages/jobs/src/services/keyword-enrichment.ts) | `SELECT location, COUNT(*) FROM seo_opportunity WHERE status='PAID_CANDIDATE' GROUP BY location` — should show destination-specific locations, no empty strings. |
| 1.4 | **Remove random number fallbacks** | 2k | [opportunity.ts](packages/jobs/src/workers/opportunity.ts) | Delete `estimateSearchVolume/Cpc/Difficulty`. Run opportunity scanner with DataForSEO intentionally failing — verify keywords are skipped, not stored with fake data. |
| 1.5 | **Product-cache-backed supplier attribution** for all keyword sources | 2ae | [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts), [keyword-enrichment.ts](packages/jobs/src/services/keyword-enrichment.ts) | After running, verify `sourceData.sourceSupplierIds` populated on >80% of PAID_CANDIDATE records. Spot-check 20 keywords for correct supplier match. |
| 1.6 | **Enrichment reads from local Product table** | 2e | [keyword-enrichment.ts](packages/jobs/src/services/keyword-enrichment.ts) | Run enrichment with Holibob API key intentionally wrong — should still succeed using local DB. |

**E2E Test for Phase 1:**
- Run full product sync → keyword enrichment → verify keyword count, supplier attribution rate, and location consistency via admin dashboard Enrichment tab.

### Phase 2 — Campaign Quality (Week 2-3)

**Goal:** Fix the campaign building pipeline so campaigns target the right audiences with the right landing pages.

| # | Task | Fix Refs | Key Files | Test |
|---|------|----------|-----------|------|
| 2.1 | **Add `?q=` to supplier microsite landing pages** | 4a | [landing-page-routing.ts](packages/jobs/src/services/landing-page-routing.ts) | Build landing page for "kayaking tours Barcelona" on a supplier microsite → URL should contain `?q=kayaking+tours` alongside `?cities=Barcelona`. Visit URL — verify filtered products shown. |
| 2.2 | **Theme-aware city matching** | 4b | [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts) | "walking tours london" should route to walking tour supplier, NOT taxi transfer supplier (highest count). Test with 5 known keyword→supplier pairs. |
| 2.3 | **Allow EXPERIENCES_FILTERED on main sites** | 4c | [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts) | Run bidding engine. Check that main site keywords previously rejected now create candidates with validated product counts. |
| 2.4 | **AI evaluation gates campaign creation** | 3a | [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts) | After running, verify only `decision: 'BID'` keywords appear in campaign candidates. REVIEW keywords should NOT create campaigns. |
| 2.5 | **Rebuild interest targeting** | 6a | [ads.ts](packages/jobs/src/workers/ads.ts) | For "food tours Rome": verify returned interests are food/travel/Rome-related (not "FC Barcelona" or generic "travel"). Log interest names + audience sizes for 20 campaigns. Manual QA pass. |
| 2.6 | **Remove "Free cancellation" + apply AI to Google RSA** | 5a, 5b | [ads.ts](packages/jobs/src/workers/ads.ts) | Deploy 5 test Google campaigns. Verify no "Free cancellation" in descriptions. Verify AI-generated headlines are keyword-specific, not generic templates. |

**E2E Test for Phase 2:**
- Run full bidding engine (`BIDDING_ENGINE_RUN`) → verify campaign count, landing page URLs (spot-check 20 for `?q=` presence), microsite assignments (spot-check 10 for theme relevance), and REVIEW keywords excluded.
- Deploy 5 campaigns to Meta staging → verify interest targeting quality manually.

### Phase 3 — Campaign Lifecycle (Week 3-4)

**Goal:** Close the automation loop — campaigns activate, bids adjust, budgets sync.

| # | Task | Fix Refs | Key Files | Test |
|---|------|----------|-----------|------|
| 3.1 | **Auto-activate campaigns** | 6b, 8b | [ads.ts](packages/jobs/src/workers/ads.ts) | Deploy 3 test campaigns PAUSED. After 24h, verify auto-activated if coherence ≥ 6. Verify NOT activated if coherence < 6. |
| 3.2 | **Bid adjustment** | 8a | [ads.ts](packages/jobs/src/workers/ads.ts) | For campaigns with 7+ days data: verify ROAS > 2.0 → bid increases, ROAS < 0.8 → bid decreases. Verify `updateBid()` called on Meta/Google APIs (check logs). |
| 3.3 | **Budget sync to platforms** | 8c | [ads.ts](packages/jobs/src/workers/ads.ts) | Scale a campaign's budget in optimizer. Verify Meta/Google API called. Check platform dashboard confirms new budget. |
| 3.4 | **Fast-fail for zero-conversion** | 8d | [ads.ts](packages/jobs/src/workers/ads.ts) | Campaign with £25 spend, 0 conversions, 3 days old → should auto-pause. Campaign with £15 spend, 0 conversions, 3 days → should NOT pause (below threshold). |
| 3.5 | **Schedule creative refresh** | 5c | [schedulers/index.ts](packages/jobs/src/schedulers/index.ts) | Add weekly cron. Run manually. Verify coherence re-checked, stale images updated, remediation triggered for low-scoring campaigns. |
| 3.6 | **Re-enable keyword discovery** | 2a | [schedulers/index.ts](packages/jobs/src/schedulers/index.ts) | Uncomment `PAID_KEYWORD_SCAN`. Run once manually. Verify new PAID_CANDIDATE records created with correct locations and no random data. |

**E2E Test for Phase 3:**
- Full pipeline run: keyword scan → AI evaluation → bidding engine → deploy 10 campaigns → wait 24h → verify activation → wait 7 days → verify bid adjustments and budget sync in platform dashboards.

### Phase 4 — Global Expansion & Polish (Week 4-6)

**Goal:** Remove UK bias, add dashboard controls, and polish the system.

| # | Task | Fix Refs | Key Files | Test |
|---|------|----------|-----------|------|
| 4.1 | **Add `targetMarkets` to Site model** | G1, G2 | [schema.prisma](packages/database/prisma/schema.prisma), [ads.ts](packages/jobs/src/workers/ads.ts) | Deploy campaign for a site with `targetMarkets: ['DE','FR','ES']`. Verify Meta ad set targets those countries, not GB/US. |
| 4.2 | **Add `primaryCurrency` to Site model** | G4 | [schema.prisma](packages/database/prisma/schema.prisma), [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts) | Site with EUR currency → verify AOV, maxCpc, budget all in EUR. |
| 4.3 | **Keyword location matches destination** | G3, 2i | [paid-keyword-scanner.ts](packages/jobs/src/services/paid-keyword-scanner.ts), [keyword-research.ts](packages/jobs/src/services/keyword-research.ts) | "Barcelona tours" → DataForSEO query uses Spain location code (2724), NOT United Kingdom. |
| 4.4 | **Remove silent location fallbacks** | G6 | [dataforseo-client.ts](packages/jobs/src/services/dataforseo-client.ts) | Unknown location → error thrown (not silent US fallback). Verify in logs. |
| 4.5 | **REVIEW keyword workflow in admin** | 3b, 3c | [bidding/page.tsx](apps/admin/src/app/(dashboard)/operations/bidding/page.tsx), [bidding/route.ts](apps/admin/src/app/api/analytics/bidding/route.ts) | REVIEW keywords visible in dashboard. Approve → promotes to BID. Reject → archives. |
| 4.6 | **Keyword-level management in admin** | 9a, 9b | Dashboard files | Per-keyword metrics visible. Pause keyword → added to negative list. Bid override → persisted and used in next deployment. |
| 4.7 | **Exploration budget** | 4f | [bidding-engine.ts](packages/jobs/src/services/bidding-engine.ts) | Verify 10-20% of daily budget allocated to random lower-scoring campaigns. |
| 4.8 | **Hourly sync for ACTIVE campaigns** | 7a | [schedulers/index.ts](packages/jobs/src/schedulers/index.ts) | ACTIVE campaign data refreshes hourly. Verify `AdDailyMetric` timestamps. |
| 4.9 | **Google Smart Bidding migration** | 6c | [google-ads-client.ts](packages/jobs/src/services/google-ads-client.ts) | Campaigns with 15+ conversions → migrated to tROAS. New campaigns → MANUAL_CPC. |

**E2E Test for Phase 4:**
- Create a test site with `targetMarkets: ['DE','FR']`, `primaryCurrency: 'EUR'`. Run full pipeline end-to-end. Verify keywords use destination-specific locations, campaigns target DE/FR, budgets in EUR, dashboard shows correct data.

---

## Verification & Tracking Framework

### How We Track Progress

Each task follows a **strict workflow**:

```
1. IMPLEMENT  → Code changes on a feature branch
2. UNIT TEST  → Automated test covering the specific fix
3. VERIFY     → Run verification query/script proving the fix works
4. PR + REVIEW → Pull request with verification evidence in description
5. DEPLOY     → Merge to main, deploy to production
6. CONFIRM    → Post-deploy verification query confirms fix is live
```

**No task is marked complete until step 6 passes.**

### Pipeline Health Check Script

We'll create a **`scripts/pipeline-health-check.ts`** script that can be run at any time to verify pipeline integrity. It checks every fix we've implemented:

```
Pipeline Health Check
=====================

PHASE 1 — Data Quality
  [✓] Product cache: 12,847 products cached (vs 12,850 in Holibob API — 99.98%)
  [✓] Supplier backfill: 0 suppliers with empty cities[] (was: 47)
  [✓] Location consistency: 0 PAID_CANDIDATE records with empty location (was: 1,203)
  [✓] No random data: 0 records with isEstimated=true
  [✓] Supplier attribution: 84% of PAID_CANDIDATE have sourceSupplierIds (target: >80%)
  [✓] Enrichment uses local DB: Last enrichment run had 0 Holibob API calls

PHASE 2 — Campaign Quality
  [✓] Landing page ?q=: 95% of supplier microsite campaigns have ?q= param (was: 0%)
  [✓] Theme matching: "walking tours london" → Secret London Walks (not Book Taxi Group)
  [✓] AI evaluation gate: 0 REVIEW-decision keywords in campaign candidates (was: ~300)
  [✓] Interest targeting: 3% of campaigns using "travel" fallback (target: <15%)
  [✓] Google RSA: 0 campaigns with "Free cancellation" in descriptions (was: 100%)

PHASE 3 — Campaign Lifecycle
  [✓] Auto-activation: 92% of campaigns activated within 48h (target: >90%)
  [✓] Bid adjustment: 43 campaigns had bids adjusted this week
  [✓] Budget sync: 0 campaigns with DB budget != platform budget
  [✓] Fast-fail: 12 zero-conversion campaigns paused at day 3 (not day 7)
  [✓] Creative refresh: Last run 2 days ago, 15 campaigns remediated
  [✓] Keyword scan: 127 new PAID_CANDIDATE created this week

PHASE 4 — Global Expansion
  [✓] Target markets: 0 campaigns using hardcoded SOURCE_MARKETS (all use site.targetMarkets)
  [✓] Currency: 0 hardcoded 'GBP' references in pipeline code
  [✓] Location codes: 0 DataForSEO calls using default US/UK (all destination-specific)

OVERALL: 18/18 checks passing ✓
```

This script queries the database and logs directly — no manual inspection needed. Run it:
- After each phase deployment
- Weekly as part of monitoring
- Before and after any pipeline code changes

### Automated Tests Per Phase

**Phase 1 tests** (run in CI):
- `product-sync.test.ts`: Verify bulk sync creates products with correct fields, aggregates supplier cities/categories
- `keyword-enrichment.test.ts`: Verify reads from local Product table (mock Prisma, NOT Holibob client)
- `supplier-attribution.test.ts`: Verify keyword "kayaking Barcelona" → matched to supplier with kayaking products in Barcelona
- `opportunity.test.ts`: Verify DataForSEO failure → keyword skipped (no random data stored)

**Phase 2 tests** (run in CI):
- `landing-page-routing.test.ts`: Verify `buildSupplierMicrositeLandingPage("kayaking tours barcelona", ...)` returns URL with `?q=kayaking+tours&cities=Barcelona`
- `bidding-engine.test.ts`: Verify theme-aware city matching (walking tours → walking supplier, not taxi supplier)
- `bidding-engine.test.ts`: Verify REVIEW-decision keywords excluded from `scoreCampaignOpportunities()`
- `interest-targeting.test.ts`: Verify AI extracts relevant concepts, filters irrelevant interests, uses audience size data

**Phase 3 tests** (run in CI):
- `ads.test.ts`: Verify auto-activation logic (coherence ≥ 6 → activate, < 6 → stay paused)
- `ads.test.ts`: Verify bid adjustment (ROAS > 2 → increase, < 0.8 → decrease, calls platform API)
- `ads.test.ts`: Verify budget sync (after scale, Meta/Google API called with new budget)
- `ads.test.ts`: Verify fast-fail (£25 spend + 0 conversions + 3 days → pause)

**Phase 4 tests** (run in CI):
- `bidding-engine.test.ts`: Verify site.targetMarkets used instead of hardcoded SOURCE_MARKETS
- `dataforseo-client.test.ts`: Verify unknown location throws error (no silent US fallback)
- `keyword-research.test.ts`: Verify "Barcelona tours" uses Spain location code

### Post-Deploy Verification Queries

After each phase ships to production, run these queries to confirm fixes are live:

**Phase 1 post-deploy:**
```sql
-- Product cache completeness
SELECT COUNT(*) as cached FROM "Product";
-- Compare against Holibob API total (manual check)

-- Supplier backfill
SELECT COUNT(*) FROM "Supplier" WHERE cities = '{}' OR cities IS NULL;
-- Target: 0

-- Location consistency
SELECT location, COUNT(*) FROM "SEOOpportunity"
WHERE status = 'PAID_CANDIDATE' GROUP BY location ORDER BY count DESC;
-- Should show destination-specific locations, no empty strings

-- Supplier attribution
SELECT
  COUNT(*) FILTER (WHERE "sourceData"::text LIKE '%sourceSupplierIds%') as attributed,
  COUNT(*) as total
FROM "SEOOpportunity" WHERE status = 'PAID_CANDIDATE';
-- Target: attributed/total > 80%
```

**Phase 2 post-deploy:**
```sql
-- Landing page ?q= coverage
SELECT
  COUNT(*) FILTER (WHERE "targetUrl" LIKE '%q=%') as with_search,
  COUNT(*) as total
FROM "AdCampaign"
WHERE "micrositeId" IS NOT NULL AND status = 'DRAFT';
-- Target: with_search/total > 90%

-- AI evaluation gate
SELECT
  ("proposalData"::json->'aiEvaluation'->>'decision') as decision,
  COUNT(*)
FROM "SEOOpportunity" o
JOIN "AdCampaign" c ON c.keywords @> ARRAY[o.keyword]
WHERE o.status = 'PAID_CANDIDATE'
GROUP BY 1;
-- Should show only 'BID', no 'REVIEW'

-- Google RSA check
SELECT COUNT(*) FROM "AdCampaign"
WHERE platform = 'GOOGLE_SEARCH'
AND ("proposalData"::text LIKE '%Free cancellation%');
-- Target: 0
```

**Phase 3 post-deploy:**
```sql
-- Auto-activation
SELECT status, COUNT(*) FROM "AdCampaign"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
AND "platformCampaignId" IS NOT NULL
GROUP BY status;
-- ACTIVE should be > 90% of total

-- Budget sync
SELECT c.id, c."dailyBudget" as db_budget
FROM "AdCampaign" c
WHERE c.status = 'ACTIVE'
AND c."platformCampaignId" IS NOT NULL
LIMIT 10;
-- Spot-check these against Meta/Google dashboards — should match
```

### Regression Prevention

The Pipeline Tracker (Phase 0) handles this automatically:
- Verification queries run daily at 9 AM via scheduled job
- Results displayed in Pipeline Tracker → Verification tab
- If any VERIFIED task's check starts failing → status changes to FAILED + visible in dashboard
- Timeline tab shows when regressions occurred

This ensures that future code changes don't silently break fixes we've made.

---

## Ongoing Monitoring

Once implemented, track these KPIs weekly:

| KPI | Target | Dashboard Location | Alert Threshold |
|-----|--------|-------------------|-----------------|
| **Portfolio ROAS** | ≥ 2.0 | Overview tab | < 1.0 for 7 days |
| **Keyword→Supplier match rate** | > 80% with sourceSupplierIds | Enrichment tab | < 50% |
| **Landing page product count** | ≥ 3 avg per campaign | Campaigns tab | Any campaign with 0 products |
| **AI evaluation BID rate** | 40-60% | Opportunities tab | < 20% or > 80% (too strict/lenient) |
| **Campaign activation rate** | > 90% of deployed within 48h | Campaigns tab | < 50% stuck PAUSED |
| **Interest targeting relevance** | Manual QA: 8/10 campaigns have relevant interests | Spot-check weekly | > 3 campaigns with "travel" fallback |
| **Budget utilization** | > 70% of daily cap | Overview tab | < 30% (pipeline not producing enough campaigns) |
| **Conversion attribution rate** | > 90% of bookings attributed | Overview tab | > 20% unattributed bookings |
| **DataForSEO/Claude spend** | Track monthly | (New: API cost dashboard) | > £200/month |

### Weekly Review Checklist

1. Check portfolio ROAS trend — is it improving week-over-week?
2. Review PAUSED campaigns — why were they paused? Landing page? Low ROAS? Zero conversions?
3. Spot-check 5 campaign landing pages — do they show relevant products?
4. Review REVIEW keyword queue — approve/reject pending keywords
5. Check bid adjustment log — are adjustments directionally correct?
6. Monitor DataForSEO + Claude API costs
7. Verify keyword pipeline is running (new PAID_CANDIDATE count this week)
