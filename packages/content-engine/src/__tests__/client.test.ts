import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeClient, MODELS, CostTracker, RateLimiter } from '../client';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Generated content here' }],
          usage: { input_tokens: 100, output_tokens: 200 },
        }),
      },
    })),
  };
});

describe('ClaudeClient', () => {
  describe('MODELS', () => {
    it('should have correct model mappings', () => {
      expect(MODELS.haiku).toBe('claude-3-5-haiku-20241022');
      expect(MODELS.sonnet).toBe('claude-3-5-sonnet-20241022');
      expect(MODELS.opus).toBe('claude-3-opus-20240229');
    });
  });

  describe('ClaudeClient instantiation', () => {
    it('should create client with default config', () => {
      const client = new ClaudeClient();
      expect(client).toBeInstanceOf(ClaudeClient);
    });

    it('should create client with custom config', () => {
      const client = new ClaudeClient({
        dailyCostLimit: 100.00,
        rateLimiter: { requestsPerMinute: 100, maxConcurrentRequests: 10 },
      });
      expect(client).toBeInstanceOf(ClaudeClient);
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for haiku', () => {
      const client = new ClaudeClient();
      // haiku: input $1/1M, output $5/1M
      const cost = client.estimateCost('haiku', 1000, 1000);
      // (1000 * 1 + 1000 * 5) / 1,000,000 = 0.006
      expect(cost).toBeCloseTo(0.006, 5);
    });

    it('should estimate cost for sonnet', () => {
      const client = new ClaudeClient();
      // sonnet: input $3/1M, output $15/1M
      const cost = client.estimateCost('sonnet', 1000, 1000);
      // (1000 * 3 + 1000 * 15) / 1,000,000 = 0.018
      expect(cost).toBeCloseTo(0.018, 5);
    });

    it('should estimate cost for opus', () => {
      const client = new ClaudeClient();
      // opus: input $15/1M, output $75/1M
      const cost = client.estimateCost('opus', 1000, 1000);
      // (1000 * 15 + 1000 * 75) / 1,000,000 = 0.09
      expect(cost).toBeCloseTo(0.09, 5);
    });
  });

  describe('canAfford', () => {
    it('should return true when within budget', () => {
      const client = new ClaudeClient({ dailyCostLimit: 50.00 });
      expect(client.canAfford(10.00)).toBe(true);
    });

    it('should return false when exceeding budget', () => {
      const client = new ClaudeClient({ dailyCostLimit: 5.00 });
      expect(client.canAfford(10.00)).toBe(false);
    });
  });

  describe('getDailyCostSummary', () => {
    it('should return summary with correct structure', () => {
      const client = new ClaudeClient();
      const summary = client.getDailyCostSummary();

      expect(summary).toHaveProperty('date');
      expect(summary).toHaveProperty('totalCost');
      expect(summary).toHaveProperty('byModel');
      expect(summary).toHaveProperty('byOperation');
      expect(summary).toHaveProperty('contentCount');
      expect(summary).toHaveProperty('limit');
      expect(summary).toHaveProperty('remaining');
    });

    it('should start with zero costs', () => {
      const client = new ClaudeClient({ dailyCostLimit: 50.00 });
      const summary = client.getDailyCostSummary();

      expect(summary.totalCost).toBe(0);
      expect(summary.remaining).toBe(50.00);
    });
  });
});

describe('CostTracker', () => {
  let tracker: CostTracker;
  let recordCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    recordCallback = vi.fn();
    tracker = new CostTracker(recordCallback);
  });

  it('should record costs correctly', () => {
    const record = tracker.recordCost(
      'claude-3-5-haiku-20241022',
      1000,
      500,
      'generate',
      'content-123'
    );

    expect(record).toHaveProperty('id');
    expect(record.model).toBe('claude-3-5-haiku-20241022');
    expect(record.inputTokens).toBe(1000);
    expect(record.outputTokens).toBe(500);
    expect(record.operation).toBe('generate');
    expect(record.contentId).toBe('content-123');
  });

  it('should call callback on record', () => {
    tracker.recordCost('claude-3-5-haiku-20241022', 1000, 500, 'generate');
    expect(recordCallback).toHaveBeenCalledTimes(1);
  });

  it('should track daily costs', () => {
    tracker.recordCost('claude-3-5-haiku-20241022', 1000000, 1000000, 'generate');
    // haiku: (1M * 1 + 1M * 5) / 1M = $6
    expect(tracker.getDailyCost()).toBeCloseTo(6.0, 2);
  });

  it('should accumulate costs', () => {
    tracker.recordCost('claude-3-5-haiku-20241022', 1000000, 0, 'generate');
    tracker.recordCost('claude-3-5-haiku-20241022', 1000000, 0, 'generate');
    // 2 calls with 1M input each = $2
    expect(tracker.getDailyCost()).toBeCloseTo(2.0, 2);
  });

  it('should provide daily summary', () => {
    tracker.recordCost('claude-3-5-haiku-20241022', 1000, 500, 'generate', 'c1');
    tracker.recordCost('claude-3-5-sonnet-20241022', 2000, 1000, 'assess', 'c1');

    const summary = tracker.getDailySummary(50.00);

    expect(summary.contentCount).toBe(1);
    expect(summary.byOperation).toHaveProperty('generate');
    expect(summary.byOperation).toHaveProperty('assess');
    expect(summary.byModel).toHaveProperty('claude-3-5-haiku-20241022');
    expect(summary.byModel).toHaveProperty('claude-3-5-sonnet-20241022');
  });

  it('should get all records', () => {
    tracker.recordCost('claude-3-5-haiku-20241022', 1000, 500, 'generate');
    tracker.recordCost('claude-3-5-haiku-20241022', 1000, 500, 'assess');

    const records = tracker.getRecords();
    expect(records).toHaveLength(2);
  });
});

describe('RateLimiter', () => {
  it('should allow requests within limits', async () => {
    const limiter = new RateLimiter({ requestsPerMinute: 60, maxConcurrentRequests: 5 });

    // Should acquire immediately
    await limiter.acquire();
    limiter.release();
  });

  it('should track concurrent requests', async () => {
    const limiter = new RateLimiter({ requestsPerMinute: 60, maxConcurrentRequests: 2 });

    // Acquire two
    await limiter.acquire();
    await limiter.acquire();

    // Third should wait until one is released
    const acquirePromise = limiter.acquire();
    limiter.release();

    await expect(acquirePromise).resolves.toBeUndefined();
    limiter.release();
    limiter.release();
  });
});
