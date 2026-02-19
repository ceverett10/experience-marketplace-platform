import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRICING_CONFIG,
  getProductPricingConfig,
  calculatePromoPrice,
} from '@/lib/pricing';

describe('pricing', () => {
  describe('getProductPricingConfig', () => {
    it('returns a markup between 5 and 15 for any product ID', () => {
      const ids = ['prod-001', 'prod-002', 'abc-xyz', '12345', 'a-very-long-product-id-here'];
      for (const id of ids) {
        const config = getProductPricingConfig(id);
        expect(config.markupPercentage).toBeGreaterThanOrEqual(5);
        expect(config.markupPercentage).toBeLessThanOrEqual(15);
      }
    });

    it('returns the same markup for the same product ID (deterministic)', () => {
      const configA = getProductPricingConfig('product-abc');
      const configB = getProductPricingConfig('product-abc');
      expect(configA.markupPercentage).toBe(configB.markupPercentage);
    });

    it('may return different markups for different product IDs', () => {
      // Test a range of IDs — at least some should differ
      const markups = new Set(
        ['id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6', 'id-7', 'id-8', 'id-9', 'id-10'].map(
          (id) => getProductPricingConfig(id).markupPercentage
        )
      );
      expect(markups.size).toBeGreaterThan(1);
    });

    it('discountLabel matches "SAVE X%" pattern', () => {
      const config = getProductPricingConfig('test-product');
      expect(config.discountLabel).toMatch(/^SAVE \d+%$/);
    });
  });

  describe('calculatePromoPrice', () => {
    it('returns hasPromo false when markup is 0', () => {
      const result = calculatePromoPrice('£50.00', 50, 'GBP', {
        markupPercentage: 0,
        showDiscountBadge: true,
      });
      expect(result.hasPromo).toBe(false);
    });

    it('returns hasPromo false when actualPriceAmount is 0', () => {
      const result = calculatePromoPrice('£0.00', 0, 'GBP', {
        markupPercentage: 10,
        showDiscountBadge: true,
      });
      expect(result.hasPromo).toBe(false);
    });

    it('calculates promo pricing correctly for GBP with 10% markup', () => {
      const result = calculatePromoPrice('£50.00', 50, 'GBP', {
        markupPercentage: 10,
        showDiscountBadge: true,
        discountLabel: 'SAVE 10%',
      });

      // RRP = 50 * 1.10 = 55.0000...01 (floating point), ceil → 56, 56 - 0.01 = 55.99
      expect(result.originalFormatted).toBe('£55.99');
      expect(result.discountedFormatted).toBe('£50.00');
      expect(result.savingsPercent).toBe(10);
      expect(result.hasPromo).toBe(true);
    });

    it('defaults discountLabel to "SAVE X%" when not provided in config', () => {
      const result = calculatePromoPrice('£50.00', 50, 'GBP', {
        markupPercentage: 10,
        showDiscountBadge: true,
        // discountLabel intentionally omitted
      });

      expect(result.discountLabel).toBe('SAVE 10%');
    });
  });

  describe('DEFAULT_PRICING_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_PRICING_CONFIG.markupPercentage).toBe(5);
      expect(DEFAULT_PRICING_CONFIG.showDiscountBadge).toBe(true);
      expect(DEFAULT_PRICING_CONFIG.discountLabel).toBe('SAVE 5%');
    });
  });
});
