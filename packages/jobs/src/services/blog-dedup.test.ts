import { describe, it, expect } from 'vitest';
import {
  tokenize,
  jaccardSimilarity,
  findSimilarTitle,
  clusterDuplicateTitles,
} from './blog-dedup.js';

describe('blog-dedup', () => {
  describe('tokenize', () => {
    it('should lowercase and remove stop words', () => {
      const tokens = tokenize('The Best Harry Potter Tours in London');
      expect(tokens.has('harry')).toBe(true);
      expect(tokens.has('potter')).toBe(true);
      expect(tokens.has('tours')).toBe(true);
      expect(tokens.has('london')).toBe(true);
      // "the", "best", "in" are stop words
      expect(tokens.has('the')).toBe(false);
      expect(tokens.has('best')).toBe(false);
      expect(tokens.has('in')).toBe(false);
    });

    it('should remove punctuation and single-char words', () => {
      const tokens = tokenize("A Beginner's Guide: 10 Tips!");
      expect(tokens.has("beginner's")).toBe(false);
      // Apostrophe becomes space, so "beginner" is a separate token
      expect(tokens.has('beginner')).toBe(true);
      expect(tokens.has('10')).toBe(false); // numbers-only removed
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 1 for identical sets', () => {
      const a = new Set(['harry', 'potter', 'tours']);
      expect(jaccardSimilarity(a, a)).toBe(1);
    });

    it('should return 0 for completely disjoint sets', () => {
      const a = new Set(['harry', 'potter']);
      const b = new Set(['food', 'tours']);
      expect(jaccardSimilarity(a, b)).toBe(0);
    });

    it('should return correct similarity for partial overlap', () => {
      const a = new Set(['harry', 'potter', 'tours', 'london']);
      const b = new Set(['harry', 'potter', 'experiences', 'london']);
      // intersection: harry, potter, london (3), union: 5
      expect(jaccardSimilarity(a, b)).toBeCloseTo(3 / 5);
    });
  });

  describe('findSimilarTitle', () => {
    const existingTitles = [
      'Top Harry Potter Tours in London',
      'Food Walking Tours in Borough Market',
      'How to Visit the Tower of London',
    ];

    it('should detect near-duplicate titles', () => {
      const result = findSimilarTitle('Best Harry Potter Experiences in London', existingTitles);
      expect(result).not.toBeNull();
      expect(result).toContain('Harry Potter');
    });

    it('should allow genuinely different titles', () => {
      const result = findSimilarTitle('A History of Wizarding Schools in Scotland', existingTitles);
      expect(result).toBeNull();
    });

    it('should return null for empty existing list', () => {
      expect(findSimilarTitle('Any Title', [])).toBeNull();
    });
  });

  describe('clusterDuplicateTitles', () => {
    it('should group near-duplicate titles together', () => {
      const titles = [
        'Best Harry Potter Tours in London',
        'How to Visit the Tower of London',
        'Top Harry Potter Experiences in London',
        'Food Walking Tours in Borough Market',
        'Harry Potter Tour Guide for London Visitors',
      ];

      const clusters = clusterDuplicateTitles(titles);
      // Harry Potter titles should cluster together
      const hpCluster = clusters.find((c) => c.some((item) => item.title.includes('Harry Potter')));
      expect(hpCluster).toBeDefined();
      expect(hpCluster!.length).toBeGreaterThanOrEqual(2);
    });

    it('should keep unique titles in their own clusters', () => {
      const titles = ['Best Harry Potter Tours in London', 'Food Walking Tours in Borough Market'];
      const clusters = clusterDuplicateTitles(titles);
      expect(clusters.length).toBe(2);
      expect(clusters.every((c) => c.length === 1)).toBe(true);
    });

    it('should handle empty input', () => {
      expect(clusterDuplicateTitles([])).toEqual([]);
    });
  });
});
