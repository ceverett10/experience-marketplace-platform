import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AvailabilityModal } from './AvailabilityModal';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock booking-flow
const mockFetchAvailability = vi.fn();
const mockGetAvailabilityDetails = vi.fn();
const mockSetAvailabilityOptions = vi.fn();
const mockSetPricingCategories = vi.fn();
const mockStartBookingFlow = vi.fn();

vi.mock('@/lib/booking-flow', () => ({
  fetchAvailability: (...args: any[]) => mockFetchAvailability(...args),
  getAvailabilityDetails: (...args: any[]) => mockGetAvailabilityDetails(...args),
  setAvailabilityOptions: (...args: any[]) => mockSetAvailabilityOptions(...args),
  setPricingCategories: (...args: any[]) => mockSetPricingCategories(...args),
  startBookingFlow: (...args: any[]) => mockStartBookingFlow(...args),
  formatDate: (d: string) => `Formatted: ${d}`,
}));

// Mock pricing
vi.mock('@/lib/pricing', () => ({
  getProductPricingConfig: vi.fn(() => null),
  calculatePromoPrice: vi.fn((formatted: string) => ({
    hasPromo: false,
    originalFormatted: formatted,
  })),
}));

// Mock SessionTimer
vi.mock('@/components/booking/SessionTimer', () => ({
  SessionTimer: ({ variant }: any) => <div data-testid="session-timer">{variant}</div>,
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  productId: 'prod-1',
  productName: 'London Walking Tour',
  primaryColor: '#0d9488',
};

const mockSlots = [
  {
    id: 'slot-1',
    date: '2025-06-15',
    soldOut: false,
    guidePriceFormattedText: '£35.00',
  },
  {
    id: 'slot-2',
    date: '2025-06-16',
    soldOut: false,
    guidePriceFormattedText: '£40.00',
  },
];

describe('AvailabilityModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAvailability.mockResolvedValue({
      sessionId: 'sess-1',
      nodes: mockSlots,
    });
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<AvailabilityModal {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders modal with product name when open', async () => {
    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('London Walking Tour');
    });
  });

  it('shows "Select a date" header on dates step', async () => {
    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Select a date');
    });
  });

  it('fetches and displays availability slots', async () => {
    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });

    expect(document.body.textContent).toContain('Formatted: 2025-06-15');
    expect(document.body.textContent).toContain('from £35.00');
  });

  it('shows no availability message when no slots', async () => {
    mockFetchAvailability.mockResolvedValue({ sessionId: 'sess-1', nodes: [] });

    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('No availability found');
    });
  });

  it('filters out sold out slots', async () => {
    mockFetchAvailability.mockResolvedValue({
      sessionId: 'sess-1',
      nodes: [
        { id: 'slot-1', date: '2025-06-15', soldOut: false, guidePriceFormattedText: '£35.00' },
        { id: 'slot-2', date: '2025-06-16', soldOut: true, guidePriceFormattedText: '£40.00' },
      ],
    });

    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('1 date available');
    });
  });

  it('shows error on fetch failure', async () => {
    mockFetchAvailability.mockRejectedValue(new Error('Network error'));

    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Network error');
    });
  });

  it('calls onClose when close button is clicked', async () => {
    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Select a date');
    });

    const closeButtons = document.body.querySelectorAll('button');
    // Find close button (the one in the header with the X icon)
    const closeBtn = Array.from(closeButtons).find(
      (btn) => !btn.textContent || btn.querySelector('svg')
    );
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it('calls onClose when backdrop is clicked', async () => {
    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Select a date');
    });

    const backdrop = document.body.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('advances to options step when slot is selected and Continue clicked', async () => {
    mockGetAvailabilityDetails.mockResolvedValue({
      id: 'slot-1',
      optionList: {
        isComplete: false,
        nodes: [
          {
            id: 'time-opt',
            label: 'Time',
            availableOptions: [
              { value: '09:00', label: '9:00 AM' },
              { value: '14:00', label: '2:00 PM' },
            ],
          },
        ],
      },
    });

    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });

    // Click a slot
    const slotBtn = document.body.querySelector('[data-testid="date-slot-slot-1"]') as HTMLElement;
    fireEvent.click(slotBtn);

    // Click Continue
    const continueBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Continue'
    );
    fireEvent.click(continueBtn!);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Choose options');
    });
  });

  it('skips options step when options are already complete', async () => {
    mockGetAvailabilityDetails.mockResolvedValue({
      id: 'slot-1',
      optionList: { isComplete: true, nodes: [] },
      pricingCategoryList: {
        nodes: [
          {
            id: 'adult',
            label: 'Adult',
            minParticipants: 1,
            maxParticipants: 10,
            unitPrice: { gross: 3500, currency: 'GBP', grossFormattedText: '£35.00' },
          },
        ],
      },
    });

    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });

    // Click a slot
    const slotBtn = document.body.querySelector('[data-testid="date-slot-slot-1"]') as HTMLElement;
    fireEvent.click(slotBtn);

    // Click Continue
    const continueBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Continue'
    );
    fireEvent.click(continueBtn!);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Select guests');
    });

    // Should show pricing categories
    expect(document.body.textContent).toContain('Adult');
    expect(document.body.textContent).toContain('£35.00 per person');
  });

  it('shows Book Now button on pricing step', async () => {
    mockGetAvailabilityDetails.mockResolvedValue({
      id: 'slot-1',
      optionList: { isComplete: true, nodes: [] },
      pricingCategoryList: {
        nodes: [
          {
            id: 'adult',
            label: 'Adult',
            minParticipants: 1,
            maxParticipants: 10,
            unitPrice: { gross: 3500, currency: 'GBP', grossFormattedText: '£35.00' },
          },
        ],
      },
    });

    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });

    const slotBtn = document.body.querySelector('[data-testid="date-slot-slot-1"]') as HTMLElement;
    fireEvent.click(slotBtn);

    const continueBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Continue'
    );
    fireEvent.click(continueBtn!);

    await waitFor(() => {
      const bookBtn = document.body.querySelector('[data-testid="book-now-button"]');
      expect(bookBtn).toBeTruthy();
      expect(bookBtn?.textContent).toBe('Book Now');
    });
  });

  it('navigates to checkout on successful booking', async () => {
    mockGetAvailabilityDetails.mockResolvedValue({
      id: 'slot-1',
      optionList: { isComplete: true, nodes: [] },
      pricingCategoryList: {
        nodes: [
          {
            id: 'adult',
            label: 'Adult',
            minParticipants: 0,
            maxParticipants: 10,
            unitPrice: { gross: 3500, currency: 'GBP', grossFormattedText: '£35.00' },
          },
        ],
      },
    });
    mockSetPricingCategories.mockResolvedValue({
      isValid: true,
      totalPrice: { gross: 7000, currency: 'GBP', grossFormattedText: '£70.00' },
      pricingCategoryList: {
        nodes: [
          {
            id: 'adult',
            label: 'Adult',
            minParticipants: 0,
            maxParticipants: 10,
            unitPrice: { gross: 3500, currency: 'GBP', grossFormattedText: '£35.00' },
          },
        ],
      },
    });
    mockStartBookingFlow.mockResolvedValue('booking-123');

    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });

    // Select slot
    const slotBtn = document.body.querySelector('[data-testid="date-slot-slot-1"]') as HTMLElement;
    fireEvent.click(slotBtn);

    // Continue to pricing
    const continueBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Continue'
    );
    fireEvent.click(continueBtn!);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Select guests');
    });

    // Increment adults
    const incrementBtn = document.body.querySelector(
      '[data-testid="guest-increment-adult"]'
    ) as HTMLElement;
    fireEvent.click(incrementBtn);
    fireEvent.click(incrementBtn);

    // Wait for pricing update
    await waitFor(() => {
      expect(mockSetPricingCategories).toHaveBeenCalled();
    });

    // Click Book Now
    const bookBtn = document.body.querySelector(
      '[data-testid="book-now-button"]'
    ) as HTMLElement;
    fireEvent.click(bookBtn);

    await waitFor(() => {
      expect(mockStartBookingFlow).toHaveBeenCalledWith('slot-1');
      expect(mockPush).toHaveBeenCalledWith('/checkout/booking-123');
    });
  });

  it('shows session timer after moving past dates step', async () => {
    mockGetAvailabilityDetails.mockResolvedValue({
      id: 'slot-1',
      optionList: { isComplete: true, nodes: [] },
      pricingCategoryList: { nodes: [] },
    });

    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });

    const slotBtn = document.body.querySelector('[data-testid="date-slot-slot-1"]') as HTMLElement;
    fireEvent.click(slotBtn);

    const continueBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Continue'
    );
    fireEvent.click(continueBtn!);

    await waitFor(() => {
      expect(document.body.querySelector('[data-testid="session-timer"]')).toBeTruthy();
    });
  });

  it('shows Back button on non-date steps', async () => {
    mockGetAvailabilityDetails.mockResolvedValue({
      id: 'slot-1',
      optionList: { isComplete: true, nodes: [] },
      pricingCategoryList: { nodes: [] },
    });

    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });

    const slotBtn = document.body.querySelector('[data-testid="date-slot-slot-1"]') as HTMLElement;
    fireEvent.click(slotBtn);

    const continueBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Continue'
    );
    fireEvent.click(continueBtn!);

    await waitFor(() => {
      const backBtn = Array.from(document.body.querySelectorAll('button')).find(
        (btn) => btn.textContent === 'Back'
      );
      expect(backBtn).toBeTruthy();
    });
  });

  it('resets state when modal closes', async () => {
    const { rerender } = render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });

    // Close modal
    rerender(<AvailabilityModal {...defaultProps} isOpen={false} />);

    // Re-open
    rerender(<AvailabilityModal {...defaultProps} isOpen={true} />);

    await waitFor(() => {
      // Should be back on dates step
      expect(document.body.textContent).toContain('Select a date');
    });
  });
});
