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
    const modelMap = {
      haiku: 'claude-3-haiku-20240307',
      sonnet: 'claude-3-5-sonnet-20241022',
      opus: 'claude-3-opus-20240229',
    };
    return modelMap[model];
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
      'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
      'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
    };
    const p = pricing[model] || pricing['claude-3-haiku-20240307'];
    return (inputTokens / 1_000_000) * p!.input + (outputTokens / 1_000_000) * p!.output;
  }
}

export function createClaudeClient(options: ClaudeClientOptions): ClaudeClient {
  return new ClaudeClient(options);
}
