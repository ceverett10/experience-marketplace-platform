import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContentGenerator,
  createGenerator,
  generateDestinationPage,
  generateCategoryPage,
  generateExperienceDescription,
  generateBlogPost,
  generateMetaDescription,
  generateSeoTitle,
} from '../generators';

// Mock the pipeline module
vi.mock('../pipeline', () => {
  const mockGenerate = vi.fn().mockResolvedValue({
    success: true,
    content: {
      id: 'content-123',
      title: 'Test Content',
      content: '<h1>Test</h1><p>Content here</p>',
      qualityAssessment: { overallScore: 85, passed: true },
    },
    totalCost: 0.05,
    totalTokens: 1500,
    rewriteCount: 0,
  });

  return {
    ContentPipeline: vi.fn().mockImplementation(() => ({
      generate: mockGenerate,
      getCostSummary: vi.fn().mockReturnValue({
        date: '2026-01-28',
        totalCost: 0.05,
        remaining: 49.95,
      }),
      onEvent: vi.fn().mockReturnValue(() => {}),
    })),
    createPipeline: vi.fn().mockImplementation(() => ({
      generate: mockGenerate,
      getCostSummary: vi.fn().mockReturnValue({
        date: '2026-01-28',
        totalCost: 0.05,
        remaining: 49.95,
      }),
      onEvent: vi.fn().mockReturnValue(() => {}),
    })),
    generateContent: mockGenerate,
  };
});

describe('Standalone Generator Functions', () => {
  describe('generateDestinationPage', () => {
    it('should generate destination content', async () => {
      const result = await generateDestinationPage({
        siteId: 'test-site',
        destination: 'Barcelona',
        targetKeyword: 'things to do in Barcelona',
        secondaryKeywords: ['Barcelona activities'],
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('should accept tone option', async () => {
      const result = await generateDestinationPage({
        siteId: 'test-site',
        destination: 'Barcelona',
        targetKeyword: 'Barcelona tours',
        tone: 'casual',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('generateCategoryPage', () => {
    it('should generate category content', async () => {
      const result = await generateCategoryPage({
        siteId: 'test-site',
        category: 'Food Tours',
        targetKeyword: 'food tours',
      });

      expect(result.success).toBe(true);
    });

    it('should accept destination option', async () => {
      const result = await generateCategoryPage({
        siteId: 'test-site',
        category: 'Food Tours',
        destination: 'Barcelona',
        targetKeyword: 'Barcelona food tours',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('generateExperienceDescription', () => {
    it('should generate experience content', async () => {
      const result = await generateExperienceDescription({
        siteId: 'test-site',
        experienceId: 'exp-123',
        title: 'Sagrada Familia Tour',
        targetKeyword: 'Sagrada Familia tour',
        duration: '2 hours',
        price: '€45',
        location: 'Barcelona',
        highlights: ['Expert guide', 'Skip the line'],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('generateBlogPost', () => {
    it('should generate listicle blog', async () => {
      const result = await generateBlogPost({
        siteId: 'test-site',
        targetKeyword: '10 best things to do in Barcelona',
        blogType: 'listicle',
        destination: 'Barcelona',
      });

      expect(result.success).toBe(true);
    });

    it('should generate guide blog', async () => {
      const result = await generateBlogPost({
        siteId: 'test-site',
        targetKeyword: 'Barcelona travel guide',
        blogType: 'guide',
      });

      expect(result.success).toBe(true);
    });

    it('should generate comparison blog', async () => {
      const result = await generateBlogPost({
        siteId: 'test-site',
        targetKeyword: 'Barcelona vs Madrid',
        blogType: 'comparison',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('generateMetaDescription', () => {
    it('should generate meta description', async () => {
      const result = await generateMetaDescription({
        siteId: 'test-site',
        targetKeyword: 'Barcelona tours',
        destination: 'Barcelona',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('generateSeoTitle', () => {
    it('should generate SEO title', async () => {
      const result = await generateSeoTitle({
        siteId: 'test-site',
        targetKeyword: 'Barcelona tours',
        destination: 'Barcelona',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('ContentGenerator Class', () => {
  let generator: ContentGenerator;

  beforeEach(() => {
    generator = createGenerator({
      siteId: 'test-site',
      tone: 'professional',
    });
  });

  describe('destination', () => {
    it('should generate destination content', async () => {
      const result = await generator.destination(
        'Barcelona',
        'things to do in Barcelona',
        { secondaryKeywords: ['Barcelona activities'] }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('category', () => {
    it('should generate category content', async () => {
      const result = await generator.category(
        'Food Tours',
        'food tours in Barcelona',
        { destination: 'Barcelona' }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('experience', () => {
    it('should generate experience content', async () => {
      const result = await generator.experience(
        {
          id: 'exp-123',
          title: 'Sagrada Familia Tour',
          duration: '2 hours',
          price: '€45',
        },
        'Sagrada Familia tour'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('blog', () => {
    it('should generate blog content', async () => {
      const result = await generator.blog(
        'things to do in Barcelona',
        'listicle',
        { destination: 'Barcelona' }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('metaDescription', () => {
    it('should generate meta description', async () => {
      const result = await generator.metaDescription('Barcelona tours');

      expect(result.success).toBe(true);
    });
  });

  describe('seoTitle', () => {
    it('should generate SEO title', async () => {
      const result = await generator.seoTitle('Barcelona tours');

      expect(result.success).toBe(true);
    });
  });

  describe('completePage', () => {
    it('should generate complete destination page', async () => {
      const result = await generator.completePage('destination', {
        destination: 'Barcelona',
        targetKeyword: 'things to do in Barcelona',
      });

      expect(result.content.success).toBe(true);
      expect(result.metaDescription.success).toBe(true);
      expect(result.seoTitle.success).toBe(true);
    });

    it('should generate complete category page', async () => {
      const result = await generator.completePage('category', {
        category: 'Food Tours',
        targetKeyword: 'Barcelona food tours',
      });

      expect(result.content.success).toBe(true);
      expect(result.metaDescription.success).toBe(true);
      expect(result.seoTitle.success).toBe(true);
    });
  });

  describe('getCostSummary', () => {
    it('should return cost summary', () => {
      const summary = generator.getCostSummary();

      expect(summary).toHaveProperty('date');
      expect(summary).toHaveProperty('totalCost');
      expect(summary).toHaveProperty('remaining');
    });
  });

  describe('onEvent', () => {
    it('should subscribe to events', () => {
      const handler = vi.fn();
      const unsubscribe = generator.onEvent(handler);

      expect(typeof unsubscribe).toBe('function');
    });
  });
});

describe('createGenerator', () => {
  it('should create generator with options', () => {
    const generator = createGenerator({
      siteId: 'test-site',
      tone: 'enthusiastic',
    });

    expect(generator).toBeInstanceOf(ContentGenerator);
  });

  it('should use default tone if not provided', () => {
    const generator = createGenerator({ siteId: 'test-site' });

    expect(generator).toBeInstanceOf(ContentGenerator);
  });
});
