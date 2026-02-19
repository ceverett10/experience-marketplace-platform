import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./FilterChip', () => ({
  FilterChip: ({ label, activeCount, isOpen, onToggle, children }: any) => (
    <div data-testid={`filter-chip-${label.toLowerCase()}`}>
      <button onClick={onToggle}>
        {label} {activeCount > 0 && `(${activeCount})`}
      </button>
      {isOpen && <div data-testid="dropdown">{children}</div>}
    </div>
  ),
}));
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

import { FilterBar } from './FilterBar';
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

const emptyFilterCounts: FilterCounts = {
  categories: [],
  cities: [],
  priceRanges: [],
  durations: [],
  ratings: [],
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

const defaultProps = {
  filters: emptyFilters,
  filterCounts: populatedFilterCounts,
  activeFilterCount: 0,
  onSetFilter: vi.fn(),
  onToggleFilter: vi.fn(),
  onClearFilters: vi.fn(),
  onOpenMobileFilters: vi.fn(),
};

describe('FilterBar', () => {
  it('renders mobile filter button with "Filters" text', () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('shows active filter count badge on mobile button when activeFilterCount > 0', () => {
    render(<FilterBar {...defaultProps} activeFilterCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('does not show active filter count badge on mobile button when activeFilterCount is 0', () => {
    render(<FilterBar {...defaultProps} activeFilterCount={0} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('calls onOpenMobileFilters when mobile filter button is clicked', () => {
    const onOpenMobileFilters = vi.fn();
    render(<FilterBar {...defaultProps} onOpenMobileFilters={onOpenMobileFilters} />);
    fireEvent.click(screen.getByText('Filters'));
    expect(onOpenMobileFilters).toHaveBeenCalledTimes(1);
  });

  it('renders Category chip when categories are available', () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByTestId('filter-chip-category')).toBeInTheDocument();
  });

  it('renders City chip when cities are available', () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByTestId('filter-chip-city')).toBeInTheDocument();
  });

  it('renders Price chip when price ranges are available', () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByTestId('filter-chip-price')).toBeInTheDocument();
  });

  it('renders Duration chip when durations are available', () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByTestId('filter-chip-duration')).toBeInTheDocument();
  });

  it('renders Rating chip when ratings are available', () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByTestId('filter-chip-rating')).toBeInTheDocument();
  });

  it('does not render Category chip when categories are empty', () => {
    render(
      <FilterBar {...defaultProps} filterCounts={{ ...populatedFilterCounts, categories: [] }} />
    );
    expect(screen.queryByTestId('filter-chip-category')).not.toBeInTheDocument();
  });

  it('does not render City chip when cities are empty', () => {
    render(<FilterBar {...defaultProps} filterCounts={{ ...populatedFilterCounts, cities: [] }} />);
    expect(screen.queryByTestId('filter-chip-city')).not.toBeInTheDocument();
  });

  it('does not render Price chip when price ranges are empty', () => {
    render(
      <FilterBar {...defaultProps} filterCounts={{ ...populatedFilterCounts, priceRanges: [] }} />
    );
    expect(screen.queryByTestId('filter-chip-price')).not.toBeInTheDocument();
  });

  it('does not render Duration chip when durations are empty', () => {
    render(
      <FilterBar {...defaultProps} filterCounts={{ ...populatedFilterCounts, durations: [] }} />
    );
    expect(screen.queryByTestId('filter-chip-duration')).not.toBeInTheDocument();
  });

  it('does not render Rating chip when ratings are empty', () => {
    render(
      <FilterBar {...defaultProps} filterCounts={{ ...populatedFilterCounts, ratings: [] }} />
    );
    expect(screen.queryByTestId('filter-chip-rating')).not.toBeInTheDocument();
  });

  it('shows "Clear all" button when activeFilterCount > 0', () => {
    render(<FilterBar {...defaultProps} activeFilterCount={2} />);
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('does not show "Clear all" button when activeFilterCount is 0', () => {
    render(<FilterBar {...defaultProps} activeFilterCount={0} />);
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
  });

  it('calls onClearFilters when "Clear all" button is clicked', () => {
    const onClearFilters = vi.fn();
    render(<FilterBar {...defaultProps} activeFilterCount={2} onClearFilters={onClearFilters} />);
    fireEvent.click(screen.getByText('Clear all'));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('shows category active count when categories are selected', () => {
    render(
      <FilterBar
        {...defaultProps}
        filters={{ ...emptyFilters, categories: ['Food Tours', 'Walking Tours'] }}
        activeFilterCount={1}
      />
    );
    expect(screen.getByText(/Category.*\(2\)/)).toBeInTheDocument();
  });

  it('shows no chips when all filter counts are empty', () => {
    render(<FilterBar {...defaultProps} filterCounts={emptyFilterCounts} />);
    expect(screen.queryByTestId('filter-chip-category')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-chip-city')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-chip-price')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-chip-duration')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-chip-rating')).not.toBeInTheDocument();
  });

  it('shows price active count when price filter is set', () => {
    render(
      <FilterBar
        {...defaultProps}
        filters={{ ...emptyFilters, priceMin: '0', priceMax: '25' }}
        activeFilterCount={1}
      />
    );
    expect(screen.getByText(/Price.*\(1\)/)).toBeInTheDocument();
  });
});
