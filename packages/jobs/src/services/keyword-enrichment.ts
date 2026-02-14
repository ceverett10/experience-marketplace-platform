/**
 * Bulk Keyword Enrichment Pipeline
 *
 * Product-led keyword generation at scale. Extracts keyword seeds from
 * Holibob product data across all supplier microsites, validates via
 * DataForSEO bulk search volume, and stores as PAID_CANDIDATE records.
 *
 * Designed as a one-time bulk enrichment (~$60-100 DataForSEO cost)
 * with optional quarterly refresh.
 *
 * Three phases:
 *   Phase 1: Extract keywords from Holibob product data
 *   Phase 2: Validate via DataForSEO bulk search volume
 *   Phase 3: Store validated keywords + enrich Supplier records
 */

import { prisma } from '@experience-marketplace/database';
import {
  createHolibobClient,
  type Product as HolibobProduct,
} from '@experience-marketplace/holibob-api';
import { DataForSEOClient } from './dataforseo-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichmentOptions {
  supplierIds?: string[];
  maxSuppliersPerRun?: number;
  maxProductsPerSupplier?: number;
  skipDataForSeo?: boolean;
  dryRun?: boolean;
  location?: string;
}

export interface EnrichmentResult {
  suppliersProcessed: number;
  suppliersSkipped: number;
  productsAnalyzed: number;
  rawSeedsExtracted: number;
  uniqueSeedsAfterDedup: number;
  keywordsValidated: number;
  keywordsStored: number;
  keywordsUpdated: number;
  suppliersEnriched: number;
  estimatedCost: number;
  duration: number;
  errors: string[];
}

interface SupplierExtraction {
  supplierId: string;
  seeds: string[];
  cities: string[];
  categories: string[];
  productsAnalyzed: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SEEDS_PER_SUPPLIER = 50;
const MAX_COST_SAFETY_LIMIT = 150; // USD
const COST_PER_KEYWORD = 0.002;

/** Common modifiers to strip from product names */
const MODIFIER_WORDS = new Set([
  'private', 'guided', 'small', 'group', 'exclusive', 'luxury', 'vip',
  'half', 'full', 'day', 'morning', 'afternoon', 'evening', 'night',
  'sunset', 'sunrise', 'skip', 'the', 'line', 'hour', 'hours',
  'minute', 'minutes', 'premium', 'ultimate', 'best', 'top',
  'express', 'deluxe', 'classic', 'original', 'official',
]);

/** Filler words to remove */
const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'with', 'for', 'from', 'to', 'and', 'or',
  'in', 'at', 'on', 'of', 'by', 'your', 'our', 'this', 'that',
]);

/** Words indicating low purchase intent */
const LOW_INTENT_TERMS = [
  'free', 'gratis', 'no cost', 'complimentary', 'freebie',
];

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export async function runBulkEnrichment(
  options: EnrichmentOptions = {}
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const {
    supplierIds,
    maxSuppliersPerRun,
    maxProductsPerSupplier = 100,
    skipDataForSeo = false,
    dryRun = false,
    location = 'United Kingdom',
  } = options;

  console.log('[Enrichment] Starting bulk keyword enrichment pipeline');
  console.log(`[Enrichment] Options: maxProducts=${maxProductsPerSupplier}, skipDataForSeo=${skipDataForSeo}, dryRun=${dryRun}, location=${location}`);

  // ----- Get Holibob client -----
  const client = getHolibobClient();

  // ----- Load suppliers -----
  const supplierWhere: Record<string, unknown> = {
    holibobSupplierId: { not: null },
    microsite: { status: 'ACTIVE' },
  };
  if (supplierIds?.length) {
    supplierWhere['id'] = { in: supplierIds };
  }

  let suppliers = await prisma.supplier.findMany({
    where: supplierWhere as any,
    select: {
      id: true,
      holibobSupplierId: true,
      name: true,
      keywordsEnrichedAt: true,
    },
    orderBy: { productCount: 'desc' },
  });

  if (maxSuppliersPerRun) {
    suppliers = suppliers.slice(0, maxSuppliersPerRun);
  }

  console.log(`[Enrichment] Found ${suppliers.length} suppliers to process`);

  // =========================================================================
  // PHASE 1: Extract keywords from product data
  // =========================================================================
  console.log('[Enrichment] Phase 1: Extracting keywords from products...');

  const allExtractions: SupplierExtraction[] = [];
  const seedToSupplierIds = new Map<string, Set<string>>();
  let totalProductsAnalyzed = 0;
  let totalRawSeeds = 0;
  let suppliersSkipped = 0;

  for (let i = 0; i < suppliers.length; i++) {
    const supplier = suppliers[i]!;

    if (!supplier.holibobSupplierId) {
      suppliersSkipped++;
      continue;
    }

    try {
      const extraction = await extractKeywordsFromSupplier(
        supplier as { id: string; holibobSupplierId: string; name: string },
        client,
        maxProductsPerSupplier
      );

      allExtractions.push(extraction);
      totalProductsAnalyzed += extraction.productsAnalyzed;
      totalRawSeeds += extraction.seeds.length;

      // Track which suppliers generated each seed
      for (const seed of extraction.seeds) {
        const key = seed.toLowerCase();
        if (!seedToSupplierIds.has(key)) {
          seedToSupplierIds.set(key, new Set());
        }
        seedToSupplierIds.get(key)!.add(supplier.id);
      }
    } catch (err) {
      const msg = `Supplier ${supplier.name} (${supplier.id}): ${err}`;
      errors.push(msg);
      console.error(`[Enrichment] ${msg}`);
    }

    // Progress logging every 100 suppliers
    if ((i + 1) % 100 === 0) {
      console.log(
        `[Enrichment] Phase 1 progress: ${i + 1}/${suppliers.length} suppliers, ` +
        `${totalRawSeeds} seeds extracted, ${totalProductsAnalyzed} products analyzed`
      );
    }
  }

  const uniqueSeeds = [...seedToSupplierIds.keys()];
  console.log(
    `[Enrichment] Phase 1 complete: ${allExtractions.length} suppliers processed, ` +
    `${totalProductsAnalyzed} products analyzed, ${totalRawSeeds} raw seeds → ${uniqueSeeds.length} unique`
  );

  // =========================================================================
  // PHASE 2: Validate keywords via DataForSEO
  // =========================================================================
  let validatedKeywords = new Map<string, {
    searchVolume: number;
    cpc: number;
    competition: number;
    competitionLevel?: string;
  }>();
  let estimatedCost = 0;

  if (!skipDataForSeo && uniqueSeeds.length > 0) {
    estimatedCost = uniqueSeeds.length * COST_PER_KEYWORD;
    console.log(
      `[Enrichment] Phase 2: Validating ${uniqueSeeds.length} unique seeds via DataForSEO ` +
      `(estimated cost: $${estimatedCost.toFixed(2)})`
    );

    if (estimatedCost > MAX_COST_SAFETY_LIMIT) {
      const msg = `Cost estimate $${estimatedCost.toFixed(2)} exceeds safety limit of $${MAX_COST_SAFETY_LIMIT}. Aborting Phase 2.`;
      console.error(`[Enrichment] ${msg}`);
      errors.push(msg);
    } else {
      try {
        validatedKeywords = await validateKeywords(uniqueSeeds, location);
        console.log(
          `[Enrichment] Phase 2 complete: ${validatedKeywords.size} keywords validated ` +
          `(${uniqueSeeds.length - validatedKeywords.size} filtered out)`
        );
      } catch (err) {
        const msg = `DataForSEO validation failed: ${err}`;
        errors.push(msg);
        console.error(`[Enrichment] ${msg}`);
      }
    }
  } else if (skipDataForSeo) {
    console.log('[Enrichment] Phase 2 skipped (skipDataForSeo=true)');
  }

  // =========================================================================
  // PHASE 3: Store results
  // =========================================================================
  let keywordsStored = 0;
  let keywordsUpdated = 0;
  let suppliersEnriched = 0;

  if (!dryRun) {
    console.log('[Enrichment] Phase 3: Storing results...');

    // 3a. Upsert validated keywords as PAID_CANDIDATE
    if (validatedKeywords.size > 0) {
      const storeResult = await storeValidatedKeywords(
        validatedKeywords,
        seedToSupplierIds,
        location
      );
      keywordsStored = storeResult.stored;
      keywordsUpdated = storeResult.updated;
      console.log(
        `[Enrichment] Stored ${keywordsStored} new + ${keywordsUpdated} updated PAID_CANDIDATE records`
      );
    }

    // 3b. Update supplier records with extracted metadata
    for (const extraction of allExtractions) {
      try {
        await prisma.supplier.update({
          where: { id: extraction.supplierId },
          data: {
            // Enrich cities/categories if currently empty
            ...(extraction.cities.length > 0 ? { cities: extraction.cities } : {}),
            ...(extraction.categories.length > 0 ? { categories: extraction.categories } : {}),
            extractedKeywords: {
              seeds: extraction.seeds,
              cities: extraction.cities,
              categories: extraction.categories,
              productsAnalyzed: extraction.productsAnalyzed,
            },
            keywordsEnrichedAt: new Date(),
          },
        });
        suppliersEnriched++;
      } catch (err) {
        errors.push(`Failed to update supplier ${extraction.supplierId}: ${err}`);
      }
    }

    console.log(`[Enrichment] Phase 3 complete: ${suppliersEnriched} suppliers enriched`);
  } else {
    console.log('[Enrichment] Phase 3 skipped (dryRun=true)');
    console.log(`[Enrichment] Would store ${validatedKeywords.size} keywords and enrich ${allExtractions.length} suppliers`);
  }

  const duration = Date.now() - startTime;
  const result: EnrichmentResult = {
    suppliersProcessed: allExtractions.length,
    suppliersSkipped,
    productsAnalyzed: totalProductsAnalyzed,
    rawSeedsExtracted: totalRawSeeds,
    uniqueSeedsAfterDedup: uniqueSeeds.length,
    keywordsValidated: validatedKeywords.size,
    keywordsStored,
    keywordsUpdated,
    suppliersEnriched,
    estimatedCost,
    duration,
    errors,
  };

  console.log(
    `[Enrichment] Pipeline complete in ${(duration / 1000).toFixed(1)}s: ` +
    `${result.suppliersProcessed} suppliers, ${result.uniqueSeedsAfterDedup} unique seeds, ` +
    `${result.keywordsValidated} validated, ${result.keywordsStored} stored, ` +
    `$${result.estimatedCost.toFixed(2)} cost, ${errors.length} errors`
  );

  return result;
}

// ---------------------------------------------------------------------------
// Phase 1: Product Data Extraction
// ---------------------------------------------------------------------------

async function extractKeywordsFromSupplier(
  supplier: { id: string; holibobSupplierId: string; name: string },
  client: ReturnType<typeof createHolibobClient>,
  maxProducts: number
): Promise<SupplierExtraction> {
  // Fetch products from Holibob
  const response = await client.getProductsByProvider(
    supplier.holibobSupplierId,
    { pageSize: maxProducts }
  );

  const products = response.nodes;
  const citySet = new Set<string>();
  const categorySet = new Set<string>();
  const activityPhrases = new Set<string>();

  for (const product of products) {
    // Extract city
    const cityName = extractCity(product);
    if (cityName) citySet.add(cityName);

    // Extract categories
    const cats = extractCategories(product);
    for (const cat of cats) categorySet.add(cat);

    // Extract activity phrase from product name
    const phrase = extractActivityPhrase(product.name, citySet);
    if (phrase) activityPhrases.add(phrase);
  }

  const cities = [...citySet];
  const categories = [...categorySet];
  const activities = [...activityPhrases];

  // Generate seed combinations: [activity] in [city]
  const seeds = new Set<string>();

  for (const activity of activities) {
    for (const city of cities) {
      seeds.add(`${activity} in ${city}`.toLowerCase());
      seeds.add(`${activity} ${city}`.toLowerCase());
    }
    // Also add bare activity if it's descriptive enough (3+ words)
    if (activity.split(' ').length >= 3) {
      seeds.add(activity.toLowerCase());
    }
  }

  // Add category + city combinations
  for (const category of categories) {
    for (const city of cities) {
      const catLower = category.toLowerCase();
      // Skip overly generic categories
      if (['general', 'private', 'other'].includes(catLower)) continue;
      seeds.add(`${catLower} in ${city}`.toLowerCase());
    }
  }

  // Cap at MAX_SEEDS_PER_SUPPLIER
  const seedArray = [...seeds].slice(0, MAX_SEEDS_PER_SUPPLIER);

  return {
    supplierId: supplier.id,
    seeds: seedArray,
    cities,
    categories,
    productsAnalyzed: products.length,
  };
}

/** Extract city name from a product's place/location/startPlace data */
function extractCity(product: HolibobProduct): string | null {
  // Try place.name first (most reliable for city)
  const placeName = product.place?.name;
  if (placeName && placeName.length > 1 && placeName.length < 50) {
    return normalizeCity(placeName);
  }

  // Try location.name
  const locName = product.location?.name;
  if (locName && locName.length > 1 && locName.length < 50) {
    return normalizeCity(locName);
  }

  // Try startPlace.formattedAddress — extract city from address
  const addr = product.startPlace?.formattedAddress;
  if (addr) {
    return extractCityFromAddress(addr);
  }

  return null;
}

/** Normalize a city name */
function normalizeCity(raw: string): string {
  // Remove common suffixes and clean up
  return raw
    .replace(/,\s*\w+$/, '') // Remove country suffix (e.g., "London, UK")
    .replace(/\s*\(.*\)/, '') // Remove parenthetical
    .trim();
}

/** Extract city from a formatted address string */
function extractCityFromAddress(address: string): string | null {
  // Addresses are usually "Street, City, Region, Country"
  // Try to get the second element (often the city)
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length >= 3) {
    return parts[1] || null;
  }
  if (parts.length === 2) {
    return parts[0] || null;
  }
  return null;
}

/** Extract category names from a product */
function extractCategories(product: HolibobProduct): string[] {
  const cats: string[] = [];

  if (product.categoryList?.nodes) {
    for (const node of product.categoryList.nodes) {
      if (node.name) cats.push(node.name);
    }
  }

  if (product.categories) {
    for (const cat of product.categories) {
      if (cat.name && !cats.includes(cat.name)) cats.push(cat.name);
    }
  }

  return cats;
}

/**
 * Extract a 2-4 word activity phrase from a product name.
 *
 * Examples:
 *   "Private Sunset Kayaking Tour in Barcelona" → "kayaking tour"
 *   "Small Group Food and Wine Walking Tour" → "food wine walking tour"
 *   "Skip-the-Line Colosseum Guided Tour" → "colosseum tour"
 *   "Airport Transfer - London Heathrow" → "airport transfer"
 */
function extractActivityPhrase(
  productName: string,
  citiesToRemove: Set<string>
): string | null {
  let name = productName.toLowerCase();

  // Remove city/location names
  for (const city of citiesToRemove) {
    const cityLower = city.toLowerCase();
    name = name.replace(new RegExp(`\\b${escapeRegex(cityLower)}\\b`, 'g'), ' ');
  }

  // Remove hyphens and special characters
  name = name.replace(/[-–—]/g, ' ').replace(/[^a-z\s]/g, '');

  // Split into words
  let words = name.split(/\s+/).filter((w) => w.length > 0);

  // Remove modifier and filler words
  words = words.filter(
    (w) => !MODIFIER_WORDS.has(w) && !FILLER_WORDS.has(w) && w.length > 1
  );

  // Remove duration patterns (e.g., "2h", "3hour")
  words = words.filter((w) => !/^\d+h?o?u?r?s?$/.test(w));

  // Join remaining words
  const phrase = words.join(' ').trim();

  // Return null if too short or too long
  const wordCount = phrase.split(/\s+/).length;
  if (wordCount < 2 || wordCount > 5) return null;

  return phrase;
}

/** Escape special regex characters */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Phase 2: DataForSEO Bulk Validation
// ---------------------------------------------------------------------------

async function validateKeywords(
  seeds: string[],
  location: string
): Promise<Map<string, { searchVolume: number; cpc: number; competition: number; competitionLevel?: string }>> {
  const dataForSeo = new DataForSEOClient();
  const validated = new Map<string, { searchVolume: number; cpc: number; competition: number; competitionLevel?: string }>();

  // getBulkSearchVolume handles batching internally (1000/batch)
  console.log(`[Enrichment] Sending ${seeds.length} keywords to DataForSEO for validation...`);

  const results = await dataForSeo.getBulkSearchVolume(seeds, location);

  for (const kw of results) {
    // Filter criteria
    if (kw.searchVolume < 10) continue; // Minimum volume threshold
    if (kw.cpc <= 0) continue; // Must have commercial intent
    if (kw.cpc > 3.0) continue; // Below max profitable threshold
    if (isLowIntentKeyword(kw.keyword)) continue;

    validated.set(kw.keyword.toLowerCase(), {
      searchVolume: kw.searchVolume,
      cpc: kw.cpc,
      competition: kw.competition,
      competitionLevel: kw.competitionLevel,
    });
  }

  return validated;
}

/** Returns true if the keyword should be rejected due to low intent terms. */
function isLowIntentKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase();
  return LOW_INTENT_TERMS.some((term) => {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    return regex.test(kw);
  });
}

// ---------------------------------------------------------------------------
// Phase 3: Store Results
// ---------------------------------------------------------------------------

async function storeValidatedKeywords(
  validated: Map<string, { searchVolume: number; cpc: number; competition: number; competitionLevel?: string }>,
  seedToSupplierIds: Map<string, Set<string>>,
  location: string
): Promise<{ stored: number; updated: number }> {
  let stored = 0;
  let updated = 0;

  for (const [keyword, data] of validated) {
    const supplierIds = seedToSupplierIds.get(keyword);
    const score = calculatePaidScore(data.searchVolume, data.cpc, data.competition * 100);

    try {
      const existing = await prisma.sEOOpportunity.findFirst({
        where: { keyword, location },
        select: { id: true },
      });

      if (existing) {
        await prisma.sEOOpportunity.update({
          where: { id: existing.id },
          data: {
            searchVolume: data.searchVolume,
            cpc: data.cpc,
            difficulty: Math.round(data.competition * 100),
            priorityScore: score,
            sourceData: {
              scanMode: 'bulk_enrichment',
              paidCandidate: true,
              competition: data.competition,
              competitionLevel: data.competitionLevel,
              sourceSupplierIds: supplierIds ? [...supplierIds] : [],
              enrichedAt: new Date().toISOString(),
            },
          },
        });
        updated++;
      } else {
        await prisma.sEOOpportunity.create({
          data: {
            keyword,
            searchVolume: data.searchVolume,
            cpc: data.cpc,
            difficulty: Math.round(data.competition * 100),
            intent: 'COMMERCIAL',
            niche: 'paid_traffic',
            location,
            priorityScore: score,
            status: 'PAID_CANDIDATE' as any,
            source: 'bulk_enrichment',
            sourceData: {
              scanMode: 'bulk_enrichment',
              paidCandidate: true,
              competition: data.competition,
              competitionLevel: data.competitionLevel,
              sourceSupplierIds: supplierIds ? [...supplierIds] : [],
              enrichedAt: new Date().toISOString(),
            },
          },
        });
        stored++;
      }
    } catch (err) {
      // Handle unique constraint violations gracefully
      if (String(err).includes('Unique constraint')) {
        // Already exists — try update instead
        try {
          await prisma.sEOOpportunity.updateMany({
            where: { keyword, location },
            data: {
              searchVolume: data.searchVolume,
              cpc: data.cpc,
              difficulty: Math.round(data.competition * 100),
              priorityScore: score,
            },
          });
          updated++;
        } catch {
          // Silently skip
        }
      } else {
        console.error(`[Enrichment] Failed to store keyword "${keyword}":`, err);
      }
    }

    // Progress logging every 500 keywords
    if ((stored + updated) % 500 === 0 && (stored + updated) > 0) {
      console.log(`[Enrichment] Phase 3 progress: ${stored} stored, ${updated} updated`);
    }
  }

  return { stored, updated };
}

/**
 * Priority score for paid keywords.
 * Matches the formula in paid-keyword-scanner.ts:
 *   Volume: 0-40 pts (log scale)
 *   CPC: 0-30 pts (lower is better for paid)
 *   Competition: 0-20 pts (lower = better)
 *   Base: +10
 */
function calculatePaidScore(volume: number, cpc: number, difficulty: number): number {
  const volumeScore = Math.min(40, (Math.log10(Math.max(volume, 1)) / 5) * 40);
  const cpcScore = Math.max(0, Math.min(30, 30 * (1 - cpc / 4)));
  const competitionScore = ((100 - difficulty) / 100) * 20;
  return Math.round(volumeScore + cpcScore + competitionScore + 10);
}

// ---------------------------------------------------------------------------
// Holibob Client Helper
// ---------------------------------------------------------------------------

function getHolibobClient() {
  const apiUrl = process.env['HOLIBOB_API_URL'];
  const partnerId = process.env['HOLIBOB_PARTNER_ID'];
  const apiKey = process.env['HOLIBOB_API_KEY'];
  const apiSecret = process.env['HOLIBOB_API_SECRET'];

  if (!apiUrl || !partnerId || !apiKey) {
    throw new Error(
      'Missing Holibob API configuration. Required: HOLIBOB_API_URL, HOLIBOB_PARTNER_ID, HOLIBOB_API_KEY'
    );
  }

  return createHolibobClient({ apiUrl, partnerId, apiKey, apiSecret });
}
