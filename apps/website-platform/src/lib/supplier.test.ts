import { describe, it, expect } from 'vitest';
import { isTickittoSite, isHolibobSite, getSupplierType } from '@/lib/supplier';
import { DEFAULT_SITE_CONFIG } from '@/lib/tenant';
import type { SiteConfig } from '@/lib/tenant';

/**
 * Helper to create a SiteConfig with a specific supplierType.
 * Only the micrositeContext.supplierType field is relevant to the
 * supplier utility functions, so we cast the partial context with `as any`.
 */
function withSupplierType(supplierType: string): SiteConfig {
  return {
    ...DEFAULT_SITE_CONFIG,
    micrositeContext: { supplierType } as any,
  };
}

describe('supplier utilities', () => {
  describe('isTickittoSite', () => {
    it('should return true for TICKITTO supplier type', () => {
      expect(isTickittoSite(withSupplierType('TICKITTO'))).toBe(true);
    });

    it('should return false for HOLIBOB supplier type', () => {
      expect(isTickittoSite(withSupplierType('HOLIBOB'))).toBe(false);
    });

    it('should return false when micrositeContext is absent', () => {
      expect(isTickittoSite(DEFAULT_SITE_CONFIG)).toBe(false);
    });
  });

  describe('isHolibobSite', () => {
    it('should return true for HOLIBOB supplier type', () => {
      expect(isHolibobSite(withSupplierType('HOLIBOB'))).toBe(true);
    });

    it('should return true when micrositeContext is absent (default is HOLIBOB)', () => {
      expect(isHolibobSite(DEFAULT_SITE_CONFIG)).toBe(true);
    });

    it('should return false for TICKITTO supplier type', () => {
      expect(isHolibobSite(withSupplierType('TICKITTO'))).toBe(false);
    });
  });

  describe('getSupplierType', () => {
    it('should return TICKITTO when supplier type is TICKITTO', () => {
      expect(getSupplierType(withSupplierType('TICKITTO'))).toBe('TICKITTO');
    });

    it('should return HOLIBOB when supplier type is HOLIBOB', () => {
      expect(getSupplierType(withSupplierType('HOLIBOB'))).toBe('HOLIBOB');
    });

    it('should default to HOLIBOB when micrositeContext is absent', () => {
      expect(getSupplierType(DEFAULT_SITE_CONFIG)).toBe('HOLIBOB');
    });
  });
});
