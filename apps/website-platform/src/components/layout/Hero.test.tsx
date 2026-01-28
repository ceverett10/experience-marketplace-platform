import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, createMockSiteConfig } from '@/test/test-utils';
import { Hero } from './Hero';

// Mock the SearchBar component
vi.mock('@/components/search/SearchBar', () => ({
  SearchBar: ({ variant }: { variant: string }) => (
    <div data-testid="search-bar" data-variant={variant}>
      Mock SearchBar
    </div>
  ),
}));

describe('Hero', () => {
  it('should render default title', () => {
    renderWithProviders(<Hero />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Discover Unique Experiences'
    );
  });

  it('should render custom title when provided', () => {
    renderWithProviders(<Hero title="Welcome to London" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Welcome to London'
    );
  });

  it('should render custom subtitle when provided', () => {
    renderWithProviders(<Hero subtitle="Custom subtitle text" />);
    expect(screen.getByText('Custom subtitle text')).toBeInTheDocument();
  });

  it('should render brand tagline as subtitle when no custom subtitle', () => {
    const siteConfig = createMockSiteConfig({
      brand: {
        tagline: 'Amazing adventures await',
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

    renderWithProviders(<Hero />, { siteConfig });
    expect(screen.getByText('Amazing adventures await')).toBeInTheDocument();
  });

  it('should render SearchBar component with hero variant', () => {
    renderWithProviders(<Hero />);

    const searchBar = screen.getByTestId('search-bar');
    expect(searchBar).toBeInTheDocument();
    expect(searchBar).toHaveAttribute('data-variant', 'hero');
  });

  it('should render popular category links', () => {
    renderWithProviders(<Hero />);

    expect(screen.getByText('Popular:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tours' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Day Trips' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Food & Drink' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Attractions' })).toBeInTheDocument();
  });

  it('should have correct hrefs for category links', () => {
    renderWithProviders(<Hero />);

    expect(screen.getByRole('link', { name: 'Tours' })).toHaveAttribute(
      'href',
      '/experiences?category=tours'
    );
    expect(screen.getByRole('link', { name: 'Day Trips' })).toHaveAttribute(
      'href',
      '/experiences?category=day-trips'
    );
    expect(screen.getByRole('link', { name: 'Food & Drink' })).toHaveAttribute(
      'href',
      '/experiences?category=food-drink'
    );
    expect(screen.getByRole('link', { name: 'Attractions' })).toHaveAttribute(
      'href',
      '/experiences?category=attractions'
    );
  });

  it('should render background image when provided', () => {
    renderWithProviders(<Hero backgroundImage="https://example.com/bg.jpg" />);

    const bgImage = screen.getByRole('img');
    expect(bgImage).toHaveAttribute('src', 'https://example.com/bg.jpg');
  });

  it('should use gradient background when no image provided', () => {
    const siteConfig = createMockSiteConfig({
      brand: {
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        name: 'Test Brand',
        tagline: null,
        accentColor: '#f59e0b',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        logoUrl: null,
        faviconUrl: null,
        ogImageUrl: null,
        socialLinks: null,
      },
    });

    renderWithProviders(<Hero />, { siteConfig });

    // No image should be rendered
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('should render site description as fallback subtitle', () => {
    const siteConfig = createMockSiteConfig({
      description: 'Site description fallback',
      brand: {
        tagline: null,
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

    renderWithProviders(<Hero />, { siteConfig });
    expect(screen.getByText('Site description fallback')).toBeInTheDocument();
  });
});
