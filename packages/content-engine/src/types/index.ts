import { z } from 'zod';

// Content Types
export type ContentType =
  | 'destination'
  | 'category'
  | 'experience'
  | 'blog'
  | 'meta_description'
  | 'seo_title';

// Content Status
export type ContentStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived';

// Quality Score Breakdown
export interface QualityScoreBreakdown {
  factualAccuracy: number; // 0-100: How accurate vs source data
  seoCompliance: number; // 0-100: Keyword usage, structure, etc.
  readability: number; // 0-100: Flesch-Kincaid score converted
  uniqueness: number; // 0-100: Original content vs templates
  engagement: number; // 0-100: Hooks, CTAs, persuasiveness
}

// Quality Assessment Result
export interface QualityAssessment {
  overallScore: number; // 0-100 weighted average
  breakdown: QualityScoreBreakdown;
  passed: boolean; // true if overallScore >= threshold
  issues: QualityIssue[]; // List of identified issues
  suggestions: string[]; // Improvement suggestions
  assessedAt: Date;
  assessedBy: 'haiku' | 'sonnet' | 'opus';
}

// Quality Issue
export interface QualityIssue {
  type: 'factual' | 'seo' | 'readability' | 'uniqueness' | 'engagement';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string; // Where in the content the issue occurs
  suggestion?: string; // How to fix it
}

// Brand Context for tone of voice and messaging
export interface BrandContext {
  siteName?: string; // The name of the site/brand for personalized content
  toneOfVoice?: {
    personality?: string[];
    writingStyle?: string;
    doList?: string[];
    dontList?: string[];
  };
  trustSignals?: {
    expertise?: string[];
    certifications?: string[];
    yearsFounded?: number;
    valuePropositions?: string[];
    guarantees?: string[];
  };
  brandStory?: {
    mission?: string;
    vision?: string;
    values?: string[];
    targetAudience?: string;
    uniqueSellingPoints?: string[];
  };
  contentGuidelines?: {
    keyThemes?: string[];
    contentPillars?: string[];
    topicClusters?: string[];
  };
  writingGuidelines?: string;
}

// Content Brief - Input for generation
export interface ContentBrief {
  type: ContentType;
  siteId: string;
  siteName?: string; // Site/brand name for personalized content
  targetKeyword: string;
  secondaryKeywords: string[];
  destination?: string;
  category?: string;
  experienceId?: string;
  tone: 'professional' | 'casual' | 'enthusiastic' | 'informative';
  targetLength: {
    min: number;
    max: number;
  };
  includeElements?: string[]; // e.g., ['hero_section', 'faq', 'cta']
  excludeElements?: string[];
  sourceData?: Record<string, unknown>; // Holibob product data, etc.
  competitorContent?: string[]; // URLs or content to differentiate from
  brandContext?: BrandContext; // Brand identity for tone of voice
}

// Generated Content
export interface GeneratedContent {
  id: string;
  briefId: string;
  type: ContentType;
  siteId: string;

  // Content fields
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  content: string; // Main content body (HTML or Markdown)
  excerpt?: string;

  // SEO fields
  targetKeyword: string;
  secondaryKeywords: string[];
  slug: string;

  // Quality
  qualityAssessment?: QualityAssessment;

  // Versioning
  version: number;
  previousVersionId?: string;

  // Status
  status: ContentStatus;

  // Metadata
  generatedAt: Date;
  generatedBy: 'haiku' | 'sonnet' | 'opus';
  tokensUsed: number;
  estimatedCost: number; // In USD
  generationTimeMs: number;

  // Rewrite tracking
  rewriteCount: number;
  maxRewrites: number;
  rewriteHistory?: RewriteRecord[];
}

// Rewrite Record
export interface RewriteRecord {
  version: number;
  reason: string;
  issues: QualityIssue[];
  rewrittenAt: Date;
  model: 'haiku' | 'sonnet' | 'opus';
  tokensUsed: number;
  previousScore: number;
  newScore: number;
}

// Pipeline Configuration
export interface PipelineConfig {
  // Model selection
  draftModel: 'haiku' | 'sonnet'; // For initial draft
  qualityModel: 'sonnet' | 'opus'; // For quality assessment
  rewriteModel: 'haiku' | 'sonnet'; // For rewrites

  // Quality thresholds
  qualityThreshold: number; // Minimum score to pass (0-100)
  autoPublishThreshold: number; // Score for auto-publish (0-100)

  // Rewrite settings
  maxRewrites: number; // Max rewrite attempts
  rewriteScoreImprovement: number; // Min improvement to continue

  // Cost controls
  maxCostPerContent: number; // Max USD per content piece
  dailyCostLimit: number; // Daily budget in USD

  // Rate limiting
  requestsPerMinute: number; // API rate limit
  maxConcurrentRequests: number;
}

// Claude API Request/Response types
export interface ClaudeRequest {
  model: string;
  maxTokens: number;
  messages: ClaudeMessage[];
  temperature?: number;
  system?: string;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeContentBlock[];
  model: string;
  stopReason: string;
  usage: ClaudeUsage;
}

export interface ClaudeContentBlock {
  type: 'text';
  text: string;
}

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
}

// Cost tracking
export interface CostRecord {
  id: string;
  contentId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number; // USD
  operation: 'generate' | 'assess' | 'rewrite';
  timestamp: Date;
}

export interface DailyCostSummary {
  date: string; // YYYY-MM-DD
  totalCost: number;
  byModel: Record<string, number>;
  byOperation: Record<string, number>;
  contentCount: number;
  limit: number;
  remaining: number;
}

// Zod schemas for validation
export const ContentBriefSchema = z.object({
  type: z.enum(['destination', 'category', 'experience', 'blog', 'meta_description', 'seo_title']),
  siteId: z.string().min(1),
  targetKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string()),
  destination: z.string().optional(),
  category: z.string().optional(),
  experienceId: z.string().optional(),
  tone: z.enum(['professional', 'casual', 'enthusiastic', 'informative']),
  targetLength: z.object({
    min: z.number().positive(),
    max: z.number().positive(),
  }),
  includeElements: z.array(z.string()).optional(),
  excludeElements: z.array(z.string()).optional(),
  sourceData: z.record(z.unknown()).optional(),
  competitorContent: z.array(z.string()).optional(),
});

export const PipelineConfigSchema = z.object({
  draftModel: z.enum(['haiku', 'sonnet']),
  qualityModel: z.enum(['sonnet', 'opus']),
  rewriteModel: z.enum(['haiku', 'sonnet']),
  qualityThreshold: z.number().min(0).max(100),
  autoPublishThreshold: z.number().min(0).max(100),
  maxRewrites: z.number().min(0).max(10),
  rewriteScoreImprovement: z.number().min(0).max(100),
  maxCostPerContent: z.number().positive(),
  dailyCostLimit: z.number().positive(),
  requestsPerMinute: z.number().positive(),
  maxConcurrentRequests: z.number().positive(),
});

// Default configuration
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  draftModel: 'haiku',
  qualityModel: 'sonnet',
  rewriteModel: 'haiku',
  qualityThreshold: 75,
  autoPublishThreshold: 90,
  maxRewrites: 3,
  rewriteScoreImprovement: 5,
  maxCostPerContent: 0.5, // 50 cents max per content
  dailyCostLimit: 50.0, // $50 daily limit
  requestsPerMinute: 50,
  maxConcurrentRequests: 5,
};
