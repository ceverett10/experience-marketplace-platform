import type { JobType } from '@experience-marketplace/database';

/**
 * Job payload types for each JobType from Prisma schema
 */

// Content Generation Jobs
export interface ContentGeneratePayload {
  siteId: string;
  pageId?: string; // If provided, update existing page instead of creating new one
  opportunityId?: string;
  contentType: 'destination' | 'experience' | 'category' | 'blog';
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
}

export interface SeoOpportunityScanPayload {
  siteId?: string;
  destinations?: string[];
  categories?: string[];
  forceRescan?: boolean;
}

export interface SeoOpportunityOptimizePayload {
  siteId?: string;
  maxIterations?: number;
  destinationFocus?: string[];
  categoryFocus?: string[];
  budgetLimit?: number;
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

/**
 * Union type of all job payloads
 */
export type JobPayload =
  | ContentGeneratePayload
  | ContentOptimizePayload
  | ContentReviewPayload
  | SeoAnalyzePayload
  | SeoOpportunityScanPayload
  | SeoOpportunityOptimizePayload
  | GscSyncPayload
  | GscSetupPayload
  | SiteCreatePayload
  | SiteDeployPayload
  | DomainRegisterPayload
  | DomainVerifyPayload
  | SslProvisionPayload
  | MetricsAggregatePayload
  | PerformanceReportPayload
  | ABTestAnalyzePayload
  | ABTestRebalancePayload;

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
  SEO_OPPORTUNITY_SCAN: QUEUE_NAMES.SEO,
  SEO_OPPORTUNITY_OPTIMIZE: QUEUE_NAMES.SEO,
  GSC_SYNC: QUEUE_NAMES.GSC,
  GSC_VERIFY: QUEUE_NAMES.GSC,
  GSC_SETUP: QUEUE_NAMES.GSC,
  SITE_CREATE: QUEUE_NAMES.SITE,
  SITE_DEPLOY: QUEUE_NAMES.SITE,
  DOMAIN_REGISTER: QUEUE_NAMES.DOMAIN,
  DOMAIN_VERIFY: QUEUE_NAMES.DOMAIN,
  SSL_PROVISION: QUEUE_NAMES.DOMAIN,
  METRICS_AGGREGATE: QUEUE_NAMES.ANALYTICS,
  PERFORMANCE_REPORT: QUEUE_NAMES.ANALYTICS,
  ABTEST_ANALYZE: QUEUE_NAMES.ABTEST,
  ABTEST_REBALANCE: QUEUE_NAMES.ABTEST,
};
