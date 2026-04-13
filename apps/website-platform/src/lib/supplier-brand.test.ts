import { describe, it, expect } from 'vitest';
import { getBrandColourFromCategories, generateSupplierBrandCSS } from './supplier-brand';

describe('supplier-brand', () => {
  describe('getBrandColourFromCategories', () => {
    it('returns default teal for empty categories', () => {
      expect(getBrandColourFromCategories([])).toBe('#1D9E75');
    });

    it('returns blue for water activities', () => {
      expect(getBrandColourFromCategories(['boat tours', 'sailing'])).toBe('#0077B6');
    });

    it('returns burgundy for food experiences', () => {
      expect(getBrandColourFromCategories(['food tours', 'culinary'])).toBe('#9B2335');
    });

    it('returns green for nature/cycling', () => {
      expect(getBrandColourFromCategories(['cycling tours'])).toBe('#2D6A4F');
    });

    it('returns default for unrecognised categories', () => {
      expect(getBrandColourFromCategories(['general', 'other'])).toBe('#1D9E75');
    });

    it('matches on partial keyword within category string', () => {
      expect(getBrandColourFromCategories(['desert safari adventure'])).toBe('#B8860B');
    });
  });

  describe('generateSupplierBrandCSS', () => {
    it('generates CSS with brand colour when provided', () => {
      const css = generateSupplierBrandCSS('#FF0000');
      expect(css).toContain('--supplier-brand: #FF0000');
      expect(css).toContain('--supplier-brand-dark:');
      expect(css).toContain('--supplier-brand-light:');
      expect(css).toContain('--supplier-brand-text:');
    });

    it('falls back to category colour when no brand colour', () => {
      const css = generateSupplierBrandCSS(undefined, ['ocean tours']);
      expect(css).toContain('--supplier-brand: #0077B6');
    });

    it('falls back to default teal when no brand colour or categories', () => {
      const css = generateSupplierBrandCSS(undefined, []);
      expect(css).toContain('--supplier-brand: #1D9E75');
    });
  });
});
