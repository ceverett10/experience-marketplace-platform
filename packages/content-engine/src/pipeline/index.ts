import type { ContentBrief, GeneratedContent, PipelineConfig, QualityAssessment } from '../types';
import { DEFAULT_PIPELINE_CONFIG } from '../types';
import { ClaudeClient } from '../client';

export interface PipelineResult {
  content: GeneratedContent;
  success: boolean;
  error?: string;
}

export type PipelineEventHandler = (event: PipelineEvent) => void;

export interface PipelineEvent {
  type:
    | 'draft_start'
    | 'draft_complete'
    | 'quality_start'
    | 'quality_complete'
    | 'rewrite_start'
    | 'rewrite_complete'
    | 'complete'
    | 'error';
  data?: any;
}

export class ContentPipeline {
  private config: PipelineConfig;
  private client: ClaudeClient;
  private eventHandlers: PipelineEventHandler[] = [];

  constructor(client: ClaudeClient, config?: Partial<PipelineConfig>) {
    this.client = client;
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  }

  onEvent(handler: PipelineEventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emit(event: PipelineEvent): void {
    this.eventHandlers.forEach((h) => h(event));
  }

  async generate(brief: ContentBrief): Promise<PipelineResult> {
    try {
      this.emit({ type: 'draft_start', data: brief });

      const draft = await this.generateDraft(brief);
      this.emit({ type: 'draft_complete', data: draft });

      if (!this.config.qualityThreshold) {
        return { content: draft, success: true };
      }

      this.emit({ type: 'quality_start' });
      const assessment = await this.assessQuality(draft, brief);
      this.emit({ type: 'quality_complete', data: assessment });

      draft.qualityAssessment = assessment;

      if (assessment.overallScore >= this.config.qualityThreshold) {
        this.emit({ type: 'complete', data: draft });
        return { content: draft, success: true };
      }

      let currentDraft = draft;
      let currentAssessment = assessment;

      for (let i = 0; i < this.config.maxRewrites; i++) {
        this.emit({ type: 'rewrite_start', data: { attempt: i + 1 } });
        const rewritten = await this.rewriteContent(currentDraft, currentAssessment, brief);
        const newAssessment = await this.assessQuality(rewritten, brief);

        rewritten.qualityAssessment = newAssessment;
        this.emit({
          type: 'rewrite_complete',
          data: { attempt: i + 1, score: newAssessment.overallScore },
        });

        if (newAssessment.overallScore >= this.config.qualityThreshold) {
          this.emit({ type: 'complete', data: rewritten });
          return { content: rewritten, success: true };
        }

        currentDraft = rewritten;
        currentAssessment = newAssessment;
      }

      this.emit({ type: 'complete', data: currentDraft });
      return { content: currentDraft, success: false, error: 'Quality threshold not met' };
    } catch (error) {
      this.emit({ type: 'error', data: error });
      throw error;
    }
  }

  private async generateDraft(brief: ContentBrief): Promise<GeneratedContent> {
    const prompt = this.buildPrompt(brief);
    const model = this.client.getModelId(this.config.draftModel);
    const startTime = Date.now();

    const response = await this.client.generate({
      model,
      system: 'You are an expert travel content writer creating SEO-optimized content.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      temperature: 0.7,
    });

    const content = response.content.find((b) => b.type === 'text')?.text || '';
    const cost = this.client.calculateCost(
      model,
      response.usage.input_tokens,
      response.usage.output_tokens
    );

    return {
      id: Math.random().toString(36).substr(2, 9),
      briefId: Math.random().toString(36).substr(2, 9),
      type: brief.type,
      siteId: brief.siteId,
      title: this.extractTitle(content),
      content,
      targetKeyword: brief.targetKeyword,
      secondaryKeywords: brief.secondaryKeywords,
      slug: this.generateSlug(brief.targetKeyword),
      version: 1,
      status: 'draft',
      generatedAt: new Date(),
      generatedBy: this.config.draftModel,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      estimatedCost: cost,
      generationTimeMs: Date.now() - startTime,
      rewriteCount: 0,
      maxRewrites: this.config.maxRewrites,
    };
  }

  private async assessQuality(
    content: GeneratedContent,
    brief: ContentBrief
  ): Promise<QualityAssessment> {
    const prompt = `Assess this content quality. Return JSON only.

Content: ${content.content}

Context: ${JSON.stringify({ type: brief.type, keyword: brief.targetKeyword })}

Evaluate (0-100 each): factualAccuracy, seoCompliance, readability, uniqueness, engagement.
List issues with type, severity, description.
Provide suggestions.

JSON format:
{"overallScore": 85, "breakdown": {...}, "issues": [...], "suggestions": [...]}`;

    const model = this.client.getModelId(this.config.qualityModel);
    const response = await this.client.generate({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '{}';
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');

    return {
      overallScore: json.overallScore || 50,
      breakdown: json.breakdown || {
        factualAccuracy: 50,
        seoCompliance: 50,
        readability: 50,
        uniqueness: 50,
        engagement: 50,
      },
      passed: (json.overallScore || 50) >= this.config.qualityThreshold,
      issues: json.issues || [],
      suggestions: json.suggestions || [],
      assessedAt: new Date(),
      assessedBy: this.config.qualityModel,
    };
  }

  private async rewriteContent(
    content: GeneratedContent,
    assessment: QualityAssessment,
    brief: ContentBrief
  ): Promise<GeneratedContent> {
    const prompt = `Rewrite this content to address quality issues.

Original: ${content.content}

Issues: ${JSON.stringify(assessment.issues)}
Suggestions: ${JSON.stringify(assessment.suggestions)}

Improve while maintaining keyword: ${brief.targetKeyword}`;

    const model = this.client.getModelId(this.config.rewriteModel);
    const startTime = Date.now();

    const response = await this.client.generate({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    });

    const newContent = response.content.find((b) => b.type === 'text')?.text || '';
    const cost = this.client.calculateCost(
      model,
      response.usage.input_tokens,
      response.usage.output_tokens
    );

    return {
      ...content,
      content: newContent,
      version: content.version + 1,
      rewriteCount: content.rewriteCount + 1,
      tokensUsed: content.tokensUsed + response.usage.input_tokens + response.usage.output_tokens,
      estimatedCost: content.estimatedCost + cost,
      generationTimeMs: content.generationTimeMs + (Date.now() - startTime),
    };
  }

  private buildPrompt(brief: ContentBrief): string {
    return `Create ${brief.type} content for: ${brief.targetKeyword}

Keywords: ${brief.secondaryKeywords.join(', ')}
Length: ${brief.targetLength.min}-${brief.targetLength.max} words
Tone: ${brief.tone}

${brief.destination ? 'Destination: ' + brief.destination : ''}
${brief.category ? 'Category: ' + brief.category : ''}

Return markdown content only.`;
  }

  private extractTitle(content: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1] || 'Untitled';
  }

  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  getCostSummary() {
    return { total: 0, byModel: {}, byOperation: {} };
  }
}

export function createPipeline(config?: Partial<PipelineConfig>): ContentPipeline {
  const apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '';
  const client = new ClaudeClient({ apiKey });
  return new ContentPipeline(client, config);
}
