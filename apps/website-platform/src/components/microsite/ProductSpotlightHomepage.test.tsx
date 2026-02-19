import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductSpotlightHomepage } from './ProductSpotlightHomepage';

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} />,
}));

// Mock child components
vi.mock('@/components/experiences/ExperienceGallery', () => ({
  ExperienceGallery: ({ images }: any) => <div data-testid="gallery">{images.length} images</div>,
}));

vi.mock('@/components/experiences/BookingWidget', () => ({
  BookingWidget: () => <div data-testid="booking-widget">Booking</div>,
}));

vi.mock('@/components/experiences/MobileBookingCTA', () => ({
  MobileBookingCTA: () => <div data-testid="mobile-cta">CTA</div>,
}));

vi.mock('@/components/analytics/TrackViewItem', () => ({
  TrackViewItem: () => null,
}));

vi.mock('@/lib/image-utils', () => ({
  BLUR_PLACEHOLDER: 'data:image/png;base64,placeholder',
  isHolibobImage: vi.fn(() => false),
}));

vi.mock('@/components/ui/PriceDisplay', () => ({
  PriceDisplay: ({ priceFormatted }: any) => <span data-testid="price">{priceFormatted}</span>,
}));

vi.mock('@/lib/pricing', () => ({
  getProductPricingConfig: vi.fn(() => ({
    markupPercentage: 0,
    showDiscountBadge: false,
  })),
}));

function makeExperience(overrides: Record<string, any> = {}) {
  return {
    id: 'exp-1',
    title: 'London Walking Tour',
    slug: 'london-walking-tour',
    shortDescription: 'A guided walk through historic London',
    description: '<p>See the best of London on foot</p>',
    imageUrl: '/hero.jpg',
    images: ['/hero.jpg', '/img2.jpg', '/img3.jpg'],
    price: { amount: 3500, currency: 'GBP', formatted: '£35.00' },
    duration: { formatted: '2h', minutes: 120 },
    rating: { average: 4.5, count: 100 },
    location: { name: 'London' },
    categories: ['Walking Tours'],
    highlights: ['See Big Ben', 'Visit Westminster'],
    languages: ['English', 'Spanish'],
    cancellationPolicy: 'Free cancellation up to 24h before',
    ...overrides,
  } as any;
}

const makeSite = (overrides: Record<string, any> = {}) =>
  ({
    id: 'site-1',
    name: 'London Tours',
    brand: { primaryColor: '#0d9488' },
    ...overrides,
  }) as any;

describe('ProductSpotlightHomepage', () => {
  const defaultProps = {
    site: makeSite(),
    experience: makeExperience(),
  };

  it('renders experience title', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('London Walking Tour')).toBeDefined();
  });

  it('renders rating badge', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText(/4\.5/)).toBeDefined();
    expect(screen.getByText(/100 reviews/)).toBeDefined();
  });

  it('hides rating badge when no reviews', () => {
    render(
      <ProductSpotlightHomepage
        {...defaultProps}
        experience={makeExperience({ rating: { average: 0, count: 0 } })}
      />
    );
    expect(screen.queryByText(/reviews/)).toBeNull();
  });

  it('renders location name', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getAllByText('London').length).toBeGreaterThanOrEqual(1);
  });

  it('renders duration', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getAllByText('2h').length).toBeGreaterThanOrEqual(1);
  });

  it('renders free cancellation badge', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('Free Cancellation')).toBeDefined();
  });

  it('hides free cancellation when policy does not include free', () => {
    render(
      <ProductSpotlightHomepage
        {...defaultProps}
        experience={makeExperience({ cancellationPolicy: 'No refunds' })}
      />
    );
    expect(screen.queryByText('Free Cancellation')).toBeNull();
  });

  it('renders Check Availability CTA', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('Check Availability')).toBeDefined();
  });

  it('renders experience gallery when multiple images', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(document.querySelector('[data-testid="gallery"]')).toBeTruthy();
  });

  it('hides gallery when only one image', () => {
    render(
      <ProductSpotlightHomepage
        {...defaultProps}
        experience={makeExperience({ images: ['/hero.jpg'] })}
      />
    );
    expect(document.querySelector('[data-testid="gallery"]')).toBeNull();
  });

  it('renders About This Experience section', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('About This Experience')).toBeDefined();
  });

  it('renders description as HTML', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('See the best of London on foot')).toBeDefined();
  });

  it('renders highlights', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('Highlights')).toBeDefined();
    expect(screen.getByText('See Big Ben')).toBeDefined();
    expect(screen.getByText('Visit Westminster')).toBeDefined();
  });

  it('hides highlights section when none provided', () => {
    render(
      <ProductSpotlightHomepage {...defaultProps} experience={makeExperience({ highlights: [] })} />
    );
    expect(screen.queryByText('Highlights')).toBeNull();
  });

  it('renders Quick Facts section', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('Quick Facts')).toBeDefined();
  });

  it('renders languages in Quick Facts', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('English, Spanish')).toBeDefined();
  });

  it('renders cancellation policy in Quick Facts', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('Free cancellation up to 24h before')).toBeDefined();
  });

  it('renders booking widget section', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('Select Date & Book')).toBeDefined();
    expect(document.querySelector('[data-testid="booking-widget"]')).toBeTruthy();
  });

  it('renders trust signals', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(screen.getByText('Secure Booking')).toBeDefined();
    expect(screen.getByText('Instant Confirmation')).toBeDefined();
    expect(screen.getByText('Mobile Tickets')).toBeDefined();
    expect(screen.getByText('24/7 Support')).toBeDefined();
  });

  it('renders mobile booking CTA', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(document.querySelector('[data-testid="mobile-cta"]')).toBeTruthy();
  });

  it('renders price display', () => {
    render(<ProductSpotlightHomepage {...defaultProps} />);
    expect(document.querySelector('[data-testid="price"]')).toBeTruthy();
  });
});
