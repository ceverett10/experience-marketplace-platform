import type { JobType } from '@experience-marketplace/database';

/**
 * Job payload types for each JobType from Prisma schema
 */

// Content Generation Jobs
export interface ContentGeneratePayload {
  siteId: string;
  pageId?: string; // If provided, update existing page instead of creating new one
  opportunityId?: string;
  contentType: 'destination' | 'experience' | 'category' | 'blog' | 'about';
  targetKeyword: string;
  secondaryKeywords?: string[];
  destination?: string;
  category?: string;
  targetLength?: { min: number; max: number };
}

export interface ContentOptimizePayload {
  siteId: string;
  pageId: string;
  contentId: string;
  reason: 'low_ctr' | 'position_drop' | 'high_bounce' | 'low_time' | 'no_bookings';
  performanceData?: {
    ctr?: number;
    position?: number;
    bounceRate?: number;
    timeOnPage?: number;
  };
}

export interface ContentReviewPayload {
  siteId: string;
  contentId: string;
  qualityScore: number;
  issues: Array<{ type: string; severity: string; description: string }>;
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
  | 'regional'; // "european city breaks"

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
  | LinkAssetGeneratePayload;

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
};
