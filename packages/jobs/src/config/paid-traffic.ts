/**
 * Shared configuration for the paid traffic pipeline.
 *
 * Single source of truth for all constants used across:
 *   - Bidding engine (scoring, profitability, budget allocation)
 *   - Budget optimizer (pause/scale thresholds)
 *   - Ad alerting (overspend detection)
 *   - Keyword scanner (CPC/volume thresholds)
 *   - Keyword enrichment (seed limits, cost caps)
 *   - Scheduler (payload defaults)
 *   - Admin API routes (budget display)
 *
 * All values can be overridden via environment variables where noted.
 */
export const PAID_TRAFFIC_CONFIG = {
  // ---------------------------------------------------------------------------
  // Portfolio budget
  // ---------------------------------------------------------------------------
  /** Total daily spend cap across all campaigns. Env: BIDDING_MAX_DAILY_BUDGET */
  maxDailyBudget: parseFloat(process.env['BIDDING_MAX_DAILY_BUDGET'] || '1200'),
  /** Max daily budget for a single campaign (scaling cap) */
  maxPerCampaignBudget: 50,
  /** Minimum daily budget per campaign (Meta requires ~£1, Google ~$1) */
  minDailyBudget: 1.0,
  /** Ad platforms to create new campaigns for. Env: ENABLED_AD_PLATFORMS */
  enabledPlatforms: (process.env['ENABLED_AD_PLATFORMS'] || 'GOOGLE_SEARCH')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as ('FACEBOOK' | 'GOOGLE_SEARCH')[],

  // ---------------------------------------------------------------------------
  // ROAS thresholds
  // ---------------------------------------------------------------------------
  /** Target ROAS for the bidding engine (1.0 = break-even, prioritise volume) */
  targetRoas: 1.0,
  /** Pause campaigns below this ROAS after observation period */
  roasPauseThreshold: 0.5,
  /** Scale up campaigns above this ROAS */
  roasScaleThreshold: 2.0,

  // ---------------------------------------------------------------------------
  // Budget optimizer
  // ---------------------------------------------------------------------------
  /** Minimum days of data before pausing underperformers */
  observationDays: 7,
  /** Budget increase per optimisation cycle (15%) */
  scaleIncrement: 0.15,

  // ---------------------------------------------------------------------------
  // Profitability defaults (when no real booking/analytics data)
  // ---------------------------------------------------------------------------
  defaults: {
    /** Average order value in GBP */
    aov: 197,
    /** Holibob commission rate (%) */
    commissionRate: 18,
    /** Conversion rate (decimal) — 1.5% */
    cvr: 0.015,
  },

  /** Domains excluded from bidding — no keyword generation or profitability scoring */
  excludedDomains: ['broke-nomad.com', 'grad-trip.com'] as string[],

  // ---------------------------------------------------------------------------
  // Keyword scanning / enrichment
  // ---------------------------------------------------------------------------
  /** Max CPC threshold for keyword discovery */
  maxCpc: 3.0,
  /** Minimum monthly search volume for keyword discovery */
  minVolume: 50,
  /** Max keyword seeds per supplier in enrichment */
  maxSeedsPerSupplier: 100,
  /** USD safety cap for DataForSEO spend per enrichment run */
  enrichmentCostLimit: 350,

  // ---------------------------------------------------------------------------
  // Search term harvesting
  // ---------------------------------------------------------------------------
  /** Min spend (GBP) on a zero-conversion search term before auto-excluding */
  searchTermExcludeSpendThreshold: 1.0,
  /** Min clicks on a zero-conversion search term before auto-excluding */
  searchTermExcludeClickThreshold: 2,

  // ---------------------------------------------------------------------------
  // Meta consolidated campaigns (CBO with lowest-cost bidding)
  // ---------------------------------------------------------------------------
  metaConsolidated: {
    objective: 'OUTCOME_SALES',
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP' as const,
    roasFloor: undefined, // Phase 1: no ROAS constraint, maximize learning
    optimizationGoal: 'OFFSITE_CONVERSIONS',
    cboEnabled: true,
    /** Extended learning phase for CBO campaigns */
    learningPhaseDays: 14,
    /** Fast-fail: pause ad set after this spend with 0 conversions */
    fastFailSpend: 50,
    /** Max budget per consolidated campaign */
    maxPerCampaignBudget: 100,

    /** Keyword patterns → campaign group mapping (first match wins — order matters) */
    categoryPatterns: {
      // Branded sites (exact match first)
      'Branded – Harry Potter Tours': ['harry potter'],
      'Branded – London Food Tours': ['london food tour'],
      // New niche groups (before broader groups to avoid mis-classification)
      'Wine & Vineyard': ['wine tour', 'wine tasting', 'vineyard'],
      'Attractions & Tickets': ['attraction ticket', 'skip the line', 'hop on hop off'],
      'Wellness & Spa': ['wellness', 'yoga tour', 'meditation', 'spa experience'],
      'Parties & Groups': ['bachelorette', 'hen party', 'group activit'],
      'Romantic & Honeymoon': ['romantic', 'couples tour', 'honeymoon'],
      // Broad category groups
      'Adventure & Outdoor': [
        'adventure',
        'hiking',
        'safari',
        'trek',
        'outdoor',
        'climb',
        'expedition',
        'wildlife',
        'atv',
        'cycling',
        'horse riding',
      ],
      'Food, Drink & Culinary': [
        'food tour',
        'culinary',
        'cooking class',
        'gastro',
        'street food',
        'beer tour',
        'dining',
      ],
      'Boats, Sailing & Water': [
        'boat',
        'sailing',
        'yacht',
        'cruise',
        'diving',
        'snorkel',
        'kayak',
        'surf',
        'water sport',
      ],
      'Transfers & Transport': [
        'transfer',
        'airport',
        'taxi',
        'shuttle',
        'limo',
        'chauffeur',
        'private car',
      ],
      'Cultural & Sightseeing': [
        'museum',
        'gallery',
        'history',
        'cultural',
        'sightseeing',
        'monument',
        'heritage',
        'walking tour',
        'city tour',
        'architecture',
      ],
    } as Record<string, string[]>,

    /** Profitability score threshold for General Tours Tier 1 vs Tier 2 */
    generalToursTier1Threshold: 50,

    /**
     * Negative keyword patterns for Google — keywords matching these are dropped.
     * These are terms that match category patterns but have no purchase intent.
     */
    googleNegativePatterns: [
      // Animals / nature facts (not bookable experiences)
      'goat climbing',
      'life history',
      'life story',
      'biography',
      'how to become',
      'how to learn',
      'diy ',
      'recipe',
      'ingredients',
      // Wrong activity category matches
      'skydiving phoenix', // not water-related
      'skydiving in phoenix',
      // Non-bookable informational
      'what is',
      'what are',
      'where is',
      'where are',
      'how much does',
      'how far is',
      'history of',
      'facts about',
      'wikipedia',
      'reddit',
      'youtube',
      'free ',
      'jobs ',
      'career',
      'salary',
      // Brand/company names (searches for specific companies, not bookable via us)
      'moana sailing',
      'calypso kayaking',
      'beachcomber cruises',
      'vancouver water adventures',
      'monkey adventures',
      'devour barcelona',
      'uber boat',
      'ninja food tours',
      // Informational / non-booking intent
      'tank scuba diving',
      'wildlife nature photography',
      'adventure out',
      'street food market',
      'trekking planner',
      // Navigational / informational (no booking intent)
      ' address',
      'car park',
      ' reviews',
      ' directions',
      'phone number',
      'opening hours',
      'opening times',
      'how to get to',
      ' map ',
    ] as string[],

    /** Campaign group → branded domain mapping for destination page ad sets */
    campaignGroupDomains: {
      'Food, Drink & Culinary': ['food-tour-guide.com'],
      'Boats, Sailing & Water': ['water-tours.com'],
      'Adventure & Outdoor': ['outdoorexploring.com'],
      'Cultural & Sightseeing': ['cultural-tours.com'],
      'Wine & Vineyard': ['winetravelcollective.com'],
      'Attractions & Tickets': ['attractionbooking.com'],
      'Wellness & Spa': ['zen-journeys.com'],
      'Parties & Groups': ['bachelorette-party-ideas.com'],
      'Romantic & Honeymoon': ['honeymoonexperiences.com'],
      'General Tours – Tier 1': ['experiencess.com'],
      'General Tours – Tier 2': ['experiencess.com'],
      'Branded – Harry Potter Tours': ['harry-potter-tours.com'],
      'Branded – London Food Tours': ['london-food-tours.com'],
      'Transfers & Transport': [],
    } as Record<string, string[]>,

    /** Country code → region mapping (for ad set assignment within General Tours) */
    regionMap: {
      // UK & Ireland
      GB: 'UK & Ireland',
      IE: 'UK & Ireland',
      // Europe
      DE: 'Europe',
      FR: 'Europe',
      ES: 'Europe',
      IT: 'Europe',
      NL: 'Europe',
      PT: 'Europe',
      AT: 'Europe',
      CH: 'Europe',
      SE: 'Europe',
      NO: 'Europe',
      DK: 'Europe',
      GR: 'Europe',
      CZ: 'Europe',
      PL: 'Europe',
      HU: 'Europe',
      HR: 'Europe',
      RO: 'Europe',
      BG: 'Europe',
      FI: 'Europe',
      BE: 'Europe',
      // Americas
      US: 'Americas',
      CA: 'Americas',
      MX: 'Americas',
      BR: 'Americas',
      AR: 'Americas',
      CO: 'Americas',
      PE: 'Americas',
      CL: 'Americas',
      // Asia-Pacific
      AU: 'Asia-Pacific',
      NZ: 'Asia-Pacific',
      JP: 'Asia-Pacific',
      TH: 'Asia-Pacific',
      SG: 'Asia-Pacific',
      ID: 'Asia-Pacific',
      MY: 'Asia-Pacific',
      VN: 'Asia-Pacific',
      KR: 'Asia-Pacific',
      IN: 'Asia-Pacific',
      PH: 'Asia-Pacific',
      // Middle East & Africa
      AE: 'Middle East & Africa',
      ZA: 'Middle East & Africa',
      MA: 'Middle East & Africa',
      EG: 'Middle East & Africa',
      KE: 'Middle East & Africa',
      TZ: 'Middle East & Africa',
      JO: 'Middle East & Africa',
      TR: 'Middle East & Africa',
    } as Record<string, string>,
  },

  // ---------------------------------------------------------------------------
  // Site-driven keyword generation config
  // ---------------------------------------------------------------------------
  /**
   * Maps each branded domain to:
   *   - stems: search-friendly keyword stems to combine with cities
   *   - holibobCategories: raw Holibob categories that confirm product inventory
   *   - minProducts: minimum products in a city before generating keywords
   *   - cityFilter: optional — restrict to specific cities (for city-specific sites)
   */
  siteKeywordConfig: {
    // ---- Category sites (global — all cities with inventory) ----
    'food-tour-guide.com': {
      stems: [
        'food tours',
        'cooking classes',
        'wine tasting',
        'street food tours',
        'beer tours',
        'dining experiences',
      ],
      holibobCategories: [
        'Food and Drink Tours',
        'Cooking Classes',
        'Wine Tasting',
        'Street Food Tours',
        'Beer Tours',
        'Dining Experience',
        'Food Tours',
        'Wine Tours',
      ],
      minProducts: 3,
    },
    'water-tours.com': {
      stems: [
        'boat tours',
        'boat',
        'sailing tours',
        'kayaking',
        'snorkeling tours',
        'diving tours',
        'water sports',
      ],
      holibobCategories: [
        'Watersports',
        'Boat',
        'Sailing',
        'Scuba Diving / Snorkelling',
        'Kayaking / Canoeing',
        'Cruise / Cruise Excursion',
      ],
      minProducts: 3,
    },
    'outdoorexploring.com': {
      stems: [
        'hiking tours',
        'safari tours',
        'ATV tours',
        'cycling tours',
        'horse riding',
        'wildlife tours',
      ],
      holibobCategories: [
        'Hiking',
        'Safari',
        'ATV / Quad Bike',
        'Biking / Cycling',
        'Horse Riding',
        'Wildlife',
      ],
      minProducts: 3,
    },
    'cultural-tours.com': {
      stems: [
        'walking tours',
        'city tours',
        'museum tours',
        'architecture tours',
        'sightseeing tours',
      ],
      holibobCategories: [
        'Walking',
        'City Tour',
        'Architecture',
        'Museum',
        'Culture',
        'Local tour',
      ],
      minProducts: 3,
    },
    'attractionbooking.com': {
      stems: ['attraction tickets', 'skip the line tickets', 'hop on hop off'],
      holibobCategories: ['Passes', 'Hop-on Hop-off'],
      minProducts: 3,
    },
    'winetravelcollective.com': {
      stems: ['wine tours', 'wine tasting tours', 'vineyard tours'],
      holibobCategories: ['Wine Tasting', 'Wine Tours'],
      minProducts: 3,
    },
    'honeymoonexperiences.com': {
      stems: ['romantic experiences', 'couples tours', 'honeymoon activities'],
      holibobCategories: ['Couples'],
      minProducts: 3,
    },

    // ---- City-specific sites (only their city) ----
    'london-food-tours.com': {
      stems: ['food tours', 'cooking classes', 'street food tours'],
      holibobCategories: [
        'Food and Drink Tours',
        'Cooking Classes',
        'Street Food Tours',
        'Food Tours',
      ],
      minProducts: 1,
      cityFilter: ['London'],
    },
    'paris-food-tours.com': {
      stems: ['food tours', 'cooking classes', 'street food tours'],
      holibobCategories: [
        'Food and Drink Tours',
        'Cooking Classes',
        'Street Food Tours',
        'Food Tours',
      ],
      minProducts: 1,
      cityFilter: ['Paris'],
    },
    'barcelona-food-tours.com': {
      stems: ['food tours', 'cooking classes', 'street food tours'],
      holibobCategories: [
        'Food and Drink Tours',
        'Cooking Classes',
        'Street Food Tours',
        'Food Tours',
      ],
      minProducts: 1,
      cityFilter: ['Barcelona'],
    },
    'new-york-food-tours.com': {
      stems: ['food tours', 'cooking classes', 'street food tours'],
      holibobCategories: [
        'Food and Drink Tours',
        'Cooking Classes',
        'Street Food Tours',
        'Food Tours',
      ],
      minProducts: 1,
      cityFilter: ['New York'],
    },
    'london-museum-tickets.com': {
      stems: ['museum tickets', 'museum tours', 'gallery tickets'],
      holibobCategories: ['Museum'],
      minProducts: 1,
      cityFilter: ['London'],
    },
    'new-york-museum-tickets.com': {
      stems: ['museum tickets', 'museum tours', 'gallery tickets'],
      holibobCategories: ['Museum'],
      minProducts: 1,
      cityFilter: ['New York'],
    },
    'harry-potter-tours.com': {
      stems: ['harry potter tours', 'harry potter experience'],
      holibobCategories: ['Themed'],
      minProducts: 1,
      cityFilter: ['London', 'Edinburgh'],
    },

    // ---- Audience sites (broader — general categories across all cities) ----
    // broke-nomad.com and grad-trip.com excluded — low AOV demographic
    'bachelorette-party-ideas.com': {
      stems: ['bachelorette party', 'hen party', 'group activities'],
      holibobCategories: ['Local tour', 'Food and Drink Tours', 'Cruise / Cruise Excursion'],
      minProducts: 5,
    },
    'zen-journeys.com': {
      stems: ['wellness retreats', 'yoga tours', 'meditation experiences', 'spa experiences'],
      holibobCategories: ['Local tour', 'Walking', 'Wildlife'],
      minProducts: 3,
    },
  } as Record<
    string,
    {
      stems: string[];
      holibobCategories: string[];
      minProducts: number;
      cityFilter?: string[];
    }
  >,

  // ---------------------------------------------------------------------------
  // Default negative keywords (applied to every new Google campaign)
  // ---------------------------------------------------------------------------
  defaultNegativeKeywords: [
    // Job seekers
    'job',
    'jobs',
    'career',
    'careers',
    'salary',
    'hiring',
    'recruit',
    'recruitment',
    'internship',
    'volunteer',
    'volunteering',
    'employment',
    // Freebie hunters
    'free',
    'gratis',
    'complimentary',
    'no cost',
    'freebie',
    // Info seekers (non-commercial)
    'diy',
    'how to',
    'tutorial',
    'wiki',
    'wikipedia',
    'reddit',
    'quora',
    'youtube',
    'tripadvisor',
    'blog',
    // Research & planning (top of funnel)
    'things to do',
    'what to see',
    'what to do',
    'itinerary',
    'planning',
    'ideas',
    'tips',
    'guide',
    // Discount code seekers
    'discount code',
    'coupon',
    'promo code',
    'voucher code',
    'groupon',
    // Complaints & reputation
    'review',
    'reviews',
    'complaint',
    'complaints',
    'scam',
    'refund',
    'cancel',
    'cancellation policy',
    // Non-commercial research
    'images',
    'photos',
    'pictures',
    'wallpaper',
    'map',
    'weather',
    'visa',
    'embassy',
    'history',
    'population',
    'language',
    'capital',
    'time zone',
    'currency',
    'safety',
    // Accommodation (wrong product type)
    'hotel',
    'hotels',
    'hostel',
    'airbnb',
    'accommodation',
    'resort',
    // Navigation / directions
    'directions',
    'address',
    'parking',
    'opening hours',
    'opening times',
    // Wrong product type
    'flight',
    'flights',
    'train tickets',
    'bus tickets',
    'ferry',
    'car rental',
    'car hire',
    'insurance',
    // Education / academic
    'essay',
    'assignment',
    'university',
    'school',
    'meaning',
    'definition',
    // Competitor / brand terms to avoid
    'viator',
    'getyourguide',
    'klook',
    'airbnb experiences',
    'tiktok',
  ],
};
