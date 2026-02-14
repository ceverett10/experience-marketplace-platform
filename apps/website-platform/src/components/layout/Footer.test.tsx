import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, createMockSiteConfig } from '@/test/test-utils';
import { Footer } from './Footer';

describe('Footer', () => {
  it('should render site name', () => {
    renderWithProviders(<Footer />);
    expect(screen.getByText('Experience Marketplace')).toBeInTheDocument();
  });

  it('should render logo when logoUrl is provided', () => {
    const siteConfig = createMockSiteConfig({
      name: 'Test Site',
      brand: {
        logoUrl: 'https://example.com/logo.png',
        logoDarkUrl: null,
        name: 'Test Brand',
        tagline: 'Test tagline',
        primaryColor: '#6366f1',
        secondaryColor: '#8b5cf6',
        accentColor: '#f59e0b',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        faviconUrl: null,
        ogImageUrl: null,
        socialLinks: null,
      },
    });

    renderWithProviders(<Footer />, { siteConfig });

    const logo = screen.getByAltText('Test Site');
    expect(logo).toBeInTheDocument();
  });

  it('should render brand tagline when provided', () => {
    const siteConfig = createMockSiteConfig({
      brand: {
        tagline: 'Amazing experiences await',
        name: 'Test Brand',
        primaryColor: '#6366f1',
        secondaryColor: '#8b5cf6',
        accentColor: '#f59e0b',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        logoUrl: null,
        logoDarkUrl: null,
        faviconUrl: null,
        ogImageUrl: null,
        socialLinks: null,
      },
    });

    renderWithProviders(<Footer />, { siteConfig });
    expect(screen.getByText('Amazing experiences await')).toBeInTheDocument();
  });

  it('should render experience category links from homepage config', () => {
    renderWithProviders(<Footer />);

    // Default categories from DEFAULT_SITE_CONFIG.homepageConfig.categories
    expect(screen.getByRole('link', { name: 'Tours & Sightseeing' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Food & Drink' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Adventure' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Culture & History' })).toBeInTheDocument();
  });

  it('should render company links', () => {
    renderWithProviders(<Footer />);

    expect(screen.getByRole('link', { name: 'About Us' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact' })).toBeInTheDocument();
  });

  it('should render legal links', () => {
    renderWithProviders(<Footer />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeInTheDocument();
  });

  it('should render social links when provided', () => {
    const siteConfig = createMockSiteConfig({
      brand: {
        socialLinks: {
          facebook: 'https://facebook.com/test',
          instagram: 'https://instagram.com/test',
          twitter: 'https://twitter.com/test',
        },
        name: 'Test Brand',
        tagline: null,
        primaryColor: '#6366f1',
        secondaryColor: '#8b5cf6',
        accentColor: '#f59e0b',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        logoUrl: null,
        logoDarkUrl: null,
        faviconUrl: null,
        ogImageUrl: null,
      },
    });

    renderWithProviders(<Footer />, { siteConfig });

    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute(
      'href',
      'https://facebook.com/test'
    );
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://instagram.com/test'
    );
    expect(screen.getByRole('link', { name: 'X (Twitter)' })).toHaveAttribute(
      'href',
      'https://twitter.com/test'
    );
  });

  it('should render default social links when none configured', () => {
    renderWithProviders(<Footer />);

    // DEFAULT_SOCIAL_LINKS provides Facebook and X (Twitter) as fallbacks
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute(
      'href',
      'https://www.facebook.com/experiencess'
    );
    expect(screen.getByRole('link', { name: 'X (Twitter)' })).toHaveAttribute(
      'href',
      'https://x.com/experiencess'
    );
    // Instagram is NOT in defaults
    expect(screen.queryByRole('link', { name: 'Instagram' })).not.toBeInTheDocument();
  });

  it('should render copyright with current year and Holibob', () => {
    renderWithProviders(<Footer />);

    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(currentYear))).toBeInTheDocument();
    expect(screen.getByText(/Holibob/)).toBeInTheDocument();
    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument();
  });

  it('should have correct href for category links with search params', () => {
    renderWithProviders(<Footer />);

    // Links should use q= param for search
    const toursLink = screen.getByRole('link', { name: 'Tours & Sightseeing' });
    expect(toursLink.getAttribute('href')).toContain('/experiences?');
    expect(toursLink.getAttribute('href')).toContain('q=');
  });

  it('should include destination in category links when available', () => {
    const siteConfig = createMockSiteConfig({
      homepageConfig: {
        hero: { title: 'Test', subtitle: 'Test' },
        popularExperiences: {
          title: 'Popular',
          subtitle: 'Experiences',
          destination: 'London',
        },
        categories: [
          { name: 'Food Tours', slug: 'food-tours', icon: '🍕' },
          { name: 'Wine Tasting', slug: 'wine-tasting', icon: '🍷' },
        ],
      },
    });

    renderWithProviders(<Footer />, { siteConfig });

    // Should use categories from homepageConfig
    const foodToursLink = screen.getByRole('link', { name: 'Food Tours' });
    expect(foodToursLink.getAttribute('href')).toContain('q=Food+Tours');
    expect(foodToursLink.getAttribute('href')).toContain('destination=London');
  });
});
