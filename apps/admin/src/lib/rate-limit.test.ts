import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from './rate-limit';

describe('rate-limit', () => {
  beforeEach(() => {
    // Clear rate limits between tests
    clearRateLimit('test@example.com');
    clearRateLimit('other@example.com');
  });

  describe('checkRateLimit', () => {
    it('returns 0 for unknown email (no attempts)', () => {
      expect(checkRateLimit('fresh@example.com')).toBe(0);
    });

    it('returns 0 when under the attempt limit', () => {
      recordFailedAttempt('test@example.com');
      recordFailedAttempt('test@example.com');
      expect(checkRateLimit('test@example.com')).toBe(0);
    });

    it('returns seconds remaining when limit reached (5 attempts)', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('test@example.com');
      }
      const seconds = checkRateLimit('test@example.com');
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(15 * 60); // 15 minute window
    });

    it('is case-insensitive', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('Test@Example.COM');
      }
      expect(checkRateLimit('test@example.com')).toBeGreaterThan(0);
    });

    it('trims whitespace', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(' test@example.com ');
      }
      expect(checkRateLimit('test@example.com')).toBeGreaterThan(0);
    });
  });

  describe('recordFailedAttempt', () => {
    it('increments attempt count', () => {
      recordFailedAttempt('test@example.com');
      expect(checkRateLimit('test@example.com')).toBe(0); // 1 attempt, still under limit

      recordFailedAttempt('test@example.com');
      recordFailedAttempt('test@example.com');
      recordFailedAttempt('test@example.com');
      recordFailedAttempt('test@example.com');
      expect(checkRateLimit('test@example.com')).toBeGreaterThan(0); // 5 attempts, at limit
    });

    it('tracks different emails independently', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('test@example.com');
      }
      expect(checkRateLimit('test@example.com')).toBeGreaterThan(0);
      expect(checkRateLimit('other@example.com')).toBe(0);
    });
  });

  describe('clearRateLimit', () => {
    it('clears rate limit for a specific email', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('test@example.com');
      }
      expect(checkRateLimit('test@example.com')).toBeGreaterThan(0);

      clearRateLimit('test@example.com');
      expect(checkRateLimit('test@example.com')).toBe(0);
    });

    it('does not affect other emails', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('test@example.com');
        recordFailedAttempt('other@example.com');
      }
      clearRateLimit('test@example.com');
      expect(checkRateLimit('test@example.com')).toBe(0);
      expect(checkRateLimit('other@example.com')).toBeGreaterThan(0);
    });
  });

  describe('window expiration', () => {
    it('resets after window expires', () => {
      vi.useFakeTimers();
      try {
        for (let i = 0; i < 5; i++) {
          recordFailedAttempt('test@example.com');
        }
        expect(checkRateLimit('test@example.com')).toBeGreaterThan(0);

        // Advance past the 15-minute window
        vi.advanceTimersByTime(15 * 60 * 1000 + 1);
        expect(checkRateLimit('test@example.com')).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
