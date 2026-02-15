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
/** Minimum % of experience (non-transfer) products to process a supplier */
const MIN_EXPERIENCE_RATIO = 0.15;

/** Categories that indicate transport/transfer (low booking intent for experiences) */
const TRANSPORT_CATEGORIES = new Set([
  'transfer', 'car, bus or mini-van', 'transportation', 'shuttle',
  'airport transfer', 'port transfer',
]);

/** Common modifiers to strip from product names */
const MODIFIER_WORDS = new Set([
  'private', 'guided', 'small', 'group', 'exclusive', 'luxury', 'vip',
  'half', 'full', 'day', 'morning', 'afternoon', 'evening', 'night',
  'sunset', 'sunrise', 'skip', 'the', 'line', 'hour', 'hours',
  'minute', 'minutes', 'premium', 'ultimate', 'best', 'top',
  'express', 'deluxe', 'classic', 'original', 'official',
  'ticket', 'tickets', 'entry', 'admission', 'pass',
  'hands', 'hand', 'based', 'semi', 'self', 'audio', 'trip',
  'daytrip', 'sightseeing', 'sightseeings', 'days', 'cook',
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

/**
 * Well-known cities/destinations for fallback extraction from product names.
 * Sorted by importance — we match against product titles when place.name is empty.
 */
const KNOWN_DESTINATIONS = new Set([
  // Major European cities
  'london', 'paris', 'barcelona', 'rome', 'amsterdam', 'lisbon', 'madrid',
  'berlin', 'vienna', 'prague', 'budapest', 'dublin', 'edinburgh', 'athens',
  'florence', 'venice', 'milan', 'naples', 'seville', 'porto', 'nice',
  'munich', 'bruges', 'dubrovnik', 'split', 'santorini', 'mykonos',
  'reykjavik', 'stockholm', 'copenhagen', 'oslo', 'helsinki', 'zurich',
  'geneva', 'brussels', 'krakow', 'warsaw', 'istanbul', 'marrakech',
  'glasgow', 'liverpool', 'manchester', 'bath', 'oxford', 'cambridge',
  'york', 'brighton', 'bristol', 'cardiff', 'inverness', 'belfast',
  'cork', 'galway', 'malaga', 'granada', 'valencia', 'bilbao',
  'lyon', 'marseille', 'bordeaux', 'strasbourg', 'normandy', 'provence',
  'tuscany', 'cinque terre', 'amalfi', 'pompeii', 'capri', 'sicily',
  'sardinia', 'crete', 'rhodes', 'corfu', 'zakynthos',
  // Italy (expanded - many cooking/food experience suppliers)
  'bologna', 'palermo', 'siena', 'verona', 'turin', 'genoa', 'pisa',
  'lucca', 'como', 'rimini', 'perugia', 'parma', 'modena', 'ravenna',
  'lecce', 'bari', 'alberobello', 'matera', 'sorrento', 'positano',
  'taormina', 'catania', 'cagliari', 'trieste', 'padua', 'bergamo',
  'arezzo', 'orvieto', 'assisi', 'cortona', 'varenna', 'bellagio',
  'cinque terre', 'portofino', 'san gimignano',
  // Spain (expanded)
  'san sebastian', 'toledo', 'cordoba', 'cadiz', 'salamanca',
  'ibiza', 'mallorca', 'tenerife', 'gran canaria', 'lanzarote',
  // France (expanded)
  'avignon', 'aix-en-provence', 'cannes', 'monaco', 'toulouse',
  'nantes', 'montpellier', 'dijon', 'colmar', 'annecy',
  // Germany/Austria/Switzerland
  'salzburg', 'innsbruck', 'graz', 'heidelberg', 'dresden',
  'cologne', 'hamburg', 'frankfurt', 'nuremberg', 'rothenburg',
  'lucerne', 'interlaken', 'zermatt', 'grindelwald',
  // Scandinavia
  'bergen', 'gothenburg', 'malmo', 'turku', 'rovaniemi', 'tromso',
  // Eastern Europe
  'tallinn', 'riga', 'vilnius', 'bratislava', 'ljubljana', 'zagreb',
  'sarajevo', 'kotor', 'mostar', 'ohrid', 'plovdiv', 'sofia', 'bucharest',
  // Greece (expanded)
  'thessaloniki', 'heraklion', 'chania', 'naxos', 'paros', 'meteora',
  'delphi', 'olympia', 'corinth', 'nafplio', 'hydra',
  // UK & Ireland
  'stonehenge', 'cotswolds', 'lake district', 'snowdonia', 'highlands',
  'isle of skye', 'loch ness', 'windsor', 'canterbury', 'stratford',
  'aberdeen', 'st andrews', 'whitby', 'durham', 'chester', 'salisbury',
  'bournemouth', 'portsmouth', 'southampton', 'nottingham', 'leeds',
  'birmingham', 'swansea', 'killarney', 'limerick', 'waterford',
  // Americas
  'new york', 'los angeles', 'san francisco', 'las vegas', 'miami',
  'chicago', 'boston', 'washington', 'seattle', 'san diego', 'honolulu',
  'new orleans', 'nashville', 'austin', 'denver', 'portland',
  'savannah', 'charleston', 'minneapolis', 'philadelphia', 'atlanta',
  'dallas', 'houston', 'phoenix', 'san antonio', 'orlando', 'tampa',
  'pittsburgh', 'detroit', 'baltimore', 'memphis', 'st louis',
  'santa fe', 'sedona', 'aspen', 'key west', 'maui', 'kauai',
  'anchorage', 'juneau', 'niagara falls',
  // Canada
  'toronto', 'vancouver', 'montreal', 'quebec city', 'ottawa', 'calgary',
  'banff', 'victoria', 'halifax', 'whistler',
  // Latin America
  'cancun', 'mexico city', 'cabo', 'playa del carmen', 'tulum',
  'oaxaca', 'guanajuato', 'merida', 'puebla', 'guadalajara',
  'havana', 'nassau', 'punta cana', 'cartagena', 'bogota', 'medellin',
  'lima', 'cusco', 'buenos aires', 'rio de janeiro', 'sao paulo',
  'santiago', 'montevideo', 'quito', 'galapagos',
  'san jose', 'monteverde', 'la fortuna', 'antigua guatemala',
  'guayaquil', 'valparaiso', 'bariloche', 'ushuaia',
  // Asia & Pacific
  'tokyo', 'kyoto', 'osaka', 'bangkok', 'singapore', 'hong kong',
  'bali', 'hanoi', 'ho chi minh', 'siem reap', 'kuala lumpur',
  'seoul', 'taipei', 'shanghai', 'beijing', 'dubai', 'abu dhabi',
  'delhi', 'mumbai', 'jaipur', 'agra', 'goa', 'colombo', 'kandy',
  'kathmandu', 'phnom penh', 'yangon', 'manila', 'cebu',
  'chiang mai', 'phuket', 'koh samui', 'ubud', 'yogyakarta',
  'luang prabang', 'hoi an', 'da nang', 'nha trang',
  'nagasaki', 'hiroshima', 'nara', 'hakone', 'kamakura',
  'penang', 'langkawi', 'borneo', 'lombok',
  // South Asia
  'galle', 'ella', 'sigiriya', 'dambulla', 'trincomalee',
  'varanasi', 'udaipur', 'jodhpur', 'rishikesh', 'kochi', 'munnar',
  // Africa & Middle East
  'cairo', 'cape town', 'johannesburg', 'nairobi', 'zanzibar',
  'victoria falls', 'casablanca', 'fez', 'luxor', 'aswan',
  'tel aviv', 'jerusalem', 'petra', 'amman', 'muscat',
  'marrakech', 'essaouira', 'chefchaouen', 'mombasa', 'arusha',
  'windhoek', 'livingstone', 'addis ababa', 'dakar', 'accra',
  // Oceania
  'sydney', 'melbourne', 'auckland', 'queenstown', 'cairns',
  'fiji', 'tahiti', 'gold coast', 'brisbane', 'adelaide', 'perth',
  'hobart', 'darwin', 'rotorua', 'wellington', 'christchurch',
  // Caribbean
  'jamaica', 'barbados', 'aruba', 'curacao', 'bermuda',
  'st lucia', 'antigua', 'grenada', 'martinique',
  'san juan', 'turks and caicos', 'cayman islands',
  // Countries (when no city is extractable)
  'sri lanka', 'thailand', 'vietnam', 'cambodia', 'nepal',
  'morocco', 'egypt', 'kenya', 'tanzania', 'south africa',
  'iceland', 'scotland', 'ireland', 'portugal', 'spain',
  'italy', 'france', 'greece', 'croatia', 'turkey',
  'japan', 'indonesia', 'malaysia', 'philippines', 'india',
  'mexico', 'peru', 'colombia', 'brazil', 'argentina', 'costa rica',
  'australia', 'new zealand', 'fiji', 'malta', 'cyprus', 'montenegro',
  'oman', 'jordan', 'israel', 'georgia', 'armenia',
]);

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
  // Only process suppliers with active microsites (these are the sites we can drive traffic to)
  const supplierWhere: Record<string, unknown> = {
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

  // Log sample seeds for quality review
  const sampleSize = Math.min(30, uniqueSeeds.length);
  const shuffled = uniqueSeeds.sort(() => Math.random() - 0.5);
  console.log(`[Enrichment] Sample seeds (${sampleSize} of ${uniqueSeeds.length}):`);
  for (let s = 0; s < sampleSize; s++) {
    console.log(`[Enrichment]   ${shuffled[s]}`);
  }

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

  const allProducts = response.nodes;
  const citySet = new Set<string>();
  const categorySet = new Set<string>();
  const activityPhrases = new Set<string>();

  // First pass: separate experience products from transfers
  const experienceProducts: typeof allProducts = [];
  let transferCount = 0;

  for (const product of allProducts) {
    if (isTransferProduct(product)) {
      transferCount++;
      // Still extract cities from transfer products (they often mention cities)
      const cityFromName = extractCityFromProductName(product.name);
      if (cityFromName) citySet.add(cityFromName);
      continue;
    }
    experienceProducts.push(product);
  }

  // Skip supplier if overwhelmingly transfer-focused
  if (allProducts.length > 0 && experienceProducts.length / allProducts.length < MIN_EXPERIENCE_RATIO) {
    console.log(
      `[Enrichment] Skipping ${supplier.name}: ${transferCount}/${allProducts.length} products are transfers ` +
      `(${experienceProducts.length} experiences, below ${MIN_EXPERIENCE_RATIO * 100}% threshold)`
    );
    return {
      supplierId: supplier.id,
      seeds: [],
      cities: [...citySet],
      categories: [],
      productsAnalyzed: allProducts.length,
    };
  }

  // Second pass: extract per-product city + activity pairs
  // Key insight: each product's activity should only be paired with ITS OWN city,
  // not cross-multiplied with all cities from other products.
  const seeds = new Set<string>();
  const SKIP_CATEGORIES = new Set(['general', 'private', 'other', 'multi-day',
    'full day', 'half day', 'car, bus or mini-van', 'passes', 'city',
    'natural', 'iconic', 'themed', 'classes', 'general']);

  for (const product of experienceProducts) {
    // Extract THIS product's city
    const city = extractCity(product);
    if (city) citySet.add(city);

    // Extract categories (skip transport-related ones)
    const cats = extractCategories(product);
    for (const cat of cats) {
      if (!TRANSPORT_CATEGORIES.has(cat.toLowerCase())) {
        categorySet.add(cat);
      }
    }

    // Extract activity phrase from product name
    const allCities = new Set(citySet); // Use accumulated cities for name cleaning
    const phrase = extractActivityPhrase(product.name, allCities);

    // Generate seeds: pair THIS activity with THIS product's city
    if (phrase && city) {
      seeds.add(`${phrase} in ${city}`.toLowerCase());
      seeds.add(`${phrase} ${city}`.toLowerCase());
    }
    // Add bare activity if descriptive enough
    if (phrase && phrase.split(' ').length >= 3) {
      seeds.add(phrase.toLowerCase());
    }

    // Add category + city for THIS product (not cross-multiplied)
    if (city) {
      for (const cat of cats) {
        const catLower = cat.toLowerCase();
        if (SKIP_CATEGORIES.has(catLower) || TRANSPORT_CATEGORIES.has(catLower)) continue;
        seeds.add(`${catLower} in ${city}`.toLowerCase());
      }
    }
  }

  const cities = [...citySet];
  const categories = [...categorySet].filter(c => !SKIP_CATEGORIES.has(c.toLowerCase()));

  // Cap at MAX_SEEDS_PER_SUPPLIER
  const seedArray = [...seeds].slice(0, MAX_SEEDS_PER_SUPPLIER);

  return {
    supplierId: supplier.id,
    seeds: seedArray,
    cities,
    categories,
    productsAnalyzed: allProducts.length,
  };
}

/** Check if a product is a transfer/transport (not a bookable experience) */
function isTransferProduct(product: HolibobProduct): boolean {
  const cats = extractCategories(product);
  if (cats.length === 0) return false;

  // If the product has ONLY transport-related categories, it's a transfer
  const experienceCats = cats.filter(c => !TRANSPORT_CATEGORIES.has(c.toLowerCase()));
  if (experienceCats.length === 0) return true;

  // Also check the product name for strong transfer signals
  const nameLower = product.name.toLowerCase();
  const transferNamePatterns = [
    /\btransfer\b/, /\bairport\s+(to|from)\b/, /\bshuttle\b/,
    /\bport\s+(to|from)\b/, /\b(arrival|departure)\s+transfer\b/,
  ];
  // If name screams "transfer" and categories include Transfer, skip it
  if (cats.some(c => c.toLowerCase() === 'transfer') &&
      transferNamePatterns.some(p => p.test(nameLower))) {
    return true;
  }

  return false;
}

/**
 * Extract a city/destination name from a product title.
 * Fallback when place.name is not available from the API.
 *
 * Matches against a set of well-known tourism destinations.
 * Examples:
 *   "Private Sunset Kayaking Tour in Barcelona" → "Barcelona"
 *   "Colombo Tuk Tuk Safari" → "Colombo"
 *   "Udawalawe National Park Safari" → null (not in known list, but "Sri Lanka" might match)
 */
function extractCityFromProductName(productName: string): string | null {
  const nameLower = productName.toLowerCase();

  // Strategy 1: Match against known destinations (longest match first)
  let bestMatch: string | null = null;
  let bestLen = 0;

  for (const dest of KNOWN_DESTINATIONS) {
    if (dest.length > bestLen && nameLower.includes(dest)) {
      const regex = new RegExp(`\\b${escapeRegex(dest)}\\b`, 'i');
      if (regex.test(nameLower)) {
        bestMatch = dest;
        bestLen = dest.length;
      }
    }
  }

  if (bestMatch) {
    return bestMatch.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Strategy 2: Pattern-based extraction from title structure
  // Reject words that look like city names but aren't
  const NON_CITY_WORDS = new Set([
    'private', 'tour', 'day', 'trip', 'group', 'class', 'experience',
    'adventure', 'excursion', 'safari', 'cruise', 'transfer', 'boat',
    'walk', 'hike', 'bike', 'ride', 'drive', 'flight', 'show',
    'sunrise', 'sunset', 'morning', 'afternoon', 'evening', 'night',
    'standard', 'premium', 'luxury', 'budget', 'basic', 'deluxe',
  ]);

  function isValidCity(candidate: string): boolean {
    if (candidate.length < 3 || candidate.length > 30) return false;
    // Reject if ALL words are common non-city words
    const words = candidate.toLowerCase().split(/\s+/);
    if (words.every(w => NON_CITY_WORDS.has(w))) return false;
    // Reject if it contains numbers
    if (/\d/.test(candidate)) return false;
    // Must start with uppercase (already ensured by regex)
    return true;
  }

  // "... in [City]" — "Cooking Class in Bologna"
  const inMatch = productName.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$/);
  if (inMatch?.[1] && isValidCity(inMatch[1])) {
    return inMatch[1];
  }

  // "[City]: ..." — "Naples: Pasta Making Class"
  const colonMatch = productName.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*):\s/);
  if (colonMatch?.[1] && isValidCity(colonMatch[1])) {
    return colonMatch[1];
  }

  return null;
}

/** Extract city name from a product's place/location/startPlace data */
function extractCity(product: HolibobProduct): string | null {
  // Try place.name first (now included in the GraphQL query)
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

  // Fall back to extracting from product name
  return extractCityFromProductName(product.name);
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
 * Focuses on the core bookable activity, stripping modifiers and locations.
 *
 * Examples:
 *   "Private Sunset Kayaking Tour in Barcelona" → "kayaking tour"
 *   "Small Group Pasta and Tiramisu Class" → "pasta tiramisu class"
 *   "Skip-the-Line Colosseum Guided Tour" → "colosseum tour"
 *   "Tuk Tuk Safari" → "tuk tuk safari"
 */
function extractActivityPhrase(
  productName: string,
  citiesToRemove: Set<string>
): string | null {
  let name = productName.toLowerCase();

  // Remove city/location names (so they don't pollute the activity phrase)
  for (const city of citiesToRemove) {
    const cityLower = city.toLowerCase();
    name = name.replace(new RegExp(`\\b${escapeRegex(cityLower)}\\b`, 'g'), ' ');
  }
  // Also strip known destinations directly
  for (const dest of KNOWN_DESTINATIONS) {
    if (name.includes(dest)) {
      name = name.replace(new RegExp(`\\b${escapeRegex(dest)}\\b`, 'g'), ' ');
    }
  }

  // Remove common title patterns that add noise
  name = name
    .replace(/[-–—:]/g, ' ')    // Hyphens and colons
    .replace(/[^a-z\s]/g, '')    // Non-alpha characters
    .replace(/\bself\s+guided\b/g, 'self-guided')  // Keep as compound
    .replace(/\bshore\s+excursion\b/g, 'shore excursion');

  // Split into words
  let words = name.split(/\s+/).filter(w => w.length > 0);

  // Remove modifier, filler, and noise words
  words = words.filter(
    w => !MODIFIER_WORDS.has(w) && !FILLER_WORDS.has(w) && w.length > 1
  );

  // Remove duration patterns and numbers
  words = words.filter(w => !/^\d+h?o?u?r?s?$/.test(w) && !/^\d+$/.test(w));

  // Remove additional noise: directional/logistic words
  const NOISE_WORDS = new Set([
    'hotel', 'hotels', 'pickup', 'pick', 'drop', 'off', 'optional',
    'included', 'includes', 'including', 'transport', 'return',
    'round', 'way', 'standard', 'rental', 'chauffeur', 'driven',
    'home', 'port', 'center', 'centre', 'city', 'airport',
    'station', 'departure', 'arrival', 'local', 'transfers',
    'transfer', 'stops', 'highlights', 'based', 'one',
  ]);
  words = words.filter(w => !NOISE_WORDS.has(w));

  // Take first 4 meaningful words (longer phrases are too specific)
  words = words.slice(0, 4);

  const phrase = words.join(' ').trim();
  const wordCount = phrase.split(/\s+/).length;
  if (wordCount < 2 || wordCount > 4) return null;

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
