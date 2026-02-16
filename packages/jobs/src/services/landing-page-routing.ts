/**
 * Landing Page Routing — API-Aware Keyword → Landing Page Matching
 *
 * Routes paid traffic keywords to the best available landing page based on:
 * 1. Site type (Main Site vs Supplier Microsite vs Opportunity Microsite)
 * 2. Holibob API constraints (Product Discovery vs Product List by Provider)
 * 3. Keyword intent classification
 * 4. Available published pages for the site
 *
 * Includes pre-deployment validation to ensure landing pages have products.
 */

import { prisma } from '@experience-marketplace/database';

// --- Types -------------------------------------------------------------------

export type LandingPageType =
  | 'HOMEPAGE'
  | 'DESTINATION'
  | 'CATEGORY'
  | 'COLLECTION'
  | 'EXPERIENCE_DETAIL'
  | 'BLOG'
  | 'EXPERIENCES_FILTERED';

export type SiteType = 'MAIN' | 'OPPORTUNITY_MICROSITE' | 'SUPPLIER_MICROSITE';

export interface LandingPageResult {
  url: string;
  path: string;
  type: LandingPageType;
  validated: boolean;
  productCount?: number;
}

export interface LandingPageContext {
  siteType: SiteType;
  micrositeEntityType?: 'SUPPLIER' | 'OPPORTUNITY' | 'PRODUCT';
  cachedProductCount?: number;
  supplierCities?: string[];
  supplierCategories?: string[];
  holibobSupplierId?: string;
  discoveryConfig?: { keyword?: string; destination?: string; searchTerms?: string[] };
  sitePages: PageCacheEntry[];
  collections: CollectionCacheEntry[];
}

export interface PageCacheEntry {
  siteId: string;
  slug: string;
  type: string; // LANDING, CATEGORY, BLOG, etc.
  title: string;
  holibobLocationId: string | null;
  holibobCategoryId: string | null;
}

export interface CollectionCacheEntry {
  micrositeId: string;
  slug: string;
  name: string;
  collectionType: string;
  seasonalMonths: number[] | null;
  productCount: number;
}

// --- Constants ---------------------------------------------------------------

/**
 * Category keyword stems — maps activity names to their common search variations.
 * Sourced from keyword-enrichment.ts CATEGORY_KEYWORD_STEMS.
 */
const CATEGORY_STEMS: string[] = [
  'walking tour',
  'walking tours',
  'guided walk',
  'food tour',
  'food tours',
  'food tasting',
  'food experience',
  'cooking class',
  'cooking classes',
  'cooking experience',
  'water sports',
  'kayaking',
  'snorkeling',
  'boat tour',
  'boat trips',
  'sailing tour',
  'boat cruise',
  'sightseeing tour',
  'city tour',
  'city sightseeing',
  'cultural tour',
  'historical tour',
  'history tour',
  'wine tasting',
  'wine tour',
  'winery tour',
  'adventure tour',
  'adventure activities',
  'outdoor activities',
  'bike tour',
  'cycling tour',
  'bike rental',
  'nature tour',
  'nature walk',
  'nature experience',
  'art class',
  'art workshop',
  'craft workshop',
  'spa experience',
  'wellness experience',
  'nightlife tour',
  'pub crawl',
  'bar tour',
  'night tour',
  'photo tour',
  'photography tour',
  'family activities',
  'family tour',
  'kids activities',
  'hop on hop off',
  'bus tour',
  'museum tour',
  'museum tickets',
  'museum visit',
  'snorkeling tour',
  'diving experience',
  'scuba diving',
  'hiking tour',
  'hiking experience',
  'guided hike',
  'street food tour',
  'street food experience',
  'market tour',
  'food market tour',
  'shore excursion',
  'port excursion',
  'cruise excursion',
  'day trip',
  'day trips',
  'excursion',
];

/** Discovery phrases that signal destination-focused intent */
const DESTINATION_SIGNALS = [
  'things to do in',
  'what to do in',
  'best tours in',
  'activities in',
  'experiences in',
  'places to visit in',
  'what to see in',
  'attractions in',
  'tours in',
  'book activities in',
];

/** Informational signals that suggest blog content is the right landing page */
const BLOG_SIGNALS = [
  'best time to visit',
  'how to get to',
  'tips for',
  'guide to',
  'is it worth',
  'worth it',
  'how much does',
  'cost of',
  'budget for',
  'vs ',
  ' or ',
  'compare',
  'review of',
  'what to wear',
  'what to bring',
  'how long does',
];

/** Audience signals that suggest a curated collection */
const AUDIENCE_SIGNALS = [
  'romantic',
  'couples',
  'honeymoon',
  'family',
  'kids',
  'children',
  'senior',
  'elderly',
  'solo',
  'group',
  'friends',
  'accessible',
  'wheelchair',
  'luxury',
  'budget',
  'free',
];

/** Seasonal signals that suggest a seasonal collection */
const SEASONAL_SIGNALS = [
  'christmas',
  'halloween',
  'easter',
  'new year',
  'valentine',
  'summer',
  'winter',
  'spring',
  'autumn',
  'fall',
  'festive',
  'holiday season',
];

/** Generic words to strip from keywords when building search queries */
const STRIP_WORDS = new Set([
  'book',
  'buy',
  'get',
  'find',
  'best',
  'top',
  'cheap',
  'affordable',
  'popular',
  'recommended',
  'tickets',
  'ticket',
  'online',
  'near me',
  'the',
  'a',
  'an',
  'in',
  'at',
  'for',
  'to',
  'of',
  'and',
  'or',
  'things',
  'do',
  'what',
  'where',
  'how',
]);

// --- Keyword Classification --------------------------------------------------

type KeywordPageAffinity =
  | 'BLOG'
  | 'COLLECTION'
  | 'DESTINATION'
  | 'CATEGORY'
  | 'EXPERIENCES_FILTERED'
  | 'EXPERIENCE_DETAIL';

/**
 * Classifies a keyword's page type affinity based on linguistic patterns.
 * Priority: Blog > Collection > Destination > Category > Filtered > Detail
 */
export function classifyKeywordPageType(
  keyword: string,
  intent: string,
  location: string | null
): KeywordPageAffinity {
  const kw = keyword.toLowerCase();

  // 1. Blog: informational intent patterns
  if (intent === 'INFORMATIONAL' || BLOG_SIGNALS.some((s) => kw.includes(s))) {
    return 'BLOG';
  }

  // 2. Collection: audience or seasonal patterns
  if (
    AUDIENCE_SIGNALS.some((s) => kw.includes(s)) ||
    SEASONAL_SIGNALS.some((s) => kw.includes(s))
  ) {
    return 'COLLECTION';
  }

  // 3. Destination: discovery phrases with a location
  const hasDiscoveryPhrase = DESTINATION_SIGNALS.some((s) => kw.includes(s));
  const hasCategory = CATEGORY_STEMS.some((s) => kw.includes(s));

  if (hasDiscoveryPhrase && !hasCategory) {
    return 'DESTINATION';
  }

  // 4. Category: matches known category stems without a location
  if (hasCategory && !location) {
    return 'CATEGORY';
  }

  // 5. Destination + Category combo → filtered listing
  if (hasCategory && location) {
    return 'EXPERIENCES_FILTERED';
  }

  // 6. Default: filtered listing (with whatever params are available)
  return 'EXPERIENCES_FILTERED';
}

// --- Search Query Extraction -------------------------------------------------

/**
 * Strips location names and generic words from a keyword to produce
 * a clean search query for the Product Discovery API.
 *
 * Examples:
 * - "book london walking tour" → "walking tour"
 * - "best food tours paris" → "food tours"
 * - "things to do in london" → "" (empty — destination browse only)
 */
export function extractSearchQuery(keyword: string, location: string | null): string {
  let words = keyword.toLowerCase().split(/\s+/);

  // Remove location words
  if (location) {
    const locationWords = location.toLowerCase().split(/\s+/);
    words = words.filter((w) => !locationWords.includes(w));
  }

  // Remove generic words
  words = words.filter((w) => !STRIP_WORDS.has(w));

  // Remove leftover prepositions at start/end
  while (words.length > 0 && STRIP_WORDS.has(words[0]!)) words.shift();
  while (words.length > 0 && STRIP_WORDS.has(words[words.length - 1]!)) words.pop();

  return words.join(' ').trim();
}

// --- Page Cache Loading ------------------------------------------------------

/**
 * Batch-loads all published pages and collections for a set of sites and microsites.
 * Call once per bidding engine run, before the scoring loop.
 *
 * Pages are loaded by siteId (main site pages) and micrositeId (microsite pages).
 * Collections are loaded by micrositeId (collections belong to microsites).
 */
export async function loadPageCaches(
  siteIds: string[],
  micrositeIds: string[] = []
): Promise<{
  pagesBySite: Map<string, PageCacheEntry[]>;
  pagesByMicrosite: Map<string, PageCacheEntry[]>;
  collectionsByMicrosite: Map<string, CollectionCacheEntry[]>;
}> {
  const [sitePages, micrositePages, collections] = await Promise.all([
    // Pages belonging to main sites
    siteIds.length > 0
      ? prisma.page.findMany({
          where: { siteId: { in: siteIds }, status: 'PUBLISHED' },
          select: {
            siteId: true,
            slug: true,
            type: true,
            title: true,
            holibobLocationId: true,
            holibobCategoryId: true,
          },
        })
      : Promise.resolve([]),
    // Pages belonging to microsites
    micrositeIds.length > 0
      ? prisma.page.findMany({
          where: { micrositeId: { in: micrositeIds }, status: 'PUBLISHED' },
          select: {
            micrositeId: true,
            slug: true,
            type: true,
            title: true,
            holibobLocationId: true,
            holibobCategoryId: true,
          },
        })
      : Promise.resolve([]),
    // Collections (belong to microsites)
    micrositeIds.length > 0
      ? prisma.curatedCollection.findMany({
          where: { micrositeId: { in: micrositeIds }, isActive: true },
          select: {
            micrositeId: true,
            slug: true,
            name: true,
            collectionType: true,
            seasonalMonths: true,
            products: { select: { id: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const pagesBySite = new Map<string, PageCacheEntry[]>();
  for (const page of sitePages) {
    if (!page.siteId) continue;
    const existing = pagesBySite.get(page.siteId) || [];
    existing.push({
      siteId: page.siteId,
      slug: page.slug,
      type: page.type,
      title: page.title,
      holibobLocationId: page.holibobLocationId,
      holibobCategoryId: page.holibobCategoryId,
    });
    pagesBySite.set(page.siteId, existing);
  }

  const pagesByMicrosite = new Map<string, PageCacheEntry[]>();
  for (const page of micrositePages) {
    if (!page.micrositeId) continue;
    const existing = pagesByMicrosite.get(page.micrositeId) || [];
    existing.push({
      siteId: page.micrositeId, // Use micrositeId as the siteId key for downstream compatibility
      slug: page.slug,
      type: page.type,
      title: page.title,
      holibobLocationId: page.holibobLocationId,
      holibobCategoryId: page.holibobCategoryId,
    });
    pagesByMicrosite.set(page.micrositeId, existing);
  }

  const collectionsByMicrosite = new Map<string, CollectionCacheEntry[]>();
  for (const col of collections) {
    const existing = collectionsByMicrosite.get(col.micrositeId) || [];
    existing.push({
      micrositeId: col.micrositeId,
      slug: col.slug,
      name: col.name,
      collectionType: col.collectionType,
      seasonalMonths: col.seasonalMonths,
      productCount: col.products.length,
    });
    collectionsByMicrosite.set(col.micrositeId, existing);
  }

  return { pagesBySite, pagesByMicrosite, collectionsByMicrosite };
}

// --- Landing Page Routing (Main Entry Point) ---------------------------------

/**
 * Determines the best landing page URL for a keyword based on site type,
 * available pages, and API constraints.
 */
export function buildLandingPageUrl(
  domain: string,
  keyword: string,
  intent: string,
  location: string | null,
  context: LandingPageContext
): LandingPageResult {
  // --- FAST EXITS ---

  // 1. Branded/navigational → homepage (all site types)
  if (intent === 'NAVIGATIONAL') {
    return { url: `https://${domain}`, path: '/', type: 'HOMEPAGE', validated: true };
  }

  // 2. Small catalogs (<50 products) → homepage
  if (context.cachedProductCount != null && context.cachedProductCount < 50) {
    return { url: `https://${domain}`, path: '/', type: 'HOMEPAGE', validated: true };
  }

  // 3. PRODUCT_SPOTLIGHT microsites → always homepage (single product)
  if (context.micrositeEntityType === 'PRODUCT') {
    return { url: `https://${domain}`, path: '/', type: 'HOMEPAGE', validated: true };
  }

  // --- SUPPLIER MICROSITES (Product List API) ---
  if (context.siteType === 'SUPPLIER_MICROSITE') {
    return buildSupplierMicrositeLandingPage(domain, keyword, location, context);
  }

  // --- MAIN SITES & OPPORTUNITY MICROSITES (Product Discovery API) ---
  return buildDiscoveryLandingPage(domain, keyword, intent, location, context);
}

// --- Supplier Microsite Routing (Product List API) ---------------------------

/**
 * Routes keywords for supplier microsites. ONLY uses paths compatible with
 * the Product List by Provider API (never /destinations/ or /categories/).
 */
function buildSupplierMicrositeLandingPage(
  domain: string,
  keyword: string,
  location: string | null,
  context: LandingPageContext
): LandingPageResult {
  const kw = keyword.toLowerCase();
  const url = new URL(`https://${domain}/experiences`);
  let hasFilter = false;

  // Match keyword to supplier's cities
  const cityMatch = context.supplierCities?.find((city) => kw.includes(city.toLowerCase()));
  if (cityMatch) {
    url.searchParams.set('cities', cityMatch);
    hasFilter = true;
  }

  // Match keyword to supplier's categories
  const categoryMatch = context.supplierCategories?.find((cat) => kw.includes(cat.toLowerCase()));
  if (categoryMatch) {
    url.searchParams.set('categories', categoryMatch);
    hasFilter = true;
  }

  // If no filters matched, homepage is safest — shows all supplier products
  if (!hasFilter) {
    return { url: `https://${domain}`, path: '/', type: 'HOMEPAGE', validated: true };
  }

  return {
    url: url.toString(),
    path: url.pathname + url.search,
    type: 'EXPERIENCES_FILTERED',
    validated: false, // Needs product count validation
  };
}

// --- Discovery Landing Page Routing (Product Discovery API) ------------------

/**
 * Routes keywords for main sites and opportunity microsites.
 * Can route to /destinations/, /categories/, /collections/, /blog/, or /experiences?.
 */
function buildDiscoveryLandingPage(
  domain: string,
  keyword: string,
  intent: string,
  location: string | null,
  context: LandingPageContext
): LandingPageResult {
  const kw = keyword.toLowerCase();
  const affinity = classifyKeywordPageType(keyword, intent, location);

  // Try matching to dedicated pages in priority order
  switch (affinity) {
    case 'BLOG': {
      const post = context.sitePages.find(
        (p) => p.type === 'BLOG' && keywordMatchesBlogTitle(kw, p.title)
      );
      if (post) {
        const slug = post.slug.startsWith('blog/') ? post.slug.substring(5) : post.slug;
        return {
          url: `https://${domain}/blog/${slug}`,
          path: `/blog/${slug}`,
          type: 'BLOG',
          validated: true, // Blog posts don't need product validation
        };
      }
      break;
    }

    case 'COLLECTION': {
      const currentMonth = new Date().getMonth() + 1;
      const collection = context.collections.find((c) => {
        // Must have enough products
        if (c.productCount < 3) return false;
        // Check seasonal relevance
        if (c.seasonalMonths?.length && !c.seasonalMonths.includes(currentMonth)) return false;
        // Match collection name to keyword
        return (
          kw.includes(c.name.toLowerCase()) ||
          c.name.toLowerCase().includes(extractSearchQuery(keyword, location))
        );
      });
      if (collection) {
        return {
          url: `https://${domain}/collections/${collection.slug}`,
          path: `/collections/${collection.slug}`,
          type: 'COLLECTION',
          validated: true, // Product count already checked
          productCount: collection.productCount,
        };
      }
      break;
    }

    case 'DESTINATION': {
      const page = context.sitePages.find(
        (p) => p.type === 'LANDING' && p.holibobLocationId && kw.includes(p.title.toLowerCase())
      );
      if (page) {
        return {
          url: `https://${domain}/destinations/${page.slug}`,
          path: `/destinations/${page.slug}`,
          type: 'DESTINATION',
          validated: false, // Needs Product Discovery validation
        };
      }
      break;
    }

    case 'CATEGORY': {
      const page = context.sitePages.find(
        (p) => p.type === 'CATEGORY' && p.holibobCategoryId && keywordMatchesCategory(kw, p.title)
      );
      if (page) {
        return {
          url: `https://${domain}/categories/${page.slug}`,
          path: `/categories/${page.slug}`,
          type: 'CATEGORY',
          validated: false, // Needs Product Discovery validation
        };
      }
      break;
    }
  }

  // Fallback: filtered experiences listing
  const url = new URL(`https://${domain}/experiences`);
  if (location) url.searchParams.set('destination', location);
  const searchQuery = extractSearchQuery(keyword, location);
  if (searchQuery) url.searchParams.set('q', searchQuery);

  return {
    url: url.toString(),
    path: url.pathname + url.search,
    type: 'EXPERIENCES_FILTERED',
    validated: false,
  };
}

// --- Matching Helpers --------------------------------------------------------

/**
 * Checks if a keyword matches a blog post title.
 * Uses a loose match: at least 2 significant words from keyword appear in title.
 */
function keywordMatchesBlogTitle(keyword: string, title: string): boolean {
  const titleLower = title.toLowerCase();
  const kwWords = keyword.split(/\s+/).filter((w) => !STRIP_WORDS.has(w) && w.length > 2);
  const matchCount = kwWords.filter((w) => titleLower.includes(w)).length;
  return matchCount >= 2;
}

/**
 * Checks if a keyword matches a category page title.
 * At least one category stem in the keyword must appear in the title.
 */
function keywordMatchesCategory(keyword: string, title: string): boolean {
  const titleLower = title.toLowerCase();
  return CATEGORY_STEMS.some(
    (stem) => keyword.includes(stem) && titleLower.includes(stem.split(' ')[0]!)
  );
}

// --- Landing Page Validation -------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  productCount: number;
  reason?: string;
}

/**
 * Validation cache — prevents redundant API calls for the same landing page.
 * Shared across a single bidding engine run.
 */
export class LandingPageValidator {
  private cache = new Map<string, ValidationResult>();
  private apiCallCount = 0;
  private readonly maxApiCalls: number;

  constructor(maxApiCalls = 100) {
    this.maxApiCalls = maxApiCalls;
  }

  /**
   * Validates that a landing page will show sufficient products.
   * Returns cached results when available and respects API call limits.
   */
  async validate(
    cacheKey: string,
    validateFn: () => Promise<ValidationResult>
  ): Promise<ValidationResult> {
    // Return cached result
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Respect API call limit
    if (this.apiCallCount >= this.maxApiCalls) {
      return { valid: true, productCount: -1, reason: 'VALIDATION_LIMIT_REACHED' };
    }

    this.apiCallCount++;

    try {
      const result = await validateFn();
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      // On API error, accept with unknown product count
      const fallback: ValidationResult = {
        valid: true,
        productCount: -1,
        reason: 'VALIDATION_API_ERROR',
      };
      this.cache.set(cacheKey, fallback);
      return fallback;
    }
  }

  /** Log validation failure as an AdAlert */
  async logValidationFailure(
    siteId: string,
    keyword: string,
    landingPagePath: string,
    landingPageType: string,
    productCount: number,
    reason: string,
    siteType: SiteType
  ): Promise<void> {
    await prisma.adAlert.create({
      data: {
        type: 'LANDING_PAGE_VALIDATION_FAILED',
        severity: 'WARNING',
        siteId,
        message: `Skipped campaign "${keyword}": landing page ${landingPagePath} has ${productCount} products (minimum 3 required). Reason: ${reason}`,
        details: { keyword, landingPagePath, landingPageType, productCount, reason, siteType },
      },
    });
  }

  get stats() {
    return {
      cached: this.cache.size,
      apiCalls: this.apiCallCount,
      maxApiCalls: this.maxApiCalls,
    };
  }
}

// --- Profitability Scoring Bonus ---------------------------------------------

/**
 * Returns a profitability score bonus (0-12) based on landing page type.
 * Higher bonus for dedicated pages that drive better Quality Score.
 */
export function getLandingPageBonus(type: LandingPageType): number {
  switch (type) {
    case 'DESTINATION':
    case 'CATEGORY':
      return 12; // Best: dedicated page with rich content + structured data
    case 'COLLECTION':
    case 'EXPERIENCE_DETAIL':
      return 10; // Great: focused, specific content
    case 'EXPERIENCES_FILTERED':
      return 8; // Good: relevant filtered results
    case 'BLOG':
      return 5; // OK: informational, lower conversion rate
    case 'HOMEPAGE':
    default:
      return 0; // No bonus: generic landing page
  }
}
