import type { JobType } from '@experience-marketplace/database';

/**
 * Job payload types for each JobType from Prisma schema
 */

// Content Generation Jobs
export interface ContentGeneratePayload {
  siteId?: string; // For Site-based content generation
  micrositeId?: string; // For MicrositeConfig-based content generation
  pageId?: string; // If provided, update existing page instead of creating new one
  opportunityId?: string;
  contentType: 'destination' | 'experience' | 'category' | 'blog' | 'about' | 'faq';
  targetKeyword: string;
  secondaryKeywords?: string[];
  destination?: string;
  category?: string;
  targetLength?: { min: number; max: number };
  sourceData?: {
    questions?: string[]; // For FAQ generation
    contentSubtype?: string; // For comparison/seasonal/guide content
    comparedItems?: string[]; // For comparison content
    comparisonType?: string; // For comparison content
    season?: string; // For seasonal content
    year?: number; // For seasonal content
    location?: string; // For guide content
    event?: string; // For seasonal/event content
    [key: string]: unknown;
  };
}

export interface ContentOptimizePayload {
  siteId: string;
  pageId?: string; // Optional — when omitted, all content for site is optimized (batch mode)
  contentId?: string; // Optional — when omitted, all content for site is optimized (batch mode)
  reason?:
    | 'low_ctr'
    | 'position_drop'
    | 'high_bounce'
    | 'low_time'
    | 'no_bookings'
    | 'initial_seo'
    | 'thin_content'
    | 'keyword_optimization'
    | 'snippet_optimization';
  performanceData?: {
    ctr?: number;
    position?: number;
    bounceRate?: number;
    timeOnPage?: number;
    // For thin_content expansion
    currentWordCount?: number;
    targetWordCount?: number;
  };
  /** SEO issue ID that triggered this optimization (for auto-resolution tracking) */
  seoIssueId?: string;
  /** Additional optimization context from SEO issue metadata */
  optimizationContext?: Record<string, unknown>;
}

export interface ContentReviewPayload {
  siteId: string;
  contentId?: string; // Optional — when omitted, all content for site is reviewed (batch mode)
  qualityScore?: number;
  issues?: Array<{ type: string; severity: string; description: string }>;
}

// SEO Jobs
export interface SeoAnalyzePayload {
  siteId: string;
  pageIds?: string[];
  fullSiteAudit?: boolean;
  triggerOptimizations?: boolean;
  forceAudit?: boolean;
}

export interface SeoOpportunityScanPayload {
  siteId?: string;
  destinations?: string[];
  categories?: string[];
  forceRescan?: boolean;
  useRecursiveOptimization?: boolean; // Default: true - use integrated multi-mode + recursive optimization
  // Scan version: 'standard' = full scan (~$2.20), 'quick' = reduced scan (~$0.50)
  scanVersion?: 'standard' | 'quick';
  // Convenience fields (override optimizationConfig)
  maxIterations?: number;
  initialSuggestionsCount?: number;
  optimizationConfig?: {
    maxIterations?: number; // Default: 5
    initialSuggestionsCount?: number; // Default: 20
    seedModes?: ScanMode[]; // Which modes to include in seed generation
  };
}

// Scan mode types for opportunity identification
export type ScanMode =
  | 'hyper_local' // "london food tours"
  | 'generic_activity' // "food tours" (no location)
  | 'demographic' // "family travel experiences"
  | 'occasion' // "bachelor party activities"
  | 'experience_level' // "luxury wine tours"
  | 'regional' // "european city breaks"
  | 'thematic'; // "harry potter tour", "friends experiences" - pop culture/fandom

// Seed opportunity structure for multi-mode scanning
export interface OpportunitySeed {
  keyword: string;
  clusterKeywords?: string[]; // Related search terms for keyword cluster volume estimation
  destination?: string; // undefined for generic/demographic/occasion
  category: string;
  niche: string;
  scanMode: ScanMode;
  rationale: string;
  inventoryCount: number;
  destinationCount?: number; // For generic/regional - how many destinations have inventory
}

// Inventory landscape for AI-driven opportunity discovery
export interface InventoryLandscape {
  totalCountries: number;
  totalCities: number;
  totalCategories: number;
  topDestinations: Array<{ name: string; country: string; productCount: number }>;
  categories: Array<{ name: string; productCount: number }>;
  productSamples: Array<{
    city: string;
    country: string;
    productCount: number;
    sampleProducts: Array<{ name: string; category?: string; tags?: string[] }>;
  }>;
}

export interface SeoOpportunityOptimizePayload {
  siteId?: string;
  maxIterations?: number;
  destinationFocus?: string[];
  categoryFocus?: string[];
  budgetLimit?: number;
}

// SEO Health & Recursive Optimization Jobs
export interface SeoHealthAuditPayload {
  siteId: string;
  triggerOptimizations?: boolean;
  forceAudit?: boolean;
}

export interface SeoAutoOptimizePayload {
  siteId: string;
  scope?: 'all' | 'metadata' | 'structured-data' | 'content';
}

export interface SeoRecursiveOptimizePayload {
  siteId: string;
  pageId: string;
  reason: string;
  iteration: number;
  previousScore?: number;
  targetScore: number;
}

export interface SeoBatchOptimizePayload {
  siteId: string;
  maxPages?: number;
  urgencyFilter?: 'high' | 'medium' | 'low' | 'all';
}

export interface GscSyncPayload {
  siteId: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  dimensions?: ('query' | 'page' | 'country' | 'device')[];
}

export interface GscSetupPayload {
  siteId: string;
  domain: string;
  cloudflareZoneId: string;
}

export interface GA4SetupPayload {
  siteId: string;
  accountId?: string; // Optional - if not provided, uses first available account
}

export interface MicrositeGscSyncPayload {
  micrositeId?: string; // Optional - if not provided, syncs all active microsites
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export interface MicrositeAnalyticsSyncPayload {
  micrositeId?: string; // Optional - if not provided, syncs all active microsites
  date?: string; // YYYY-MM-DD, defaults to yesterday
}

export interface MicrositeGA4SyncPayload {
  micrositeId?: string; // Optional - if not provided, syncs all active microsites
  date?: string; // YYYY-MM-DD, defaults to yesterday
}

// Site Management Jobs
export interface SiteCreatePayload {
  opportunityId: string;
  domain?: string;
  brandConfig?: {
    name: string;
    tagline?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    font?: string;
    logoUrl?: string;
  };
  autoPublish?: boolean;
}

export interface SiteDeployPayload {
  siteId: string;
  environment: 'staging' | 'production';
  deploymentConfig?: Record<string, unknown>;
}

export interface DomainRegisterPayload {
  siteId: string;
  domain: string;
  registrar: 'namecheap' | 'cloudflare' | 'google';
  autoRenew?: boolean;
}

export interface DomainVerifyPayload {
  domainId: string;
  verificationMethod: 'dns' | 'http';
}

export interface SslProvisionPayload {
  domainId: string;
  provider: 'letsencrypt' | 'cloudflare';
}

// Analytics Jobs
export interface MetricsAggregatePayload {
  siteId?: string;
  date?: string; // YYYY-MM-DD
  aggregationType: 'daily' | 'weekly' | 'monthly';
}

export interface PerformanceReportPayload {
  siteId?: string;
  reportType: 'daily' | 'weekly' | 'monthly';
  recipients?: string[];
}

// A/B Testing Jobs
export interface ABTestAnalyzePayload {
  abTestId: string;
  minSamples?: number;
  confidenceLevel?: number;
}

export interface ABTestRebalancePayload {
  abTestId: string;
  algorithm: 'thompson_sampling' | 'epsilon_greedy';
}

// Link Building Jobs
export interface LinkOpportunityScanPayload {
  siteId: string;
  competitorDomains?: string[];
  maxOpportunities?: number;
}

export interface LinkBacklinkMonitorPayload {
  siteId: string;
  checkExisting?: boolean;
  discoverNew?: boolean;
}

export interface LinkOutreachGeneratePayload {
  siteId: string;
  opportunityId: string;
  templateType: 'guest_post' | 'resource_page' | 'broken_link';
}

export interface LinkAssetGeneratePayload {
  siteId: string;
  assetType:
    | 'statistics_roundup'
    | 'comprehensive_guide'
    | 'infographic_data'
    | 'original_research';
  targetKeyword: string;
  destination?: string;
}

// Microsite Management Jobs
export interface MicrositeCreatePayload {
  supplierId?: string;
  productId?: string;
  parentDomain: string; // e.g., 'experiencess.com'
}

export interface MicrositeBrandGeneratePayload {
  micrositeId: string;
}

export interface MicrositeContentGeneratePayload {
  micrositeId: string;
  contentTypes: ('homepage' | 'about' | 'experiences' | 'blog')[];
  isRefresh?: boolean;
}

export interface MicrositePublishPayload {
  micrositeId: string;
}

export interface MicrositeArchivePayload {
  micrositeId: string;
  reason?: string;
}

export interface MicrositeHealthCheckPayload {
  micrositeId?: string; // If omitted, check all microsites
}

// Holibob Sync Jobs
export interface SupplierSyncPayload {
  /** Force sync even if recently synced */
  forceSync?: boolean;
  /** Maximum cities to scan for suppliers */
  maxCities?: number;
  /** Maximum products per city to scan */
  maxProductsPerCity?: number;
}

export interface ProductSyncPayload {
  /** Specific supplier IDs to sync (if not provided, syncs all) */
  supplierIds?: string[];
  /** Maximum products per supplier to sync */
  maxProductsPerSupplier?: number;
  /** Force sync even if recently synced */
  forceSync?: boolean;
  /** Only sync products older than this many hours */
  staleSyncThresholdHours?: number;
}

// Social Media Jobs
export interface SocialDailyPostingPayload {
  siteId?: string; // Optional - if provided, only process this site
}

export interface SocialPostGeneratePayload {
  siteId: string;
  platform: 'PINTEREST' | 'FACEBOOK' | 'TWITTER';
  pageId?: string; // Optional - specific blog post to promote
  contentType?: 'blog_promo' | 'engagement' | 'travel_tip'; // Content variation
}

export interface SocialPostPublishPayload {
  socialPostId: string;
}

// Paid Traffic Acquisition Jobs
export interface AdCampaignSyncPayload {
  campaignId?: string; // If omitted, sync all active campaigns
  platform?: 'PINTEREST' | 'FACEBOOK' | 'GOOGLE_DISPLAY' | 'BING' | 'OUTBRAIN' | 'REDDIT';
}

export interface AdPerformanceReportPayload {
  siteId?: string; // If omitted, report across all sites
  dateRange?: { start: string; end: string }; // YYYY-MM-DD
}

export interface AdBudgetOptimizerPayload {
  siteId?: string; // If omitted, optimize across all sites
  maxCpc?: number; // Override default $0.10 cap
}

export interface PaidKeywordScanPayload {
  siteId?: string; // Optional — 'all' for cross-site scan
  maxCpc?: number; // Default: 3.00
  minVolume?: number; // Default: 100
  modes?: ('gsc' | 'expansion' | 'discovery' | 'pinterest' | 'meta')[]; // Default: all five
}

export interface BiddingEngineRunPayload {
  mode?: 'full' | 'optimize_only' | 'report_only';
  maxDailyBudget?: number; // Default: £200/day
}

/**
 * Union type of all job payloads
 */
export type JobPayload =
  | ContentGeneratePayload
  | ContentOptimizePayload
  | ContentReviewPayload
  | SeoAnalyzePayload
  | SeoAutoOptimizePayload
  | SeoOpportunityScanPayload
  | SeoOpportunityOptimizePayload
  | SeoHealthAuditPayload
  | SeoRecursiveOptimizePayload
  | SeoBatchOptimizePayload
  | GscSyncPayload
  | GscSetupPayload
  | GA4SetupPayload
  | SiteCreatePayload
  | SiteDeployPayload
  | DomainRegisterPayload
  | DomainVerifyPayload
  | SslProvisionPayload
  | MetricsAggregatePayload
  | PerformanceReportPayload
  | ABTestAnalyzePayload
  | ABTestRebalancePayload
  | LinkOpportunityScanPayload
  | LinkBacklinkMonitorPayload
  | LinkOutreachGeneratePayload
  | LinkAssetGeneratePayload
  | MicrositeCreatePayload
  | MicrositeBrandGeneratePayload
  | MicrositeContentGeneratePayload
  | MicrositePublishPayload
  | MicrositeArchivePayload
  | MicrositeHealthCheckPayload
  | MicrositeGscSyncPayload
  | MicrositeAnalyticsSyncPayload
  | MicrositeGA4SyncPayload
  | SupplierSyncPayload
  | ProductSyncPayload
  | SocialDailyPostingPayload
  | SocialPostGeneratePayload
  | SocialPostPublishPayload
  | AdCampaignSyncPayload
  | AdPerformanceReportPayload
  | AdBudgetOptimizerPayload
  | PaidKeywordScanPayload
  | BiddingEngineRunPayload;

/**
 * Job configuration options
 */
export interface JobOptions {
  priority?: number; // 1-10, default 5
  delay?: number; // milliseconds
  attempts?: number; // retry attempts, default 3
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  removeOnComplete?: boolean | number; // true, false, or keep last N
  removeOnFail?: boolean | number;
}

/**
 * Job result structure
 */
export interface JobResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
  errorCategory?: string;
  errorSeverity?: string;
  retryable?: boolean;
  timestamp: Date;
}

/**
 * Queue names mapped to job types
 */
export const QUEUE_NAMES = {
  // Content
  CONTENT: 'content',

  // SEO
  SEO: 'seo',
  GSC: 'gsc',

  // Site Management
  SITE: 'site',
  DOMAIN: 'domain',

  // Analytics
  ANALYTICS: 'analytics',

  // A/B Testing
  ABTEST: 'abtest',

  // Microsite & Sync (long-running jobs)
  SYNC: 'sync',
  MICROSITE: 'microsite',

  // Social Media
  SOCIAL: 'social',

  // Paid Traffic
  ADS: 'ads',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Map job types to queue names
 */
export const JOB_TYPE_TO_QUEUE: Record<JobType, QueueName> = {
  CONTENT_GENERATE: QUEUE_NAMES.CONTENT,
  CONTENT_OPTIMIZE: QUEUE_NAMES.CONTENT,
  CONTENT_REVIEW: QUEUE_NAMES.CONTENT,
  SEO_ANALYZE: QUEUE_NAMES.SEO,
  SEO_AUTO_OPTIMIZE: QUEUE_NAMES.SEO,
  SEO_OPPORTUNITY_SCAN: QUEUE_NAMES.SEO,
  SEO_OPPORTUNITY_OPTIMIZE: QUEUE_NAMES.SEO,
  GSC_SYNC: QUEUE_NAMES.GSC,
  GSC_VERIFY: QUEUE_NAMES.GSC,
  GSC_SETUP: QUEUE_NAMES.GSC,
  GA4_SETUP: QUEUE_NAMES.ANALYTICS,
  SITE_CREATE: QUEUE_NAMES.SITE,
  SITE_DEPLOY: QUEUE_NAMES.SITE,
  DOMAIN_REGISTER: QUEUE_NAMES.DOMAIN,
  DOMAIN_VERIFY: QUEUE_NAMES.DOMAIN,
  SSL_PROVISION: QUEUE_NAMES.DOMAIN,
  METRICS_AGGREGATE: QUEUE_NAMES.ANALYTICS,
  PERFORMANCE_REPORT: QUEUE_NAMES.ANALYTICS,
  ABTEST_ANALYZE: QUEUE_NAMES.ABTEST,
  ABTEST_REBALANCE: QUEUE_NAMES.ABTEST,
  LINK_OPPORTUNITY_SCAN: QUEUE_NAMES.SEO,
  LINK_BACKLINK_MONITOR: QUEUE_NAMES.SEO,
  LINK_OUTREACH_GENERATE: QUEUE_NAMES.SEO,
  LINK_ASSET_GENERATE: QUEUE_NAMES.SEO,

  // Microsite Management
  MICROSITE_CREATE: QUEUE_NAMES.MICROSITE,
  MICROSITE_BRAND_GENERATE: QUEUE_NAMES.MICROSITE,
  MICROSITE_CONTENT_GENERATE: QUEUE_NAMES.CONTENT, // Uses content queue for AI generation
  MICROSITE_PUBLISH: QUEUE_NAMES.MICROSITE,
  MICROSITE_ARCHIVE: QUEUE_NAMES.MICROSITE,
  MICROSITE_HEALTH_CHECK: QUEUE_NAMES.MICROSITE,

  // Holibob Sync (long-running)
  SUPPLIER_SYNC: QUEUE_NAMES.SYNC,
  SUPPLIER_SYNC_INCREMENTAL: QUEUE_NAMES.SYNC,
  PRODUCT_SYNC: QUEUE_NAMES.SYNC,
  PRODUCT_SYNC_INCREMENTAL: QUEUE_NAMES.SYNC,

  // Analytics (scheduled jobs)
  GA4_DAILY_SYNC: QUEUE_NAMES.ANALYTICS,
  REFRESH_ANALYTICS_VIEWS: QUEUE_NAMES.ANALYTICS,
  MICROSITE_GSC_SYNC: QUEUE_NAMES.ANALYTICS,
  MICROSITE_ANALYTICS_SYNC: QUEUE_NAMES.ANALYTICS,
  MICROSITE_GA4_SYNC: QUEUE_NAMES.ANALYTICS,

  // Social Media
  SOCIAL_POST_GENERATE: QUEUE_NAMES.SOCIAL,
  SOCIAL_POST_PUBLISH: QUEUE_NAMES.SOCIAL,
  SOCIAL_DAILY_POSTING: QUEUE_NAMES.SOCIAL,

  // Scheduled Maintenance (setInterval-based, tracked for admin visibility)
  // These don't use BullMQ queues but need a mapping for type completeness
  META_TITLE_MAINTENANCE: QUEUE_NAMES.CONTENT,
  MICROSITE_CONTENT_REFRESH: QUEUE_NAMES.CONTENT,
  MICROSITE_SITEMAP_RESUBMIT: QUEUE_NAMES.MICROSITE,
  COLLECTION_REFRESH: QUEUE_NAMES.CONTENT,
  AUTONOMOUS_ROADMAP: QUEUE_NAMES.SITE,

  // Paid Traffic Acquisition
  AD_CAMPAIGN_SYNC: QUEUE_NAMES.ADS,
  AD_PERFORMANCE_REPORT: QUEUE_NAMES.ADS,
  AD_BUDGET_OPTIMIZER: QUEUE_NAMES.ADS,
  PAID_KEYWORD_SCAN: QUEUE_NAMES.ADS,
  BIDDING_ENGINE_RUN: QUEUE_NAMES.ADS,
};
