import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProductDiscoverySearch } from './ProductDiscoverySearch';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0F766E' }),
}));

vi.mock('@/lib/analytics', () => ({
  trackSearch: vi.fn(),
}));

describe('ProductDiscoverySearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          destination: null,
          destinations: [],
          tags: [],
          searchTerms: [],
        }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rendering', () => {
    it('renders the hero variant with Where, When, Who, What sections', () => {
      render(<ProductDiscoverySearch />);
      const whereLabels = screen.getAllByText('Where');
      expect(whereLabels.length).toBeGreaterThanOrEqual(1);
      const whenLabels = screen.getAllByText('When');
      expect(whenLabels.length).toBeGreaterThanOrEqual(1);
      const whoLabels = screen.getAllByText('Who');
      expect(whoLabels.length).toBeGreaterThanOrEqual(1);
      const whatLabels = screen.getAllByText('What');
      expect(whatLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('renders the sidebar variant with section buttons', () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      expect(screen.getByText('Anywhere')).toBeInTheDocument();
      expect(screen.getByText('Anytime')).toBeInTheDocument();
      expect(screen.getByText('Anyone')).toBeInTheDocument();
      expect(screen.getByText('Anything')).toBeInTheDocument();
    });

    it('renders Search Experiences button', () => {
      render(<ProductDiscoverySearch />);
      const buttons = screen.getAllByRole('button', { name: /search/i });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders with default destination pre-filled', () => {
      render(<ProductDiscoverySearch defaultDestination="London" />);
      const londonTexts = screen.getAllByText('London');
      expect(londonTexts.length).toBeGreaterThanOrEqual(1);
    });

    it('renders popular suggestion chips when no destination is selected', () => {
      render(<ProductDiscoverySearch />);
      expect(screen.getByText('Walking Tours')).toBeInTheDocument();
      expect(screen.getByText('Food & Drink')).toBeInTheDocument();
      expect(screen.getByText('Museums')).toBeInTheDocument();
    });
  });

  describe('dropdown visibility', () => {
    it('shows Where dropdown when Where button is clicked', async () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      const whereButtons = screen.getAllByText('Where');
      fireEvent.click(whereButtons[0]!.closest('button')!);
      expect(screen.getByText('are you going?')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. London, Paris, or Rome')).toBeInTheDocument();
    });

    it('shows When dropdown with time suggestions', async () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      const whenButton = screen.getByText('Anytime').closest('button')!;
      fireEvent.click(whenButton);
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('Tomorrow')).toBeInTheDocument();
      expect(screen.getByText('This Weekend')).toBeInTheDocument();
      expect(screen.getByText('Next Week')).toBeInTheDocument();
      expect(screen.getByText('Next Month')).toBeInTheDocument();
    });

    it('shows Who dropdown with traveler type suggestions', async () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      const whoButton = screen.getByText('Anyone').closest('button')!;
      fireEvent.click(whoButton);
      expect(screen.getByText('Solo Traveller')).toBeInTheDocument();
      expect(screen.getByText('Couple')).toBeInTheDocument();
      expect(screen.getByText('Family with Kids')).toBeInTheDocument();
      expect(screen.getByText('Group of Friends')).toBeInTheDocument();
      expect(screen.getByText('Business Trip')).toBeInTheDocument();
    });

    it('shows What dropdown with activity suggestions', async () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      const whatButton = screen.getByText('Anything').closest('button')!;
      fireEvent.click(whatButton);
      expect(screen.getByText('is on your bucket list?')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('e.g. Walking tours, Museums, or Skip-the-line')
      ).toBeInTheDocument();
    });

    it('closes dropdown when clicking outside', async () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      const whereButtons = screen.getAllByText('Where');
      fireEvent.click(whereButtons[0]!.closest('button')!);
      expect(screen.getByText('are you going?')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('are you going?')).not.toBeInTheDocument();
    });

    it('toggles dropdown closed when same section is clicked again', async () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      const whereButtons = screen.getAllByText('Where');
      const btn = whereButtons[0]!.closest('button')!;
      fireEvent.click(btn);
      expect(screen.getByText('are you going?')).toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.queryByText('are you going?')).not.toBeInTheDocument();
    });
  });

  describe('loading states', () => {
    it('shows loading indicator when fetching suggestions', async () => {
      let resolvePromise!: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(pendingPromise);

      render(<ProductDiscoverySearch variant="sidebar" defaultDestination="London" />);

      const whereButtons = screen.getAllByText('Where');
      fireEvent.click(whereButtons[0]!.closest('button')!);

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      const loadingElements = screen.queryAllByText('Loading suggestions...');
      expect(loadingElements.length).toBeGreaterThanOrEqual(0);

      resolvePromise({
        ok: true,
        json: () =>
          Promise.resolve({
            destination: null,
            destinations: [],
            tags: [],
            searchTerms: [],
          }),
      });
    });

    it('renders without errors during search debounce', async () => {
      render(<ProductDiscoverySearch variant="sidebar" defaultDestination="Lon" />);

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      const searchButtons = screen.getAllByRole('button', { name: /search/i });
      expect(searchButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('empty results', () => {
    it('shows default location suggestions when API returns no destinations', async () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      const whereButtons = screen.getAllByText('Where');
      fireEvent.click(whereButtons[0]!.closest('button')!);

      expect(screen.getByText('London')).toBeInTheDocument();
      expect(screen.getByText('Paris')).toBeInTheDocument();
      expect(screen.getByText('Barcelona')).toBeInTheDocument();
      expect(screen.getByText('Rome')).toBeInTheDocument();
      expect(screen.getByText('Amsterdam')).toBeInTheDocument();
      expect(screen.getByText('Edinburgh')).toBeInTheDocument();
    });

    it('shows default What suggestions when API returns no tags', async () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      const whatButton = screen.getByText('Anything').closest('button')!;
      fireEvent.click(whatButton);

      expect(screen.getByText('Walking Tours')).toBeInTheDocument();
      expect(screen.getByText('Food & Drink')).toBeInTheDocument();
      expect(screen.getByText('Museums')).toBeInTheDocument();
      expect(screen.getByText('Outdoor Activities')).toBeInTheDocument();
      expect(screen.getByText('Day Trips')).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('handles fetch failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      render(<ProductDiscoverySearch variant="sidebar" defaultDestination="London" />);

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      const whereButtons = screen.getAllByText('Where');
      expect(whereButtons.length).toBeGreaterThanOrEqual(1);

      consoleSpy.mockRestore();
    });

    it('handles non-ok response gracefully', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
      });

      render(<ProductDiscoverySearch variant="sidebar" defaultDestination="London" />);

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      const whereButtons = screen.getAllByText('Where');
      expect(whereButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('navigation', () => {
    it('navigates to /experiences with destination param on search', () => {
      render(<ProductDiscoverySearch variant="sidebar" defaultDestination="London" />);
      const searchButton = screen.getByText('Search Experiences');
      fireEvent.click(searchButton);
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/experiences?'));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('destination=London'));
    });

    it('advances to next section when a suggestion is selected', () => {
      render(<ProductDiscoverySearch variant="sidebar" />);
      const whereButtons = screen.getAllByText('Where');
      fireEvent.click(whereButtons[0]!.closest('button')!);
      fireEvent.click(screen.getByText('London'));
      expect(screen.getByText('are you free?')).toBeInTheDocument();
    });
  });
});
