import { describe, it, expect } from 'vitest';
import {
  BLUR_PLACEHOLDER,
  isHolibobImage,
  isR2Image,
  shouldSkipOptimization,
  getBrandBlurPlaceholder,
  IMAGE_SIZES,
  isUnsplashImage,
  optimizeUnsplashUrl,
} from '@/lib/image-utils';

describe('image-utils', () => {
  describe('isHolibobImage', () => {
    it('returns true for holibob CDN URLs', () => {
      expect(isHolibobImage('https://images.holibob.tech/foo.jpg')).toBe(true);
    });

    it('returns false for non-holibob URLs', () => {
      expect(isHolibobImage('https://example.com/foo.jpg')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isHolibobImage(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isHolibobImage(undefined)).toBe(false);
    });
  });

  describe('isR2Image', () => {
    it('returns true for .r2.dev URLs', () => {
      expect(isR2Image('https://foo.r2.dev/bar.jpg')).toBe(true);
    });

    it('returns true for r2.cloudflarestorage.com URLs', () => {
      expect(isR2Image('https://r2.cloudflarestorage.com/bar.jpg')).toBe(true);
    });

    it('returns false for non-R2 URLs', () => {
      expect(isR2Image('https://example.com/bar.jpg')).toBe(false);
    });
  });

  describe('shouldSkipOptimization', () => {
    it('returns true for holibob images', () => {
      expect(shouldSkipOptimization('https://images.holibob.tech/img.jpg')).toBe(true);
    });

    it('returns true for R2 images', () => {
      expect(shouldSkipOptimization('https://bucket.r2.dev/img.jpg')).toBe(true);
    });

    it('returns false for other URLs', () => {
      expect(shouldSkipOptimization('https://example.com/img.jpg')).toBe(false);
    });
  });

  describe('getBrandBlurPlaceholder', () => {
    it('returns a string starting with data:image/svg+xml;base64,', () => {
      const result = getBrandBlurPlaceholder('#3b82f6');
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('contains brand color RGB values in the SVG', () => {
      const result = getBrandBlurPlaceholder('#ff8800');
      // Decode the base64 to verify RGB values
      const base64 = result.replace('data:image/svg+xml;base64,', '');
      const svg = Buffer.from(base64, 'base64').toString('utf-8');
      // #ff8800 = rgb(255, 136, 0)
      expect(svg).toContain('255');
      expect(svg).toContain('136');
      expect(svg).toContain('0');
    });
  });

  describe('isUnsplashImage', () => {
    it('returns true for images.unsplash.com URLs', () => {
      expect(isUnsplashImage('https://images.unsplash.com/photo-123')).toBe(true);
    });

    it('returns true for unsplash.com/photos URLs', () => {
      expect(isUnsplashImage('https://unsplash.com/photos/abc')).toBe(true);
    });

    it('returns false for non-unsplash URLs', () => {
      expect(isUnsplashImage('https://example.com/img.jpg')).toBe(false);
    });
  });

  describe('optimizeUnsplashUrl', () => {
    it('adds w, q, fm, auto, fit params for unsplash URLs', () => {
      const result = optimizeUnsplashUrl('https://images.unsplash.com/photo-123');
      const url = new URL(result);
      expect(url.searchParams.get('w')).toBe('1920');
      expect(url.searchParams.get('q')).toBe('80');
      expect(url.searchParams.get('fm')).toBe('jpg');
      expect(url.searchParams.get('auto')).toBe('format');
      expect(url.searchParams.get('fit')).toBe('crop');
    });

    it('passes through non-unsplash URLs unchanged', () => {
      const input = 'https://example.com/img.jpg';
      expect(optimizeUnsplashUrl(input)).toBe(input);
    });

    it('returns empty string for empty input', () => {
      expect(optimizeUnsplashUrl('')).toBe('');
    });
  });

  describe('constants', () => {
    it('BLUR_PLACEHOLDER starts with "data:"', () => {
      expect(BLUR_PLACEHOLDER).toMatch(/^data:/);
    });

    it('IMAGE_SIZES has expected keys', () => {
      expect(IMAGE_SIZES).toHaveProperty('gridCard');
      expect(IMAGE_SIZES).toHaveProperty('halfWidth');
      expect(IMAGE_SIZES).toHaveProperty('fullWidth');
      expect(IMAGE_SIZES).toHaveProperty('thumbnail');
      expect(IMAGE_SIZES).toHaveProperty('small');
      expect(IMAGE_SIZES).toHaveProperty('compact');
    });
  });
});
