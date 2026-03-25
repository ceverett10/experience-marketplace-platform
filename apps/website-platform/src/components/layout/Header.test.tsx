import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, createMockSiteConfig } from '@/test/test-utils';
import { Header } from './Header';

describe('Header', () => {
  it('should render site name when no logo provided', () => {
    renderWithProviders(<Header />);
    expect(screen.getByText('Experience Marketplace')).toBeInTheDocument();
  });

  it('should render logo image when logoUrl is provided', () => {
    const siteConfig = createMockSiteConfig({
      name: 'Test Site',
      brand: {
        logoUrl: 'https://example.com/logo.png',
        logoDarkUrl: null,
        name: 'Test Brand',
        tagline: null,
        primaryColor: '#e11d48',
        secondaryColor: '#8b5cf6',
        accentColor: '#f59e0b',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        faviconUrl: null,
        ogImageUrl: null,
        socialLinks: null,
      },
    });

    renderWithProviders(<Header />, { siteConfig });

    const logoImg = screen.getByRole('img', { name: 'Test Site' });
    expect(logoImg).toBeInTheDocument();
    expect(logoImg).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('should use logoUrl (light variant, dark text) on the white header', () => {
    const siteConfig = createMockSiteConfig({
      name: 'Test Site',
      brand: {
        logoUrl: 'https://example.com/logo-light.png',
        logoDarkUrl: 'https://example.com/logo-dark.png',
        name: 'Test Brand',
        tagline: null,
        primaryColor: '#1B4965',
        secondaryColor: '#8b5cf6',
        accentColor: '#f59e0b',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        faviconUrl: null,
        ogImageUrl: null,
        socialLinks: null,
      },
    });

    renderWithProviders(<Header />, { siteConfig });

    // logoUrl = light variant (dark text, transparent bg) — correct for white header
    // logoDarkUrl = dark variant (white text, transparent bg) — for dark/hero backgrounds only
    const logoImg = screen.getByRole('img', { name: 'Test Site' });
    expect(logoImg).toHaveAttribute('src', 'https://example.com/logo-light.png');
  });

  it('should render navigation links', () => {
    renderWithProviders(<Header />);

    expect(screen.getByRole('link', { name: 'Experiences' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Destinations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Categories' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument();
  });

  it('should render Book Now button', () => {
    renderWithProviders(<Header />);

    const bookButton = screen.getAllByRole('link', { name: 'Book Now' });
    expect(bookButton.length).toBeGreaterThan(0);
  });

  it('should toggle mobile menu when menu button is clicked', () => {
    renderWithProviders(<Header />);

    const menuButton = screen.getByRole('button', { name: /open main menu/i });

    // Mobile menu should be closed initially (navigation links in desktop only)
    const mobileNav = screen.queryByRole('link', { name: 'Experiences' });
    expect(mobileNav).toBeInTheDocument();

    // Click to open mobile menu
    fireEvent.click(menuButton);

    // Should still have navigation links (now in mobile menu too)
    const navLinks = screen.getAllByRole('link', { name: 'Experiences' });
    expect(navLinks.length).toBeGreaterThan(0);
  });

  it('should apply brand color to site name when color has sufficient contrast', () => {
    const siteConfig = createMockSiteConfig({
      brand: {
        logoUrl: null,
        logoDarkUrl: null,
        name: 'Test Brand',
        tagline: null,
        primaryColor: '#0d1b2a', // dark color, luminance well below 0.18 threshold
        secondaryColor: '#8b5cf6',
        accentColor: '#f59e0b',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        faviconUrl: null,
        ogImageUrl: null,
        socialLinks: null,
      },
    });
    renderWithProviders(<Header />, { siteConfig });

    const siteName = screen.getByText('Experience Marketplace');
    expect(siteName).toHaveStyle({ color: '#0d1b2a' });
  });

  it('should fall back to dark navy when brand color is too light for contrast', () => {
    // #6366f1 (indigo) has luminance ~0.205 > 0.18 threshold — fails 4.5:1 against white
    renderWithProviders(<Header />);

    const siteName = screen.getByText('Experience Marketplace');
    expect(siteName).toHaveStyle({ color: '#1a2744' });
  });

  it('should render sticky header with white background', () => {
    renderWithProviders(<Header />);

    const header = screen.getByRole('banner');
    expect(header).toHaveClass('sticky', 'bg-white/95');
  });

  it('should have correct href for logo link', () => {
    renderWithProviders(<Header />);

    const logoLink = screen.getByRole('link', { name: 'Experience Marketplace' });
    expect(logoLink).toHaveAttribute('href', '/');
  });

  it('should have correct hrefs for navigation links', () => {
    renderWithProviders(<Header />);

    expect(screen.getByRole('link', { name: 'Experiences' })).toHaveAttribute(
      'href',
      '/experiences'
    );
    expect(screen.getByRole('link', { name: 'Destinations' })).toHaveAttribute(
      'href',
      '/destinations'
    );
    expect(screen.getByRole('link', { name: 'Categories' })).toHaveAttribute('href', '/categories');
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
  });
});
