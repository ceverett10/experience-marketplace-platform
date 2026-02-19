import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, createMockSiteConfig } from '@/test/test-utils';
import { Footer } from './Footer';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} />,
}));

describe('Footer', () => {
  // ── Brand section ─────────────────────────────────────────────────────

  describe('brand section', () => {
    it('should render site name when no logo', () => {
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

    it('should render site description when no tagline', () => {
      const siteConfig = createMockSiteConfig({
        description: 'Custom site description text',
        brand: {
          tagline: null,
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
      expect(screen.getByText('Custom site description text')).toBeInTheDocument();
    });

    it('should render fallback description when no tagline or description', () => {
      const siteConfig = createMockSiteConfig({
        description: undefined,
        brand: {
          tagline: null,
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
      expect(
        screen.getByText('Discover unique experiences in your destination.')
      ).toBeInTheDocument();
    });
  });

  // ── Experience links (navigation) ─────────────────────────────────────

  describe('experience category links', () => {
    it('should render experience category links from homepage config', () => {
      renderWithProviders(<Footer />);

      // Default categories from DEFAULT_SITE_CONFIG.homepageConfig.categories
      expect(screen.getByRole('link', { name: 'Tours & Sightseeing' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Food & Drink' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Adventure' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Culture & History' })).toBeInTheDocument();
    });

    it('should use categories from homepageConfig context even when site homepageConfig is null', () => {
      // When homepageConfig is null, usHomepageConfig() falls back to DEFAULT_SITE_CONFIG.homepageConfig
      // which has Tours & Sightseeing, Food & Drink, Adventure, Culture & History
      const siteConfig = createMockSiteConfig({
        homepageConfig: null,
      });

      renderWithProviders(<Footer />, { siteConfig });

      // Falls back to DEFAULT_SITE_CONFIG.homepageConfig categories via the useHomepageConfig hook
      expect(screen.getByRole('link', { name: 'Tours & Sightseeing' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Food & Drink' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Adventure' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Culture & History' })).toBeInTheDocument();
    });

    it('should render custom categories from homepage config', () => {
      const siteConfig = createMockSiteConfig({
        homepageConfig: {
          hero: { title: 'Test', subtitle: 'Test' },
          popularExperiences: {
            title: 'Popular',
            subtitle: 'Experiences',
            destination: 'London',
          },
          categories: [
            { name: 'Food Tours', slug: 'food-tours', icon: null },
            { name: 'Wine Tasting', slug: 'wine-tasting', icon: null },
          ],
        },
      });

      renderWithProviders(<Footer />, { siteConfig });
      expect(screen.getByRole('link', { name: 'Food Tours' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Wine Tasting' })).toBeInTheDocument();
    });

    it('should have correct href for category links with search params', () => {
      renderWithProviders(<Footer />);

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
            { name: 'Food Tours', slug: 'food-tours', icon: null },
            { name: 'Wine Tasting', slug: 'wine-tasting', icon: null },
          ],
        },
      });

      renderWithProviders(<Footer />, { siteConfig });

      const foodToursLink = screen.getByRole('link', { name: 'Food Tours' });
      expect(foodToursLink.getAttribute('href')).toContain('q=Food+Tours');
      expect(foodToursLink.getAttribute('href')).toContain('destination=London');
    });

    it('should limit category links to first 4', () => {
      const siteConfig = createMockSiteConfig({
        homepageConfig: {
          hero: { title: 'Test', subtitle: 'Test' },
          popularExperiences: { title: 'Popular', subtitle: 'Sub' },
          categories: [
            { name: 'Cat 1', slug: 'cat-1', icon: null },
            { name: 'Cat 2', slug: 'cat-2', icon: null },
            { name: 'Cat 3', slug: 'cat-3', icon: null },
            { name: 'Cat 4', slug: 'cat-4', icon: null },
            { name: 'Cat 5', slug: 'cat-5', icon: null },
            { name: 'Cat 6', slug: 'cat-6', icon: null },
          ],
        },
      });

      renderWithProviders(<Footer />, { siteConfig });

      expect(screen.getByRole('link', { name: 'Cat 1' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Cat 4' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Cat 5' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Cat 6' })).not.toBeInTheDocument();
    });

    it('should not include destination param when destination is not set', () => {
      const siteConfig = createMockSiteConfig({
        homepageConfig: {
          hero: { title: 'Test', subtitle: 'Test' },
          popularExperiences: {
            title: 'Popular',
            subtitle: 'Experiences',
            // No destination
          },
          categories: [{ name: 'Food Tours', slug: 'food-tours', icon: null }],
        },
      });

      renderWithProviders(<Footer />, { siteConfig });

      const foodToursLink = screen.getByRole('link', { name: 'Food Tours' });
      expect(foodToursLink.getAttribute('href')).not.toContain('destination=');
    });
  });

  // ── Company links ─────────────────────────────────────────────────────

  describe('company links', () => {
    it('should render About Us link', () => {
      renderWithProviders(<Footer />);
      const link = screen.getByRole('link', { name: 'About Us' });
      expect(link).toHaveAttribute('href', '/about');
    });

    it('should render Contact link', () => {
      renderWithProviders(<Footer />);
      const link = screen.getByRole('link', { name: 'Contact' });
      expect(link).toHaveAttribute('href', '/contact');
    });
  });

  // ── Legal links ───────────────────────────────────────────────────────

  describe('legal links', () => {
    it('should render Privacy Policy link', () => {
      renderWithProviders(<Footer />);
      const link = screen.getByRole('link', { name: 'Privacy Policy' });
      expect(link).toHaveAttribute('href', '/privacy');
    });

    it('should render Terms of Service link', () => {
      renderWithProviders(<Footer />);
      const link = screen.getByRole('link', { name: 'Terms of Service' });
      expect(link).toHaveAttribute('href', '/terms');
    });
  });

  // ── Social links ──────────────────────────────────────────────────────

  describe('social links', () => {
    it('should render custom social links when provided', () => {
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

      expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute(
        'href',
        'https://www.facebook.com/profile.php?id=61587586815675'
      );
      expect(screen.getByRole('link', { name: 'X (Twitter)' })).toHaveAttribute(
        'href',
        'https://x.com/ExperiencessCom'
      );
      expect(screen.getByRole('link', { name: 'Pinterest' })).toHaveAttribute(
        'href',
        'https://www.pinterest.co.uk/00nbxjcmbvodh0scl8x8t2npb25phj/'
      );
    });

    it('should not render Instagram when not in defaults', () => {
      renderWithProviders(<Footer />);
      expect(screen.queryByRole('link', { name: 'Instagram' })).not.toBeInTheDocument();
    });

    it('should not render Pinterest when only facebook/twitter provided', () => {
      const siteConfig = createMockSiteConfig({
        brand: {
          socialLinks: {
            facebook: 'https://facebook.com/test',
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

      expect(screen.queryByRole('link', { name: 'Pinterest' })).not.toBeInTheDocument();
    });

    it('social links open in new tab', () => {
      renderWithProviders(<Footer />);

      const fbLink = screen.getByRole('link', { name: 'Facebook' });
      expect(fbLink).toHaveAttribute('target', '_blank');
      expect(fbLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  // ── Related microsites ────────────────────────────────────────────────

  describe('related microsites', () => {
    it('should render related microsites when provided', () => {
      const siteConfig = createMockSiteConfig({
        relatedMicrosites: [
          { fullDomain: 'rome-tours.example.com', siteName: 'Rome Tours' },
          { fullDomain: 'paris-tours.example.com', siteName: 'Paris Tours' },
        ],
      });

      renderWithProviders(<Footer />, { siteConfig });

      expect(screen.getByText('More Experiences')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Rome Tours' })).toHaveAttribute(
        'href',
        'https://rome-tours.example.com'
      );
      expect(screen.getByRole('link', { name: 'Paris Tours' })).toHaveAttribute(
        'href',
        'https://paris-tours.example.com'
      );
    });

    it('should render "Experiencess Network" link with microsites', () => {
      const siteConfig = createMockSiteConfig({
        relatedMicrosites: [{ fullDomain: 'rome-tours.example.com', siteName: 'Rome Tours' }],
      });

      renderWithProviders(<Footer />, { siteConfig });

      const networkLink = screen.getByText(/Experiencess Network/);
      expect(networkLink.closest('a')).toHaveAttribute('href', 'https://experiencess.com');
    });

    it('should limit to 5 microsites', () => {
      const microsites = Array.from({ length: 8 }, (_, i) => ({
        fullDomain: `site-${i}.example.com`,
        siteName: `Site ${i}`,
      }));

      const siteConfig = createMockSiteConfig({
        relatedMicrosites: microsites,
      });

      renderWithProviders(<Footer />, { siteConfig });

      expect(screen.getByRole('link', { name: 'Site 0' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Site 4' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Site 5' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Site 7' })).not.toBeInTheDocument();
    });

    it('should not render More Experiences section when no microsites', () => {
      renderWithProviders(<Footer />);
      expect(screen.queryByText('More Experiences')).not.toBeInTheDocument();
    });

    it('should not render More Experiences section when microsites is empty array', () => {
      const siteConfig = createMockSiteConfig({
        relatedMicrosites: [],
      });

      renderWithProviders(<Footer />, { siteConfig });
      expect(screen.queryByText('More Experiences')).not.toBeInTheDocument();
    });
  });

  // ── Payment logos ─────────────────────────────────────────────────────

  describe('payment logos', () => {
    it('should render "We accept" label', () => {
      renderWithProviders(<Footer />);
      expect(screen.getByText('We accept')).toBeInTheDocument();
    });

    it('should render payment method names', () => {
      renderWithProviders(<Footer />);
      expect(screen.getByText('VISA')).toBeInTheDocument();
      expect(screen.getByText('AMEX')).toBeInTheDocument();
      expect(screen.getByText('Apple Pay')).toBeInTheDocument();
      expect(screen.getByText('Google Pay')).toBeInTheDocument();
      expect(screen.getByText('Secured by Stripe')).toBeInTheDocument();
    });
  });

  // ── Copyright section ─────────────────────────────────────────────────

  describe('copyright section', () => {
    it('should render copyright with current year and Holibob', () => {
      renderWithProviders(<Footer />);

      const currentYear = new Date().getFullYear().toString();
      expect(screen.getByText(new RegExp(currentYear))).toBeInTheDocument();
      expect(screen.getByText(/Holibob/)).toBeInTheDocument();
      expect(screen.getByText(/All rights reserved/)).toBeInTheDocument();
    });

    it('should render Experiencess.com network link when micrositeContext is present', () => {
      const siteConfig = createMockSiteConfig({
        micrositeContext: { someKey: 'value' },
      });

      renderWithProviders(<Footer />, { siteConfig });

      expect(screen.getByText(/Part of the/)).toBeInTheDocument();
      const networkLink = screen.getByRole('link', { name: 'Experiencess.com' });
      expect(networkLink).toHaveAttribute('href', 'https://experiencess.com');
    });

    it('should not render network text when no micrositeContext', () => {
      const siteConfig = createMockSiteConfig({
        micrositeContext: null,
      });

      renderWithProviders(<Footer />, { siteConfig });
      expect(screen.queryByText(/Part of the/)).not.toBeInTheDocument();
    });
  });

  // ── Parent domain footer ──────────────────────────────────────────────

  describe('parent domain footer', () => {
    it('should render parent domain footer when isParentDomain is true', () => {
      const siteConfig = createMockSiteConfig({
        isParentDomain: true,
      });

      renderWithProviders(<Footer />, { siteConfig });

      // Should show "Experiencess" brand name
      expect(screen.getByText('Experiencess')).toBeInTheDocument();
    });

    it('should render parent domain network description', () => {
      const siteConfig = createMockSiteConfig({
        isParentDomain: true,
      });

      renderWithProviders(<Footer />, { siteConfig });

      expect(
        screen.getByText(/A network of experience brands powered through our partnership/)
      ).toBeInTheDocument();
    });

    it('should render Network navigation in parent domain footer', () => {
      const siteConfig = createMockSiteConfig({
        isParentDomain: true,
      });

      renderWithProviders(<Footer />, { siteConfig });

      expect(screen.getByText('Network')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Our Brands' })).toHaveAttribute(
        'href',
        '/#our-brands'
      );
      expect(screen.getByRole('link', { name: 'Our Providers' })).toHaveAttribute(
        'href',
        '/#featured-providers'
      );
      expect(screen.getByRole('link', { name: 'Top Locations' })).toHaveAttribute(
        'href',
        '/#top-locations'
      );
    });

    it('should render company and legal links in parent domain footer', () => {
      const siteConfig = createMockSiteConfig({
        isParentDomain: true,
      });

      renderWithProviders(<Footer />, { siteConfig });

      expect(screen.getByRole('link', { name: 'About Us' })).toHaveAttribute('href', '/about');
      expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
      expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
        'href',
        '/privacy'
      );
      expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
        'href',
        '/terms'
      );
    });

    it('should render default social links in parent domain footer', () => {
      const siteConfig = createMockSiteConfig({
        isParentDomain: true,
      });

      renderWithProviders(<Footer />, { siteConfig });

      expect(screen.getByRole('link', { name: 'Facebook' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'X (Twitter)' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Pinterest' })).toBeInTheDocument();
    });

    it('should render payment logos in parent domain footer', () => {
      const siteConfig = createMockSiteConfig({
        isParentDomain: true,
      });

      renderWithProviders(<Footer />, { siteConfig });

      expect(screen.getByText('VISA')).toBeInTheDocument();
      expect(screen.getByText('Secured by Stripe')).toBeInTheDocument();
    });

    it('should render copyright in parent domain footer without network mention', () => {
      const siteConfig = createMockSiteConfig({
        isParentDomain: true,
      });

      renderWithProviders(<Footer />, { siteConfig });

      // Multiple elements may match /Holibob/ (brand description + copyright)
      expect(screen.getAllByText(/Holibob/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/All rights reserved/)).toBeInTheDocument();
    });

    it('should not render "Experiences" section heading in parent domain footer', () => {
      const siteConfig = createMockSiteConfig({
        isParentDomain: true,
      });

      renderWithProviders(<Footer />, { siteConfig });

      // Parent footer uses "Network" heading instead of "Experiences"
      expect(screen.queryByText('Experiences')).not.toBeInTheDocument();
      expect(screen.getByText('Network')).toBeInTheDocument();
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('should have a footer landmark', () => {
      renderWithProviders(<Footer />);
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    it('should have a sr-only "Footer" heading', () => {
      renderWithProviders(<Footer />);
      expect(screen.getByText('Footer')).toHaveClass('sr-only');
    });

    it('should have Experiences section heading', () => {
      renderWithProviders(<Footer />);
      expect(screen.getByText('Experiences')).toBeInTheDocument();
    });

    it('should have Company section heading', () => {
      renderWithProviders(<Footer />);
      expect(screen.getByText('Company')).toBeInTheDocument();
    });

    it('should have Legal section heading', () => {
      renderWithProviders(<Footer />);
      expect(screen.getByText('Legal')).toBeInTheDocument();
    });

    it('social links should have sr-only text for accessibility', () => {
      renderWithProviders(<Footer />);

      const fbLink = screen.getByRole('link', { name: 'Facebook' });
      expect(fbLink.querySelector('.sr-only')).toHaveTextContent('Facebook');
    });
  });
});
