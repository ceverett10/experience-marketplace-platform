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
        faviconUrl: null,
        ogImageUrl: null,
        socialLinks: null,
      },
    });

    renderWithProviders(<Footer />, { siteConfig });
    expect(screen.getByText('Amazing experiences await')).toBeInTheDocument();
  });

  it('should render experience category links', () => {
    renderWithProviders(<Footer />);

    expect(screen.getByRole('link', { name: 'Tours & Activities' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Day Trips' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Attractions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Food & Drink' })).toBeInTheDocument();
  });

  it('should render company links', () => {
    renderWithProviders(<Footer />);

    expect(screen.getByRole('link', { name: 'About Us' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Careers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Press' })).toBeInTheDocument();
  });

  it('should render legal links', () => {
    renderWithProviders(<Footer />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cookie Policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Accessibility' })).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Twitter' })).toHaveAttribute(
      'href',
      'https://twitter.com/test'
    );
  });

  it('should not render social links when not provided', () => {
    renderWithProviders(<Footer />);

    expect(screen.queryByRole('link', { name: 'Facebook' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Instagram' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Twitter' })).not.toBeInTheDocument();
  });

  it('should render Holibob attribution', () => {
    renderWithProviders(<Footer />);

    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Holibob' })).toHaveAttribute(
      'href',
      'https://holibob.tech'
    );
  });

  it('should render copyright with current year', () => {
    renderWithProviders(<Footer />);

    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(currentYear))).toBeInTheDocument();
    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument();
  });

  it('should have correct href for category links', () => {
    renderWithProviders(<Footer />);

    expect(screen.getByRole('link', { name: 'Tours & Activities' })).toHaveAttribute(
      'href',
      '/experiences?category=tours'
    );
    expect(screen.getByRole('link', { name: 'Day Trips' })).toHaveAttribute(
      'href',
      '/experiences?category=day-trips'
    );
  });
});
