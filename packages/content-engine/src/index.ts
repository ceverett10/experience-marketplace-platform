/**
 * Content Engine - AI-powered content generation for Experience Marketplace
 *
 * @module @experience-marketplace/content-engine
 *
 * This package provides:
 * - Claude API client with rate limiting and cost tracking
 * - Prompt templates for all content types
 * - AI Quality Gate with scoring system
 * - Content generation pipeline with auto-rewrite
 * - Type-specific content generators
 *
 * @example
 * ```typescript
 * import { createGenerator } from '@experience-marketplace/content-engine';
 *
 * const generator = createGenerator({
 *   siteId: 'my-site',
 *   tone: 'enthusiastic',
 * });
 *
 * // Generate a destination page
 * const result = await generator.destination(
 *   'Barcelona',
 *   'things to do in Barcelona',
 *   { secondaryKeywords: ['Barcelona activities', 'Barcelona tours'] }
 * );
 *
 * if (result.success) {
 *   console.log(result.content.content);
 *   console.log(`Quality score: ${result.content.qualityAssessment?.overallScore}`);
 * }
 * ```
 */

// Types
export type {
  ContentType,
  ContentStatus,
  QualityScoreBreakdown,
  QualityAssessment,
  QualityIssue,
  ContentBrief,
  GeneratedContent,
  RewriteRecord,
  PipelineConfig,
  ClaudeRequest,
  ClaudeMessage,
  ClaudeResponse,
  ClaudeContentBlock,
  ClaudeUsage,
  CostRecord,
  DailyCostSummary,
} from './types';

export { ContentBriefSchema, PipelineConfigSchema, DEFAULT_PIPELINE_CONFIG } from './types';

// Client
export {
  ClaudeClient,
  getClaudeClient,
  MODELS,
  type ModelAlias,
  CostTracker,
  RateLimiter,
} from './client';

// Prompts
export {
  SYSTEM_PROMPTS,
  buildDestinationPrompt,
  buildCategoryPrompt,
  buildExperiencePrompt,
  buildBlogPrompt,
  buildMetaDescriptionPrompt,
  buildSeoTitlePrompt,
  buildQualityAssessmentPrompt,
  buildRewritePrompt,
  getPromptBuilder,
} from './prompts';

// Quality
export {
  QualityGate,
  quickAssess,
  thoroughAssess,
  SCORE_WEIGHTS,
  SEVERITY_THRESHOLDS,
} from './quality';

// Pipeline
export {
  ContentPipeline,
  createPipeline,
  generateContent,
  type PipelineEvent,
  type PipelineEventHandler,
} from './pipeline';

// Generators
export {
  ContentGenerator,
  createGenerator,
  generateDestinationPage,
  generateCategoryPage,
  generateExperienceDescription,
  generateBlogPost,
  generateMetaDescription,
  generateSeoTitle,
} from './generators';
