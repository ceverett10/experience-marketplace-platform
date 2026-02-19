import { describe, it, expect } from 'vitest';
import { DURATION_RANGES, parseDurationToMinutes, classifyDuration } from '@/lib/duration-utils';

describe('duration-utils', () => {
  describe('parseDurationToMinutes', () => {
    it('returns 0 for null', () => {
      expect(parseDurationToMinutes(null)).toBe(0);
    });

    it('returns 0 for undefined', () => {
      expect(parseDurationToMinutes(undefined)).toBe(0);
    });

    it('returns 0 for empty string', () => {
      expect(parseDurationToMinutes('')).toBe(0);
    });

    it('passes through numeric values', () => {
      expect(parseDurationToMinutes(210)).toBe(210);
    });

    describe('ISO 8601 durations', () => {
      it('parses PT3H30M → 210', () => {
        expect(parseDurationToMinutes('PT3H30M')).toBe(210);
      });

      it('parses PT210M → 210', () => {
        expect(parseDurationToMinutes('PT210M')).toBe(210);
      });

      it('parses P1D → 1440', () => {
        expect(parseDurationToMinutes('P1D')).toBe(1440);
      });

      it('parses P2DT4H → 3120', () => {
        expect(parseDurationToMinutes('P2DT4H')).toBe(3120);
      });

      it('parses PT3H → 180', () => {
        expect(parseDurationToMinutes('PT3H')).toBe(180);
      });

      it('parses PT30M → 30', () => {
        expect(parseDurationToMinutes('PT30M')).toBe(30);
      });
    });

    describe('formatted text durations', () => {
      it('parses "3 hours" → 180', () => {
        expect(parseDurationToMinutes('3 hours')).toBe(180);
      });

      it('parses "3h 30m" → 210', () => {
        expect(parseDurationToMinutes('3h 30m')).toBe(210);
      });

      it('parses "1 day" → 1440', () => {
        expect(parseDurationToMinutes('1 day')).toBe(1440);
      });

      it('parses "30 min" → 30', () => {
        expect(parseDurationToMinutes('30 min')).toBe(30);
      });

      it('parses "2 hours 30 minutes" → 150', () => {
        expect(parseDurationToMinutes('2 hours 30 minutes')).toBe(150);
      });
    });

    describe('case insensitivity', () => {
      it('parses lowercase "pt3h30m" the same as "PT3H30M"', () => {
        expect(parseDurationToMinutes('pt3h30m')).toBe(parseDurationToMinutes('PT3H30M'));
      });
    });
  });

  describe('classifyDuration', () => {
    it('returns null for 0', () => {
      expect(classifyDuration(0)).toBeNull();
    });

    it('returns null for negative values', () => {
      expect(classifyDuration(-5)).toBeNull();
    });

    it('returns "short" for 60 minutes', () => {
      expect(classifyDuration(60)).toBe('short');
    });

    it('returns "short" for 119 minutes', () => {
      expect(classifyDuration(119)).toBe('short');
    });

    it('returns "half-day" for 120 minutes', () => {
      expect(classifyDuration(120)).toBe('half-day');
    });

    it('returns "half-day" for 239 minutes', () => {
      expect(classifyDuration(239)).toBe('half-day');
    });

    it('returns "full-day" for 240 minutes', () => {
      expect(classifyDuration(240)).toBe('full-day');
    });

    it('returns "full-day" for 479 minutes', () => {
      expect(classifyDuration(479)).toBe('full-day');
    });

    it('returns "multi-day" for 480 minutes', () => {
      expect(classifyDuration(480)).toBe('multi-day');
    });

    it('returns "multi-day" for 1440 minutes', () => {
      expect(classifyDuration(1440)).toBe('multi-day');
    });
  });

  describe('DURATION_RANGES', () => {
    it('has all 4 keys', () => {
      expect(Object.keys(DURATION_RANGES)).toEqual(
        expect.arrayContaining(['short', 'half-day', 'full-day', 'multi-day'])
      );
      expect(Object.keys(DURATION_RANGES)).toHaveLength(4);
    });
  });
});
