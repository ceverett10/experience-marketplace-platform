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
  minVolume: 100,
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
