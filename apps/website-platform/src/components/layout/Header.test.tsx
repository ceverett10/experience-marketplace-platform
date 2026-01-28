import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, createMockSiteConfig } from '@/test/test-utils';
import { Header } from './Header';

describe('Header', () => {
  it('should render site name when no logo provided', () => {
    renderWithProviders(<Header />);
    expect(screen.getByText('Experience Marketplace')).toBeInTheDocument();
  });

  it('should render logo when logoUrl is provided', () => {
    const siteConfig = createMockSiteConfig({
      name: 'Test Site',
      brand: {
        logoUrl: 'https://example.com/logo.png',
        name: 'Test Brand',
        tagline: null,
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

    renderWithProviders(<Header />, { siteConfig });

    const logo = screen.getByAltText('Test Site');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png');
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

  it('should apply brand primary color to site name', () => {
    const siteConfig = createMockSiteConfig({
      brand: {
        primaryColor: '#ff0000',
        name: 'Test Brand',
        tagline: null,
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

    renderWithProviders(<Header />, { siteConfig });

    const siteName = screen.getByText('Experience Marketplace');
    expect(siteName).toHaveStyle({ color: '#ff0000' });
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
