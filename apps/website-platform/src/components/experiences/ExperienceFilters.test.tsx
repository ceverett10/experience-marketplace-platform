import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExperienceFilters } from './ExperienceFilters';

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/experiences',
  useSearchParams: () => mockSearchParams,
}));

// Mock site-context
vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0d9488' }),
}));

describe('ExperienceFilters', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  describe('rendering', () => {
    it('renders sort options section', () => {
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

    it('renders categories section', () => {
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

    it('renders price range section', () => {
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

    it('renders duration section', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Duration')).toBeInTheDocument();
      expect(screen.getByText('Up to 3 hours')).toBeInTheDocument();
      expect(screen.getByText('3 to 6 hours')).toBeInTheDocument();
      expect(screen.getByText('6 to 12 hours')).toBeInTheDocument();
      expect(screen.getByText('Full day or longer')).toBeInTheDocument();
    });

    it('renders rating section', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.getByText('Rating')).toBeInTheDocument();
      expect(screen.getByText(/4\.5\+ & up/)).toBeInTheDocument();
      expect(screen.getByText(/4\+ & up/)).toBeInTheDocument();
      expect(screen.getByText(/3\.5\+ & up/)).toBeInTheDocument();
      expect(screen.getByText(/3\+ & up/)).toBeInTheDocument();
    });
  });

  describe('clear filters button', () => {
    it('does not show clear button when no filters are active', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      expect(screen.queryByText('Clear all filters')).not.toBeInTheDocument();
    });

    it('shows clear button when a category filter is active', () => {
      render(<ExperienceFilters currentFilters={{ category: 'tours' }} />);
      expect(screen.getByText('Clear all filters')).toBeInTheDocument();
    });

    it('shows clear button when price filters are active', () => {
      render(<ExperienceFilters currentFilters={{ minPrice: '0', maxPrice: '25' }} />);
      expect(screen.getByText('Clear all filters')).toBeInTheDocument();
    });

    it('does not show clear button when only sort is set', () => {
      render(<ExperienceFilters currentFilters={{ sort: 'price-low' }} />);
      expect(screen.queryByText('Clear all filters')).not.toBeInTheDocument();
    });

    it('navigates to pathname only when clear filters is clicked', () => {
      render(<ExperienceFilters currentFilters={{ category: 'tours' }} />);
      fireEvent.click(screen.getByText('Clear all filters'));
      expect(mockPush).toHaveBeenCalledWith('/experiences');
    });
  });

  describe('sort interactions', () => {
    it('selects "Recommended" by default when no sort filter is set', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      const radios = screen.getAllByRole('radio');
      const recommendedRadio = radios.find(
        (r) => (r as HTMLInputElement).value === 'recommended'
      ) as HTMLInputElement;
      expect(recommendedRadio.checked).toBe(true);
    });

    it('selects the current sort option', () => {
      render(<ExperienceFilters currentFilters={{ sort: 'price-low' }} />);
      const radios = screen.getAllByRole('radio');
      const priceLowRadio = radios.find(
        (r) => (r as HTMLInputElement).value === 'price-low'
      ) as HTMLInputElement;
      expect(priceLowRadio.checked).toBe(true);
    });

    it('navigates when a sort option is clicked', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      fireEvent.click(screen.getByText('Price: Low to High'));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('sort=price-low'));
    });
  });

  describe('category interactions', () => {
    it('checks a category checkbox when it matches currentFilters', () => {
      render(<ExperienceFilters currentFilters={{ category: 'tours' }} />);
      const checkboxes = screen.getAllByRole('checkbox');
      // The category checkboxes come after the sort radios
      // Find the "Tours & Sightseeing" checkbox by its checked state
      const checkedBoxes = checkboxes.filter((cb) => (cb as HTMLInputElement).checked);
      expect(checkedBoxes.length).toBeGreaterThanOrEqual(1);
    });

    it('navigates with category param when clicking an unchecked category', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      fireEvent.click(screen.getByText('Day Trips'));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('category=day-trips'));
    });

    it('removes category param when clicking a checked category (toggle off)', () => {
      render(<ExperienceFilters currentFilters={{ category: 'day-trips' }} />);
      fireEvent.click(screen.getByText('Day Trips'));
      // Should navigate without category param
      expect(mockPush).toHaveBeenCalled();
      const url = mockPush.mock.calls[0][0] as string;
      expect(url).not.toContain('category=');
    });
  });

  describe('price range interactions', () => {
    it('checks a price range when it matches currentFilters', () => {
      render(<ExperienceFilters currentFilters={{ minPrice: '25', maxPrice: '50' }} />);
      const checkboxes = screen.getAllByRole('checkbox');
      const checkedBoxes = checkboxes.filter((cb) => (cb as HTMLInputElement).checked);
      expect(checkedBoxes.length).toBeGreaterThanOrEqual(1);
    });

    it('navigates with price params when clicking a price range', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      fireEvent.click(screen.getByText('Under £25'));
      expect(mockPush).toHaveBeenCalled();
      const url = mockPush.mock.calls[0][0] as string;
      expect(url).toContain('minPrice=0');
      expect(url).toContain('maxPrice=25');
    });

    it('navigates with only minPrice for the 200+ range', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      fireEvent.click(screen.getByText('£200+'));
      expect(mockPush).toHaveBeenCalled();
      const url = mockPush.mock.calls[0][0] as string;
      expect(url).toContain('minPrice=200');
      expect(url).not.toContain('maxPrice=');
    });

    it('removes price params when clicking a selected price range (toggle off)', () => {
      render(<ExperienceFilters currentFilters={{ minPrice: '0', maxPrice: '25' }} />);
      fireEvent.click(screen.getByText('Under £25'));
      expect(mockPush).toHaveBeenCalled();
      const url = mockPush.mock.calls[0][0] as string;
      expect(url).not.toContain('minPrice=');
      expect(url).not.toContain('maxPrice=');
    });

    it('selects 200+ range when minPrice=200 and no maxPrice', () => {
      render(<ExperienceFilters currentFilters={{ minPrice: '200' }} />);
      const checkboxes = screen.getAllByRole('checkbox');
      const checkedBoxes = checkboxes.filter((cb) => (cb as HTMLInputElement).checked);
      expect(checkedBoxes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('brand color styling', () => {
    it('applies brand color to the clear all filters button', () => {
      render(<ExperienceFilters currentFilters={{ category: 'tours' }} />);
      const clearButton = screen.getByText('Clear all filters');
      expect(clearButton).toHaveStyle({ color: '#0d9488' });
    });

    it('applies accent color to radio inputs', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      const radios = screen.getAllByRole('radio');
      expect(radios[0]).toHaveStyle({ accentColor: '#0d9488' });
    });

    it('applies accent color to checkbox inputs', () => {
      render(<ExperienceFilters currentFilters={{}} />);
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toHaveStyle({ accentColor: '#0d9488' });
    });
  });
});
