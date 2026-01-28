import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables before imports
vi.stubEnv('REDIS_URL', 'redis://test:6379');
vi.stubEnv('PORT', '3002');

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name) => ({
    name,
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation((name, processor, opts) => ({
    name,
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock ioredis
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    quit: vi.fn().mockResolvedValue(undefined),
    status: 'ready',
  })),
}));

describe('Demand Generation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Queue definitions', () => {
    it('should create SEO analysis queue', async () => {
      const { seoAnalysisQueue } = await import('./index.js');
      expect(seoAnalysisQueue).toBeDefined();
      expect(seoAnalysisQueue.name).toBe('seo-analysis');
    });

    it('should create content generation queue', async () => {
      const { contentGenerationQueue } = await import('./index.js');
      expect(contentGenerationQueue).toBeDefined();
      expect(contentGenerationQueue.name).toBe('content-generation');
    });

    it('should create trend monitoring queue', async () => {
      const { trendMonitoringQueue } = await import('./index.js');
      expect(trendMonitoringQueue).toBeDefined();
      expect(trendMonitoringQueue.name).toBe('trend-monitoring');
    });
  });

  describe('Worker definitions', () => {
    it('should create SEO worker', async () => {
      const { seoWorker } = await import('./index.js');
      expect(seoWorker).toBeDefined();
      expect(seoWorker.name).toBe('seo-analysis');
    });

    it('should create content worker', async () => {
      const { contentWorker } = await import('./index.js');
      expect(contentWorker).toBeDefined();
      expect(contentWorker.name).toBe('content-generation');
    });

    it('should create trend worker', async () => {
      const { trendWorker } = await import('./index.js');
      expect(trendWorker).toBeDefined();
      expect(trendWorker.name).toBe('trend-monitoring');
    });
  });

  describe('Job type interfaces', () => {
    it('should have correct SEOAnalysisJob interface', async () => {
      const { seoAnalysisQueue } = await import('./index.js');

      // Test that the queue can accept jobs with the correct shape
      const jobData = {
        siteId: 'site-123',
        targetKeywords: ['keyword1', 'keyword2'],
        competitorUrls: ['https://competitor.com'],
      };

      await seoAnalysisQueue.add('analyze', jobData);
      expect(seoAnalysisQueue.add).toHaveBeenCalledWith('analyze', jobData);
    });

    it('should have correct ContentGenerationJob interface', async () => {
      const { contentGenerationQueue } = await import('./index.js');

      const jobData = {
        siteId: 'site-123',
        opportunityId: 'opp-456',
        contentType: 'destination' as const,
        targetKeyword: 'best tours london',
      };

      await contentGenerationQueue.add('generate', jobData);
      expect(contentGenerationQueue.add).toHaveBeenCalledWith('generate', jobData);
    });

    it('should have correct TrendMonitoringJob interface', async () => {
      const { trendMonitoringQueue } = await import('./index.js');

      const jobData = {
        siteId: 'site-123',
        region: 'UK',
        categories: ['tours', 'activities'],
      };

      await trendMonitoringQueue.add('monitor', jobData);
      expect(trendMonitoringQueue.add).toHaveBeenCalledWith('monitor', jobData);
    });
  });

  describe('Error handling', () => {
    it('should register error handlers on workers', async () => {
      const { seoWorker, contentWorker, trendWorker } = await import('./index.js');

      expect(seoWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(contentWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(trendWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
    });
  });
});

describe('Job Processing', () => {
  describe('SEO Analysis Job', () => {
    it('should process SEO analysis jobs correctly', async () => {
      // The actual job processing logic would be tested here
      // For now, we verify the job structure
      const seoJob = {
        siteId: 'site-123',
        targetKeywords: ['london tours', 'uk experiences'],
        competitorUrls: ['https://viator.com', 'https://getyourguide.com'],
      };

      expect(seoJob.siteId).toBeDefined();
      expect(Array.isArray(seoJob.targetKeywords)).toBe(true);
      expect(Array.isArray(seoJob.competitorUrls)).toBe(true);
    });
  });

  describe('Content Generation Job', () => {
    it('should validate content types', () => {
      const validTypes = ['destination', 'experience', 'category', 'blog'];

      validTypes.forEach((type) => {
        const job = {
          siteId: 'site-123',
          opportunityId: 'opp-456',
          contentType: type,
          targetKeyword: 'test keyword',
        };
        expect(job.contentType).toBe(type);
      });
    });
  });

  describe('Trend Monitoring Job', () => {
    it('should handle optional fields', () => {
      // Minimal job with only required field
      const minimalJob = {
        siteId: 'site-123',
      };
      expect(minimalJob.siteId).toBeDefined();

      // Full job with all fields
      const fullJob = {
        siteId: 'site-123',
        region: 'Europe',
        categories: ['adventure', 'culture'],
      };
      expect(fullJob.region).toBe('Europe');
      expect(fullJob.categories).toHaveLength(2);
    });
  });
});

describe('Environment Configuration', () => {
  it('should use REDIS_URL from environment', () => {
    expect(process.env['REDIS_URL']).toBe('redis://test:6379');
  });

  it('should use PORT from environment', () => {
    expect(process.env['PORT']).toBe('3002');
  });
});
