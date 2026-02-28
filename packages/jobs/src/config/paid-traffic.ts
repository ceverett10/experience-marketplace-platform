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
  searchTermExcludeSpendThreshold: 2.0,
  /** Min clicks on a zero-conversion search term before auto-excluding */
  searchTermExcludeClickThreshold: 3,

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

    /** Keyword patterns → campaign group mapping */
    categoryPatterns: {
      'Branded – Harry Potter Tours': ['harry potter'],
      'Branded – London Food Tours': ['london food tour'],
      'Adventure & Outdoor': [
        'adventure',
        'hiking',
        'safari',
        'trek',
        'outdoor',
        'climb',
        'expedition',
        'wildlife',
      ],
      'Food, Drink & Culinary': [
        'food tour',
        'culinary',
        'wine tast',
        'cooking class',
        'gastro',
        'street food',
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
      ],
    } as Record<string, string[]>,

    /** Profitability score threshold for General Tours Tier 1 vs Tier 2 */
    generalToursTier1Threshold: 50,

    /** Campaign group → branded domain mapping for destination page ad sets */
    campaignGroupDomains: {
      'Food, Drink & Culinary': ['food-tour-guide.com'],
      'Boats, Sailing & Water': ['water-tours.com'],
      'Adventure & Outdoor': ['outdoorexploring.com'],
      'Cultural & Sightseeing': ['cultural-tours.com'],
      'General Tours – Tier 1': ['experiencess.com'],
      'General Tours – Tier 2': ['experiencess.com'],
      'Branded – Attraction Tickets': ['attractionbooking.com'],
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
    // Competitor / brand terms to avoid
    'viator',
    'getyourguide',
    'klook',
    'airbnb experiences',
    'tiktok',
  ],
};
