import { describe, it, expect } from 'vitest';
import {
  ContentBriefSchema,
  PipelineConfigSchema,
  DEFAULT_PIPELINE_CONFIG,
} from '../types';

describe('Type Schemas', () => {
  describe('ContentBriefSchema', () => {
    it('should validate a valid content brief', () => {
      const validBrief = {
        type: 'destination',
        siteId: 'test-site',
        targetKeyword: 'things to do in Barcelona',
        secondaryKeywords: ['Barcelona activities', 'Barcelona tours'],
        destination: 'Barcelona',
        tone: 'enthusiastic',
        targetLength: { min: 500, max: 800 },
      };

      const result = ContentBriefSchema.safeParse(validBrief);
      expect(result.success).toBe(true);
    });

    it('should reject invalid content type', () => {
      const invalidBrief = {
        type: 'invalid_type',
        siteId: 'test-site',
        targetKeyword: 'test keyword',
        secondaryKeywords: [],
        tone: 'professional',
        targetLength: { min: 100, max: 200 },
      };

      const result = ContentBriefSchema.safeParse(invalidBrief);
      expect(result.success).toBe(false);
    });

    it('should reject empty siteId', () => {
      const invalidBrief = {
        type: 'destination',
        siteId: '',
        targetKeyword: 'test keyword',
        secondaryKeywords: [],
        tone: 'professional',
        targetLength: { min: 100, max: 200 },
      };

      const result = ContentBriefSchema.safeParse(invalidBrief);
      expect(result.success).toBe(false);
    });

    it('should reject invalid tone', () => {
      const invalidBrief = {
        type: 'destination',
        siteId: 'test-site',
        targetKeyword: 'test keyword',
        secondaryKeywords: [],
        tone: 'invalid_tone',
        targetLength: { min: 100, max: 200 },
      };

      const result = ContentBriefSchema.safeParse(invalidBrief);
      expect(result.success).toBe(false);
    });

    it('should validate all content types', () => {
      const contentTypes = ['destination', 'category', 'experience', 'blog', 'meta_description', 'seo_title'];

      for (const type of contentTypes) {
        const brief = {
          type,
          siteId: 'test-site',
          targetKeyword: 'test keyword',
          secondaryKeywords: [],
          tone: 'professional',
          targetLength: { min: 100, max: 200 },
        };

        const result = ContentBriefSchema.safeParse(brief);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all tone types', () => {
      const tones = ['professional', 'casual', 'enthusiastic', 'informative'];

      for (const tone of tones) {
        const brief = {
          type: 'destination',
          siteId: 'test-site',
          targetKeyword: 'test keyword',
          secondaryKeywords: [],
          tone,
          targetLength: { min: 100, max: 200 },
        };

        const result = ContentBriefSchema.safeParse(brief);
        expect(result.success).toBe(true);
      }
    });

    it('should accept optional fields', () => {
      const briefWithOptionals = {
        type: 'destination',
        siteId: 'test-site',
        targetKeyword: 'things to do in Barcelona',
        secondaryKeywords: ['Barcelona activities'],
        destination: 'Barcelona',
        category: 'Tours',
        experienceId: 'exp-123',
        tone: 'enthusiastic',
        targetLength: { min: 500, max: 800 },
        includeElements: ['hero_section', 'faq'],
        excludeElements: ['pricing_table'],
        sourceData: { population: 1600000 },
        competitorContent: ['https://example.com'],
      };

      const result = ContentBriefSchema.safeParse(briefWithOptionals);
      expect(result.success).toBe(true);
    });
  });

  describe('PipelineConfigSchema', () => {
    it('should validate a valid pipeline config', () => {
      const validConfig = {
        draftModel: 'haiku',
        qualityModel: 'sonnet',
        rewriteModel: 'haiku',
        qualityThreshold: 75,
        autoPublishThreshold: 90,
        maxRewrites: 3,
        rewriteScoreImprovement: 5,
        maxCostPerContent: 0.50,
        dailyCostLimit: 50.00,
        requestsPerMinute: 50,
        maxConcurrentRequests: 5,
      };

      const result = PipelineConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject invalid model names', () => {
      const invalidConfig = {
        draftModel: 'gpt4',
        qualityModel: 'sonnet',
        rewriteModel: 'haiku',
        qualityThreshold: 75,
        autoPublishThreshold: 90,
        maxRewrites: 3,
        rewriteScoreImprovement: 5,
        maxCostPerContent: 0.50,
        dailyCostLimit: 50.00,
        requestsPerMinute: 50,
        maxConcurrentRequests: 5,
      };

      const result = PipelineConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject threshold out of range', () => {
      const invalidConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        qualityThreshold: 150,
      };

      const result = PipelineConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject negative costs', () => {
      const invalidConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        dailyCostLimit: -10,
      };

      const result = PipelineConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('DEFAULT_PIPELINE_CONFIG', () => {
    it('should have valid default values', () => {
      expect(DEFAULT_PIPELINE_CONFIG.draftModel).toBe('haiku');
      expect(DEFAULT_PIPELINE_CONFIG.qualityModel).toBe('sonnet');
      expect(DEFAULT_PIPELINE_CONFIG.qualityThreshold).toBe(75);
      expect(DEFAULT_PIPELINE_CONFIG.maxRewrites).toBe(3);
      expect(DEFAULT_PIPELINE_CONFIG.dailyCostLimit).toBe(50.00);
    });

    it('should pass schema validation', () => {
      const result = PipelineConfigSchema.safeParse(DEFAULT_PIPELINE_CONFIG);
      expect(result.success).toBe(true);
    });
  });
});
