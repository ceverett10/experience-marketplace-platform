import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookingWidget } from '@/components/experiences/BookingWidget';
import type { Experience } from '@/lib/holibob';
import type { BookingStats } from '@/lib/booking-analytics';

// Mock site-context
vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0d9488' }),
}));

// Mock AvailabilityModal to avoid its complex dependencies
vi.mock('@/components/experiences/AvailabilityModal', () => ({
  AvailabilityModal: ({ isOpen, onClose, productId }: any) =>
    isOpen ? (
      <div data-testid="availability-modal" data-product-id={productId}>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock PriceDisplay
vi.mock('@/components/ui/PriceDisplay', () => ({
  PriceDisplay: ({ priceFormatted, variant, showFrom }: any) => (
    <div data-testid="price-display" data-variant={variant}>
      {showFrom !== false && 'From '}
      {priceFormatted}
    </div>
  ),
}));

// Mock pricing
vi.mock('@/lib/pricing', () => ({
  getProductPricingConfig: vi.fn(() => null),
}));

const createExperience = (overrides: Partial<Experience> = {}): Experience => ({
  id: 'exp-1',
  title: 'London Eye Experience',
  slug: 'london-eye-experience',
  shortDescription: 'Amazing views of London',
  description: 'Full description here',
  imageUrl: 'https://example.com/image.jpg',
  images: ['https://example.com/image.jpg'],
  price: { amount: 35, currency: 'GBP', formatted: '£35.00' },
  duration: { value: 30, unit: 'minutes', formatted: '30 minutes' },
  rating: { average: 4.7, count: 2453 },
  location: { name: 'London, UK', address: '123 Test Street', lat: 51.5, lng: -0.1 },
  categories: [{ id: 'attractions', name: 'Attractions', slug: 'attractions' }],
  highlights: ['Great views'],
  inclusions: ['Entry ticket'],
  exclusions: ['Food'],
  cancellationPolicy: 'Free cancellation up to 24 hours',
  reviews: [],
  itinerary: [],
  additionalInfo: [],
  languages: ['English'],
  ...overrides,
});

describe('BookingWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('price display', () => {
    it('renders PriceDisplay component with experience price', () => {
      render(<BookingWidget experience={createExperience()} />);
      const priceDisplay = screen.getByTestId('price-display');
      expect(priceDisplay).toBeInTheDocument();
      expect(priceDisplay).toHaveTextContent('£35.00');
    });

    it('renders "From" label above price', () => {
      render(<BookingWidget experience={createExperience()} />);
      expect(screen.getByText('From')).toBeInTheDocument();
    });
  });

  describe('book now button', () => {
    it('renders Book Now button', () => {
      render(<BookingWidget experience={createExperience()} />);
      expect(screen.getByRole('button', { name: /book now/i })).toBeInTheDocument();
    });

    it('renders "Free cancellation available" text below button', () => {
      render(<BookingWidget experience={createExperience()} />);
      expect(screen.getByText('Free cancellation available')).toBeInTheDocument();
    });

    it('opens AvailabilityModal when Book Now is clicked', () => {
      render(<BookingWidget experience={createExperience()} />);
      expect(screen.queryByTestId('availability-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /book now/i }));
      expect(screen.getByTestId('availability-modal')).toBeInTheDocument();
    });

    it('closes AvailabilityModal when Close is clicked inside modal', () => {
      render(<BookingWidget experience={createExperience()} />);
      fireEvent.click(screen.getByRole('button', { name: /book now/i }));
      expect(screen.getByTestId('availability-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Close'));
      expect(screen.queryByTestId('availability-modal')).not.toBeInTheDocument();
    });

    it('passes correct productId to AvailabilityModal', () => {
      render(<BookingWidget experience={createExperience({ id: 'my-product' })} />);
      fireEvent.click(screen.getByRole('button', { name: /book now/i }));
      expect(screen.getByTestId('availability-modal')).toHaveAttribute(
        'data-product-id',
        'my-product'
      );
    });
  });

  describe('popular badge', () => {
    it('shows "Likely to sell out" badge when bookingStats.isHighDemand is true', () => {
      const stats: BookingStats = {
        bookingsToday: 3,
        bookingsThisWeek: 8,
        bookingsThisMonth: 8,
        isHighDemand: true,
        isTrending: false,
      };
      render(<BookingWidget experience={createExperience()} bookingStats={stats} />);
      expect(screen.getByText(/likely to sell out/i)).toBeInTheDocument();
    });

    it('shows "Likely to sell out" badge when bookingStats.isTrending is true', () => {
      const stats: BookingStats = {
        bookingsToday: 5,
        bookingsThisWeek: 15,
        bookingsThisMonth: 15,
        isHighDemand: false,
        isTrending: true,
      };
      render(<BookingWidget experience={createExperience()} bookingStats={stats} />);
      expect(screen.getByText(/likely to sell out/i)).toBeInTheDocument();
    });

    it('shows "Likely to sell out" badge when rating count > 10', () => {
      render(
        <BookingWidget experience={createExperience({ rating: { average: 4.0, count: 50 } })} />
      );
      expect(screen.getByText(/likely to sell out/i)).toBeInTheDocument();
    });

    it('does not show popular badge when not popular', () => {
      render(
        <BookingWidget experience={createExperience({ rating: { average: 3.0, count: 5 } })} />
      );
      expect(screen.queryByText(/likely to sell out/i)).not.toBeInTheDocument();
    });

    it('does not show popular badge when rating is null and no bookingStats', () => {
      render(<BookingWidget experience={createExperience({ rating: null })} />);
      expect(screen.queryByText(/likely to sell out/i)).not.toBeInTheDocument();
    });
  });

  describe('booking count social proof', () => {
    it('shows weekly booking count when bookingsThisWeek >= 3', () => {
      const stats: BookingStats = {
        bookingsToday: 2,
        bookingsThisWeek: 5,
        bookingsThisMonth: 10,
        isHighDemand: false,
        isTrending: false,
      };
      render(<BookingWidget experience={createExperience()} bookingStats={stats} />);
      expect(screen.getByText(/booked 5 times this week/i)).toBeInTheDocument();
    });

    it('shows monthly booking count when bookingsThisWeek < 3 but bookingsThisMonth >= 1', () => {
      const stats: BookingStats = {
        bookingsToday: 0,
        bookingsThisWeek: 1,
        bookingsThisMonth: 4,
        isHighDemand: false,
        isTrending: false,
      };
      render(<BookingWidget experience={createExperience()} bookingStats={stats} />);
      expect(screen.queryByText(/booked.*times this week/i)).not.toBeInTheDocument();
      expect(screen.getByText(/booked 4 times this month/i)).toBeInTheDocument();
    });

    it('shows rating-based social proof when no bookings but rating exists', () => {
      const stats: BookingStats = {
        bookingsToday: 0,
        bookingsThisWeek: 0,
        bookingsThisMonth: 0,
        isHighDemand: false,
        isTrending: false,
      };
      render(
        <BookingWidget
          experience={createExperience({ rating: { average: 4.7, count: 250 } })}
          bookingStats={stats}
        />
      );
      expect(screen.getByText(/rated 4.7 by 250 travelers/i)).toBeInTheDocument();
    });

    it('does not show social proof when no bookings and no rating', () => {
      const stats: BookingStats = {
        bookingsToday: 0,
        bookingsThisWeek: 0,
        bookingsThisMonth: 0,
        isHighDemand: false,
        isTrending: false,
      };
      render(
        <BookingWidget experience={createExperience({ rating: null })} bookingStats={stats} />
      );
      expect(screen.queryByText(/booked.*times/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/rated/i)).not.toBeInTheDocument();
    });

    it('does not show booking count when no bookingStats provided', () => {
      render(<BookingWidget experience={createExperience()} />);
      expect(screen.queryByText(/booked.*times this week/i)).not.toBeInTheDocument();
    });
  });

  describe('trust signals', () => {
    it('renders free cancellation when policy includes "free"', () => {
      render(
        <BookingWidget
          experience={createExperience({
            cancellationPolicy: 'Free cancellation up to 24 hours',
          })}
        />
      );
      expect(screen.getByText('Free cancellation')).toBeInTheDocument();
    });

    it('renders free cancellation when policy includes "full refund"', () => {
      render(
        <BookingWidget
          experience={createExperience({
            cancellationPolicy: 'Full refund if cancelled 48 hours before',
          })}
        />
      );
      expect(screen.getByText('Free cancellation')).toBeInTheDocument();
    });

    it('does not render free cancellation when policy is restrictive', () => {
      render(
        <BookingWidget
          experience={createExperience({
            cancellationPolicy: 'No refunds allowed',
          })}
        />
      );
      expect(screen.queryByText('Free cancellation')).not.toBeInTheDocument();
    });

    it('renders secure payment signal', () => {
      render(<BookingWidget experience={createExperience()} />);
      expect(screen.getByText('Secure payment')).toBeInTheDocument();
      expect(screen.getByText('Payments processed securely via Stripe')).toBeInTheDocument();
    });

    it('renders Stripe footer', () => {
      render(<BookingWidget experience={createExperience()} />);
      expect(screen.getByText('Payments secured by Stripe')).toBeInTheDocument();
    });
  });

  describe('duration and language info', () => {
    it('renders experience duration', () => {
      render(<BookingWidget experience={createExperience()} />);
      expect(screen.getByText('30 minutes')).toBeInTheDocument();
    });

    it('renders first language when languages are provided', () => {
      render(
        <BookingWidget experience={createExperience({ languages: ['English', 'Spanish'] })} />
      );
      expect(screen.getByText('English')).toBeInTheDocument();
    });

    it('does not render language when languages array is empty', () => {
      render(<BookingWidget experience={createExperience({ languages: [] })} />);
      expect(screen.queryByText('English')).not.toBeInTheDocument();
    });
  });
});
