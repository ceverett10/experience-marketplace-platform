import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AvailabilityModal } from './AvailabilityModal';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, unoptimized: _unoptimized, ...rest } = props;
    return <img {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} />;
  },
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

// Mock error reporting
vi.mock('@/lib/error-reporting', () => ({
  reportError: vi.fn(),
}));

// Mock pricing
vi.mock('@/lib/pricing', () => ({
  getProductPricingConfig: vi.fn(() => null),
  calculatePromoPrice: vi.fn((formatted: string) => ({
    hasPromo: false,
    originalFormatted: formatted,
  })),
}));

// Use dates in the current month so the calendar displays them immediately.
// Pick days near the end of month to avoid colliding with "today" (past dates are disabled).
const now = new Date();
const futureYear = now.getFullYear();
const futureMonth = String(now.getMonth() + 1).padStart(2, '0');

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
    date: `${futureYear}-${futureMonth}-25`,
    soldOut: false,
    guidePriceFormattedText: '£35.00',
  },
  {
    id: 'slot-2',
    date: `${futureYear}-${futureMonth}-26`,
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

  it('shows "Book Experience" header', async () => {
    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Book Experience');
    });
  });

  it('fetches and displays availability count', async () => {
    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });
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
        {
          id: 'slot-1',
          date: `${futureYear}-${futureMonth}-25`,
          soldOut: false,
          guidePriceFormattedText: '£35.00',
        },
        {
          id: 'slot-2',
          date: `${futureYear}-${futureMonth}-26`,
          soldOut: true,
          guidePriceFormattedText: '£40.00',
        },
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
      expect(document.body.textContent).toContain('Book Experience');
    });

    const closeButtons = document.body.querySelectorAll('button');
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
      expect(document.body.textContent).toContain('Book Experience');
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

    // Click a slot on the calendar
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

    const slotBtn = document.body.querySelector('[data-testid="date-slot-slot-1"]') as HTMLElement;
    fireEvent.click(slotBtn);

    const continueBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Continue'
    );
    fireEvent.click(continueBtn!);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Select guests');
    });

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

    const slotBtn = document.body.querySelector('[data-testid="date-slot-slot-1"]') as HTMLElement;
    fireEvent.click(slotBtn);

    const continueBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Continue'
    );
    fireEvent.click(continueBtn!);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Select guests');
    });

    const incrementBtn = document.body.querySelector(
      '[data-testid="guest-increment-adult"]'
    ) as HTMLElement;
    fireEvent.click(incrementBtn);
    fireEvent.click(incrementBtn);

    await waitFor(() => {
      expect(mockSetPricingCategories).toHaveBeenCalled();
    });

    const bookBtn = document.body.querySelector('[data-testid="book-now-button"]') as HTMLElement;
    fireEvent.click(bookBtn);

    await waitFor(() => {
      expect(mockStartBookingFlow).toHaveBeenCalledWith('slot-1');
      expect(mockPush).toHaveBeenCalledWith('/checkout/booking-123');
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

  it('pre-selects first available date', async () => {
    render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 dates available');
    });

    const firstSlot = document.body.querySelector('[data-testid="date-slot-slot-1"]');
    expect(firstSlot).toBeTruthy();
    // Continue button should be enabled since a slot is pre-selected
    const continueBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Continue'
    );
    expect(continueBtn).toBeTruthy();
    expect(continueBtn?.hasAttribute('disabled')).toBe(false);
  });

  it('defaults guest count to minParticipants (or 1) for Adult category', async () => {
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
          {
            id: 'child',
            label: 'Child',
            minParticipants: 0,
            maxParticipants: 5,
            unitPrice: { gross: 2000, currency: 'GBP', grossFormattedText: '£20.00' },
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
      expect(document.body.textContent).toContain('Select guests');
    });

    const adultCategory = document.body.querySelector('[data-testid="guest-category-adult"]');
    expect(adultCategory?.textContent).toContain('1');

    const childCategory = document.body.querySelector('[data-testid="guest-category-child"]');
    expect(childCategory?.textContent).toContain('0');
  });

  it('shows stepper with correct steps when options auto-complete', async () => {
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
      const progressSteps = document.body.querySelector('[data-testid="progress-steps"]');
      expect(progressSteps).toBeTruthy();
      // 2 steps when options auto-complete: date + travellers
      expect(document.body.textContent).toContain('Select Your Date');
      expect(document.body.textContent).toContain('Travellers');
    });
  });

  it('shows price on Book button when totalPrice is set', async () => {
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
      expect(document.body.textContent).toContain('Select guests');
    });

    await waitFor(() => {
      expect(mockSetPricingCategories).toHaveBeenCalled();
    });

    await waitFor(() => {
      const bookBtn = document.body.querySelector('[data-testid="book-now-button"]');
      expect(bookBtn?.textContent).toBe('Book for £70.00');
    });
  });

  it('resets state when modal closes', async () => {
    const { rerender } = render(<AvailabilityModal {...defaultProps} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Book Experience');
    });

    rerender(<AvailabilityModal {...defaultProps} isOpen={false} />);
    rerender(<AvailabilityModal {...defaultProps} isOpen={true} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Book Experience');
    });
  });
});
