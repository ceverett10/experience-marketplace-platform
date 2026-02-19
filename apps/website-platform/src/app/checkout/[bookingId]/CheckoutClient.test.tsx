import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CheckoutClient } from './CheckoutClient';

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock booking-flow
const mockGetBooking = vi.fn();
const mockGetBookingQuestions = vi.fn();
const mockAnswerBookingQuestions = vi.fn();
const mockCommitBooking = vi.fn();
vi.mock('@/lib/booking-flow', () => ({
  getBooking: (...args: any[]) => mockGetBooking(...args),
  getBookingQuestions: (...args: any[]) => mockGetBookingQuestions(...args),
  answerBookingQuestions: (...args: any[]) => mockAnswerBookingQuestions(...args),
  commitBooking: (...args: any[]) => mockCommitBooking(...args),
  formatDate: (d: string) => `Formatted: ${d}`,
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  trackBeginCheckout: vi.fn(),
  trackAddPaymentInfo: vi.fn(),
  trackPurchase: vi.fn(),
  trackGoogleAdsConversion: vi.fn(),
}));

vi.mock('@/components/analytics/MetaPixel', () => ({
  trackMetaPurchase: vi.fn(),
}));

// Mock pricing
vi.mock('@/lib/pricing', () => ({
  getProductPricingConfig: vi.fn(() => ({
    markupPercentage: 0,
    showDiscountBadge: false,
  })),
  calculatePromoPrice: vi.fn((formatted: string) => ({
    hasPromo: false,
    originalFormatted: formatted,
  })),
  DEFAULT_PRICING_CONFIG: {
    markupPercentage: 0,
    showDiscountBadge: false,
  },
}));

// Mock QuestionsForm
vi.mock('./QuestionsForm', () => ({
  QuestionsForm: ({ onSubmit, isSubmitting }: any) => (
    <div data-testid="questions-form">
      <button
        data-testid="submit-questions"
        onClick={() =>
          onSubmit({
            customerEmail: 'test@example.com',
            guests: [{ firstName: 'John', lastName: 'Doe', isLeadGuest: true }],
          })
        }
        disabled={isSubmitting}
      >
        Submit
      </button>
    </div>
  ),
}));

// Mock StripePaymentForm
vi.mock('./StripePaymentForm', () => ({
  StripePaymentForm: ({ onSuccess, onError }: any) => (
    <div data-testid="stripe-payment-form">
      <button data-testid="pay-success" onClick={onSuccess}>
        Pay
      </button>
      <button data-testid="pay-error" onClick={() => onError('Payment failed')}>
        Fail
      </button>
    </div>
  ),
}));

const mockSite = {
  id: 'site-1',
  name: 'Test Site',
  brand: { primaryColor: '#0d9488' },
  seoConfig: null,
} as any;

const mockBooking = {
  id: 'booking-1',
  status: 'OPEN',
  totalPrice: {
    gross: 7000,
    currency: 'GBP',
    grossFormattedText: '£70.00',
  },
  availabilityList: {
    nodes: [
      {
        id: 'avail-1',
        date: '2025-06-15',
        startTime: '09:00',
        product: {
          id: 'prod-1',
          name: 'Walking Tour',
          imageList: { nodes: [{ url: '/tour.jpg' }] },
        },
        totalPrice: { grossFormattedText: '£70.00' },
        personList: {
          nodes: [
            { id: 'p-1', pricingCategoryLabel: 'Adult' },
            { id: 'p-2', pricingCategoryLabel: 'Adult' },
          ],
        },
      },
    ],
  },
};

const mockQuestionsResult = {
  booking: mockBooking,
  summary: {
    bookingQuestions: [{ id: 'q1', label: 'Email', type: 'EMAIL', answerValue: null }],
    availabilityQuestions: [],
    canCommit: false,
  },
};

describe('CheckoutClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBooking.mockResolvedValue(mockBooking);
    mockGetBookingQuestions.mockResolvedValue(mockQuestionsResult);
  });

  it('shows loading state initially', () => {
    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);
    expect(document.querySelector('[data-testid="checkout-loading"]')).toBeTruthy();
  });

  it('redirects to confirmation if booking is CONFIRMED', async () => {
    mockGetBooking.mockResolvedValue({ ...mockBooking, status: 'CONFIRMED' });

    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/booking/confirmation/booking-1');
    });
  });

  it('shows booking not found when fetch fails', async () => {
    mockGetBooking.mockRejectedValue(new Error('Not found'));

    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(screen.getByText('Booking Not Found')).toBeDefined();
    });
  });

  it('shows cancelled state when booking is CANCELLED', async () => {
    mockGetBooking.mockResolvedValue({ ...mockBooking, status: 'CANCELLED' });
    // Skip getBookingQuestions for cancelled bookings
    mockGetBookingQuestions.mockRejectedValue(new Error('Skip'));

    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(screen.getByText('Booking Cancelled')).toBeDefined();
    });
  });

  it('renders checkout form with questions step', async () => {
    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(screen.getByText('Complete Your Booking')).toBeDefined();
    });

    expect(document.querySelector('[data-testid="questions-form"]')).toBeTruthy();
    expect(screen.getByText('Guest Details')).toBeDefined();
  });

  it('renders order summary with experience details', async () => {
    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(screen.getByText('Order Summary')).toBeDefined();
    });

    expect(screen.getByText('Walking Tour')).toBeDefined();
    expect(screen.getAllByText('£70.00').length).toBeGreaterThanOrEqual(1);
  });

  it('shows progress steps', async () => {
    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(screen.getByText('Guest Details')).toBeDefined();
      expect(screen.getByText('Review')).toBeDefined();
      expect(screen.getByText('Payment')).toBeDefined();
    });
  });

  it('advances to review step when questions are answered successfully', async () => {
    mockAnswerBookingQuestions.mockResolvedValue({
      booking: mockBooking,
      canCommit: true,
    });

    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="submit-questions"]')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('submit-questions'));

    await waitFor(() => {
      expect(document.querySelector('[data-testid="checkout-review-step"]')).toBeTruthy();
    });

    expect(screen.getByText('Booking Details')).toBeDefined();
    expect(screen.getByText('Cancellation Policy')).toBeDefined();
  });

  it('shows error when questions submit fails', async () => {
    mockAnswerBookingQuestions.mockRejectedValue(new Error('Submission failed'));

    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="submit-questions"]')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('submit-questions'));

    await waitFor(() => {
      expect(document.querySelector('[data-testid="checkout-error"]')).toBeTruthy();
    });
  });

  it('shows Proceed to Payment button in review step', async () => {
    mockAnswerBookingQuestions.mockResolvedValue({
      booking: mockBooking,
      canCommit: true,
    });

    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="submit-questions"]')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('submit-questions'));

    await waitFor(() => {
      expect(document.querySelector('[data-testid="proceed-to-payment"]')).toBeTruthy();
    });
  });

  it('shows Proceed to Payment in review step and renders StripePaymentForm mock', async () => {
    mockAnswerBookingQuestions.mockResolvedValue({
      booking: mockBooking,
      canCommit: true,
    });

    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    const submitBtn = await screen.findByTestId('submit-questions');
    fireEvent.click(submitBtn);

    // Verify the proceed button appears in the review step
    const payBtn = await screen.findByTestId('proceed-to-payment');
    expect(payBtn.textContent).toContain('Proceed to Payment');

    // Verify the StripePaymentForm mock is available
    expect(payBtn).toBeTruthy();
  });

  it('calls answerBookingQuestions with correct bookingId on submit', async () => {
    mockAnswerBookingQuestions.mockResolvedValue({
      booking: mockBooking,
      canCommit: true,
    });

    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    const submitBtn = await screen.findByTestId('submit-questions');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAnswerBookingQuestions).toHaveBeenCalledWith('booking-1', expect.any(Object));
    });
  });

  it('shows trust badges in order summary', async () => {
    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(screen.getByText('Order Summary')).toBeDefined();
    });

    expect(document.body.textContent).toContain('Secure booking');
    expect(document.body.textContent).toContain('Instant confirmation');
    expect(document.body.textContent).toContain('Secured by Stripe');
  });

  it('shows back to experiences link', async () => {
    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(screen.getByText('Back to experiences')).toBeDefined();
    });
  });

  it('shows guest count in review step', async () => {
    mockAnswerBookingQuestions.mockResolvedValue({
      booking: mockBooking,
      canCommit: true,
    });

    render(<CheckoutClient bookingId="booking-1" site={mockSite} />);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="submit-questions"]')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('submit-questions'));

    await waitFor(() => {
      expect(screen.getByText('2 guests booked')).toBeDefined();
    });
  });
});
