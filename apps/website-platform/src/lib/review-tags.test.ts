import { describe, it, expect } from 'vitest';
import {
  inferTravelerType,
  tagReviews,
  getTravelerTypeDistribution,
  TRAVELER_TYPE_CONFIG,
} from './review-tags';

describe('review-tags', () => {
  describe('inferTravelerType', () => {
    it('returns null for empty text', () => {
      expect(inferTravelerType('')).toBeNull();
    });

    it('returns null for short text', () => {
      expect(inferTravelerType('Good.')).toBeNull();
    });

    it('returns null when no pattern matches', () => {
      expect(
        inferTravelerType('This was a wonderful experience and I highly recommend it.')
      ).toBeNull();
    });

    it('detects couple from "my wife" mention', () => {
      expect(inferTravelerType('My wife and I had an amazing time on this tour.')).toBe('couple');
    });

    it('detects couple from "my husband" mention', () => {
      expect(inferTravelerType('Booked this as a surprise for my husband.')).toBe('couple');
    });

    it('detects couple from "our anniversary" mention', () => {
      expect(inferTravelerType('We did this for our anniversary and it was perfect.')).toBe(
        'couple'
      );
    });

    it('detects family from "kids loved" mention', () => {
      expect(inferTravelerType('The kids loved every minute of it!')).toBe('family');
    });

    it('detects family from "my children" mention', () => {
      expect(inferTravelerType('My children really enjoyed the interactive elements.')).toBe(
        'family'
      );
    });

    it('detects family from "family trip" mention', () => {
      expect(inferTravelerType('We booked this as part of a family trip to London.')).toBe(
        'family'
      );
    });

    it('detects group from "friends and I" mention', () => {
      expect(inferTravelerType('My friends and I had a blast on this food tour.')).toBe('group');
    });

    it('detects group from "hen party" mention', () => {
      expect(inferTravelerType('Perfect activity for our hen party weekend.')).toBe('group');
    });

    it('detects business from "team building" mention', () => {
      expect(inferTravelerType('Great team building activity for our office outing.')).toBe(
        'business'
      );
    });

    it('detects solo from "by myself" mention', () => {
      expect(inferTravelerType('I went by myself and still had a great time.')).toBe('solo');
    });

    it('detects solo from "traveling alone" mention', () => {
      expect(inferTravelerType('Even traveling alone, I felt welcome and included.')).toBe('solo');
    });

    it('prioritises family over couple when both match', () => {
      // "my wife" matches couple, "kids loved" matches family — family checked first
      expect(inferTravelerType('My wife and the kids loved this experience.')).toBe('family');
    });
  });

  describe('tagReviews', () => {
    it('returns empty map for empty reviews', () => {
      expect(tagReviews([]).size).toBe(0);
    });

    it('tags reviews that match patterns', () => {
      const reviews = [
        { id: '1', content: 'My wife and I loved it.' },
        { id: '2', content: 'Great tour, very professional.' },
        { id: '3', content: 'The kids had so much fun.' },
      ];
      const tags = tagReviews(reviews);
      expect(tags.get('1')).toBe('couple');
      expect(tags.has('2')).toBe(false);
      expect(tags.get('3')).toBe('family');
    });
  });

  describe('getTravelerTypeDistribution', () => {
    it('returns empty array when no reviews match', () => {
      const reviews = [{ id: '1', content: 'Nice experience.' }];
      expect(getTravelerTypeDistribution(reviews)).toEqual([]);
    });

    it('returns sorted distribution', () => {
      const reviews = [
        { id: '1', content: 'My wife and I loved it.' },
        { id: '2', content: 'My husband enjoyed it too.' },
        { id: '3', content: 'The kids had so much fun.' },
      ];
      const dist = getTravelerTypeDistribution(reviews);
      // 2 couple, 1 family — couple should be first
      expect(dist[0]?.type).toBe('couple');
      expect(dist[0]?.count).toBe(2);
      expect(dist[1]?.type).toBe('family');
      expect(dist[1]?.count).toBe(1);
    });
  });

  describe('TRAVELER_TYPE_CONFIG', () => {
    it('has config for all types', () => {
      const types = ['solo', 'couple', 'family', 'group', 'business'] as const;
      for (const type of types) {
        expect(TRAVELER_TYPE_CONFIG[type].label).toBeTruthy();
        expect(TRAVELER_TYPE_CONFIG[type].icon).toBeTruthy();
      }
    });
  });
});
