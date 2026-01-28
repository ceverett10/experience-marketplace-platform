import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeMessage, CostRecord, DailyCostSummary } from '../types';

// Model pricing per 1M tokens (as of Jan 2026)
const MODEL_PRICING = {
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
} as const;

// Model aliases for easy reference
export const MODELS = {
  haiku: 'claude-3-5-haiku-20241022',
  sonnet: 'claude-3-5-sonnet-20241022',
  opus: 'claude-3-opus-20240229',
} as const;

export type ModelAlias = keyof typeof MODELS;

interface RateLimiterConfig {
  requestsPerMinute: number;
  maxConcurrentRequests: number;
}

interface ClaudeClientConfig {
  apiKey?: string;
  rateLimiter?: RateLimiterConfig;
  dailyCostLimit?: number;
  onCostRecord?: (record: CostRecord) => void;
}

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private activeRequests: number = 0;
  private readonly maxConcurrent: number;
  private waitQueue: Array<() => void> = [];

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.requestsPerMinute;
    this.tokens = this.maxTokens;
    this.refillRate = config.requestsPerMinute / 60000; // per ms
    this.lastRefill = Date.now();
    this.maxConcurrent = config.maxConcurrentRequests;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refillTokens();

    // Wait for concurrent slot
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    }

    // Wait for rate limit token
    while (this.tokens < 1) {
      const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.refillTokens();
    }

    this.tokens -= 1;
    this.activeRequests += 1;
  }

  release(): void {
    this.activeRequests -= 1;
    const next = this.waitQueue.shift();
    if (next) next();
  }
}

/**
 * Cost tracker for daily budget management
 */
class CostTracker {
  private dailyCosts: Map<string, number> = new Map();
  private records: CostRecord[] = [];
  private readonly onRecord?: (record: CostRecord) => void;

  constructor(onRecord?: (record: CostRecord) => void) {
    this.onRecord = onRecord;
  }

  private getDateKey(): string {
    return new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
  }

  recordCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    operation: 'generate' | 'assess' | 'rewrite',
    contentId?: string
  ): CostRecord {
    const pricing =
      MODEL_PRICING[model as keyof typeof MODEL_PRICING] ||
      MODEL_PRICING['claude-3-5-haiku-20241022'];
    const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

    const record: CostRecord = {
      id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      contentId,
      model,
      inputTokens,
      outputTokens,
      cost,
      operation,
      timestamp: new Date(),
    };

    this.records.push(record);

    const dateKey = this.getDateKey();
    this.dailyCosts.set(dateKey, (this.dailyCosts.get(dateKey) || 0) + cost);

    if (this.onRecord) {
      this.onRecord(record);
    }

    return record;
  }

  getDailyCost(): number {
    return this.dailyCosts.get(this.getDateKey()) || 0;
  }

  getDailySummary(limit: number): DailyCostSummary {
    const date = this.getDateKey();
    const totalCost = this.getDailyCost();
    const todayRecords = this.records.filter(
      (r) => r.timestamp.toISOString().split('T')[0] === date
    );

    const byModel: Record<string, number> = {};
    const byOperation: Record<string, number> = {};

    for (const record of todayRecords) {
      byModel[record.model] = (byModel[record.model] || 0) + record.cost;
      byOperation[record.operation] = (byOperation[record.operation] || 0) + record.cost;
    }

    return {
      date,
      totalCost,
      byModel,
      byOperation,
      contentCount: new Set(todayRecords.filter((r) => r.contentId).map((r) => r.contentId)).size,
      limit,
      remaining: Math.max(0, limit - totalCost),
    };
  }

  getRecords(): CostRecord[] {
    return [...this.records];
  }

  clearOldRecords(daysToKeep: number = 30): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    this.records = this.records.filter((r) => r.timestamp >= cutoff);

    // Clean up daily costs map
    const cutoffDate = cutoff.toISOString().split('T')[0] ?? cutoff.toISOString().slice(0, 10);
    for (const [date] of this.dailyCosts) {
      if (cutoffDate && date < cutoffDate) {
        this.dailyCosts.delete(date);
      }
    }
  }
}

/**
 * Claude API Client with rate limiting, cost tracking, and retries
 */
export class ClaudeClient {
  private client: Anthropic;
  private rateLimiter: RateLimiter;
  private costTracker: CostTracker;
  private dailyCostLimit: number;

  constructor(config: ClaudeClientConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env['ANTHROPIC_API_KEY'],
    });

    this.rateLimiter = new RateLimiter(
      config.rateLimiter || { requestsPerMinute: 50, maxConcurrentRequests: 5 }
    );

    this.costTracker = new CostTracker(config.onCostRecord);
    this.dailyCostLimit = config.dailyCostLimit || 50.0;
  }

  /**
   * Check if we're within daily budget
   */
  private checkBudget(): void {
    const currentCost = this.costTracker.getDailyCost();
    if (currentCost >= this.dailyCostLimit) {
      throw new Error(
        `Daily cost limit reached: $${currentCost.toFixed(2)} / $${this.dailyCostLimit.toFixed(2)}`
      );
    }
  }

  /**
   * Send a message to Claude with rate limiting and cost tracking
   */
  async sendMessage(options: {
    model: string;
    messages: ClaudeMessage[];
    system?: string;
    maxTokens?: number;
    temperature?: number;
    operation?: 'generate' | 'assess' | 'rewrite';
    contentId?: string;
  }): Promise<{
    content: string;
    usage: { inputTokens: number; outputTokens: number };
    cost: number;
    model: string;
  }> {
    this.checkBudget();

    const modelId = MODELS[options.model as ModelAlias] || options.model;
    const maxTokens = options.maxTokens || 4096;

    await this.rateLimiter.acquire();

    try {
      const response = await this.client.messages.create({
        model: modelId,
        max_tokens: maxTokens,
        temperature: options.temperature ?? 0.7,
        system: options.system,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };

      const costRecord = this.costTracker.recordCost(
        modelId,
        usage.inputTokens,
        usage.outputTokens,
        options.operation || 'generate',
        options.contentId
      );

      return {
        content,
        usage,
        cost: costRecord.cost,
        model: modelId,
      };
    } finally {
      this.rateLimiter.release();
    }
  }

  /**
   * Generate content with a specific model
   */
  async generate(options: {
    prompt: string;
    system?: string;
    model?: ModelAlias;
    maxTokens?: number;
    temperature?: number;
    contentId?: string;
  }): Promise<{
    content: string;
    usage: { inputTokens: number; outputTokens: number };
    cost: number;
  }> {
    return this.sendMessage({
      model: options.model || 'haiku',
      messages: [{ role: 'user', content: options.prompt }],
      system: options.system,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      operation: 'generate',
      contentId: options.contentId,
    });
  }

  /**
   * Assess content quality using Sonnet
   */
  async assess(options: {
    content: string;
    prompt: string;
    model?: ModelAlias;
    contentId?: string;
  }): Promise<{
    content: string;
    usage: { inputTokens: number; outputTokens: number };
    cost: number;
  }> {
    return this.sendMessage({
      model: options.model || 'sonnet',
      messages: [{ role: 'user', content: options.prompt }],
      maxTokens: 2048,
      temperature: 0.3, // Lower temperature for more consistent assessments
      operation: 'assess',
      contentId: options.contentId,
    });
  }

  /**
   * Rewrite content based on feedback
   */
  async rewrite(options: {
    originalContent: string;
    feedback: string;
    prompt: string;
    model?: ModelAlias;
    maxTokens?: number;
    contentId?: string;
  }): Promise<{
    content: string;
    usage: { inputTokens: number; outputTokens: number };
    cost: number;
  }> {
    return this.sendMessage({
      model: options.model || 'haiku',
      messages: [{ role: 'user', content: options.prompt }],
      maxTokens: options.maxTokens || 4096,
      temperature: 0.7,
      operation: 'rewrite',
      contentId: options.contentId,
    });
  }

  /**
   * Get current daily cost summary
   */
  getDailyCostSummary(): DailyCostSummary {
    return this.costTracker.getDailySummary(this.dailyCostLimit);
  }

  /**
   * Get all cost records
   */
  getCostRecords(): CostRecord[] {
    return this.costTracker.getRecords();
  }

  /**
   * Calculate estimated cost for a request
   */
  estimateCost(model: string, estimatedInputTokens: number, estimatedOutputTokens: number): number {
    const modelId = MODELS[model as ModelAlias] || model;
    const pricing =
      MODEL_PRICING[modelId as keyof typeof MODEL_PRICING] ||
      MODEL_PRICING['claude-3-5-haiku-20241022'];
    return (
      (estimatedInputTokens * pricing.input + estimatedOutputTokens * pricing.output) / 1_000_000
    );
  }

  /**
   * Check if within budget for estimated cost
   */
  canAfford(estimatedCost: number): boolean {
    const currentCost = this.costTracker.getDailyCost();
    return currentCost + estimatedCost <= this.dailyCostLimit;
  }
}

// Export singleton instance for convenience
let defaultClient: ClaudeClient | null = null;

export function getClaudeClient(config?: ClaudeClientConfig): ClaudeClient {
  if (!defaultClient || config) {
    defaultClient = new ClaudeClient(config);
  }
  return defaultClient;
}

export { CostTracker, RateLimiter };
