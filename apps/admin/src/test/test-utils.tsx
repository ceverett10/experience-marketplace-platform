import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';

interface WrapperProps {
  children: React.ReactNode;
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  pathname?: string;
}

/**
 * Custom render function that wraps components with necessary providers
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const { ...renderOptions } = options;

  function Wrapper({ children }: WrapperProps) {
    return <>{children}</>;
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Create mock dashboard stats for testing
 */
export function createMockDashboardStats(overrides = {}) {
  return {
    totalSites: 12,
    activeSites: 8,
    totalBookings: 156,
    totalRevenue: 28450.00,
    contentPending: 5,
    conversionRate: 4.2,
    changes: {
      sites: 25,
      bookings: 8,
      revenue: 15,
    },
    ...overrides,
  };
}

/**
 * Create mock recent activity for testing
 */
export function createMockActivity(overrides = {}) {
  return {
    id: '1',
    type: 'site_created' as const,
    message: 'New site created',
    timestamp: '2 hours ago',
    ...overrides,
  };
}

/**
 * Create mock content item for testing
 */
export function createMockContentItem(overrides = {}) {
  return {
    id: '1',
    type: 'experience' as const,
    title: 'Test Experience Title',
    content: 'Test content description...',
    siteName: 'Test Site',
    status: 'pending' as const,
    qualityScore: 85,
    generatedAt: '2024-01-15T14:30:00Z',
    ...overrides,
  };
}

/**
 * Create mock platform settings for testing
 */
export function createMockSettings(overrides = {}) {
  return {
    branding: {
      platformName: 'Experience Marketplace',
      primaryColor: '#0ea5e9',
      secondaryColor: '#06b6d4',
    },
    domains: {
      storefrontDomain: 'v3.experiences.holibob.tech',
      apiDomain: 'api.holibob.com',
    },
    commissions: {
      defaultRate: 12,
      minPayoutAmount: 50,
      payoutCurrency: 'GBP',
    },
    features: {
      aiContentGeneration: true,
      autoPublish: false,
      analyticsEnabled: true,
      maintenanceMode: false,
    },
    ...overrides,
  };
}

// Re-export everything from testing-library
export * from '@testing-library/react';
