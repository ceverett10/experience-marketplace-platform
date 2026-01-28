import { z } from 'zod';

// ============================================================================
// Core Domain Types
// ============================================================================

export const StorefrontConfigSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  brandName: z.string(),
  niche: z.string(),
  description: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  socialLinks: z
    .object({
      facebook: z.string().url().optional(),
      instagram: z.string().url().optional(),
      twitter: z.string().url().optional(),
    })
    .optional(),
  seoConfig: z.object({
    titleTemplate: z.string(),
    defaultDescription: z.string(),
    keywords: z.array(z.string()),
  }),
  holibobPartnerId: z.string(),
  status: z.enum(['draft', 'active', 'paused', 'archived']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type StorefrontConfig = z.infer<typeof StorefrontConfigSchema>;

// ============================================================================
// Content Types
// ============================================================================

export const ContentItemSchema = z.object({
  id: z.string().uuid(),
  storefrontId: z.string().uuid(),
  type: z.enum(['landing_page', 'category_page', 'product_page', 'blog_post', 'faq']),
  slug: z.string(),
  title: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  content: z.string(),
  status: z.enum(['draft', 'review', 'published', 'archived']),
  publishedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ContentItem = z.infer<typeof ContentItemSchema>;

// ============================================================================
// SEO Opportunity Types
// ============================================================================

export const SEOOpportunitySchema = z.object({
  id: z.string().uuid(),
  keyword: z.string(),
  searchVolume: z.number().int().min(0),
  difficulty: z.number().min(0).max(100),
  cpc: z.number().min(0),
  intent: z.enum(['informational', 'navigational', 'transactional', 'commercial']),
  location: z.string().optional(),
  niche: z.string(),
  status: z.enum(['identified', 'evaluated', 'assigned', 'content_created', 'published']),
  assignedStorefrontId: z.string().uuid().optional(),
  priority: z.number().int().min(1).max(5),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SEOOpportunity = z.infer<typeof SEOOpportunitySchema>;

// ============================================================================
// Analytics Types
// ============================================================================

export const AnalyticsEventSchema = z.object({
  id: z.string().uuid(),
  storefrontId: z.string().uuid(),
  eventType: z.enum([
    'page_view',
    'product_view',
    'add_to_cart',
    'checkout_start',
    'checkout_complete',
    'search',
    'click',
  ]),
  sessionId: z.string(),
  userId: z.string().optional(),
  metadata: z.record(z.unknown()),
  timestamp: z.date(),
});

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

// ============================================================================
// Job Queue Types
// ============================================================================

export const JobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobTypeSchema = z.enum([
  'content_generation',
  'seo_analysis',
  'site_creation',
  'domain_setup',
  'content_optimization',
  'analytics_aggregation',
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobSchema = z.object({
  id: z.string().uuid(),
  type: JobTypeSchema,
  status: JobStatusSchema,
  priority: z.number().int().min(1).max(10).default(5),
  payload: z.record(z.unknown()),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  attempts: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
});

export type Job = z.infer<typeof JobSchema>;

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
