import { describe, it, expect } from 'vitest';
import { extractContentKeywords, getPageUrl } from './related-content';

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
});
