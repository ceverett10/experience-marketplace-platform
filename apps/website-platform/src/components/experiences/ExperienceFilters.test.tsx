import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/experiences'),
}));

vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#6366f1' }),
}));

import { ExperienceFilters } from './ExperienceFilters';

describe('ExperienceFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    });
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue('/experiences');
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(new URLSearchParams());
  });

  describe('Sort options', () => {
    it('renders "Sort by" heading', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Sort by')).toBeInTheDocument();
    });

    it('renders all sort options', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Recommended')).toBeInTheDocument();
      expect(screen.getByText('Price: Low to High')).toBeInTheDocument();
      expect(screen.getByText('Price: High to Low')).toBeInTheDocument();
      expect(screen.getByText('Highest Rated')).toBeInTheDocument();
      expect(screen.getByText('Most Popular')).toBeInTheDocument();
    });

    it('defaults to "Recommended" when no sort is specified', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      const radios = screen.getAllByRole('radio');
      const recommendedRadio = radios.find(
        (r) => r.getAttribute('value') === 'recommended'
      ) as HTMLInputElement;
      expect(recommendedRadio?.checked).toBe(true);
    });

    it('checks the correct sort option based on currentFilters.sort', () => {
      render(<ExperienceFilters currentFilters={{ sort: 'price-low' }} />);
      const radios = screen.getAllByRole('radio');
      const priceLowRadio = radios.find(
        (r) => r.getAttribute('value') === 'price-low'
      ) as HTMLInputElement;
      expect(priceLowRadio?.checked).toBe(true);
    });

    it('calls router.push when a sort option is selected', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      const priceLowLabel = screen.getByText('Price: Low to High');
      fireEvent.click(priceLowLabel);
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('sort=price-low'));
    });
  });

  describe('Categories', () => {
    it('renders "Categories" heading', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });

    it('renders all category options', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Tours & Sightseeing')).toBeInTheDocument();
      expect(screen.getByText('Day Trips')).toBeInTheDocument();
      expect(screen.getByText('Attractions & Shows')).toBeInTheDocument();
      expect(screen.getByText('Food & Drink')).toBeInTheDocument();
      expect(screen.getByText('Adventure')).toBeInTheDocument();
      expect(screen.getByText('Culture & History')).toBeInTheDocument();
      expect(screen.getByText('Nature & Wildlife')).toBeInTheDocument();
      expect(screen.getByText('Water Activities')).toBeInTheDocument();
    });

    it('checks the matching category checkbox', () => {
      render(<ExperienceFilters currentFilters={{ category: 'tours' }} />);
      const checkboxes = screen.getAllByRole('checkbox');
      // The first category checkbox should be checked (tours)
      const toursLabel = screen.getByText('Tours & Sightseeing');
      const toursCheckbox = toursLabel
        .closest('label')
        ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(toursCheckbox?.checked).toBe(true);
    });

    it('calls router.push to set category when a checkbox is clicked', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      const toursLabel = screen.getByText('Tours & Sightseeing');
      fireEvent.click(toursLabel);
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('category=tours'));
    });

    it('calls router.push to clear category when the same category is clicked again', () => {
      render(<ExperienceFilters currentFilters={{ category: 'tours' }} />);
      const toursLabel = screen.getByText('Tours & Sightseeing');
      fireEvent.click(toursLabel);
      expect(mockPush).toHaveBeenCalled();
      const url = mockPush.mock.calls[0][0] as string;
      expect(url).not.toContain('category=');
    });
  });

  describe('Price Range', () => {
    it('renders "Price Range" heading', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Price Range')).toBeInTheDocument();
    });

    it('renders all price range options', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Under £25')).toBeInTheDocument();
      expect(screen.getByText('£25 - £50')).toBeInTheDocument();
      expect(screen.getByText('£50 - £100')).toBeInTheDocument();
      expect(screen.getByText('£100 - £200')).toBeInTheDocument();
      expect(screen.getByText('£200+')).toBeInTheDocument();
    });

    it('checks the matching price range checkbox', () => {
      render(<ExperienceFilters currentFilters={{ minPrice: '25', maxPrice: '50' }} />);
      const label = screen.getByText('£25 - £50');
      const checkbox = label
        .closest('label')
        ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox?.checked).toBe(true);
    });

    it('calls router.push with minPrice and maxPrice when price range is selected', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      const priceLabel = screen.getByText('£50 - £100');
      fireEvent.click(priceLabel);
      expect(mockPush).toHaveBeenCalled();
      const url = mockPush.mock.calls[0][0] as string;
      expect(url).toContain('minPrice=50');
      expect(url).toContain('maxPrice=100');
    });

    it('calls router.push to clear price when selected price range is clicked', () => {
      render(<ExperienceFilters currentFilters={{ minPrice: '50', maxPrice: '100' }} />);
      const priceLabel = screen.getByText('£50 - £100');
      fireEvent.click(priceLabel);
      expect(mockPush).toHaveBeenCalled();
      const url = mockPush.mock.calls[0][0] as string;
      expect(url).not.toContain('minPrice');
      expect(url).not.toContain('maxPrice');
    });
  });

  describe('Duration', () => {
    it('renders "Duration" heading', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Duration')).toBeInTheDocument();
    });

    it('renders all duration options', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Up to 3 hours')).toBeInTheDocument();
      expect(screen.getByText('3 to 6 hours')).toBeInTheDocument();
      expect(screen.getByText('6 to 12 hours')).toBeInTheDocument();
      expect(screen.getByText('Full day or longer')).toBeInTheDocument();
    });
  });

  describe('Rating', () => {
    it('renders "Rating" heading', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Rating')).toBeInTheDocument();
    });

    it('renders all rating options', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText(/4\.5\+ & up/)).toBeInTheDocument();
      expect(screen.getByText(/4\+ & up/)).toBeInTheDocument();
      expect(screen.getByText(/3\.5\+ & up/)).toBeInTheDocument();
      expect(screen.getByText(/3\+ & up/)).toBeInTheDocument();
    });
  });

  describe('Clear filters', () => {
    it('does not show "Clear all filters" when no filters are active', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.queryByText('Clear all filters')).not.toBeInTheDocument();
    });

    it('shows "Clear all filters" when category filter is active', () => {
      render(<ExperienceFilters currentFilters={{ category: 'tours' }} />);
      expect(screen.getByText('Clear all filters')).toBeInTheDocument();
    });

    it('shows "Clear all filters" when price filter is active', () => {
      render(<ExperienceFilters currentFilters={{ minPrice: '0', maxPrice: '25' }} />);
      expect(screen.getByText('Clear all filters')).toBeInTheDocument();
    });

    it('calls router.push to clear filters when "Clear all filters" is clicked', () => {
      render(<ExperienceFilters currentFilters={{ category: 'tours' }} />);
      fireEvent.click(screen.getByText('Clear all filters'));
      expect(mockPush).toHaveBeenCalledWith('/experiences');
    });
  });
});
