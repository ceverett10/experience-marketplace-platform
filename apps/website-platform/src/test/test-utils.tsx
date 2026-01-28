import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { SiteProvider } from '@/lib/site-context';
import { DEFAULT_SITE_CONFIG, type SiteConfig } from '@/lib/tenant';

interface WrapperProps {
  children: React.ReactNode;
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  siteConfig?: SiteConfig;
}

/**
 * Custom render function that wraps components with necessary providers
 */
export function renderWithProviders(ui: React.ReactElement, options: CustomRenderOptions = {}) {
  const { siteConfig = DEFAULT_SITE_CONFIG, ...renderOptions } = options;

  function Wrapper({ children }: WrapperProps) {
    return <SiteProvider site={siteConfig}>{children}</SiteProvider>;
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Create a mock site config for testing
 */
export function createMockSiteConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    ...DEFAULT_SITE_CONFIG,
    ...overrides,
    brand:
      overrides.brand === null
        ? null
        : {
            ...DEFAULT_SITE_CONFIG.brand!,
            ...overrides.brand,
          },
    seoConfig:
      overrides.seoConfig === null
        ? null
        : {
            ...DEFAULT_SITE_CONFIG.seoConfig!,
            ...overrides.seoConfig,
          },
  };
}

/**
 * Create mock experience data for testing
 */
export function createMockExperience(overrides = {}) {
  return {
    id: 'exp-123',
    title: 'Test Experience',
    slug: 'test-experience',
    shortDescription: 'A great test experience',
    imageUrl: 'https://example.com/image.jpg',
    price: {
      amount: 2500,
      currency: 'GBP',
      formatted: '£25.00',
    },
    duration: {
      formatted: '2 hours',
    },
    rating: {
      average: 4.5,
      count: 100,
    },
    location: {
      name: 'London, UK',
    },
    ...overrides,
  };
}

// Re-export everything from testing-library
export * from '@testing-library/react';
