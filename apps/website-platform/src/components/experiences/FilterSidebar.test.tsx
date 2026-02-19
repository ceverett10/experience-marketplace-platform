import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSidebar, MobileFilterButton, MobileFilterDrawer, type FilterOptions } from './FilterSidebar';

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

const defaultFilterOptions: FilterOptions = {
  categories: [
    { name: 'Tours', count: 10 },
    { name: 'Food', count: 5 },
  ],
  priceRanges: [
    { label: 'Under £25', min: 0, max: 25, count: 3 },
    { label: '£25 - £50', min: 25, max: 50, count: 8 },
    { label: '£50+', min: 50, max: null, count: 4 },
  ],
  durations: [
    { label: 'Under 1 hour', value: 'short', count: 5 },
    { label: '1-4 hours', value: 'half-day', count: 10 },
  ],
  ratings: [
    { label: '4+ stars', value: 4, count: 12 },
    { label: '3+ stars', value: 3, count: 15 },
  ],
  cities: [
    { name: 'London', count: 8 },
    { name: 'Bath', count: 4 },
  ],
};

function setSearchParams(params: Record<string, string>) {
  for (const key of [...mockSearchParams.keys()]) {
    mockSearchParams.delete(key);
  }
  for (const [key, value] of Object.entries(params)) {
    mockSearchParams.set(key, value);
  }
}

describe('FilterSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSearchParams({});
  });

  it('renders filter header', () => {
    render(
      <FilterSidebar
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={15}
      />
    );

    expect(screen.getByText('Filters')).toBeDefined();
    expect(screen.getByText(/Showing 15 of 20 experiences/)).toBeDefined();
  });

  it('renders category checkboxes', () => {
    render(
      <FilterSidebar
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={20}
      />
    );

    expect(screen.getByText('Tours')).toBeDefined();
    expect(screen.getByText('Food')).toBeDefined();
  });

  it('renders price range buttons', () => {
    render(
      <FilterSidebar
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={20}
      />
    );

    expect(screen.getByText('Under £25')).toBeDefined();
    expect(screen.getByText('£25 - £50')).toBeDefined();
  });

  it('shows Clear all button when filters are active', () => {
    setSearchParams({ categories: 'Tours' });

    render(
      <FilterSidebar
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={10}
      />
    );

    expect(screen.getByText('Clear all')).toBeDefined();
  });

  it('does not show Clear all button when no filters active', () => {
    render(
      <FilterSidebar
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={20}
      />
    );

    expect(screen.queryByText('Clear all')).toBeNull();
  });

  it('toggles category filter on checkbox click', () => {
    render(
      <FilterSidebar
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={20}
      />
    );

    const toursCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(toursCheckbox);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('categories=Tours'),
      expect.anything()
    );
  });

  it('clears all filters on Clear all click', () => {
    setSearchParams({ categories: 'Tours' });

    render(
      <FilterSidebar
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={10}
      />
    );

    fireEvent.click(screen.getByText('Clear all'));

    expect(mockPush).toHaveBeenCalledWith('/experiences', expect.anything());
  });

  it('toggles duration filter', () => {
    render(
      <FilterSidebar
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={20}
      />
    );

    // Duration section is collapsed by default, expand it
    fireEvent.click(screen.getByText('Duration'));

    // Now click a duration option
    fireEvent.click(screen.getByText('Under 1 hour'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('duration=short'),
      expect.anything()
    );
  });

  it('shows approximate filter indicator', () => {
    render(
      <FilterSidebar
        filterOptions={{ ...defaultFilterOptions, isApproximate: true }}
        totalCount={20}
        filteredCount={20}
      />
    );

    expect(screen.getByText(/approximate/i)).toBeDefined();
  });

  it('hides empty filter sections', () => {
    const emptyOptions: FilterOptions = {
      categories: [],
      priceRanges: [],
      durations: [],
      ratings: [],
      cities: [],
    };

    render(
      <FilterSidebar
        filterOptions={emptyOptions}
        totalCount={0}
        filteredCount={0}
      />
    );

    expect(screen.queryByText('Categories')).toBeNull();
    expect(screen.queryByText('Price Range')).toBeNull();
  });

  it('only shows cities when more than 1 city', () => {
    const singleCity: FilterOptions = {
      ...defaultFilterOptions,
      cities: [{ name: 'London', count: 20 }],
    };

    render(
      <FilterSidebar
        filterOptions={singleCity}
        totalCount={20}
        filteredCount={20}
      />
    );

    expect(screen.queryByText('Location')).toBeNull();
  });

  it('applies custom primary color', () => {
    setSearchParams({ categories: 'Tours' });

    const { container } = render(
      <FilterSidebar
        filterOptions={defaultFilterOptions}
        primaryColor="#ff0000"
        totalCount={20}
        filteredCount={10}
      />
    );

    const clearButton = screen.getByText('Clear all');
    // jsdom normalizes hex colors to rgb()
    expect(clearButton.style.color).toBe('rgb(255, 0, 0)');
  });
});

describe('MobileFilterButton', () => {
  it('renders with filter count badge', () => {
    render(<MobileFilterButton filterCount={3} onClick={vi.fn()} />);

    expect(screen.getByText('Filters')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('hides badge when count is 0', () => {
    render(<MobileFilterButton filterCount={0} onClick={vi.fn()} />);

    expect(screen.queryByText('0')).toBeNull();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<MobileFilterButton filterCount={0} onClick={onClick} />);

    fireEvent.click(screen.getByText('Filters'));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('MobileFilterDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MobileFilterDrawer
        isOpen={false}
        onClose={vi.fn()}
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={20}
      />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders filter content when open', () => {
    render(
      <MobileFilterDrawer
        isOpen={true}
        onClose={vi.fn()}
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={15}
      />
    );

    expect(screen.getByText(/Show 15 results/)).toBeDefined();
  });

  it('calls onClose when show results button clicked', () => {
    const onClose = vi.fn();
    render(
      <MobileFilterDrawer
        isOpen={true}
        onClose={onClose}
        filterOptions={defaultFilterOptions}
        totalCount={20}
        filteredCount={15}
      />
    );

    fireEvent.click(screen.getByText(/Show 15 results/));
    expect(onClose).toHaveBeenCalled();
  });
});
