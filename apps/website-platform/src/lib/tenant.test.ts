import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSiteFromHostname,
  generateBrandCSSVariables,
  DEFAULT_SITE_CONFIG,
  type SiteConfig,
} from './tenant';

// Mock the database module
vi.mock('@experience-marketplace/database', () => ({
  prisma: {
    domain: {
      findUnique: vi.fn(),
    },
    site: {
      findUnique: vi.fn(),
    },
  },
}));

describe('tenant utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DEFAULT_SITE_CONFIG', () => {
    it('should have required properties', () => {
      expect(DEFAULT_SITE_CONFIG).toBeDefined();
      expect(DEFAULT_SITE_CONFIG.id).toBe('default');
      expect(DEFAULT_SITE_CONFIG.slug).toBe('default');
      expect(DEFAULT_SITE_CONFIG.name).toBe('Experience Marketplace');
      expect(DEFAULT_SITE_CONFIG.holibobPartnerId).toBeDefined();
    });

    it('should have brand configuration', () => {
      expect(DEFAULT_SITE_CONFIG.brand).toBeDefined();
      expect(DEFAULT_SITE_CONFIG.brand?.primaryColor).toBe('#6366f1');
      expect(DEFAULT_SITE_CONFIG.brand?.headingFont).toBe('Inter');
    });

    it('should have SEO configuration', () => {
      expect(DEFAULT_SITE_CONFIG.seoConfig).toBeDefined();
      expect(DEFAULT_SITE_CONFIG.seoConfig?.titleTemplate).toContain('%s');
      expect(DEFAULT_SITE_CONFIG.seoConfig?.keywords).toBeInstanceOf(Array);
    });
  });

  describe('getSiteFromHostname', () => {
    it('should return default config for localhost', async () => {
      const result = await getSiteFromHostname('localhost');
      expect(result).toEqual(DEFAULT_SITE_CONFIG);
    });

    it('should return default config for localhost with port', async () => {
      const result = await getSiteFromHostname('localhost:3000');
      expect(result).toEqual(DEFAULT_SITE_CONFIG);
    });

    it('should return default config for 127.0.0.1', async () => {
      const result = await getSiteFromHostname('127.0.0.1:3000');
      expect(result).toEqual(DEFAULT_SITE_CONFIG);
    });

    it('should return default config for vercel preview deployments', async () => {
      const result = await getSiteFromHostname('my-app.vercel.app');
      expect(result).toEqual(DEFAULT_SITE_CONFIG);
    });

    it('should return default config for heroku deployments', async () => {
      const result = await getSiteFromHostname('holibob-experiences-demand-gen.herokuapp.com');
      expect(result).toEqual(DEFAULT_SITE_CONFIG);
    });

    it('should strip www prefix when matching hostname', async () => {
      const result = await getSiteFromHostname('www.localhost');
      expect(result).toEqual(DEFAULT_SITE_CONFIG);
    });

    it('should strip port when matching hostname', async () => {
      const result = await getSiteFromHostname('localhost:8080');
      expect(result).toEqual(DEFAULT_SITE_CONFIG);
    });
  });

  describe('generateBrandCSSVariables', () => {
    it('should return empty string when brand is null', () => {
      const result = generateBrandCSSVariables(null);
      expect(result).toBe('');
    });

    it('should generate CSS variables from brand config', () => {
      const brand: SiteConfig['brand'] = {
        name: 'Test Brand',
        tagline: 'Test Tagline',
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        accentColor: '#0000ff',
        headingFont: 'Arial',
        bodyFont: 'Helvetica',
        logoUrl: null,
        faviconUrl: null,
        ogImageUrl: null,
        socialLinks: null,
      };

      const result = generateBrandCSSVariables(brand);

      expect(result).toContain('--color-primary: #ff0000');
      expect(result).toContain('--color-secondary: #00ff00');
      expect(result).toContain('--color-accent: #0000ff');
      expect(result).toContain('--font-heading: Arial');
      expect(result).toContain('--font-body: Helvetica');
    });

    it('should include fallback fonts in CSS variables', () => {
      const result = generateBrandCSSVariables(DEFAULT_SITE_CONFIG.brand);
      expect(result).toContain('system-ui, sans-serif');
    });
  });
});
