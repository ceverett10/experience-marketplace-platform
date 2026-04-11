import { describe, it, expect, vi } from 'vitest';
import { extractContentKeywords, getPageUrl, getRelatedPagesByKeywords } from './related-content';

vi.mock('./prisma', () => ({
  prisma: {
    page: {
      findMany: vi.fn(async () => [
        {
          id: 'p1',
          title: 'Best Food Tours in London',
          slug: 'blog/best-food-tours-london',
          metaDescription: 'Discover the best food tours',
          noIndex: false,
          publishedAt: new Date(),
          createdAt: new Date(),
          content: { body: 'Great tours...', qualityScore: 85 },
        },
        {
          id: 'p2',
          title: 'Walking Tours Guide',
          slug: 'blog/walking-tours-guide',
          metaDescription: 'A guide to walking tours',
          noIndex: false,
          publishedAt: new Date(),
          createdAt: new Date(),
          content: { body: 'Nice walks...', qualityScore: 70 },
        },
      ]),
    },
  },
}));

describe('related-content', () => {
  describe('extractContentKeywords', () => {
    it('extracts meaningful words from title', () => {
      const keywords = extractContentKeywords('Best Food Tours in London');
      expect(keywords).toContain('food');
      expect(keywords).toContain('tours');
      expect(keywords).toContain('london');
    });

    it('excludes stop words', () => {
      const keywords = extractContentKeywords('The Best Guide to Food Tours');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('best');
      expect(keywords).not.toContain('guide');
    });

    it('excludes short words', () => {
      const keywords = extractContentKeywords('A to Z of UK Food');
      expect(keywords).not.toContain('uk');
    });

    it('includes description keywords', () => {
      const keywords = extractContentKeywords(
        'Walking Tours',
        'Explore the historic streets of Barcelona with a local guide'
      );
      expect(keywords).toContain('walking');
      expect(keywords).toContain('barcelona');
    });

    it('returns lowercase unique terms', () => {
      const keywords = extractContentKeywords('London London LONDON');
      expect(keywords.filter((k) => k === 'london').length).toBe(1);
    });

    it('returns empty array for empty input', () => {
      expect(extractContentKeywords('')).toEqual([]);
    });

    it('strips non-alphanumeric characters', () => {
      const keywords = extractContentKeywords("What's New: Paris! (2024)");
      expect(keywords).toContain('paris');
      expect(keywords).toContain('2024');
    });
  });

  describe('getPageUrl', () => {
    it('returns /{slug} for BLOG pages', () => {
      expect(getPageUrl('blog/best-food-tours', 'BLOG')).toBe('/blog/best-food-tours');
    });

    it('returns /{slug} for LANDING pages', () => {
      expect(getPageUrl('destinations/london', 'LANDING')).toBe('/destinations/london');
    });

    it('returns /{slug} for FAQ pages', () => {
      expect(getPageUrl('faq/booking-help', 'FAQ')).toBe('/faq/booking-help');
    });

    it('returns /categories/{slug} for CATEGORY pages', () => {
      expect(getPageUrl('food-tours', 'CATEGORY')).toBe('/categories/food-tours');
    });
  });

  describe('getRelatedPagesByKeywords', () => {
    it('returns empty array when no keywords provided', async () => {
      const result = await getRelatedPagesByKeywords({
        siteId: 'site-1',
        pageType: 'BLOG',
        keywords: [],
      });
      expect(result).toEqual([]);
    });

    it('returns scored pages matching keywords', async () => {
      const result = await getRelatedPagesByKeywords({
        siteId: 'site-1',
        pageType: 'BLOG',
        keywords: ['food', 'london'],
        limit: 3,
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.title).toContain('Food');
    });

    it('excludes page by ID when excludePageId is set', async () => {
      const result = await getRelatedPagesByKeywords({
        siteId: 'site-1',
        pageType: 'BLOG',
        keywords: ['food'],
        excludePageId: 'p1',
        limit: 3,
      });
      expect(result.every((p) => p.id !== 'p1')).toBe(true);
    });

    it('respects limit parameter', async () => {
      const result = await getRelatedPagesByKeywords({
        siteId: 'site-1',
        pageType: 'BLOG',
        keywords: ['tours'],
        limit: 1,
      });
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });
});
