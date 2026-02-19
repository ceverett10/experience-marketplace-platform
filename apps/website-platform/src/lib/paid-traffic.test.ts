import { describe, it, expect } from 'vitest';
import { isPaidTraffic } from '@/lib/paid-traffic';

describe('isPaidTraffic', () => {
  describe('with Record<string, string | undefined>', () => {
    it('should detect gclid as paid traffic', () => {
      expect(isPaidTraffic({ gclid: 'abc123' })).toBe(true);
    });

    it('should detect fbclid as paid traffic', () => {
      expect(isPaidTraffic({ fbclid: 'abc123' })).toBe(true);
    });

    it('should detect utm_medium=cpc as paid traffic', () => {
      expect(isPaidTraffic({ utm_medium: 'cpc' })).toBe(true);
    });

    it('should detect utm_source containing google_ads as paid traffic', () => {
      expect(isPaidTraffic({ utm_source: 'google_ads' })).toBe(true);
    });

    it('should detect utm_source containing facebook_ads as paid traffic', () => {
      expect(isPaidTraffic({ utm_source: 'facebook_ads_campaign' })).toBe(true);
    });

    it('should return false for utm_medium=organic', () => {
      expect(isPaidTraffic({ utm_medium: 'organic' })).toBe(false);
    });

    it('should return false for empty params', () => {
      expect(isPaidTraffic({})).toBe(false);
    });

    it('should return false for utm_source=google (no _ads suffix)', () => {
      expect(isPaidTraffic({ utm_source: 'google' })).toBe(false);
    });
  });

  describe('with URLSearchParams', () => {
    it('should detect gclid as paid traffic', () => {
      expect(isPaidTraffic(new URLSearchParams('gclid=abc'))).toBe(true);
    });

    it('should detect utm_medium=cpc as paid traffic', () => {
      expect(isPaidTraffic(new URLSearchParams('utm_medium=cpc'))).toBe(true);
    });

    it('should return false for empty search params', () => {
      expect(isPaidTraffic(new URLSearchParams(''))).toBe(false);
    });
  });
});
