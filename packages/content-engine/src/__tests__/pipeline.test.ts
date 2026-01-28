import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentPipeline, createPipeline, generateContent } from '../pipeline';
import type { ContentBrief, PipelineConfig } from '../types';
import { DEFAULT_PIPELINE_CONFIG } from '../types';

// Mock the client module
vi.mock('../client', () => {
  return {
    ClaudeClient: vi.fn().mockImplementation(() => ({
      generate: vi.fn().mockResolvedValue({
        content: '<h1>Barcelona</h1><p>Discover the magic of Barcelona...</p>',
        usage: { inputTokens: 500, outputTokens: 1000 },
        cost: 0.01,
      }),
      assess: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          scores: {
            factualAccuracy: 85,
            seoCompliance: 80,
            readability: 90,
            uniqueness: 75,
            engagement: 82,
          },
          overallScore: 82,
          passed: true,
          issues: [],
          suggestions: [],
          strengths: ['Good content'],
        }),
        usage: { inputTokens: 300, outputTokens: 200 },
        cost: 0.005,
      }),
      rewrite: vi.fn().mockResolvedValue({
        content: '<h1>Barcelona</h1><p>Improved content...</p>',
        usage: { inputTokens: 600, outputTokens: 1100 },
        cost: 0.012,
      }),
      getDailyCostSummary: vi.fn().mockReturnValue({
        date: '2026-01-28',
        totalCost: 0.05,
        byModel: {},
        byOperation: {},
        contentCount: 1,
        limit: 50,
        remaining: 49.95,
      }),
      estimateCost: vi.fn().mockReturnValue(0.01),
      canAfford: vi.fn().mockReturnValue(true),
    })),
    getClaudeClient: vi.fn().mockImplementation(() => ({
      generate: vi.fn().mockResolvedValue({
        content: '<h1>Barcelona</h1><p>Discover the magic of Barcelona...</p>',
        usage: { inputTokens: 500, outputTokens: 1000 },
        cost: 0.01,
      }),
      assess: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          scores: {
            factualAccuracy: 85,
            seoCompliance: 80,
            readability: 90,
            uniqueness: 75,
            engagement: 82,
          },
          overallScore: 82,
          passed: true,
          issues: [],
          suggestions: [],
          strengths: ['Good content'],
        }),
        usage: { inputTokens: 300, outputTokens: 200 },
        cost: 0.005,
      }),
      rewrite: vi.fn().mockResolvedValue({
        content: '<h1>Barcelona</h1><p>Improved content...</p>',
        usage: { inputTokens: 600, outputTokens: 1100 },
        cost: 0.012,
      }),
      getDailyCostSummary: vi.fn().mockReturnValue({
        date: '2026-01-28',
        totalCost: 0.05,
        byModel: {},
        byOperation: {},
        contentCount: 1,
        limit: 50,
        remaining: 49.95,
      }),
      estimateCost: vi.fn().mockReturnValue(0.01),
      canAfford: vi.fn().mockReturnValue(true),
    })),
    MODELS: {
      haiku: 'claude-3-5-haiku-20241022',
      sonnet: 'claude-3-5-sonnet-20241022',
      opus: 'claude-3-opus-20240229',
    },
  };
});

// Mock the quality module
vi.mock('../quality', () => {
  return {
    QualityGate: vi.fn().mockImplementation(() => ({
      assess: vi.fn().mockResolvedValue({
        assessment: {
          overallScore: 82,
          breakdown: {
            factualAccuracy: 85,
            seoCompliance: 80,
            readability: 90,
            uniqueness: 75,
            engagement: 82,
          },
          passed: true,
          issues: [],
          suggestions: [],
          assessedAt: new Date(),
          assessedBy: 'sonnet',
        },
        rawResponse: '{}',
        tokensUsed: 500,
        cost: 0.005,
      }),
      shouldAutoPublish: vi.fn().mockReturnValue(false),
      shouldRewrite: vi.fn().mockReturnValue(false),
      getRewriteIssues: vi.fn().mockReturnValue([]),
      setThresholds: vi.fn(),
    })),
  };
});

describe('ContentPipeline', () => {
  const testBrief: ContentBrief = {
    type: 'destination',
    siteId: 'test-site',
    targetKeyword: 'things to do in Barcelona',
    secondaryKeywords: ['Barcelona activities', 'Barcelona tours'],
    destination: 'Barcelona',
    tone: 'enthusiastic',
    targetLength: { min: 600, max: 900 },
  };

  describe('constructor', () => {
    it('should create pipeline with default config', () => {
      const pipeline = new ContentPipeline();
      expect(pipeline).toBeInstanceOf(ContentPipeline);
    });

    it('should create pipeline with custom config', () => {
      const pipeline = new ContentPipeline({
        qualityThreshold: 80,
        maxRewrites: 5,
      });
      expect(pipeline).toBeInstanceOf(ContentPipeline);
    });
  });

  describe('onEvent', () => {
    it('should subscribe to events and return unsubscribe function', () => {
      const pipeline = new ContentPipeline();
      const handler = vi.fn();

      const unsubscribe = pipeline.onEvent(handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow unsubscribe', () => {
      const pipeline = new ContentPipeline();
      const handler = vi.fn();

      const unsubscribe = pipeline.onEvent(handler);
      unsubscribe();

      // Handler should be removed
    });
  });

  describe('generate', () => {
    it('should generate content successfully', async () => {
      const pipeline = new ContentPipeline();
      const result = await pipeline.generate(testBrief);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('should include content metadata', async () => {
      const pipeline = new ContentPipeline();
      const result = await pipeline.generate(testBrief);

      expect(result.content).toHaveProperty('id');
      expect(result.content).toHaveProperty('type', 'destination');
      expect(result.content).toHaveProperty('siteId', 'test-site');
      expect(result.content).toHaveProperty('targetKeyword', 'things to do in Barcelona');
    });

    it('should track costs', async () => {
      const pipeline = new ContentPipeline();
      const result = await pipeline.generate(testBrief);

      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('should emit events during generation', async () => {
      const pipeline = new ContentPipeline();
      const events: any[] = [];

      pipeline.onEvent((event) => events.push(event));
      await pipeline.generate(testBrief);

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'generation_started')).toBe(true);
      expect(events.some((e) => e.type === 'generation_completed')).toBe(true);
    });
  });

  describe('generateBatch', () => {
    it('should generate multiple pieces of content', async () => {
      const pipeline = new ContentPipeline();
      const briefs = [
        testBrief,
        { ...testBrief, destination: 'Madrid', targetKeyword: 'things to do in Madrid' },
      ];

      const results = await pipeline.generateBatch(briefs);

      expect(results.size).toBe(2);
    });

    it('should respect maxConcurrent option', async () => {
      const pipeline = new ContentPipeline();
      const briefs = [
        testBrief,
        { ...testBrief, destination: 'Madrid' },
        { ...testBrief, destination: 'Paris' },
      ];

      const results = await pipeline.generateBatch(briefs, { maxConcurrent: 1 });

      expect(results.size).toBe(3);
    });
  });

  describe('getCostSummary', () => {
    it('should return cost summary', () => {
      const pipeline = new ContentPipeline();
      const summary = pipeline.getCostSummary();

      expect(summary).toHaveProperty('date');
      expect(summary).toHaveProperty('totalCost');
      expect(summary).toHaveProperty('remaining');
    });
  });

  describe('getConfig', () => {
    it('should return current config', () => {
      const pipeline = new ContentPipeline({
        qualityThreshold: 80,
        maxRewrites: 5,
      });

      const config = pipeline.getConfig();

      expect(config.qualityThreshold).toBe(80);
      expect(config.maxRewrites).toBe(5);
    });
  });

  describe('updateConfig', () => {
    it('should update config values', () => {
      const pipeline = new ContentPipeline();

      pipeline.updateConfig({ qualityThreshold: 85 });
      const config = pipeline.getConfig();

      expect(config.qualityThreshold).toBe(85);
    });
  });
});

describe('createPipeline', () => {
  it('should create pipeline instance', () => {
    const pipeline = createPipeline();
    expect(pipeline).toBeInstanceOf(ContentPipeline);
  });

  it('should accept config options', () => {
    const pipeline = createPipeline({ maxRewrites: 5 });
    expect(pipeline.getConfig().maxRewrites).toBe(5);
  });
});

describe('generateContent', () => {
  const testBrief: ContentBrief = {
    type: 'destination',
    siteId: 'test-site',
    targetKeyword: 'Barcelona',
    secondaryKeywords: [],
    tone: 'professional',
    targetLength: { min: 500, max: 800 },
  };

  it('should generate content with default settings', async () => {
    const result = await generateContent(testBrief);
    expect(result.success).toBe(true);
  });
});
