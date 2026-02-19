import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMarketplaceExperiences } from './useMarketplaceExperiences';
import type { FilterState } from './useUrlFilterState';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const emptyFilterCounts = {
  categories: [],
  priceRanges: [],
  durations: [],
  ratings: [],
  cities: [],
};

const defaultFilters: FilterState = {
  categories: [],
  cities: [],
  priceMin: null,
  priceMax: null,
  duration: null,
  minRating: null,
  search: null,
};

function makeExperience(id: string) {
  return {
    id,
    title: `Experience ${id}`,
    slug: id,
    shortDescription: 'desc',
    imageUrl: '/img.jpg',
    price: { amount: 35, currency: 'GBP', formatted: '£35.00' },
    duration: { formatted: '2h', minutes: 120 },
    rating: { average: 4.5, count: 100 },
    location: { name: 'London' },
    categories: ['Tours'],
    cityId: 'city-1',
  };
}

function makeApiResponse(
  experiences: ReturnType<typeof makeExperience>[],
  overrides: Record<string, unknown> = {}
) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        experiences,
        page: 1,
        totalCount: experiences.length,
        filteredCount: experiences.length,
        hasMore: false,
        filterCounts: emptyFilterCounts,
        ...overrides,
      }),
  };
}

const defaultOptions = {
  initialExperiences: [makeExperience('init-1')],
  initialTotalCount: 1,
  initialFilteredCount: 1,
  initialHasMore: false,
  initialFilterCounts: emptyFilterCounts,
  filters: defaultFilters,
  filterKey: '',
  extraApiParams: { holibobSupplierId: 'sup-1' },
};

describe('useMarketplaceExperiences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial data without fetching on first render', () => {
    const { result } = renderHook(() =>
      useMarketplaceExperiences(defaultOptions)
    );

    expect(result.current.experiences).toHaveLength(1);
    expect(result.current.experiences[0]!.id).toBe('init-1');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.totalCount).toBe(1);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fetch when filterKey stays the same on rerender', () => {
    const { rerender } = renderHook(
      (props) => useMarketplaceExperiences(props),
      { initialProps: defaultOptions }
    );

    rerender(defaultOptions);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sets isLoading immediately when filterKey changes', () => {
    const { result, rerender } = renderHook(
      (props) => useMarketplaceExperiences(props),
      { initialProps: defaultOptions }
    );

    rerender({ ...defaultOptions, filterKey: 'categories=Tours' });

    expect(result.current.isLoading).toBe(true);
  });

  it('fetches and replaces experiences when filterKey changes', async () => {
    const fetched = [makeExperience('fetched-1'), makeExperience('fetched-2')];
    mockFetch.mockResolvedValue(makeApiResponse(fetched, { totalCount: 2 }));

    const { result, rerender } = renderHook(
      (props) => useMarketplaceExperiences(props),
      { initialProps: defaultOptions }
    );

    rerender({ ...defaultOptions, filterKey: 'categories=Tours' });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 5000 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.experiences).toHaveLength(2);
    expect(result.current.experiences[0]!.id).toBe('fetched-1');
  });

  it('builds query string with filters and extra params', async () => {
    mockFetch.mockResolvedValue(makeApiResponse([]));

    const { result, rerender } = renderHook(
      (props) => useMarketplaceExperiences(props),
      { initialProps: defaultOptions }
    );

    rerender({
      ...defaultOptions,
      filters: { ...defaultFilters, categories: ['Tours'], priceMin: '10' },
      filterKey: 'categories=Tours&priceMin=10',
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 5000 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('holibobSupplierId=sup-1');
    expect(url).toContain('categories=Tours');
    expect(url).toContain('priceMin=10');
    expect(url).toContain('page=1');
  });

  it('handles loadMore to append results', async () => {
    mockFetch.mockResolvedValue(
      makeApiResponse([makeExperience('page2-1')], {
        page: 2,
        totalCount: 2,
        hasMore: false,
      })
    );

    const { result } = renderHook(() =>
      useMarketplaceExperiences({
        ...defaultOptions,
        initialHasMore: true,
      })
    );

    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.experiences).toHaveLength(2);
    expect(result.current.experiences[1]!.id).toBe('page2-1');
  });

  it('does not loadMore when hasMore is false', () => {
    const { result } = renderHook(() =>
      useMarketplaceExperiences({ ...defaultOptions, initialHasMore: false })
    );

    act(() => {
      result.current.loadMore();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const { result, rerender } = renderHook(
      (props) => useMarketplaceExperiences(props),
      { initialProps: defaultOptions }
    );

    rerender({ ...defaultOptions, filterKey: 'error-trigger' });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.error).toContain('API error');
  });

  it('exposes filterCounts from API response', async () => {
    const filterCounts = {
      categories: [{ name: 'Tours', count: 5 }],
      priceRanges: [],
      durations: [],
      ratings: [],
      cities: [{ name: 'London', count: 3 }],
    };
    mockFetch.mockResolvedValue(
      makeApiResponse([makeExperience('e-1')], { filterCounts })
    );

    const { result, rerender } = renderHook(
      (props) => useMarketplaceExperiences(props),
      { initialProps: defaultOptions }
    );

    rerender({ ...defaultOptions, filterKey: 'new-key' });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.filterCounts.categories).toEqual([{ name: 'Tours', count: 5 }]);
  });
});
