import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteProvider, useSite, useBrand, useSEO } from './site-context';
import { DEFAULT_SITE_CONFIG, type SiteConfig } from './tenant';

// Test component that uses the hooks
function TestConsumer() {
  const site = useSite();
  const brand = useBrand();
  const seo = useSEO();

  return (
    <div>
      <span data-testid="site-name">{site.name}</span>
      <span data-testid="brand-color">{brand?.primaryColor}</span>
      <span data-testid="seo-template">{seo?.titleTemplate}</span>
    </div>
  );
}

describe('site-context', () => {
  describe('SiteProvider', () => {
    it('should provide site configuration to children', () => {
      render(
        <SiteProvider site={DEFAULT_SITE_CONFIG}>
          <TestConsumer />
        </SiteProvider>
      );

      expect(screen.getByTestId('site-name')).toHaveTextContent('Experience Marketplace');
    });

    it('should provide custom site configuration', () => {
      const customSite: SiteConfig = {
        ...DEFAULT_SITE_CONFIG,
        name: 'Custom Experiences',
        brand: {
          ...DEFAULT_SITE_CONFIG.brand!,
          primaryColor: '#ff0000',
        },
      };

      render(
        <SiteProvider site={customSite}>
          <TestConsumer />
        </SiteProvider>
      );

      expect(screen.getByTestId('site-name')).toHaveTextContent('Custom Experiences');
      expect(screen.getByTestId('brand-color')).toHaveTextContent('#ff0000');
    });
  });

  describe('useSite hook', () => {
    it('should return site configuration', () => {
      render(
        <SiteProvider site={DEFAULT_SITE_CONFIG}>
          <TestConsumer />
        </SiteProvider>
      );

      expect(screen.getByTestId('site-name')).toHaveTextContent(DEFAULT_SITE_CONFIG.name);
    });
  });

  describe('useBrand hook', () => {
    it('should return brand configuration', () => {
      render(
        <SiteProvider site={DEFAULT_SITE_CONFIG}>
          <TestConsumer />
        </SiteProvider>
      );

      expect(screen.getByTestId('brand-color')).toHaveTextContent(
        DEFAULT_SITE_CONFIG.brand!.primaryColor
      );
    });

    it('should return default brand when site has no brand', () => {
      const siteWithoutBrand: SiteConfig = {
        ...DEFAULT_SITE_CONFIG,
        brand: null,
      };

      render(
        <SiteProvider site={siteWithoutBrand}>
          <TestConsumer />
        </SiteProvider>
      );

      // Should fall back to DEFAULT_SITE_CONFIG.brand
      expect(screen.getByTestId('brand-color')).toHaveTextContent('#6366f1');
    });
  });

  describe('useSEO hook', () => {
    it('should return SEO configuration', () => {
      render(
        <SiteProvider site={DEFAULT_SITE_CONFIG}>
          <TestConsumer />
        </SiteProvider>
      );

      expect(screen.getByTestId('seo-template')).toHaveTextContent('%s | Experience Marketplace');
    });

    it('should return default SEO when site has no seoConfig', () => {
      const siteWithoutSEO: SiteConfig = {
        ...DEFAULT_SITE_CONFIG,
        seoConfig: null,
      };

      render(
        <SiteProvider site={siteWithoutSEO}>
          <TestConsumer />
        </SiteProvider>
      );

      // Should fall back to DEFAULT_SITE_CONFIG.seoConfig
      expect(screen.getByTestId('seo-template')).toHaveTextContent('%s');
    });
  });
});
