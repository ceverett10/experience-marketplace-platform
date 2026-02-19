import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultsHeader } from './ResultsHeader';
import type { FilterState } from '@/hooks/useUrlFilterState';

const emptyFilters: FilterState = {
  categories: [],
  cities: [],
  priceMin: null,
  priceMax: null,
  duration: null,
  minRating: null,
  search: null,
};

const defaultProps = {
  filteredCount: 42,
  totalCount: 100,
  isLoading: false,
  filters: emptyFilters,
  onRemoveFilter: vi.fn(),
  onClearFilters: vi.fn(),
};

describe('ResultsHeader', () => {
  it('shows the count with plural "experiences"', () => {
    render(<ResultsHeader {...defaultProps} filteredCount={42} />);
    expect(screen.getByText(/42 experiences/)).toBeInTheDocument();
  });

  it('shows singular "experience" for count of 1', () => {
    render(<ResultsHeader {...defaultProps} filteredCount={1} />);
    expect(screen.getByText(/1 experience(?!s)/)).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoading is true', () => {
    const { container } = render(<ResultsHeader {...defaultProps} isLoading={true} />);
    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });

  it('does not show loading skeleton when isLoading is false', () => {
    const { container } = render(<ResultsHeader {...defaultProps} isLoading={false} />);
    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).not.toBeInTheDocument();
  });

  it('shows "of {totalCount}" when filtered and counts differ', () => {
    render(
      <ResultsHeader
        {...defaultProps}
        filteredCount={20}
        totalCount={100}
        filters={{ ...emptyFilters, categories: ['Food Tours'] }}
      />
    );
    expect(screen.getByText('of 100')).toBeInTheDocument();
  });

  it('does not show "of {totalCount}" when counts are equal', () => {
    render(
      <ResultsHeader
        {...defaultProps}
        filteredCount={100}
        totalCount={100}
        filters={{ ...emptyFilters, categories: ['Food Tours'] }}
      />
    );
    expect(screen.queryByText('of 100')).not.toBeInTheDocument();
  });

  it('does not show "of {totalCount}" when there are no active filters', () => {
    render(
      <ResultsHeader {...defaultProps} filteredCount={80} totalCount={100} filters={emptyFilters} />
    );
    expect(screen.queryByText('of 100')).not.toBeInTheDocument();
  });

  it('shows single category name when 1 category selected', () => {
    render(
      <ResultsHeader {...defaultProps} filters={{ ...emptyFilters, categories: ['Food Tours'] }} />
    );
    expect(screen.getByText('Food Tours')).toBeInTheDocument();
  });

  it('shows "2 categories" when multiple categories selected', () => {
    render(
      <ResultsHeader
        {...defaultProps}
        filters={{ ...emptyFilters, categories: ['Food Tours', 'Walking Tours'] }}
      />
    );
    expect(screen.getByText('2 categories')).toBeInTheDocument();
  });

  it('shows single city name when 1 city selected', () => {
    render(<ResultsHeader {...defaultProps} filters={{ ...emptyFilters, cities: ['London'] }} />);
    expect(screen.getByText('London')).toBeInTheDocument();
  });

  it('shows "3 cities" when multiple cities selected', () => {
    render(
      <ResultsHeader
        {...defaultProps}
        filters={{ ...emptyFilters, cities: ['London', 'Paris', 'Rome'] }}
      />
    );
    expect(screen.getByText('3 cities')).toBeInTheDocument();
  });

  it('shows price range display with both min and max', () => {
    render(
      <ResultsHeader
        {...defaultProps}
        filters={{ ...emptyFilters, priceMin: '10', priceMax: '50' }}
      />
    );
    // Source code uses template: `${min}\u2013${max}` which is an en-dash
    expect(screen.getByText(/£10.*£50/)).toBeInTheDocument();
  });

  it('shows price range display with only min (open-ended)', () => {
    render(<ResultsHeader {...defaultProps} filters={{ ...emptyFilters, priceMin: '50' }} />);
    expect(screen.getByText(/£50\+/)).toBeInTheDocument();
  });

  it('shows duration label from DURATION_LABELS', () => {
    render(<ResultsHeader {...defaultProps} filters={{ ...emptyFilters, duration: 'half-day' }} />);
    // DURATION_LABELS['half-day'] = '2\u20134 hours'
    expect(screen.getByText(/2.*4 hours/)).toBeInTheDocument();
  });

  it('shows raw duration value when not in DURATION_LABELS', () => {
    render(<ResultsHeader {...defaultProps} filters={{ ...emptyFilters, duration: 'custom' }} />);
    expect(screen.getByText('custom')).toBeInTheDocument();
  });

  it('shows rating display with plus suffix', () => {
    render(<ResultsHeader {...defaultProps} filters={{ ...emptyFilters, minRating: '4.5' }} />);
    expect(screen.getByText('4.5+')).toBeInTheDocument();
  });

  it('shows search display in quotes', () => {
    render(<ResultsHeader {...defaultProps} filters={{ ...emptyFilters, search: 'london' }} />);
    expect(screen.getByText('"london"')).toBeInTheDocument();
  });

  it('calls onRemoveFilter with the filter key when a pill is clicked', () => {
    const onRemoveFilter = vi.fn();
    render(
      <ResultsHeader
        {...defaultProps}
        onRemoveFilter={onRemoveFilter}
        filters={{ ...emptyFilters, duration: 'short' }}
      />
    );
    // Click the pill button that contains the duration display
    const pill = screen.getByRole('button', { name: /Under 2 hours/ });
    fireEvent.click(pill);
    expect(onRemoveFilter).toHaveBeenCalledWith('duration');
  });

  it('calls onRemoveFilter for both priceMin and priceMax when price pill is clicked', () => {
    const onRemoveFilter = vi.fn();
    render(
      <ResultsHeader
        {...defaultProps}
        onRemoveFilter={onRemoveFilter}
        filters={{ ...emptyFilters, priceMin: '10', priceMax: '50' }}
      />
    );
    const pill = screen.getByRole('button', { name: /£10.*£50/ });
    fireEvent.click(pill);
    expect(onRemoveFilter).toHaveBeenCalledWith('priceMin');
    expect(onRemoveFilter).toHaveBeenCalledWith('priceMax');
  });

  it('calls onRemoveFilter with "categories" when category pill is clicked', () => {
    const onRemoveFilter = vi.fn();
    render(
      <ResultsHeader
        {...defaultProps}
        onRemoveFilter={onRemoveFilter}
        filters={{ ...emptyFilters, categories: ['Food Tours'] }}
      />
    );
    const pill = screen.getByRole('button', { name: /Food Tours/ });
    fireEvent.click(pill);
    expect(onRemoveFilter).toHaveBeenCalledWith('categories');
  });

  it('calls onRemoveFilter with "minRating" when rating pill is clicked', () => {
    const onRemoveFilter = vi.fn();
    render(
      <ResultsHeader
        {...defaultProps}
        onRemoveFilter={onRemoveFilter}
        filters={{ ...emptyFilters, minRating: '4' }}
      />
    );
    const pill = screen.getByRole('button', { name: /4\+/ });
    fireEvent.click(pill);
    expect(onRemoveFilter).toHaveBeenCalledWith('minRating');
  });

  it('calls onRemoveFilter with "search" when search pill is clicked', () => {
    const onRemoveFilter = vi.fn();
    render(
      <ResultsHeader
        {...defaultProps}
        onRemoveFilter={onRemoveFilter}
        filters={{ ...emptyFilters, search: 'london' }}
      />
    );
    const pill = screen.getByRole('button', { name: /"london"/ });
    fireEvent.click(pill);
    expect(onRemoveFilter).toHaveBeenCalledWith('search');
  });

  it('shows "Clear all" when there are more than 1 active pills', () => {
    render(
      <ResultsHeader
        {...defaultProps}
        filters={{
          ...emptyFilters,
          categories: ['Food Tours'],
          duration: 'short',
        }}
      />
    );
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('does not show "Clear all" when there is only 1 active pill', () => {
    render(
      <ResultsHeader {...defaultProps} filters={{ ...emptyFilters, categories: ['Food Tours'] }} />
    );
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
  });

  it('does not show "Clear all" when there are no active pills', () => {
    render(<ResultsHeader {...defaultProps} filters={emptyFilters} />);
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
  });

  it('calls onClearFilters when "Clear all" is clicked', () => {
    const onClearFilters = vi.fn();
    render(
      <ResultsHeader
        {...defaultProps}
        onClearFilters={onClearFilters}
        filters={{
          ...emptyFilters,
          categories: ['Food Tours'],
          minRating: '4',
        }}
      />
    );
    fireEvent.click(screen.getByText('Clear all'));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('renders multiple active filter pills simultaneously', () => {
    render(
      <ResultsHeader
        {...defaultProps}
        filters={{
          ...emptyFilters,
          categories: ['Food Tours'],
          cities: ['London'],
          priceMin: '10',
          priceMax: '50',
          duration: 'short',
          minRating: '4',
          search: 'test',
        }}
      />
    );
    expect(screen.getByText('Food Tours')).toBeInTheDocument();
    expect(screen.getByText('London')).toBeInTheDocument();
    expect(screen.getByText(/£10.*£50/)).toBeInTheDocument();
    expect(screen.getByText('Under 2 hours')).toBeInTheDocument();
    expect(screen.getByText('4+')).toBeInTheDocument();
    expect(screen.getByText('"test"')).toBeInTheDocument();
  });
});
