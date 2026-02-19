import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./FilterDropdown', () => ({
  CheckboxFilter: ({ options }: any) => (
    <div data-testid="checkbox-filter">{options.length} options</div>
  ),
  ButtonGroupFilter: ({ options }: any) => (
    <div data-testid="button-group">{options.length} options</div>
  ),
  PriceRangeFilter: ({ ranges }: any) => (
    <div data-testid="price-range">{ranges.length} ranges</div>
  ),
}));

import { FilterOverlay } from './FilterOverlay';
import type { FilterState } from '@/hooks/useUrlFilterState';
import type { FilterCounts } from '@/hooks/useMarketplaceExperiences';

const emptyFilters: FilterState = {
  categories: [],
  cities: [],
  priceMin: null,
  priceMax: null,
  duration: null,
  minRating: null,
  search: null,
};

const populatedFilterCounts: FilterCounts = {
  categories: [
    { name: 'Food Tours', count: 12 },
    { name: 'Walking Tours', count: 8 },
  ],
  cities: [
    { name: 'London', count: 15 },
    { name: 'Paris', count: 10 },
  ],
  priceRanges: [
    { label: 'GBP0-GBP25', min: 0, max: 25, count: 5 },
    { label: 'GBP25-GBP50', min: 25, max: 50, count: 10 },
  ],
  durations: [
    { label: 'Under 2 hours', value: 'short', count: 7 },
    { label: '2-4 hours', value: 'half-day', count: 5 },
  ],
  ratings: [
    { label: '4+', value: 4, count: 20 },
    { label: '4.5+', value: 4.5, count: 10 },
  ],
};

const emptyFilterCounts: FilterCounts = {
  categories: [],
  cities: [],
  priceRanges: [],
  durations: [],
  ratings: [],
};

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  filters: emptyFilters,
  filterCounts: populatedFilterCounts,
  filteredCount: 42,
  onSetFilter: vi.fn(),
  onToggleFilter: vi.fn(),
  onClearFilters: vi.fn(),
};

describe('FilterOverlay', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders "Filters" heading when open', () => {
    render(<FilterOverlay {...defaultProps} isOpen={true} />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('shows "Close filters" button (aria-label)', () => {
    render(<FilterOverlay {...defaultProps} isOpen={true} />);
    expect(screen.getByLabelText('Close filters')).toBeInTheDocument();
  });

  it('shows "Clear all" button', () => {
    render(<FilterOverlay {...defaultProps} isOpen={true} />);
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('shows "Show X experiences" button with filteredCount', () => {
    render(<FilterOverlay {...defaultProps} filteredCount={42} />);
    expect(screen.getByText('Show 42 experiences')).toBeInTheDocument();
  });

  it('shows singular "experience" for count of 1', () => {
    render(<FilterOverlay {...defaultProps} filteredCount={1} />);
    expect(screen.getByText('Show 1 experience')).toBeInTheDocument();
  });

  it('shows plural "experiences" for count of 0', () => {
    render(<FilterOverlay {...defaultProps} filteredCount={0} />);
    expect(screen.getByText('Show 0 experiences')).toBeInTheDocument();
  });

  it('renders Category section when categories are available', () => {
    render(<FilterOverlay {...defaultProps} />);
    expect(screen.getByText('Category')).toBeInTheDocument();
  });

  it('renders City section when cities are available', () => {
    render(<FilterOverlay {...defaultProps} />);
    expect(screen.getByText('City')).toBeInTheDocument();
  });

  it('renders Price section when price ranges are available', () => {
    render(<FilterOverlay {...defaultProps} />);
    expect(screen.getByText('Price')).toBeInTheDocument();
  });

  it('renders Duration section when durations are available', () => {
    render(<FilterOverlay {...defaultProps} />);
    expect(screen.getByText('Duration')).toBeInTheDocument();
  });

  it('renders Rating section when ratings are available', () => {
    render(<FilterOverlay {...defaultProps} />);
    expect(screen.getByText('Rating')).toBeInTheDocument();
  });

  it('does not render Category section when categories are empty', () => {
    render(
      <FilterOverlay
        {...defaultProps}
        filterCounts={{ ...populatedFilterCounts, categories: [] }}
      />
    );
    expect(screen.queryByText('Category')).not.toBeInTheDocument();
  });

  it('does not render City section when cities are empty', () => {
    render(
      <FilterOverlay {...defaultProps} filterCounts={{ ...populatedFilterCounts, cities: [] }} />
    );
    expect(screen.queryByText('City')).not.toBeInTheDocument();
  });

  it('does not render any filter sections when all counts are empty', () => {
    render(<FilterOverlay {...defaultProps} filterCounts={emptyFilterCounts} />);
    expect(screen.queryByText('Category')).not.toBeInTheDocument();
    expect(screen.queryByText('City')).not.toBeInTheDocument();
    expect(screen.queryByText('Price')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
    expect(screen.queryByText('Rating')).not.toBeInTheDocument();
  });

  it('calls onClose on Escape key when open', () => {
    const onClose = vi.fn();
    render(<FilterOverlay {...defaultProps} isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape key when closed', () => {
    const onClose = vi.fn();
    render(<FilterOverlay {...defaultProps} isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn();
    render(<FilterOverlay {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close filters'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClearFilters when "Clear all" button is clicked', () => {
    const onClearFilters = vi.fn();
    render(<FilterOverlay {...defaultProps} onClearFilters={onClearFilters} />);
    fireEvent.click(screen.getByText('Clear all'));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when "Show results" button is clicked', () => {
    const onClose = vi.fn();
    render(<FilterOverlay {...defaultProps} onClose={onClose} filteredCount={42} />);
    fireEvent.click(screen.getByText('Show 42 experiences'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sets body overflow to hidden when open', () => {
    render(<FilterOverlay {...defaultProps} isOpen={true} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('resets body overflow when closed', () => {
    const { rerender } = render(<FilterOverlay {...defaultProps} isOpen={true} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<FilterOverlay {...defaultProps} isOpen={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('resets body overflow on unmount', () => {
    const { unmount } = render(<FilterOverlay {...defaultProps} isOpen={true} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('has role="dialog" on the overlay panel', () => {
    render(<FilterOverlay {...defaultProps} isOpen={true} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('has aria-modal="true" on the dialog', () => {
    render(<FilterOverlay {...defaultProps} isOpen={true} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('has aria-label on the dialog', () => {
    render(<FilterOverlay {...defaultProps} isOpen={true} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Filter experiences');
  });
});
