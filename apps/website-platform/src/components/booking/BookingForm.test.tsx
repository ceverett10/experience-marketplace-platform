import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingForm } from './BookingForm';
import { SiteProvider } from '@/lib/site-context';
import { DEFAULT_SITE_CONFIG } from '@/lib/tenant';
import type { Experience } from '@/lib/holibob';

// Track router.push calls
const mockPush = vi.fn();

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
}));

// Mock child components to isolate BookingForm logic
vi.mock('./AvailabilityCalendar', () => ({
  AvailabilityCalendar: ({
    onDateSelect,
    onTimeSlotSelect,
  }: {
    productId: string;
    selectedDate: string | null;
    selectedTimeSlot: any;
    onDateSelect: (date: string) => void;
    onTimeSlotSelect: (slot: any) => void;
    adults?: number;
    children?: number;
  }) => (
    <div data-testid="availability-calendar">
      <button
        data-testid="select-date-btn"
        onClick={() => {
          onDateSelect('2026-03-15');
          onTimeSlotSelect({
            id: 'slot-1',
            time: '10:00 AM',
            price: 3500,
            currency: 'GBP',
          });
        }}
      >
        Select Date & Time
      </button>
    </div>
  ),
}));

vi.mock('./GuestSelector', () => ({
  GuestSelector: ({
    guestCounts,
    onGuestCountChange,
  }: {
    guestCounts: Array<{ typeId: string; count: number }>;
    onGuestCountChange: (typeId: string, count: number) => void;
    maxGuests?: number;
    minGuests?: number;
  }) => (
    <div data-testid="guest-selector">
      {guestCounts.map((gc) => (
        <div key={gc.typeId}>
          <span>
            {gc.typeId}: {gc.count}
          </span>
          <button
            data-testid={`increment-${gc.typeId}`}
            onClick={() => onGuestCountChange(gc.typeId, gc.count + 1)}
          >
            +{gc.typeId}
          </button>
          <button
            data-testid={`decrement-${gc.typeId}`}
            onClick={() => onGuestCountChange(gc.typeId, Math.max(0, gc.count - 1))}
          >
            -{gc.typeId}
          </button>
        </div>
      ))}
    </div>
  ),
  GuestDetailsForm: ({
    guestCounts,
    guestDetails,
    onGuestDetailsChange,
  }: {
    guestCounts: Array<{ typeId: string; count: number }>;
    guestDetails: Array<{
      guestTypeId: string;
      firstName: string;
      lastName: string;
      email?: string;
    }>;
    onGuestDetailsChange: (details: any[]) => void;
  }) => (
    <div data-testid="guest-details-form">
      <button
        data-testid="fill-guest-details"
        onClick={() => {
          const totalGuests = guestCounts.reduce((sum, gc) => sum + gc.count, 0);
          const details = Array.from({ length: totalGuests }, (_, i) => ({
            guestTypeId: i < (guestCounts[0]?.count ?? 0) ? 'adult' : 'child',
            firstName: `First${i}`,
            lastName: `Last${i}`,
            email: i === 0 ? 'lead@example.com' : undefined,
            phone: i === 0 ? '+447000000000' : undefined,
          }));
          onGuestDetailsChange(details);
        }}
      >
        Fill Guest Details
      </button>
    </div>
  ),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper with SiteProvider
const renderWithProvider = (ui: React.ReactNode) => {
  return render(<SiteProvider site={DEFAULT_SITE_CONFIG}>{ui}</SiteProvider>);
};

const mockExperience: Experience = {
  id: 'exp-1',
  title: 'London Eye Experience',
  slug: 'london-eye-experience',
  shortDescription: 'Amazing views of London',
  description: 'Full description here',
  imageUrl: 'https://example.com/image.jpg',
  images: ['https://example.com/image.jpg'],
  price: { amount: 3500, currency: 'GBP', formatted: '\u00a335.00' },
  duration: { value: 30, unit: 'minutes', formatted: '30 minutes' },
  rating: { average: 4.7, count: 2453 },
  location: {
    name: 'London, UK',
    address: '123 Test Street',
    lat: 51.5,
    lng: -0.1,
  },
  categories: [{ id: 'attractions', name: 'Attractions', slug: 'attractions' }],
  highlights: ['Great views'],
  inclusions: ['Entry ticket'],
  exclusions: ['Food'],
  cancellationPolicy: 'Free cancellation up to 24 hours',
  reviews: [],
  itinerary: [],
  additionalInfo: [],
  languages: [],
};

const mockExperienceNoRating: Experience = {
  ...mockExperience,
  rating: undefined as any,
};

describe('BookingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'booking-123' } }),
    });
  });

  // ── Header rendering ──────────────────────────────────────────────────

  describe('header rendering', () => {
    it('renders experience price and per person label', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      expect(screen.getByText('\u00a335.00')).toBeInTheDocument();
      expect(screen.getByText('per person')).toBeInTheDocument();
    });

    it('renders rating when present', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      expect(screen.getByText('4.7')).toBeInTheDocument();
      expect(screen.getByText('(2453 reviews)')).toBeInTheDocument();
    });

    it('does not render rating when not present', () => {
      renderWithProvider(<BookingForm experience={mockExperienceNoRating} />);
      expect(screen.queryByText('reviews)')).not.toBeInTheDocument();
    });
  });

  // ── Step indicators ───────────────────────────────────────────────────

  describe('step indicators', () => {
    it('shows all four step labels', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      expect(screen.getByText('Date & Time')).toBeInTheDocument();
      expect(screen.getByText('Guests')).toBeInTheDocument();
      expect(screen.getByText('Details')).toBeInTheDocument();
      expect(screen.getByText('Review')).toBeInTheDocument();
    });

    it('shows step numbers 1-4', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      // Step 1 is active, so styled differently; steps 2-4 show numbers
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  // ── Step 1: Date selection ────────────────────────────────────────────

  describe('step 1 - date selection', () => {
    it('renders the AvailabilityCalendar on mount', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      expect(screen.getByTestId('availability-calendar')).toBeInTheDocument();
    });

    it('disables Continue when no date is selected', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      expect(screen.getByText('Continue')).toBeDisabled();
    });

    it('does not show Back button on first step', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      expect(screen.queryByText('Back')).not.toBeInTheDocument();
    });

    it('enables Continue after selecting a date and time slot', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);

      fireEvent.click(screen.getByTestId('select-date-btn'));
      expect(screen.getByText('Continue')).not.toBeDisabled();
    });
  });

  // ── Step 2: Guest selection ───────────────────────────────────────────

  describe('step 2 - guest selection', () => {
    function navigateToGuestsStep() {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      fireEvent.click(screen.getByTestId('select-date-btn'));
      fireEvent.click(screen.getByText('Continue'));
    }

    it('shows the GuestSelector after navigating from step 1', () => {
      navigateToGuestsStep();
      expect(screen.getByTestId('guest-selector')).toBeInTheDocument();
    });

    it('shows Back button on step 2', () => {
      navigateToGuestsStep();
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    it('navigates back to step 1 when Back is clicked', () => {
      navigateToGuestsStep();
      fireEvent.click(screen.getByText('Back'));
      expect(screen.getByTestId('availability-calendar')).toBeInTheDocument();
    });

    it('shows default guest counts (2 adults, 0 children, 0 infants)', () => {
      navigateToGuestsStep();
      expect(screen.getByText('adult: 2')).toBeInTheDocument();
      expect(screen.getByText('child: 0')).toBeInTheDocument();
      expect(screen.getByText('infant: 0')).toBeInTheDocument();
    });

    it('allows incrementing guest counts', () => {
      navigateToGuestsStep();
      fireEvent.click(screen.getByTestId('increment-child'));
      expect(screen.getByText('child: 1')).toBeInTheDocument();
    });

    it('allows decrementing guest counts', () => {
      navigateToGuestsStep();
      fireEvent.click(screen.getByTestId('decrement-adult'));
      expect(screen.getByText('adult: 1')).toBeInTheDocument();
    });

    it('enables Continue when at least one adult is present', () => {
      navigateToGuestsStep();
      // Default is 2 adults, so Continue should be enabled
      expect(screen.getByText('Continue')).not.toBeDisabled();
    });

    it('disables Continue when all adults are removed', () => {
      navigateToGuestsStep();
      // Remove both adults
      fireEvent.click(screen.getByTestId('decrement-adult'));
      fireEvent.click(screen.getByTestId('decrement-adult'));
      // Now 0 adults — but there are 0 children and 0 infants too = 0 total
      expect(screen.getByText('Continue')).toBeDisabled();
    });
  });

  // ── Step 3: Guest details ─────────────────────────────────────────────

  describe('step 3 - guest details', () => {
    function navigateToDetailsStep() {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      // Step 1: select date
      fireEvent.click(screen.getByTestId('select-date-btn'));
      fireEvent.click(screen.getByText('Continue'));
      // Step 2: guests (default 2 adults)
      fireEvent.click(screen.getByText('Continue'));
    }

    it('shows the GuestDetailsForm on step 3', () => {
      navigateToDetailsStep();
      expect(screen.getByTestId('guest-details-form')).toBeInTheDocument();
    });

    it('shows Back button on step 3', () => {
      navigateToDetailsStep();
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    it('navigates back to step 2 when Back is clicked', () => {
      navigateToDetailsStep();
      fireEvent.click(screen.getByText('Back'));
      expect(screen.getByTestId('guest-selector')).toBeInTheDocument();
    });

    it('disables Continue before guest details are filled', () => {
      navigateToDetailsStep();
      expect(screen.getByText('Continue')).toBeDisabled();
    });

    it('enables Continue after guest details are filled', () => {
      navigateToDetailsStep();
      fireEvent.click(screen.getByTestId('fill-guest-details'));
      expect(screen.getByText('Continue')).not.toBeDisabled();
    });
  });

  // ── Step 4: Review ────────────────────────────────────────────────────

  describe('step 4 - review', () => {
    function navigateToReviewStep() {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      // Step 1
      fireEvent.click(screen.getByTestId('select-date-btn'));
      fireEvent.click(screen.getByText('Continue'));
      // Step 2
      fireEvent.click(screen.getByText('Continue'));
      // Step 3
      fireEvent.click(screen.getByTestId('fill-guest-details'));
      fireEvent.click(screen.getByText('Continue'));
    }

    it('shows booking summary with experience title', () => {
      navigateToReviewStep();
      expect(screen.getByText('London Eye Experience')).toBeInTheDocument();
    });

    it('shows booking summary heading', () => {
      navigateToReviewStep();
      expect(screen.getByText('Booking Summary')).toBeInTheDocument();
    });

    it('shows formatted selected date', () => {
      navigateToReviewStep();
      // Date was set to 2026-03-15
      expect(screen.getByText(/15 March 2026/)).toBeInTheDocument();
    });

    it('shows selected time slot', () => {
      navigateToReviewStep();
      expect(screen.getByText('10:00 AM')).toBeInTheDocument();
    });

    it('shows guest count (2 adults)', () => {
      navigateToReviewStep();
      expect(screen.getAllByText(/2 guests/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/2 adults/).length).toBeGreaterThanOrEqual(1);
    });

    it('shows contact email and phone fields', () => {
      navigateToReviewStep();
      expect(screen.getByLabelText('Contact email *')).toBeInTheDocument();
      expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    });

    it('pre-fills customer email from lead guest', () => {
      navigateToReviewStep();
      const emailInput = screen.getByLabelText('Contact email *') as HTMLInputElement;
      expect(emailInput.value).toBe('lead@example.com');
    });

    it('shows total price breakdown', () => {
      navigateToReviewStep();
      // 3500 pence * 2 guests = 7000 pence = £70.00
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('shows terms text', () => {
      navigateToReviewStep();
      expect(
        screen.getByText(/By proceeding, you agree to our Terms of Service/)
      ).toBeInTheDocument();
    });

    it('shows "Proceed to Payment" button instead of Continue', () => {
      navigateToReviewStep();
      expect(screen.queryByText('Continue')).not.toBeInTheDocument();
      expect(screen.getByText('Proceed to Payment')).toBeInTheDocument();
    });

    it('shows Back button on review step', () => {
      navigateToReviewStep();
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    it('navigates back to details when Back is clicked', () => {
      navigateToReviewStep();
      fireEvent.click(screen.getByText('Back'));
      expect(screen.getByTestId('guest-details-form')).toBeInTheDocument();
    });

    it('disables submit when email is empty', () => {
      navigateToReviewStep();
      const emailInput = screen.getByLabelText('Contact email *') as HTMLInputElement;
      // Clear the email
      fireEvent.change(emailInput, { target: { value: '' } });
      expect(screen.getByText('Proceed to Payment')).toBeDisabled();
    });
  });

  // ── Booking submission ────────────────────────────────────────────────

  describe('booking submission', () => {
    function navigateToReviewAndSubmit() {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      fireEvent.click(screen.getByTestId('select-date-btn'));
      fireEvent.click(screen.getByText('Continue'));
      fireEvent.click(screen.getByText('Continue'));
      fireEvent.click(screen.getByTestId('fill-guest-details'));
      fireEvent.click(screen.getByText('Continue'));
    }

    it('calls the booking API on submit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'booking-123' } }),
      });

      navigateToReviewAndSubmit();

      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/booking',
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    it('calls all three API endpoints sequentially (create, availability, questions)', async () => {
      const callOrder: string[] = [];
      mockFetch.mockImplementation((url: string) => {
        callOrder.push(url);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { id: 'booking-123' } }),
        });
      });

      navigateToReviewAndSubmit();

      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      await waitFor(() => {
        expect(callOrder).toHaveLength(3);
        expect(callOrder[0]).toBe('/api/booking');
        expect(callOrder[1]).toContain('/api/booking/booking-123/availability');
        expect(callOrder[2]).toContain('/api/booking/booking-123/questions');
      });
    });

    it('redirects to checkout page on success when no callback', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'booking-123' } }),
      });

      navigateToReviewAndSubmit();

      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/checkout/booking-123');
      });
    });

    it('calls onBookingCreated callback instead of redirecting when provided', async () => {
      const onBookingCreated = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'booking-456' } }),
      });

      render(
        <SiteProvider site={DEFAULT_SITE_CONFIG}>
          <BookingForm experience={mockExperience} onBookingCreated={onBookingCreated} />
        </SiteProvider>
      );

      fireEvent.click(screen.getByTestId('select-date-btn'));
      fireEvent.click(screen.getByText('Continue'));
      fireEvent.click(screen.getByText('Continue'));
      fireEvent.click(screen.getByTestId('fill-guest-details'));
      fireEvent.click(screen.getByText('Continue'));

      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      await waitFor(() => {
        expect(onBookingCreated).toHaveBeenCalledWith('booking-456');
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    it('shows "Processing..." text while submitting', async () => {
      // Make fetch hang so we can see the loading state
      let resolveBooking: any;
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveBooking = resolve;
          })
      );

      navigateToReviewAndSubmit();

      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      expect(screen.getByText('Processing...')).toBeInTheDocument();

      // Clean up
      await act(async () => {
        resolveBooking({
          ok: true,
          json: () => Promise.resolve({ data: { id: 'booking-123' } }),
        });
      });
    });

    it('displays error message when booking creation fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Service unavailable' }),
      });

      navigateToReviewAndSubmit();

      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      await waitFor(() => {
        expect(screen.getByText('Service unavailable')).toBeInTheDocument();
      });
    });

    it('displays error when availability add fails', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create booking succeeds
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { id: 'booking-123' } }),
          });
        }
        // Add availability fails
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'No availability for selected date' }),
        });
      });

      navigateToReviewAndSubmit();

      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      await waitFor(() => {
        expect(screen.getByText('No availability for selected date')).toBeInTheDocument();
      });
    });

    it('displays generic error for non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('Unknown error string');

      navigateToReviewAndSubmit();

      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to create booking')).toBeInTheDocument();
      });
    });

    it('re-enables submit button after error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed' }),
      });

      navigateToReviewAndSubmit();

      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      await waitFor(() => {
        expect(screen.getByText('Proceed to Payment')).not.toBeDisabled();
      });
    });
  });

  // ── Step clicking (completed steps) ───────────────────────────────────

  describe('step clicking navigation', () => {
    it('allows clicking on completed steps to navigate back', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      // Go to step 2
      fireEvent.click(screen.getByTestId('select-date-btn'));
      fireEvent.click(screen.getByText('Continue'));

      // Click on "Date & Time" step indicator to go back
      fireEvent.click(screen.getByText('Date & Time'));
      expect(screen.getByTestId('availability-calendar')).toBeInTheDocument();
    });

    it('does not allow clicking on future steps', () => {
      renderWithProvider(<BookingForm experience={mockExperience} />);
      // On step 1, clicking "Review" should do nothing
      fireEvent.click(screen.getByText('Review'));
      // Should still be on step 1
      expect(screen.getByTestId('availability-calendar')).toBeInTheDocument();
    });
  });

  // ── Error clearing ────────────────────────────────────────────────────

  describe('error clearing', () => {
    it('clears error when navigating steps', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Some error' }),
      });

      renderWithProvider(<BookingForm experience={mockExperience} />);
      fireEvent.click(screen.getByTestId('select-date-btn'));
      fireEvent.click(screen.getByText('Continue'));
      fireEvent.click(screen.getByText('Continue'));
      fireEvent.click(screen.getByTestId('fill-guest-details'));
      fireEvent.click(screen.getByText('Continue'));

      // Trigger error
      await act(async () => {
        fireEvent.click(screen.getByText('Proceed to Payment'));
      });

      await waitFor(() => {
        expect(screen.getByText('Some error')).toBeInTheDocument();
      });

      // Navigate back — error should be cleared
      fireEvent.click(screen.getByText('Back'));
      expect(screen.queryByText('Some error')).not.toBeInTheDocument();
    });
  });
});
