#!/usr/bin/env npx tsx
/**
 * Batch Create Destination Pages for Branded Sites
 *
 * Creates up to 50 destination pages per branded domain, ranked by niche-filtered
 * keyword demand and gated by Holibob product availability (>= 10 products).
 *
 * Each site gets destination pages only for cities where its specific niche has
 * real keyword demand AND real product inventory. The bidding engine's profitability
 * gate handles CPC filtering downstream.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/batch-create-destinations.ts [options]
 *
 * Options:
 *   --dry-run         Show what would be created without creating
 *   --limit=N         Max pages per site (default: 50)
 *   --site=DOMAIN     Only process this specific domain
 *   --skip-validation Skip Holibob product validation (use cached keyword data only)
 */

import { prisma, PageType, PageStatus } from '@experience-marketplace/database';
import { createHolibobClient } from '@experience-marketplace/holibob-api';
import { addJob } from '../queues/index.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_PAGES_PER_SITE = 50;
const PRODUCT_THRESHOLD = 10;
const STAGGER_DELAY_MS = 5_000; // 5s between content generation jobs
const HOLIBOB_RATE_LIMIT_MS = 1_500; // 1.5s between Holibob API calls

/** Known cities for extraction from keyword text (longest-first matching) */
const KNOWN_CITIES = [
  // Major European cities
  'london',
  'paris',
  'barcelona',
  'rome',
  'amsterdam',
  'berlin',
  'prague',
  'vienna',
  'lisbon',
  'dublin',
  'athens',
  'budapest',
  'copenhagen',
  'stockholm',
  'istanbul',
  // Asia & Oceania
  'tokyo',
  'bangkok',
  'singapore',
  'sydney',
  'dubai',
  'marrakech',
  'cairo',
  // North America
  'new york',
  'los angeles',
  'san francisco',
  'chicago',
  'miami',
  'las vegas',
  'orlando',
  'nashville',
  'boston',
  'seattle',
  'denver',
  'austin',
  'philadelphia',
  'washington',
  'savannah',
  'san diego',
  'honolulu',
  'portland',
  // Canada
  'toronto',
  'vancouver',
  'montreal',
  // Latin America
  'cancun',
  'mexico city',
  'lima',
  'buenos aires',
  'cartagena',
  'bogota',
  // Southeast Asia
  'bali',
  'phuket',
  'chiang mai',
  'hanoi',
  'ho chi minh',
  'siem reap',
  // Australia & NZ
  'queenstown',
  'melbourne',
  'gold coast',
  'auckland',
  // UK cities
  'edinburgh',
  'york',
  'oxford',
  'bath',
  'cambridge',
  'brighton',
  'manchester',
  'liverpool',
  'bristol',
  'cardiff',
  'belfast',
  'glasgow',
  'durham',
  // Italy & Spain
  'florence',
  'venice',
  'naples',
  'milan',
  'seville',
  'madrid',
  'malaga',
  // Western Europe
  'bruges',
  'brussels',
  'munich',
  'hamburg',
  'salzburg',
  'zurich',
  // France
  'nice',
  'bordeaux',
  'provence',
  'tuscany',
  'amalfi',
  // Nordics & Eastern Europe
  'reykjavik',
  'iceland',
  'norway',
  'croatia',
  'dubrovnik',
  'split',
  // Greek Islands
  'santorini',
  'mykonos',
  'crete',
  'corfu',
  // Africa
  'cape town',
  'johannesburg',
  'nairobi',
  'zanzibar',
  'serengeti',
  'kenya',
  'tanzania',
  'south africa',
  'morocco',
  // South Asia
  'jaipur',
  'delhi',
  'goa',
  'mumbai',
  'agra',
  'kathmandu',
  'nepal',
  // South America
  'rio de janeiro',
  'sao paulo',
  'cusco',
  'patagonia',
  'chile',
  // Countries (for broader matching)
  'japan',
  'thailand',
  'vietnam',
  'indonesia',
  'india',
  'sri lanka',
  // London areas (for london-food-tours.com)
  'borough market',
  'covent garden',
  'shoreditch',
  'camden',
  'soho',
  'brick lane',
  'notting hill',
  'chinatown',
  'greenwich',
].sort((a, b) => b.length - a.length); // Sort longest-first for matching

/**
 * Site niche definitions.
 * Patterns are used to filter keywords to each site's niche.
 * searchTerm is passed to Holibob discoverProducts for niche-aware validation.
 * niche is the human-readable niche name used in page titles.
 */
interface SiteNicheConfig {
  patterns: string[] | null; // null = catch-all (everything not claimed by other niches)
  searchTerm: string;
  niche: string;
}

const SITE_NICHES: Record<string, SiteNicheConfig> = {
  'food-tour-guide.com': {
    patterns: [
      'food tour',
      'culinary',
      'wine tast',
      'cooking class',
      'street food',
      'gastro',
      'food experience',
      'tasting',
    ],
    searchTerm: 'street food tours',
    niche: 'Food Tours',
  },
  'water-tours.com': {
    patterns: [
      'boat',
      'sailing',
      'yacht',
      'cruise',
      'diving',
      'snorkel',
      'kayak',
      'surf',
      'water sport',
      'river',
      'canal',
      'jet ski',
      'whale watch',
      'dolphin',
      'fishing trip',
      'ferry',
    ],
    searchTerm: 'boat tours',
    niche: 'Boat Tours',
  },
  'outdoorexploring.com': {
    patterns: [
      'adventure',
      'hiking',
      'safari',
      'trek',
      'outdoor',
      'climb',
      'expedition',
      'wildlife',
      'zip line',
      'mountain',
      'camping',
      'nature',
      'canyoning',
      'rafting',
      'paraglid',
      'bungee',
    ],
    searchTerm: 'hiking',
    niche: 'Adventure Tours',
  },
  'cultural-tours.com': {
    patterns: [
      'museum',
      'gallery',
      'cultural',
      'sightseeing',
      'monument',
      'heritage',
      'walking tour',
      'history',
      'architecture',
      'art tour',
      'temple',
      'church',
      'cathedral',
      'palace',
      'castle',
    ],
    searchTerm: 'local guides',
    niche: 'Cultural Tours',
  },
  'attractionbooking.com': {
    patterns: null, // catch-all: keywords not matching any other niche
    searchTerm: 'guided tours',
    niche: 'Tours & Attractions',
  },
  'harry-potter-tours.com': {
    patterns: ['harry potter', 'hogwarts', 'wizarding', 'warner bros studio'],
    searchTerm: 'Harry Potter',
    niche: 'Harry Potter Tours',
  },
  'london-food-tours.com': {
    patterns: ['london food', 'london culinary', 'london tasting', 'london street food'],
    searchTerm: 'food tour',
    niche: 'London Food Tours',
  },
};

// Collect ALL niche patterns (excluding catch-all) for the catch-all exclusion filter
const ALL_NICHE_PATTERNS: string[] = [];
for (const [domain, cfg] of Object.entries(SITE_NICHES)) {
  if (cfg.patterns && domain !== 'attractionbooking.com') {
    ALL_NICHE_PATTERNS.push(...cfg.patterns);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function capitalize(text: string): string {
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractCity(keyword: string): string | null {
  const kw = keyword.toLowerCase();
  for (const city of KNOWN_CITIES) {
    if (kw.includes(city)) return city;
  }
  return null;
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const words = text.split(' ');
  let result = '';
  for (const word of words) {
    if ((result + ' ' + word).trim().length <= maxLength) {
      result = (result + ' ' + word).trim();
    } else {
      break;
    }
  }
  return result || text.slice(0, maxLength);
}

function generateMetaTitle(params: {
  title: string;
  siteName: string;
  niche?: string;
  location?: string;
}): string {
  const { title, siteName, niche, location } = params;
  const MAX_LENGTH = 60;

  if (location && niche) {
    const landingTitle = `Best ${capitalize(niche)} in ${location} | ${siteName}`;
    if (landingTitle.length <= MAX_LENGTH) return landingTitle;
    // Try without brand
    const noBrand = `${capitalize(niche)} in ${location}`;
    if (noBrand.length <= MAX_LENGTH) return noBrand;
  }

  // Fallback: truncate with brand
  const withBrand = `${title} | ${siteName}`;
  if (withBrand.length <= MAX_LENGTH) return withBrand;

  const availableLength = MAX_LENGTH - siteName.length - 3;
  if (availableLength < 20) {
    return truncateAtWord(title, MAX_LENGTH - 3) + '...';
  }
  return truncateAtWord(title, availableLength) + ` | ${siteName}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface ScriptOptions {
  dryRun: boolean;
  limit: number;
  siteFilter?: string;
  skipValidation: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    dryRun: false,
    limit: MAX_PAGES_PER_SITE,
    skipValidation: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.replace('--limit=', ''), 10);
    } else if (arg.startsWith('--site=')) {
      options.siteFilter = arg.replace('--site=', '');
    } else if (arg === '--skip-validation') {
      options.skipValidation = true;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Product validation with caching
// ---------------------------------------------------------------------------

type HolibobClient =
  ReturnType<typeof createHolibobClient> extends Promise<infer T>
    ? T
    : ReturnType<typeof createHolibobClient>;

const productCache = new Map<string, number>();

async function validateProducts(
  client: HolibobClient,
  cityName: string,
  searchTerm: string,
  skipValidation: boolean
): Promise<{ count: number; usedFallback: boolean }> {
  if (skipValidation) {
    return { count: 999, usedFallback: false };
  }

  // Check cache: niche-specific key
  const cacheKey = `${cityName}|${searchTerm}`;
  const cached = productCache.get(cacheKey);
  if (cached !== undefined) {
    return { count: cached, usedFallback: false };
  }

  // Check cache: location-only fallback key
  const fallbackKey = `${cityName}|`;
  const cachedFallback = productCache.get(fallbackKey);

  try {
    // Try niche-specific search first
    await sleep(HOLIBOB_RATE_LIMIT_MS);
    const response = await client.discoverProducts(
      { freeText: cityName, searchTerm, currency: 'GBP' },
      { pageSize: PRODUCT_THRESHOLD }
    );
    const count = response.products.length;
    productCache.set(cacheKey, count);

    if (count >= PRODUCT_THRESHOLD) {
      return { count, usedFallback: false };
    }

    // Niche search returned too few — try location-only fallback
    if (cachedFallback !== undefined) {
      return { count: cachedFallback, usedFallback: true };
    }

    await sleep(HOLIBOB_RATE_LIMIT_MS);
    const fallbackResponse = await client.discoverProducts(
      { freeText: cityName, currency: 'GBP' },
      { pageSize: PRODUCT_THRESHOLD }
    );
    const fallbackCount = fallbackResponse.products.length;
    productCache.set(fallbackKey, fallbackCount);
    return { count: fallbackCount, usedFallback: true };
  } catch (error) {
    console.error(
      `[Batch] Product validation error for "${cityName}" + "${searchTerm}":`,
      error instanceof Error ? error.message : String(error)
    );
    // Fail-open on error: allow page creation
    return { count: PRODUCT_THRESHOLD, usedFallback: false };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface CityData {
  kwCount: number;
  totalVolume: number;
  topKeyword: string;
}

interface SiteResult {
  domain: string;
  siteId: string;
  siteName: string;
  created: number;
  skippedExists: number;
  skippedNoProducts: number;
  cities: Array<{ city: string; volume: number; products: number; created: boolean }>;
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.info('='.repeat(70));
  console.info('Batch Destination Page Creator');
  console.info(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.info(`Max pages per site: ${options.limit}`);
  if (options.siteFilter) console.info(`Site filter: ${options.siteFilter}`);
  if (options.skipValidation) console.info('Product validation: SKIPPED');
  console.info('='.repeat(70));

  // 1. Resolve domain → siteId mapping
  const domainList = Object.keys(SITE_NICHES);
  const domains = await prisma.domain.findMany({
    where: { domain: { in: domainList } },
    select: { domain: true, siteId: true },
  });
  const domainToSite = new Map<string, string>();
  for (const d of domains) {
    if (d.siteId) domainToSite.set(d.domain, d.siteId);
  }

  // Also fetch site names
  const siteIds = [...new Set(domainToSite.values())];
  const sites = await prisma.site.findMany({
    where: { id: { in: siteIds } },
    select: { id: true, name: true },
  });
  const siteIdToName = new Map<string, string>();
  for (const s of sites) {
    siteIdToName.set(s.id, s.name);
  }

  // 2. Load all PAID_CANDIDATE keywords
  const keywords = await prisma.sEOOpportunity.findMany({
    where: { status: 'PAID_CANDIDATE' },
    select: { keyword: true, searchVolume: true },
  });
  console.info(`\nLoaded ${keywords.length} PAID_CANDIDATE keywords`);

  // 3. Initialize Holibob client for product validation
  const apiUrl = process.env['HOLIBOB_API_URL'];
  const partnerId = process.env['HOLIBOB_PARTNER_ID'];
  const apiKey = process.env['HOLIBOB_API_KEY'];
  const apiSecret = process.env['HOLIBOB_API_SECRET'];

  let holibobClient: HolibobClient | null = null;
  if (apiUrl && partnerId && apiKey && !options.skipValidation) {
    holibobClient = createHolibobClient({ apiUrl, partnerId, apiKey, apiSecret });
    console.info('Holibob client initialized for product validation');
  } else if (!options.skipValidation) {
    console.warn('Missing Holibob credentials — product validation will be skipped');
  }

  // 4. Process each site
  const results: SiteResult[] = [];
  let totalCreated = 0;
  let totalQueued = 0;

  for (const [domain, cfg] of Object.entries(SITE_NICHES)) {
    if (options.siteFilter && domain !== options.siteFilter) continue;

    const siteId = domainToSite.get(domain);
    if (!siteId) {
      console.info(`\n--- ${domain} --- SKIP (no siteId in database)`);
      continue;
    }

    const siteName = siteIdToName.get(siteId) ?? domain;
    console.info(`\n${'='.repeat(60)}`);
    console.info(`${domain} (${siteName})`);
    console.info('='.repeat(60));

    // 4a. Filter keywords to this site's niche
    let filtered: typeof keywords;
    if (cfg.patterns === null) {
      // Catch-all: keywords not matching ANY other niche
      filtered = keywords.filter((kw) => {
        const kwl = kw.keyword.toLowerCase();
        return ALL_NICHE_PATTERNS.every((p) => !kwl.includes(p));
      });
    } else {
      filtered = keywords.filter((kw) => {
        const kwl = kw.keyword.toLowerCase();
        return cfg.patterns!.some((p) => kwl.includes(p));
      });
    }
    console.info(`  Niche-matched keywords: ${filtered.length}`);

    // 4b. Extract cities from keyword text and aggregate by city
    const byCity = new Map<string, CityData>();
    for (const kw of filtered) {
      const city = extractCity(kw.keyword);
      if (!city) continue;

      const existing = byCity.get(city);
      if (existing) {
        existing.kwCount++;
        existing.totalVolume += kw.searchVolume || 0;
      } else {
        byCity.set(city, {
          kwCount: 1,
          totalVolume: kw.searchVolume || 0,
          topKeyword: kw.keyword,
        });
      }
    }

    // Sort by total search volume DESC
    const rankedCities = [...byCity.entries()].sort((a, b) => b[1].totalVolume - a[1].totalVolume);
    console.info(`  Cities with keyword matches: ${rankedCities.length}`);

    // 4c. Get existing destination pages for this site
    const existingPages = await prisma.page.findMany({
      where: { siteId, type: PageType.LANDING, slug: { startsWith: 'destinations/' } },
      select: { slug: true },
    });
    const existingSlugs = new Set(existingPages.map((p) => p.slug));
    console.info(`  Existing destination pages: ${existingSlugs.size}`);

    // 4d. Iterate through ranked cities, validate products, create pages
    const siteResult: SiteResult = {
      domain,
      siteId,
      siteName,
      created: 0,
      skippedExists: 0,
      skippedNoProducts: 0,
      cities: [],
    };

    let createdCount = 0;
    for (const [city, data] of rankedCities) {
      if (createdCount >= options.limit) break;

      const slug = `destinations/${slugify(city)}`;

      // Skip if page already exists
      if (existingSlugs.has(slug)) {
        siteResult.skippedExists++;
        console.info(`  SKIP [EXISTS] ${city} (${slug})`);
        continue;
      }

      // Validate product availability
      let productCount = PRODUCT_THRESHOLD; // default if no client
      if (holibobClient) {
        const validation = await validateProducts(
          holibobClient,
          capitalize(city),
          cfg.searchTerm,
          options.skipValidation
        );
        productCount = validation.count;

        if (productCount < PRODUCT_THRESHOLD) {
          siteResult.skippedNoProducts++;
          siteResult.cities.push({
            city,
            volume: data.totalVolume,
            products: productCount,
            created: false,
          });
          console.info(
            `  SKIP [${productCount} products] ${city} — ${data.kwCount} kws, ${data.totalVolume} vol/mo` +
              (validation.usedFallback ? ' (fallback)' : '')
          );
          continue;
        }
      }

      // Create the page
      const destinationTitle = `${cfg.niche} in ${capitalize(city)}`;
      const metaTitle = generateMetaTitle({
        title: destinationTitle,
        siteName,
        niche: cfg.niche.toLowerCase(),
        location: capitalize(city),
      });
      const metaDescription =
        `Discover the best ${cfg.niche.toLowerCase()} in ${capitalize(city)}. ` +
        'Expert guides, insider tips, and top experiences.';

      if (options.dryRun) {
        console.info(
          `  CREATE ${city} — ${data.kwCount} kws, ${data.totalVolume} vol/mo, ` +
            `${productCount} products — "${metaTitle}"`
        );
      } else {
        try {
          const page = await prisma.page.create({
            data: {
              siteId,
              title: destinationTitle,
              slug,
              type: PageType.LANDING,
              status: PageStatus.DRAFT,
              metaTitle,
              metaDescription,
              priority: 0.8,
            },
          });

          const delayMs = totalQueued * STAGGER_DELAY_MS;
          await addJob(
            'CONTENT_GENERATE',
            {
              siteId,
              pageId: page.id,
              contentType: 'destination',
              targetKeyword: data.topKeyword || `${cfg.niche.toLowerCase()} in ${capitalize(city)}`,
              destination: capitalize(city),
            },
            delayMs > 0 ? { delay: delayMs } : undefined
          );

          totalQueued++;
          console.info(
            `  CREATED ${city} — ${data.kwCount} kws, ${data.totalVolume} vol/mo, ` +
              `${productCount} products (delay: ${Math.round(delayMs / 1000)}s)`
          );
        } catch (error) {
          if (error instanceof Error && error.message.includes('Unique constraint')) {
            console.warn(`  SKIP [DUPLICATE] ${city} — page already exists (race condition)`);
            siteResult.skippedExists++;
            continue;
          }
          throw error;
        }
      }

      createdCount++;
      siteResult.created++;
      siteResult.cities.push({
        city,
        volume: data.totalVolume,
        products: productCount,
        created: true,
      });
    }

    totalCreated += siteResult.created;
    results.push(siteResult);

    console.info(
      `\n  Summary: ${siteResult.created} created, ${siteResult.skippedExists} already exist, ${siteResult.skippedNoProducts} skipped (no products)`
    );
  }

  // 5. Final report
  console.info('\n' + '='.repeat(70));
  console.info(options.dryRun ? 'DRY RUN COMPLETE' : 'BATCH COMPLETE');
  console.info('='.repeat(70));
  console.info(`\nTotal pages ${options.dryRun ? 'would be created' : 'created'}: ${totalCreated}`);
  if (!options.dryRun) {
    console.info(`Total content jobs queued: ${totalQueued}`);
    const estMinutes = Math.ceil((totalQueued * 45) / 60);
    console.info(`Estimated queue processing time: ~${estMinutes} minutes`);
  }

  console.info('\nPer-site breakdown:');
  for (const r of results) {
    console.info(
      `  ${r.domain}: ${r.created} created, ${r.skippedExists} exist, ${r.skippedNoProducts} no products`
    );
  }

  console.info(`\nHolibob API calls made: ${productCache.size}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
