import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileBookingCTA } from './MobileBookingCTA';
import type { BookingStats } from '@/lib/booking-analytics';

// Mock site-context
vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0d9488' }),
}));

// Mock AvailabilityModal
vi.mock('./AvailabilityModal', () => ({
  AvailabilityModal: ({ isOpen, onClose, productId, productName }: any) =>
    isOpen ? (
      <div
        data-testid="availability-modal"
        data-product-id={productId}
        data-product-name={productName}
      >
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

// Mock PriceDisplay
vi.mock('@/components/ui/PriceDisplay', () => ({
  PriceDisplay: ({ priceFormatted, variant }: any) => (
    <div data-testid="price-display" data-variant={variant}>
      {priceFormatted}
    </div>
  ),
}));

// Mock pricing
vi.mock('@/lib/pricing', () => ({
  getProductPricingConfig: vi.fn(() => null),
}));

const defaultProps = {
  productId: 'prod-1',
  productName: 'London Eye Tour',
  priceFormatted: '£35.00',
  priceAmount: 35,
  priceCurrency: 'GBP',
};

describe('MobileBookingCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the price display component', () => {
      render(<MobileBookingCTA {...defaultProps} />);
      const priceDisplay = screen.getByTestId('price-display');
      expect(priceDisplay).toBeInTheDocument();
      expect(priceDisplay).toHaveTextContent('£35.00');
      expect(priceDisplay).toHaveAttribute('data-variant', 'compact');
    });

    it('renders free cancellation and best price guarantee text', () => {
      render(<MobileBookingCTA {...defaultProps} />);
      // The paragraph contains both texts joined by a middot
      const infoText = screen.getByText(/best price guarantee/i);
      expect(infoText).toBeInTheDocument();
      expect(infoText.textContent).toMatch(/free cancellation/i);
    });

    it('renders Reserve now button', () => {
      render(<MobileBookingCTA {...defaultProps} />);
      expect(screen.getByRole('button', { name: /reserve now/i })).toBeInTheDocument();
    });

    it('renders spacer div for sticky CTA', () => {
      const { container } = render(<MobileBookingCTA {...defaultProps} />);
      const spacer = container.querySelector('.h-20');
      expect(spacer).toBeInTheDocument();
    });
  });

  describe('urgency banner', () => {
    it('shows urgency banner when isHighDemand is true', () => {
      const stats: BookingStats = {
        bookingsToday: 3,
        bookingsThisWeek: 8,
        isHighDemand: true,
        isTrending: false,
      };
      render(<MobileBookingCTA {...defaultProps} bookingStats={stats} />);
      expect(screen.getByText(/high demand/i)).toBeInTheDocument();
    });

    it('shows urgency banner when isTrending is true', () => {
      const stats: BookingStats = {
        bookingsToday: 5,
        bookingsThisWeek: 15,
        isHighDemand: false,
        isTrending: true,
      };
      render(<MobileBookingCTA {...defaultProps} bookingStats={stats} />);
      expect(screen.getByText(/high demand/i)).toBeInTheDocument();
    });

    it('does not show urgency banner when neither high demand nor trending', () => {
      const stats: BookingStats = {
        bookingsToday: 1,
        bookingsThisWeek: 2,
        isHighDemand: false,
        isTrending: false,
      };
      render(<MobileBookingCTA {...defaultProps} bookingStats={stats} />);
      expect(screen.queryByText(/high demand/i)).not.toBeInTheDocument();
    });

    it('does not show urgency banner when no bookingStats provided', () => {
      render(<MobileBookingCTA {...defaultProps} />);
      expect(screen.queryByText(/high demand/i)).not.toBeInTheDocument();
    });
  });

  describe('availability modal', () => {
    it('opens modal when Reserve now button is clicked', () => {
      render(<MobileBookingCTA {...defaultProps} />);
      expect(screen.queryByTestId('availability-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /reserve now/i }));
      expect(screen.getByTestId('availability-modal')).toBeInTheDocument();
    });

    it('closes modal via Close button', () => {
      render(<MobileBookingCTA {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /reserve now/i }));
      expect(screen.getByTestId('availability-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Close Modal'));
      expect(screen.queryByTestId('availability-modal')).not.toBeInTheDocument();
    });

    it('passes correct productId and productName to modal', () => {
      render(<MobileBookingCTA {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /reserve now/i }));
      const modal = screen.getByTestId('availability-modal');
      expect(modal).toHaveAttribute('data-product-id', 'prod-1');
      expect(modal).toHaveAttribute('data-product-name', 'London Eye Tour');
    });
  });

  describe('default props', () => {
    it('uses default priceAmount of 0 when not provided', () => {
      render(<MobileBookingCTA productId="prod-1" productName="Test" priceFormatted="£0.00" />);
      expect(screen.getByTestId('price-display')).toBeInTheDocument();
    });

    it('uses default priceCurrency of GBP when not provided', () => {
      render(<MobileBookingCTA productId="prod-1" productName="Test" priceFormatted="£10.00" />);
      expect(screen.getByTestId('price-display')).toBeInTheDocument();
    });
  });
});
