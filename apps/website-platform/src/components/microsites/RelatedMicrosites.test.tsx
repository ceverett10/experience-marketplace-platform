import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedMicrosites } from './RelatedMicrosites';
import type { RelatedMicrosite } from '@/lib/microsite-experiences';

// ── helpers ─────────────────────────────────────────────────────────────────

function createMicrosite(overrides: Partial<RelatedMicrosite> = {}): RelatedMicrosite {
  return {
    fullDomain: 'tours.example.com',
    siteName: 'Amazing Tours',
    tagline: 'Unforgettable experiences await',
    logoUrl: 'https://cdn.example.com/logo.png',
    categories: ['Walking Tours', 'Food & Drink'],
    cities: ['London', 'Paris'],
    productCount: 42,
    rating: 4.7,
    ...overrides,
  };
}

describe('RelatedMicrosites', () => {
  // ── Empty state ─────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders nothing when microsites array is empty', () => {
      const { container } = render(<RelatedMicrosites microsites={[]} />);
      expect(container.innerHTML).toBe('');
    });
  });

  // ── Default props ───────────────────────────────────────────────────────

  describe('default title and subtitle', () => {
    it('renders the default heading', () => {
      render(<RelatedMicrosites microsites={[createMicrosite()]} />);
      expect(
        screen.getByRole('heading', { name: /Discover More Tour Operators/i })
      ).toBeInTheDocument();
    });

    it('renders the default subtitle', () => {
      render(<RelatedMicrosites microsites={[createMicrosite()]} />);
      expect(
        screen.getByText('Explore similar experiences from trusted providers')
      ).toBeInTheDocument();
    });
  });

  // ── Custom title / subtitle ─────────────────────────────────────────────

  describe('custom title and subtitle', () => {
    it('renders a custom title', () => {
      render(<RelatedMicrosites microsites={[createMicrosite()]} title="More Operators" />);
      expect(screen.getByRole('heading', { name: 'More Operators' })).toBeInTheDocument();
    });

    it('renders a custom subtitle', () => {
      render(
        <RelatedMicrosites microsites={[createMicrosite()]} subtitle="Find your next adventure" />
      );
      expect(screen.getByText('Find your next adventure')).toBeInTheDocument();
    });
  });

  // ── Microsite card rendering ────────────────────────────────────────────

  describe('microsite card', () => {
    it('renders the site name', () => {
      render(<RelatedMicrosites microsites={[createMicrosite({ siteName: 'Venice Tours' })]} />);
      expect(screen.getByText('Venice Tours')).toBeInTheDocument();
    });

    it('renders the tagline', () => {
      render(
        <RelatedMicrosites microsites={[createMicrosite({ tagline: 'Explore the canals' })]} />
      );
      expect(screen.getByText('Explore the canals')).toBeInTheDocument();
    });

    it('does not render tagline when it is null', () => {
      render(<RelatedMicrosites microsites={[createMicrosite({ tagline: null })]} />);
      // Only the site name and stats should be present
      expect(screen.queryByText('Unforgettable experiences await')).not.toBeInTheDocument();
    });

    it('renders the logo image with correct alt text', () => {
      render(
        <RelatedMicrosites
          microsites={[
            createMicrosite({
              siteName: 'Rome Walks',
              logoUrl: 'https://cdn.example.com/rome.png',
            }),
          ]}
        />
      );
      const img = screen.getByAltText('Rome Walks logo');
      expect(img).toHaveAttribute('src', 'https://cdn.example.com/rome.png');
    });

    it('renders a fallback initial when logoUrl is null', () => {
      render(
        <RelatedMicrosites
          microsites={[createMicrosite({ siteName: 'Barcelona Fun', logoUrl: null })]}
        />
      );
      // First letter of the site name
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('links to the full domain with https', () => {
      render(
        <RelatedMicrosites microsites={[createMicrosite({ fullDomain: 'my-tours.example.com' })]} />
      );
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://my-tours.example.com');
    });

    it('sets rel="noopener" on links', () => {
      render(<RelatedMicrosites microsites={[createMicrosite()]} />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('rel', 'noopener');
    });
  });

  // ── Rating display ──────────────────────────────────────────────────────

  describe('rating', () => {
    it('displays the formatted rating', () => {
      render(<RelatedMicrosites microsites={[createMicrosite({ rating: 4.8 })]} />);
      expect(screen.getByText('4.8')).toBeInTheDocument();
    });

    it('does not render rating when it is null', () => {
      render(<RelatedMicrosites microsites={[createMicrosite({ rating: null })]} />);
      expect(screen.queryByText(/\d\.\d/)).not.toBeInTheDocument();
    });
  });

  // ── Product count ───────────────────────────────────────────────────────

  describe('product count', () => {
    it('displays singular "experience" for count of 1', () => {
      render(<RelatedMicrosites microsites={[createMicrosite({ productCount: 1 })]} />);
      expect(screen.getByText('1 experience')).toBeInTheDocument();
    });

    it('displays plural "experiences" for count > 1', () => {
      render(<RelatedMicrosites microsites={[createMicrosite({ productCount: 15 })]} />);
      expect(screen.getByText('15 experiences')).toBeInTheDocument();
    });
  });

  // ── City and category tags ──────────────────────────────────────────────

  describe('tags', () => {
    it('renders up to 2 city tags', () => {
      render(
        <RelatedMicrosites
          microsites={[createMicrosite({ cities: ['London', 'Paris', 'Rome'] })]}
        />
      );
      expect(screen.getByText('London')).toBeInTheDocument();
      expect(screen.getByText('Paris')).toBeInTheDocument();
      expect(screen.queryByText('Rome')).not.toBeInTheDocument();
    });

    it('renders up to 2 category tags', () => {
      render(
        <RelatedMicrosites
          microsites={[
            createMicrosite({
              categories: ['Walking Tours', 'Food & Drink', 'Art & Culture'],
            }),
          ]}
        />
      );
      expect(screen.getByText('Walking Tours')).toBeInTheDocument();
      expect(screen.getByText('Food & Drink')).toBeInTheDocument();
      expect(screen.queryByText('Art & Culture')).not.toBeInTheDocument();
    });

    it('renders no tags when cities and categories are empty', () => {
      render(<RelatedMicrosites microsites={[createMicrosite({ cities: [], categories: [] })]} />);
      // The link should still exist, just no tag spans with blue/indigo bg
      expect(screen.getByRole('link')).toBeInTheDocument();
    });
  });

  // ── Multiple microsites ─────────────────────────────────────────────────

  describe('multiple microsites', () => {
    it('renders a card for each microsite', () => {
      const microsites = [
        createMicrosite({ fullDomain: 'a.example.com', siteName: 'Site A' }),
        createMicrosite({ fullDomain: 'b.example.com', siteName: 'Site B' }),
        createMicrosite({ fullDomain: 'c.example.com', siteName: 'Site C' }),
      ];

      render(<RelatedMicrosites microsites={microsites} />);
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(3);
      expect(screen.getByText('Site A')).toBeInTheDocument();
      expect(screen.getByText('Site B')).toBeInTheDocument();
      expect(screen.getByText('Site C')).toBeInTheDocument();
    });
  });
});
