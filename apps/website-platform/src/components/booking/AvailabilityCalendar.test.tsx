import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { SiteProvider } from '@/lib/site-context';
import { DEFAULT_SITE_CONFIG } from '@/lib/tenant';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper with SiteProvider
const renderWithProvider = (ui: React.ReactNode) => {
  return render(<SiteProvider site={DEFAULT_SITE_CONFIG}>{ui}</SiteProvider>);
};

describe('AvailabilityCalendar', () => {
  const mockOnDateSelect = vi.fn();
  const mockOnTimeSlotSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            options: [
              {
                id: 'slot-1',
                name: 'Morning Tour',
                date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
                startTime: '09:00',
                price: 3500,
                currency: 'GBP',
                remainingCapacity: 10,
              },
              {
                id: 'slot-2',
                name: 'Afternoon Tour',
                date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
                startTime: '14:00',
                price: 3500,
                currency: 'GBP',
                remainingCapacity: 5,
              },
            ],
          },
        }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders calendar with month header', async () => {
    renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={null}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
      />
    );

    // Should show current month
    const currentMonth = new Date().toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
    expect(screen.getByText(currentMonth)).toBeInTheDocument();
  });

  it('renders weekday headers', async () => {
    renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={null}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
      />
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Sun')).toBeInTheDocument();
    });

    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  it('fetches availability on mount', async () => {
    renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={null}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
        adults={2}
        children={0}
      />
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/availability'));
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('productId=test-product'));
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('adults=2'));
    });
  });

  it('shows loading state while fetching', async () => {
    // Make fetch hang
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { container } = renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={null}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
      />
    );

    // Should show loading spinner
    await waitFor(() => {
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  it('shows error message on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={null}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to load availability/i)).toBeInTheDocument();
    });
  });

  it('allows navigation to next month', async () => {
    renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={null}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
      />
    );

    // Wait for initial load to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      expect(screen.queryByText('Sun')).toBeInTheDocument();
    });

    // Get current month text
    const currentMonthText = new Date().toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
    expect(screen.getByText(currentMonthText)).toBeInTheDocument();

    const nextButton = screen.getByLabelText('Next month');
    fireEvent.click(nextButton);

    await waitFor(() => {
      // Calculate next month correctly (avoid date overflow issues)
      const today = new Date();
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const expectedMonthText = nextMonth.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });
      expect(screen.getByText(expectedMonthText)).toBeInTheDocument();
    });
  });

  it('calls onDateSelect when date is clicked', async () => {
    // Use a date that's in the future (7 days from now)
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const futureDateStr = futureDate.toISOString().split('T')[0] ?? '';

    // Override mock for this test to include the future date
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            options: [
              {
                id: 'slot-1',
                name: 'Morning Tour',
                date: futureDateStr,
                startTime: '09:00',
                price: 3500,
                currency: 'GBP',
                remainingCapacity: 10,
              },
            ],
          },
        }),
    });

    renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={null}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
      />
    );

    // Wait for loading to complete and calendar to render
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      expect(screen.queryByText('Sun')).toBeInTheDocument();
    });

    // If the future date is in a different month, navigate to it
    const currentMonth = new Date().getMonth();
    const futureMonth = futureDate.getMonth();
    if (futureMonth !== currentMonth) {
      const nextButton = screen.getByLabelText('Next month');
      fireEvent.click(nextButton);
      // Wait for calendar to update
      await waitFor(() => {
        const expectedMonthText = futureDate.toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric',
        });
        expect(screen.getByText(expectedMonthText)).toBeInTheDocument();
      });
    }

    // Find and click the date button
    const dateButton = await screen.findByLabelText(
      new RegExp(
        `${futureDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.*Available`,
        'i'
      )
    );
    fireEvent.click(dateButton);

    expect(mockOnDateSelect).toHaveBeenCalledWith(futureDateStr);
    expect(mockOnTimeSlotSelect).toHaveBeenCalledWith(null);
  });

  it('shows time slots when date is selected', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0] ?? '';

    renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={tomorrowStr}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Available times')).toBeInTheDocument();
      expect(screen.getByText('09:00')).toBeInTheDocument();
      expect(screen.getByText('14:00')).toBeInTheDocument();
    });
  });

  it('calls onTimeSlotSelect when time slot is clicked', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0] ?? '';

    renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={tomorrowStr}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('09:00')).toBeInTheDocument();
    });

    const timeSlotButton = screen.getByText('09:00').closest('button');
    if (timeSlotButton) {
      fireEvent.click(timeSlotButton);
    }

    expect(mockOnTimeSlotSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'slot-1',
        time: '09:00',
        price: 3500,
        currency: 'GBP',
      })
    );
  });

  it('shows remaining capacity warning for limited slots', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0] ?? '';

    renderWithProvider(
      <AvailabilityCalendar
        productId="test-product"
        selectedDate={tomorrowStr}
        selectedTimeSlot={null}
        onDateSelect={mockOnDateSelect}
        onTimeSlotSelect={mockOnTimeSlotSelect}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('5 left')).toBeInTheDocument();
    });
  });
});
