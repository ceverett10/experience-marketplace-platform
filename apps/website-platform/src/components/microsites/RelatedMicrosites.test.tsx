import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedMicrosites } from './RelatedMicrosites';

type RelatedMicrosite = {
  fullDomain: string;
  siteName: string;
  tagline: string | null;
  logoUrl: string | null;
  categories: string[];
  cities: string[];
  productCount: number;
  rating: number | null;
};

function makeMicrosite(overrides: Partial<RelatedMicrosite> = {}): RelatedMicrosite {
  return {
    fullDomain: 'london-tours.com',
    siteName: 'London Tours',
    tagline: 'The best tours in London',
    logoUrl: 'https://example.com/logo.png',
    categories: ['Walking Tours', 'Food Tours'],
    cities: ['London', 'Oxford'],
    productCount: 42,
    rating: 4.7,
    ...overrides,
  };
}

describe('RelatedMicrosites', () => {
  it('returns null when microsites array is empty', () => {
    const { container } = render(<RelatedMicrosites microsites={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the default title', () => {
    render(<RelatedMicrosites microsites={[makeMicrosite()]} />);
    expect(screen.getByText('Discover More Tour Operators')).toBeInTheDocument();
  });

  it('renders the default subtitle', () => {
    render(<RelatedMicrosites microsites={[makeMicrosite()]} />);
    expect(
      screen.getByText('Explore similar experiences from trusted providers')
    ).toBeInTheDocument();
  });

  it('renders custom title when provided', () => {
    render(<RelatedMicrosites microsites={[makeMicrosite()]} title="Other Operators" />);
    expect(screen.getByText('Other Operators')).toBeInTheDocument();
  });

  it('renders custom subtitle when provided', () => {
    render(<RelatedMicrosites microsites={[makeMicrosite()]} subtitle="Find more adventures" />);
    expect(screen.getByText('Find more adventures')).toBeInTheDocument();
  });

  it('renders microsite site names', () => {
    const microsites = [
      makeMicrosite({ siteName: 'London Tours', fullDomain: 'london-tours.com' }),
      makeMicrosite({ siteName: 'Paris Adventures', fullDomain: 'paris-adventures.com' }),
    ];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.getByText('London Tours')).toBeInTheDocument();
    expect(screen.getByText('Paris Adventures')).toBeInTheDocument();
  });

  it('renders tagline when provided', () => {
    const microsites = [makeMicrosite({ tagline: 'The best tours in London' })];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.getByText('The best tours in London')).toBeInTheDocument();
  });

  it('does not render tagline when null', () => {
    const microsites = [makeMicrosite({ tagline: null, siteName: 'No Tag' })];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.getByText('No Tag')).toBeInTheDocument();
  });

  it('renders logo image when logoUrl is provided', () => {
    const microsites = [
      makeMicrosite({ logoUrl: 'https://example.com/logo.png', siteName: 'MyTours' }),
    ];
    render(<RelatedMicrosites microsites={microsites} />);
    const img = screen.getByAltText('MyTours logo');
    expect(img).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('renders first letter fallback when logoUrl is null', () => {
    const microsites = [makeMicrosite({ logoUrl: null, siteName: 'ZetaTours' })];
    render(<RelatedMicrosites microsites={microsites} />);
    // First letter of "ZetaTours" in a div
    expect(screen.getByText('Z')).toBeInTheDocument();
  });

  it('renders rating with one decimal place', () => {
    const microsites = [makeMicrosite({ rating: 4.7 })];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.getByText('4.7')).toBeInTheDocument();
  });

  it('does not render rating when null', () => {
    const microsites = [makeMicrosite({ rating: null })];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.queryByText(/\d\.\d/)).not.toBeInTheDocument();
  });

  it('renders product count with plural "experiences"', () => {
    const microsites = [makeMicrosite({ productCount: 42 })];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.getByText('42 experiences')).toBeInTheDocument();
  });

  it('renders product count with singular "experience"', () => {
    const microsites = [makeMicrosite({ productCount: 1 })];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.getByText('1 experience')).toBeInTheDocument();
  });

  it('renders city tags (up to 2)', () => {
    const microsites = [makeMicrosite({ cities: ['London', 'Oxford', 'Bath'] })];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.getByText('London')).toBeInTheDocument();
    expect(screen.getByText('Oxford')).toBeInTheDocument();
    expect(screen.queryByText('Bath')).not.toBeInTheDocument();
  });

  it('renders category tags (up to 2)', () => {
    const microsites = [
      makeMicrosite({ categories: ['Walking Tours', 'Food Tours', 'Boat Trips'] }),
    ];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.getByText('Walking Tours')).toBeInTheDocument();
    expect(screen.getByText('Food Tours')).toBeInTheDocument();
    expect(screen.queryByText('Boat Trips')).not.toBeInTheDocument();
  });

  it('links cards to https://{fullDomain}', () => {
    const microsites = [makeMicrosite({ fullDomain: 'london-tours.com' })];
    render(<RelatedMicrosites microsites={microsites} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://london-tours.com');
  });

  it('sets rel="noopener" on links', () => {
    const microsites = [makeMicrosite()];
    render(<RelatedMicrosites microsites={microsites} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('rel', 'noopener');
  });

  it('renders multiple microsites', () => {
    const microsites = [
      makeMicrosite({ siteName: 'Site A', fullDomain: 'site-a.com' }),
      makeMicrosite({ siteName: 'Site B', fullDomain: 'site-b.com' }),
      makeMicrosite({ siteName: 'Site C', fullDomain: 'site-c.com' }),
    ];
    render(<RelatedMicrosites microsites={microsites} />);
    expect(screen.getByText('Site A')).toBeInTheDocument();
    expect(screen.getByText('Site B')).toBeInTheDocument();
    expect(screen.getByText('Site C')).toBeInTheDocument();
  });
});
