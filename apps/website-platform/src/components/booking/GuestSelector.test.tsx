import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuestSelector, GuestDetailsForm, type GuestCount } from './GuestSelector';
import { SiteProvider } from '@/lib/site-context';
import { DEFAULT_SITE_CONFIG } from '@/lib/tenant';

// Test wrapper with SiteProvider
const renderWithProvider = (ui: React.ReactNode) => {
  return render(<SiteProvider site={DEFAULT_SITE_CONFIG}>{ui}</SiteProvider>);
};

describe('GuestSelector', () => {
  const mockOnGuestCountChange = vi.fn();

  const defaultGuestCounts: GuestCount[] = [
    { typeId: 'adult', count: 2 },
    { typeId: 'child', count: 0 },
    { typeId: 'infant', count: 0 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders guest type options', () => {
    renderWithProvider(
      <GuestSelector guestCounts={defaultGuestCounts} onGuestCountChange={mockOnGuestCountChange} />
    );

    expect(screen.getByText('Adults')).toBeInTheDocument();
    expect(screen.getByText('Children')).toBeInTheDocument();
    expect(screen.getByText('Infants')).toBeInTheDocument();
  });

  it('shows correct guest counts', () => {
    renderWithProvider(
      <GuestSelector
        guestCounts={[
          { typeId: 'adult', count: 3 },
          { typeId: 'child', count: 2 },
          { typeId: 'infant', count: 1 },
        ]}
        onGuestCountChange={mockOnGuestCountChange}
      />
    );

    // Look for the count displays
    const countDisplays = screen.getAllByText(/^\d$/);
    expect(countDisplays).toHaveLength(3);
  });

  it('shows total guests count', () => {
    renderWithProvider(
      <GuestSelector
        guestCounts={[
          { typeId: 'adult', count: 2 },
          { typeId: 'child', count: 1 },
          { typeId: 'infant', count: 0 },
        ]}
        onGuestCountChange={mockOnGuestCountChange}
      />
    );

    expect(screen.getByText('3 guests')).toBeInTheDocument();
  });

  it('shows singular "guest" for single guest', () => {
    renderWithProvider(
      <GuestSelector
        guestCounts={[
          { typeId: 'adult', count: 1 },
          { typeId: 'child', count: 0 },
          { typeId: 'infant', count: 0 },
        ]}
        onGuestCountChange={mockOnGuestCountChange}
      />
    );

    expect(screen.getByText('1 guest')).toBeInTheDocument();
  });

  it('calls onGuestCountChange when incrementing', () => {
    renderWithProvider(
      <GuestSelector guestCounts={defaultGuestCounts} onGuestCountChange={mockOnGuestCountChange} />
    );

    const increaseButtons = screen.getAllByLabelText(/Increase.*count/i);
    fireEvent.click(increaseButtons[0]!); // Increase adults

    expect(mockOnGuestCountChange).toHaveBeenCalledWith('adult', 3);
  });

  it('calls onGuestCountChange when decrementing', () => {
    renderWithProvider(
      <GuestSelector guestCounts={defaultGuestCounts} onGuestCountChange={mockOnGuestCountChange} />
    );

    const decreaseButtons = screen.getAllByLabelText(/Decrease.*count/i);
    fireEvent.click(decreaseButtons[0]!); // Decrease adults

    expect(mockOnGuestCountChange).toHaveBeenCalledWith('adult', 1);
  });

  it('disables decrement button when count is 0', () => {
    renderWithProvider(
      <GuestSelector
        guestCounts={[
          { typeId: 'adult', count: 2 },
          { typeId: 'child', count: 0 },
          { typeId: 'infant', count: 0 },
        ]}
        onGuestCountChange={mockOnGuestCountChange}
      />
    );

    const decreaseChildButton = screen.getByLabelText('Decrease Children count');
    expect(decreaseChildButton).toBeDisabled();
  });

  it('disables increment button when max guests reached', () => {
    renderWithProvider(
      <GuestSelector
        guestCounts={[
          { typeId: 'adult', count: 20 },
          { typeId: 'child', count: 0 },
          { typeId: 'infant', count: 0 },
        ]}
        onGuestCountChange={mockOnGuestCountChange}
        maxGuests={20}
      />
    );

    const increaseButtons = screen.getAllByLabelText(/Increase.*count/i);
    increaseButtons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it('shows max indicator when at maximum', () => {
    renderWithProvider(
      <GuestSelector
        guestCounts={[
          { typeId: 'adult', count: 20 },
          { typeId: 'child', count: 0 },
          { typeId: 'infant', count: 0 },
        ]}
        onGuestCountChange={mockOnGuestCountChange}
        maxGuests={20}
      />
    );

    expect(screen.getByText('(max)')).toBeInTheDocument();
  });

  it('shows warning when no adults selected', () => {
    renderWithProvider(
      <GuestSelector
        guestCounts={[
          { typeId: 'adult', count: 0 },
          { typeId: 'child', count: 2 },
          { typeId: 'infant', count: 0 },
        ]}
        onGuestCountChange={mockOnGuestCountChange}
      />
    );

    expect(screen.getByText(/At least one adult is required/i)).toBeInTheDocument();
  });

  it('supports custom guest types', () => {
    const customGuestTypes = [
      { id: 'senior', name: 'Seniors', description: 'Ages 65+', price: 2500, currency: 'GBP' },
      {
        id: 'student',
        name: 'Students',
        description: 'With valid ID',
        price: 2000,
        currency: 'GBP',
      },
    ];

    renderWithProvider(
      <GuestSelector
        guestTypes={customGuestTypes}
        guestCounts={[
          { typeId: 'senior', count: 1 },
          { typeId: 'student', count: 2 },
        ]}
        onGuestCountChange={mockOnGuestCountChange}
      />
    );

    expect(screen.getByText('Seniors')).toBeInTheDocument();
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('Ages 65+')).toBeInTheDocument();
  });
});

describe('GuestSelector - Mobile touch targets', () => {
  const mockOnGuestCountChange = vi.fn();

  const defaultGuestCounts: GuestCount[] = [
    { typeId: 'adult', count: 2 },
    { typeId: 'child', count: 0 },
    { typeId: 'infant', count: 0 },
  ];

  it('increment/decrement buttons use h-8 w-8 sizing', () => {
    renderWithProvider(
      <GuestSelector guestCounts={defaultGuestCounts} onGuestCountChange={mockOnGuestCountChange} />
    );

    const increaseButtons = screen.getAllByLabelText(/Increase.*count/i);
    const decreaseButtons = screen.getAllByLabelText(/Decrease.*count/i);

    // Verify current button size classes (will be updated to h-11 w-11 in Phase 1)
    for (const button of [...increaseButtons, ...decreaseButtons]) {
      expect(button.className).toMatch(/h-8/);
      expect(button.className).toMatch(/w-8/);
    }
  });
});

describe('GuestDetailsForm', () => {
  const mockOnGuestDetailsChange = vi.fn();

  const defaultGuestCounts: GuestCount[] = [
    { typeId: 'adult', count: 2 },
    { typeId: 'child', count: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form for each guest', () => {
    renderWithProvider(
      <GuestDetailsForm
        guestCounts={defaultGuestCounts}
        guestDetails={[]}
        onGuestDetailsChange={mockOnGuestDetailsChange}
      />
    );

    // Should have 3 guest forms (2 adults + 1 child)
    expect(screen.getByText('Adults 1')).toBeInTheDocument();
    expect(screen.getByText('Adults 2')).toBeInTheDocument();
    expect(screen.getByText('Children 1')).toBeInTheDocument();
  });

  it('marks first adult as lead guest', () => {
    renderWithProvider(
      <GuestDetailsForm
        guestCounts={defaultGuestCounts}
        guestDetails={[]}
        onGuestDetailsChange={mockOnGuestDetailsChange}
      />
    );

    expect(screen.getByText('Lead guest')).toBeInTheDocument();
  });

  it('requires email for lead guest', () => {
    renderWithProvider(
      <GuestDetailsForm
        guestCounts={[{ typeId: 'adult', count: 1 }]}
        guestDetails={[]}
        onGuestDetailsChange={mockOnGuestDetailsChange}
      />
    );

    // Lead guest should have required email field
    const emailLabel = screen.getByText('Email *');
    expect(emailLabel).toBeInTheDocument();
  });

  it('calls onGuestDetailsChange when input changes', () => {
    renderWithProvider(
      <GuestDetailsForm
        guestCounts={[{ typeId: 'adult', count: 1 }]}
        guestDetails={[{ guestTypeId: 'adult', firstName: '', lastName: '' }]}
        onGuestDetailsChange={mockOnGuestDetailsChange}
      />
    );

    const firstNameInput = screen.getByLabelText('First name *');
    fireEvent.change(firstNameInput, { target: { value: 'John' } });

    expect(mockOnGuestDetailsChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ firstName: 'John' })])
    );
  });

  it('shows name fields for all guests', () => {
    renderWithProvider(
      <GuestDetailsForm
        guestCounts={[{ typeId: 'adult', count: 2 }]}
        guestDetails={[]}
        onGuestDetailsChange={mockOnGuestDetailsChange}
      />
    );

    const firstNameInputs = screen.getAllByLabelText('First name *');
    const lastNameInputs = screen.getAllByLabelText('Last name *');

    expect(firstNameInputs).toHaveLength(2);
    expect(lastNameInputs).toHaveLength(2);
  });

  it('returns null when no guests', () => {
    const { container } = renderWithProvider(
      <GuestDetailsForm
        guestCounts={[]}
        guestDetails={[]}
        onGuestDetailsChange={mockOnGuestDetailsChange}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
