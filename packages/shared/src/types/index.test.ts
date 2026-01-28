import { describe, it, expect } from 'vitest';
import {
  StorefrontConfigSchema,
  ContentItemSchema,
  SEOOpportunitySchema,
  AnalyticsEventSchema,
  JobStatusSchema,
  JobTypeSchema,
  JobSchema,
} from './index.js';

describe('Zod Schemas', () => {
  describe('StorefrontConfigSchema', () => {
    const validStorefront = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      domain: 'example.com',
      brandName: 'Test Brand',
      niche: 'travel',
      primaryColor: '#FF5733',
      secondaryColor: '#33FF57',
      seoConfig: {
        titleTemplate: '%s | Test Brand',
        defaultDescription: 'A test brand description',
        keywords: ['travel', 'tours'],
      },
      holibobPartnerId: 'partner-123',
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should validate a valid storefront config', () => {
      const result = StorefrontConfigSchema.safeParse(validStorefront);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = StorefrontConfigSchema.safeParse({
        ...validStorefront,
        id: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid hex color', () => {
      const result = StorefrontConfigSchema.safeParse({
        ...validStorefront,
        primaryColor: 'not-a-color',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const result = StorefrontConfigSchema.safeParse({
        ...validStorefront,
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should allow optional fields', () => {
      const result = StorefrontConfigSchema.safeParse({
        ...validStorefront,
        description: 'Optional description',
        logoUrl: 'https://example.com/logo.png',
        faviconUrl: 'https://example.com/favicon.ico',
        socialLinks: {
          facebook: 'https://facebook.com/test',
          instagram: 'https://instagram.com/test',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ContentItemSchema', () => {
    const validContent = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      storefrontId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'landing_page' as const,
      slug: 'test-page',
      title: 'Test Page',
      metaTitle: 'Test Page | Brand',
      metaDescription: 'A test page description',
      content: '<p>Test content</p>',
      status: 'draft' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should validate a valid content item', () => {
      const result = ContentItemSchema.safeParse(validContent);
      expect(result.success).toBe(true);
    });

    it('should accept all content types', () => {
      const types = ['landing_page', 'category_page', 'product_page', 'blog_post', 'faq'] as const;
      types.forEach((type) => {
        const result = ContentItemSchema.safeParse({ ...validContent, type });
        expect(result.success).toBe(true);
      });
    });

    it('should accept all status values', () => {
      const statuses = ['draft', 'review', 'published', 'archived'] as const;
      statuses.forEach((status) => {
        const result = ContentItemSchema.safeParse({ ...validContent, status });
        expect(result.success).toBe(true);
      });
    });

    it('should allow optional publishedAt', () => {
      const result = ContentItemSchema.safeParse({
        ...validContent,
        publishedAt: new Date(),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SEOOpportunitySchema', () => {
    const validSEO = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      keyword: 'london tours',
      searchVolume: 10000,
      difficulty: 45,
      cpc: 2.5,
      intent: 'transactional' as const,
      niche: 'travel',
      status: 'identified' as const,
      priority: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should validate a valid SEO opportunity', () => {
      const result = SEOOpportunitySchema.safeParse(validSEO);
      expect(result.success).toBe(true);
    });

    it('should reject negative search volume', () => {
      const result = SEOOpportunitySchema.safeParse({
        ...validSEO,
        searchVolume: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should reject difficulty over 100', () => {
      const result = SEOOpportunitySchema.safeParse({
        ...validSEO,
        difficulty: 150,
      });
      expect(result.success).toBe(false);
    });

    it('should reject priority outside 1-5 range', () => {
      const result = SEOOpportunitySchema.safeParse({
        ...validSEO,
        priority: 10,
      });
      expect(result.success).toBe(false);
    });

    it('should accept all intent types', () => {
      const intents = ['informational', 'navigational', 'transactional', 'commercial'] as const;
      intents.forEach((intent) => {
        const result = SEOOpportunitySchema.safeParse({ ...validSEO, intent });
        expect(result.success).toBe(true);
      });
    });

    it('should allow optional location and assignedStorefrontId', () => {
      const result = SEOOpportunitySchema.safeParse({
        ...validSEO,
        location: 'London, UK',
        assignedStorefrontId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('AnalyticsEventSchema', () => {
    const validEvent = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      storefrontId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'page_view' as const,
      sessionId: 'session-abc123',
      metadata: { path: '/home' },
      timestamp: new Date(),
    };

    it('should validate a valid analytics event', () => {
      const result = AnalyticsEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should accept all event types', () => {
      const eventTypes = [
        'page_view',
        'product_view',
        'add_to_cart',
        'checkout_start',
        'checkout_complete',
        'search',
        'click',
      ] as const;
      eventTypes.forEach((eventType) => {
        const result = AnalyticsEventSchema.safeParse({ ...validEvent, eventType });
        expect(result.success).toBe(true);
      });
    });

    it('should allow optional userId', () => {
      const result = AnalyticsEventSchema.safeParse({
        ...validEvent,
        userId: 'user-123',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('JobStatusSchema', () => {
    it('should accept all valid statuses', () => {
      const statuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
      statuses.forEach((status) => {
        const result = JobStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      const result = JobStatusSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('JobTypeSchema', () => {
    it('should accept all valid job types', () => {
      const types = [
        'content_generation',
        'seo_analysis',
        'site_creation',
        'domain_setup',
        'content_optimization',
        'analytics_aggregation',
      ];
      types.forEach((type) => {
        const result = JobTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid job type', () => {
      const result = JobTypeSchema.safeParse('invalid_type');
      expect(result.success).toBe(false);
    });
  });

  describe('JobSchema', () => {
    const validJob = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      type: 'content_generation' as const,
      status: 'pending' as const,
      payload: { contentId: 'abc123' },
      createdAt: new Date(),
    };

    it('should validate a valid job', () => {
      const result = JobSchema.safeParse(validJob);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const result = JobSchema.safeParse(validJob);
      if (result.success) {
        expect(result.data.priority).toBe(5);
        expect(result.data.attempts).toBe(0);
        expect(result.data.maxAttempts).toBe(3);
      }
    });

    it('should reject priority outside 1-10 range', () => {
      const result = JobSchema.safeParse({
        ...validJob,
        priority: 15,
      });
      expect(result.success).toBe(false);
    });

    it('should allow optional fields', () => {
      const result = JobSchema.safeParse({
        ...validJob,
        result: { output: 'success' },
        error: 'Some error',
        startedAt: new Date(),
        completedAt: new Date(),
      });
      expect(result.success).toBe(true);
    });
  });
});
