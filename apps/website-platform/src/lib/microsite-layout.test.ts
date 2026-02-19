import { describe, it, expect } from 'vitest';
import {
  resolveLayoutType,
  getLayoutConfig,
  LAYOUT_TYPE_LABELS,
  LAYOUT_TYPE_DESCRIPTIONS,
} from '@/lib/microsite-layout';

describe('microsite layout utilities', () => {
  describe('resolveLayoutType', () => {
    it('should return the explicit type when PRODUCT_SPOTLIGHT is set, regardless of count', () => {
      expect(resolveLayoutType('PRODUCT_SPOTLIGHT', 100)).toBe('PRODUCT_SPOTLIGHT');
    });

    it('should return the explicit type when CATALOG is set, regardless of count', () => {
      expect(resolveLayoutType('CATALOG', 1)).toBe('CATALOG');
    });

    it('should return the explicit type when MARKETPLACE is set', () => {
      expect(resolveLayoutType('MARKETPLACE', 5)).toBe('MARKETPLACE');
    });

    it('should resolve AUTO to PRODUCT_SPOTLIGHT for 1 product', () => {
      expect(resolveLayoutType('AUTO', 1)).toBe('PRODUCT_SPOTLIGHT');
    });

    it('should resolve AUTO to CATALOG for 5 products', () => {
      expect(resolveLayoutType('AUTO', 5)).toBe('CATALOG');
    });

    it('should resolve AUTO to CATALOG for 25 products', () => {
      expect(resolveLayoutType('AUTO', 25)).toBe('CATALOG');
    });

    it('should resolve AUTO to CATALOG for 50 products (boundary)', () => {
      expect(resolveLayoutType('AUTO', 50)).toBe('CATALOG');
    });

    it('should resolve AUTO to MARKETPLACE for 51 products', () => {
      expect(resolveLayoutType('AUTO', 51)).toBe('MARKETPLACE');
    });

    it('should resolve AUTO to MARKETPLACE for 100 products', () => {
      expect(resolveLayoutType('AUTO', 100)).toBe('MARKETPLACE');
    });
  });

  describe('getLayoutConfig', () => {
    it('should return PRODUCT_SPOTLIGHT config', () => {
      const config = getLayoutConfig('PRODUCT_SPOTLIGHT', 1);
      expect(config.resolvedType).toBe('PRODUCT_SPOTLIGHT');
      expect(config.gridColumns).toBe(1);
      expect(config.showCategories).toBe(false);
      expect(config.showDestinations).toBe(false);
      expect(config.heroStyle).toBe('product-focused');
      expect(config.maxFeaturedProducts).toBe(1);
    });

    it('should return CATALOG config with 2 columns for small catalog', () => {
      const config = getLayoutConfig('CATALOG', 3);
      expect(config.resolvedType).toBe('CATALOG');
      expect(config.gridColumns).toBe(2);
      expect(config.showCategories).toBe(false); // < 10 products
      expect(config.heroStyle).toBe('compact');
    });

    it('should return CATALOG config with 3 columns and categories for larger catalog', () => {
      const config = getLayoutConfig('CATALOG', 20);
      expect(config.resolvedType).toBe('CATALOG');
      expect(config.gridColumns).toBe(3);
      expect(config.showCategories).toBe(true); // >= 10 products
      expect(config.maxFeaturedProducts).toBe(6);
    });

    it('should return MARKETPLACE config', () => {
      const config = getLayoutConfig('MARKETPLACE', 100);
      expect(config.resolvedType).toBe('MARKETPLACE');
      expect(config.gridColumns).toBe(4);
      expect(config.showCategories).toBe(true);
      expect(config.showDestinations).toBe(true);
      expect(config.heroStyle).toBe('full');
      expect(config.showPagination).toBe(true);
    });
  });

  describe('constants', () => {
    it('LAYOUT_TYPE_LABELS should have all layout type keys', () => {
      expect(LAYOUT_TYPE_LABELS).toHaveProperty('AUTO');
      expect(LAYOUT_TYPE_LABELS).toHaveProperty('PRODUCT_SPOTLIGHT');
      expect(LAYOUT_TYPE_LABELS).toHaveProperty('CATALOG');
      expect(LAYOUT_TYPE_LABELS).toHaveProperty('MARKETPLACE');
    });

    it('LAYOUT_TYPE_DESCRIPTIONS should have all layout type keys', () => {
      expect(LAYOUT_TYPE_DESCRIPTIONS).toHaveProperty('AUTO');
      expect(LAYOUT_TYPE_DESCRIPTIONS).toHaveProperty('PRODUCT_SPOTLIGHT');
      expect(LAYOUT_TYPE_DESCRIPTIONS).toHaveProperty('CATALOG');
      expect(LAYOUT_TYPE_DESCRIPTIONS).toHaveProperty('MARKETPLACE');
    });
  });
});
