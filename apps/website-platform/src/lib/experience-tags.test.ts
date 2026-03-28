import { describe, it, expect } from 'vitest';
import { getOccasionTags, OCCASION_TAG_CONFIG } from './experience-tags';
import type { OccasionTag } from './experience-tags';

describe('experience-tags', () => {
  describe('getOccasionTags', () => {
    it('returns empty array when no data provided', () => {
      expect(getOccasionTags({})).toEqual([]);
    });

    it('returns empty array when no keywords match', () => {
      expect(
        getOccasionTags({
          title: 'Generic Tour',
          shortDescription: 'A nice tour of the area.',
          categories: [],
        })
      ).toEqual([]);
    });

    it('detects foodies from food-related categories', () => {
      const tags = getOccasionTags({
        categories: ['food and drink tours'],
      });
      expect(tags).toContain('foodies');
    });

    it('detects couples from wine tours category', () => {
      const tags = getOccasionTags({
        categories: ['wine tours'],
      });
      expect(tags).toContain('couples');
      expect(tags).toContain('foodies');
    });

    it('detects adventure from title keywords', () => {
      const tags = getOccasionTags({
        title: 'Kayaking Adventure on the Thames',
      });
      expect(tags).toContain('adventure');
    });

    it('detects culture from museum category', () => {
      const tags = getOccasionTags({
        categories: ['museum tours'],
      });
      expect(tags).toContain('culture');
    });

    it('detects families from description keywords', () => {
      const tags = getOccasionTags({
        shortDescription: 'A fun family-friendly tour suitable for kids of all ages.',
      });
      expect(tags).toContain('families');
    });

    it('detects relaxation from spa category', () => {
      const tags = getOccasionTags({
        categories: ['spa and wellness'],
      });
      expect(tags).toContain('relaxation');
    });

    it('detects groups from corporate keywords', () => {
      const tags = getOccasionTags({
        title: 'Team Building Experience',
        shortDescription: 'Perfect for corporate events and group celebrations.',
      });
      expect(tags).toContain('groups');
    });

    it('returns at most 3 tags', () => {
      const tags = getOccasionTags({
        title: 'Romantic wine tasting cooking class kayaking museum tour',
        categories: ['food and drink tours', 'museum tours', 'outdoor activities'],
      });
      expect(tags.length).toBeLessThanOrEqual(3);
    });

    it('prioritises category matches over keyword matches', () => {
      const tags = getOccasionTags({
        title: 'Tour with romantic sunset views',
        categories: ['food and drink tours'],
      });
      // foodies should be first (category match scores 3), couples second (keyword scores 1)
      expect(tags[0]).toBe('foodies');
    });

    it('multi-word keywords score higher', () => {
      const tags = getOccasionTags({
        shortDescription: 'A perfect date night experience with wine tasting included.',
      });
      expect(tags).toContain('couples');
    });
  });

  describe('OCCASION_TAG_CONFIG', () => {
    it('has config for all tag types', () => {
      const expectedTags: OccasionTag[] = [
        'couples',
        'families',
        'solo',
        'groups',
        'foodies',
        'adventure',
        'culture',
        'relaxation',
      ];
      for (const tag of expectedTags) {
        expect(OCCASION_TAG_CONFIG[tag]).toBeDefined();
        expect(OCCASION_TAG_CONFIG[tag].label).toBeTruthy();
        expect(OCCASION_TAG_CONFIG[tag].icon).toBeTruthy();
        expect(OCCASION_TAG_CONFIG[tag].color).toBeTruthy();
      }
    });
  });
});
