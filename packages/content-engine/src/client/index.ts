import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeClientOptions {
  apiKey: string;
  maxRetries?: number;
}

export class ClaudeClient {
  private client: Anthropic;

  constructor(options: ClaudeClientOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      maxRetries: options.maxRetries || 3,
    });
  }

  async generate(params: {
    model: string;
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens: number;
    temperature?: number;
  }) {
    return this.client.messages.create({
      model: params.model,
      system: params.system,
      messages: params.messages,
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.7,
    });
  }

  getModelId(model: 'haiku' | 'sonnet' | 'opus'): string {
    // Claude 4.x model IDs (Claude 3.x models were retired in 2025)
    const modelMap = {
      haiku: 'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-4-20250514',
      opus: 'claude-opus-4-5-20251101',
    };
    return modelMap[model];
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Updated pricing for Claude 4.x models
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
      'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
      'claude-opus-4-5-20251101': { input: 15.0, output: 75.0 },
    };
    const p = pricing[model] || pricing['claude-haiku-4-5-20251001'];
    return (inputTokens / 1_000_000) * p!.input + (outputTokens / 1_000_000) * p!.output;
  }
}

export function createClaudeClient(options: ClaudeClientOptions): ClaudeClient {
  return new ClaudeClient(options);
}
