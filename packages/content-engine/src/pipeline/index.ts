import type {
  ContentBrief,
  GeneratedContent,
  ContentStatus,
  PipelineConfig,
  QualityAssessment,
  RewriteRecord,
} from '../types';
import { DEFAULT_PIPELINE_CONFIG } from '../types';
import { type ClaudeClient, getClaudeClient, type ModelAlias } from '../client';
import { SYSTEM_PROMPTS, getPromptBuilder, buildRewritePrompt } from '../prompts';
import { QualityGate } from '../quality';

/**
 * Events emitted during pipeline execution
 */
export type PipelineEvent =
  | { type: 'generation_started'; briefId: string; model: string }
  | { type: 'generation_completed'; contentId: string; tokensUsed: number; cost: number }
  | { type: 'assessment_started'; contentId: string; model: string }
  | { type: 'assessment_completed'; contentId: string; score: number; passed: boolean }
  | { type: 'rewrite_started'; contentId: string; attempt: number; issues: number }
  | { type: 'rewrite_completed'; contentId: string; newScore: number; improvement: number }
  | { type: 'pipeline_completed'; contentId: string; finalScore: number; status: ContentStatus }
  | { type: 'pipeline_failed'; briefId: string; error: string }
  | { type: 'cost_warning'; currentCost: number; limit: number };

export type PipelineEventHandler = (event: PipelineEvent) => void;

export interface PipelineResult {
  success: boolean;
  content?: GeneratedContent;
  error?: string;
  totalCost: number;
  totalTokens: number;
  rewriteCount: number;
}

/**
 * Content Generation Pipeline
 * Orchestrates the full content generation workflow:
 * 1. Generate initial draft
 * 2. Assess quality
 * 3. Rewrite if needed (up to maxRewrites)
 * 4. Return final content with status
 */
export class ContentPipeline {
  private client: ClaudeClient;
  private qualityGate: QualityGate;
  private config: PipelineConfig;
  private eventHandlers: PipelineEventHandler[] = [];

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };

    this.client = getClaudeClient({
      dailyCostLimit: this.config.dailyCostLimit,
      rateLimiter: {
        requestsPerMinute: this.config.requestsPerMinute,
        maxConcurrentRequests: this.config.maxConcurrentRequests,
      },
    });

    this.qualityGate = new QualityGate({
      client: this.client,
      model: this.config.qualityModel as ModelAlias,
      threshold: this.config.qualityThreshold,
      autoPublishThreshold: this.config.autoPublishThreshold,
    });
  }

  /**
   * Subscribe to pipeline events
   */
  onEvent(handler: PipelineEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit a pipeline event
   */
  private emit(event: PipelineEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Pipeline event handler error:', error);
      }
    }
  }

  /**
   * Generate a unique content ID
   */
  private generateContentId(): string {
    return `content_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Generate a URL-friendly slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);
  }

  /**
   * Extract title from HTML content
   */
  private extractTitle(content: string): string {
    // Try to find H1 tag
    const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      return h1Match[1].replace(/<[^>]*>/g, '').trim();
    }

    // Try to find first heading
    const headingMatch = content.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    if (headingMatch && headingMatch[1]) {
      return headingMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    // Fall back to first line
    const firstLine = (content.split('\n')[0] ?? '').replace(/<[^>]*>/g, '').trim();
    return firstLine.slice(0, 100) || 'Untitled Content';
  }

  /**
   * Extract excerpt from HTML content
   */
  private extractExcerpt(content: string, maxLength: number = 160): string {
    // Strip HTML tags and get first paragraph
    const text = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3).trim() + '...';
  }

  /**
   * Calculate word count
   */
  private countWords(content: string): number {
    const text = content.replace(/<[^>]*>/g, ' ').trim();
    return text.split(/\s+/).filter(Boolean).length;
  }

  /**
   * Check if we can afford an operation
   */
  private checkCostBudget(estimatedCost: number): boolean {
    const summary = this.client.getDailyCostSummary();

    if (summary.remaining < estimatedCost) {
      this.emit({
        type: 'cost_warning',
        currentCost: summary.totalCost,
        limit: summary.limit,
      });
      return false;
    }

    return true;
  }

  /**
   * Run the full content generation pipeline
   */
  async generate(brief: ContentBrief): Promise<PipelineResult> {
    const contentId = this.generateContentId();
    const briefId = `brief_${Date.now()}`;
    const startTime = Date.now();
    let totalCost = 0;
    let totalTokens = 0;
    let rewriteCount = 0;

    try {
      // Step 1: Generate initial draft
      this.emit({ type: 'generation_started', briefId, model: this.config.draftModel });

      const promptBuilder = getPromptBuilder(brief.type);
      const prompt = promptBuilder(brief);

      const generation = await this.client.generate({
        prompt,
        system: SYSTEM_PROMPTS.contentWriter,
        model: this.config.draftModel as ModelAlias,
        maxTokens: this.calculateMaxTokens(brief),
        temperature: 0.7,
        contentId,
      });

      totalCost += generation.cost;
      totalTokens += generation.usage.inputTokens + generation.usage.outputTokens;

      this.emit({
        type: 'generation_completed',
        contentId,
        tokensUsed: generation.usage.inputTokens + generation.usage.outputTokens,
        cost: generation.cost,
      });

      let currentContent = generation.content;
      let currentAssessment: QualityAssessment | undefined;
      const rewriteHistory: RewriteRecord[] = [];

      // Step 2: Quality Assessment Loop
      while (rewriteCount <= this.config.maxRewrites) {
        // Check cost budget before assessment
        const estimatedAssessmentCost = this.client.estimateCost(
          this.config.qualityModel,
          2000,
          1000
        );
        if (!this.checkCostBudget(estimatedAssessmentCost)) {
          throw new Error('Daily cost limit reached during assessment');
        }

        this.emit({
          type: 'assessment_started',
          contentId,
          model: this.config.qualityModel,
        });

        const assessmentResult = await this.qualityGate.assess(currentContent, brief, contentId);
        currentAssessment = assessmentResult.assessment;
        totalCost += assessmentResult.cost;
        totalTokens += assessmentResult.tokensUsed;

        this.emit({
          type: 'assessment_completed',
          contentId,
          score: currentAssessment.overallScore,
          passed: currentAssessment.passed,
        });

        // If passed quality gate, we're done
        if (currentAssessment.passed) {
          break;
        }

        // Check if we should rewrite
        if (!this.qualityGate.shouldRewrite(currentAssessment)) {
          break; // Score too low, regenerate instead
        }

        // Check if we've reached max rewrites
        if (rewriteCount >= this.config.maxRewrites) {
          break;
        }

        // Step 3: Rewrite
        const issues = this.qualityGate.getRewriteIssues(currentAssessment);

        this.emit({
          type: 'rewrite_started',
          contentId,
          attempt: rewriteCount + 1,
          issues: issues.length,
        });

        const rewritePrompt = buildRewritePrompt(currentContent, issues, brief);

        // Check cost budget before rewrite
        const estimatedRewriteCost = this.client.estimateCost(this.config.rewriteModel, 3000, 2000);
        if (!this.checkCostBudget(estimatedRewriteCost)) {
          throw new Error('Daily cost limit reached during rewrite');
        }

        const rewrite = await this.client.rewrite({
          originalContent: currentContent,
          feedback: issues.map((i) => i.description).join('; '),
          prompt: rewritePrompt,
          model: this.config.rewriteModel as ModelAlias,
          maxTokens: this.calculateMaxTokens(brief),
          contentId,
        });

        const previousScore = currentAssessment.overallScore;
        currentContent = rewrite.content;
        totalCost += rewrite.cost;
        totalTokens += rewrite.usage.inputTokens + rewrite.usage.outputTokens;
        rewriteCount++;

        // Re-assess after rewrite (will be done in next loop iteration)
        // But first, record the rewrite
        rewriteHistory.push({
          version: rewriteCount,
          reason: 'Quality threshold not met',
          issues,
          rewrittenAt: new Date(),
          model: this.config.rewriteModel as 'haiku' | 'sonnet' | 'opus',
          tokensUsed: rewrite.usage.inputTokens + rewrite.usage.outputTokens,
          previousScore,
          newScore: 0, // Will be updated after assessment
        });

        // Quick assessment to get new score for logging
        const quickAssess = await this.qualityGate.assess(currentContent, brief, contentId);
        const newScore = quickAssess.assessment.overallScore;
        totalCost += quickAssess.cost;
        totalTokens += quickAssess.tokensUsed;

        // Update the rewrite record with new score
        const lastRewrite = rewriteHistory[rewriteHistory.length - 1];
        if (lastRewrite) {
          lastRewrite.newScore = newScore;
        }

        this.emit({
          type: 'rewrite_completed',
          contentId,
          newScore,
          improvement: newScore - previousScore,
        });

        // Check if improvement is sufficient
        if (
          newScore - previousScore < this.config.rewriteScoreImprovement &&
          newScore < this.config.qualityThreshold
        ) {
          // Not improving enough, stop rewriting
          currentAssessment = quickAssess.assessment;
          break;
        }

        currentAssessment = quickAssess.assessment;
      }

      // Determine final status
      let status: ContentStatus;
      if (currentAssessment && this.qualityGate.shouldAutoPublish(currentAssessment)) {
        status = 'approved';
      } else if (currentAssessment?.passed) {
        status = 'pending_review';
      } else {
        status = 'draft';
      }

      // Build final content object
      const title = this.extractTitle(currentContent);
      const generatedContent: GeneratedContent = {
        id: contentId,
        briefId,
        type: brief.type,
        siteId: brief.siteId,
        title,
        content: currentContent,
        excerpt: this.extractExcerpt(currentContent),
        targetKeyword: brief.targetKeyword,
        secondaryKeywords: brief.secondaryKeywords,
        slug: this.generateSlug(title),
        qualityAssessment: currentAssessment,
        version: 1,
        status,
        generatedAt: new Date(),
        generatedBy: this.config.draftModel as 'haiku' | 'sonnet' | 'opus',
        tokensUsed: totalTokens,
        estimatedCost: totalCost,
        generationTimeMs: Date.now() - startTime,
        rewriteCount,
        maxRewrites: this.config.maxRewrites,
        rewriteHistory,
      };

      this.emit({
        type: 'pipeline_completed',
        contentId,
        finalScore: currentAssessment?.overallScore || 0,
        status,
      });

      return {
        success: true,
        content: generatedContent,
        totalCost,
        totalTokens,
        rewriteCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.emit({
        type: 'pipeline_failed',
        briefId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        totalCost,
        totalTokens,
        rewriteCount,
      };
    }
  }

  /**
   * Calculate appropriate max tokens based on content type and target length
   */
  private calculateMaxTokens(brief: ContentBrief): number {
    // Rough estimate: 1 word ≈ 1.3 tokens
    const targetTokens = Math.ceil(brief.targetLength.max * 1.5);

    // Add buffer for HTML formatting
    const withBuffer = targetTokens + 500;

    // Cap at reasonable limits
    return Math.min(withBuffer, 8192);
  }

  /**
   * Batch generate content for multiple briefs
   */
  async generateBatch(
    briefs: ContentBrief[],
    options: { maxConcurrent?: number; stopOnError?: boolean } = {}
  ): Promise<Map<string, PipelineResult>> {
    const results = new Map<string, PipelineResult>();
    const maxConcurrent = options.maxConcurrent || 3;

    // Process in batches
    for (let i = 0; i < briefs.length; i += maxConcurrent) {
      const batch = briefs.slice(i, i + maxConcurrent);

      const batchResults = await Promise.all(
        batch.map(async (brief, index) => {
          const briefKey = `${brief.type}_${brief.targetKeyword}_${i + index}`;
          try {
            const result = await this.generate(brief);
            return { key: briefKey, result };
          } catch (error) {
            return {
              key: briefKey,
              result: {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                totalCost: 0,
                totalTokens: 0,
                rewriteCount: 0,
              } as PipelineResult,
            };
          }
        })
      );

      for (const { key, result } of batchResults) {
        results.set(key, result);

        if (options.stopOnError && !result.success) {
          return results;
        }
      }
    }

    return results;
  }

  /**
   * Get current cost summary
   */
  getCostSummary() {
    return this.client.getDailyCostSummary();
  }

  /**
   * Get pipeline configuration
   */
  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  /**
   * Update pipeline configuration
   */
  updateConfig(updates: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...updates };

    // Update quality gate thresholds if changed
    if (updates.qualityThreshold !== undefined || updates.autoPublishThreshold !== undefined) {
      this.qualityGate.setThresholds(
        this.config.qualityThreshold,
        this.config.autoPublishThreshold
      );
    }
  }
}

/**
 * Create a new pipeline instance
 */
export function createPipeline(config?: Partial<PipelineConfig>): ContentPipeline {
  return new ContentPipeline(config);
}

/**
 * Quick content generation with default settings
 */
export async function generateContent(brief: ContentBrief): Promise<PipelineResult> {
  const pipeline = new ContentPipeline();
  return pipeline.generate(brief);
}
