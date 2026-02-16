/**
 * Price Formatting Regression Tests
 *
 * CRITICAL: This test file exists to prevent the /100 price bug from recurring.
 *
 * Price unit conventions:
 * - CATALOG prices (guidePrice from API, priceFrom from DB Decimal(10,2)) are in MAJOR units
 *   e.g., 43 = £43.00, 85.50 = £85.50
 * - BOOKING prices (gross from availability/checkout API) are in MINOR units (pence/cents)
 *   e.g., 4300 = £43.00, 8550 = £85.50
 *
 * The catalog formatPrice must NOT divide by 100.
 * The booking formatPrice MUST divide by 100.
 */
import { describe, it, expect } from 'vitest';
import { formatPrice as catalogFormatPrice } from './holibob';
import { formatPrice as bookingFormatPrice } from './booking-flow';

describe('Price formatting regression tests', () => {
  describe('Catalog prices (major units — DO NOT divide by 100)', () => {
    it('should display £43 for guidePrice=43', () => {
      expect(catalogFormatPrice(43, 'GBP')).toBe('£43.00');
    });

    it('should display £85 for guidePrice=85', () => {
      expect(catalogFormatPrice(85, 'GBP')).toBe('£85.00');
    });

    it('should display £125.50 for guidePrice=125.50', () => {
      expect(catalogFormatPrice(125.5, 'GBP')).toBe('£125.50');
    });

    it('should display €200 for guidePrice=200 EUR', () => {
      expect(catalogFormatPrice(200, 'EUR')).toBe('€200.00');
    });

    it('should NOT show sub-pound amounts for typical prices', () => {
      // These are the prices that were broken: £0.43, £0.85 instead of £43, £85
      const typicalPrices = [25, 43, 65, 85, 100, 150, 250];
      for (const price of typicalPrices) {
        const formatted = catalogFormatPrice(price, 'GBP');
        const numericValue = parseFloat(formatted.replace(/[^0-9.]/g, ''));
        expect(numericValue).toBeGreaterThanOrEqual(1);
        expect(numericValue).toBe(price);
      }
    });

    it('should handle zero price', () => {
      expect(catalogFormatPrice(0, 'GBP')).toBe('£0.00');
    });

    it('should handle fractional prices from DB Decimal', () => {
      // priceFrom is Decimal(10,2) — stored as 43.50 in DB
      expect(catalogFormatPrice(43.5, 'GBP')).toBe('£43.50');
      expect(catalogFormatPrice(9.99, 'GBP')).toBe('£9.99');
    });
  });

  describe('Booking prices (minor units — MUST divide by 100)', () => {
    it('should display £43 for gross=4300', () => {
      expect(bookingFormatPrice(4300, 'GBP')).toBe('£43.00');
    });

    it('should display £85 for gross=8500', () => {
      expect(bookingFormatPrice(8500, 'GBP')).toBe('£85.00');
    });

    it('should display £35 for gross=3500', () => {
      expect(bookingFormatPrice(3500, 'GBP')).toBe('£35.00');
    });

    it('should display £125.50 for gross=12550', () => {
      expect(bookingFormatPrice(12550, 'GBP')).toBe('£125.50');
    });

    it('should handle zero', () => {
      expect(bookingFormatPrice(0, 'GBP')).toBe('£0.00');
    });
  });

  describe('Catalog vs Booking price distinction', () => {
    it('same numeric value should produce different results', () => {
      // 4300 as catalog price = £4,300.00 (major units)
      // 4300 as booking price = £43.00 (minor units / 100)
      const catalogResult = catalogFormatPrice(4300, 'GBP');
      const bookingResult = bookingFormatPrice(4300, 'GBP');
      expect(catalogResult).toBe('£4,300.00');
      expect(bookingResult).toBe('£43.00');
      expect(catalogResult).not.toBe(bookingResult);
    });
  });
});
