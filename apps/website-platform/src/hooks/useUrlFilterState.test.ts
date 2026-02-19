import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

// Mock window.history.replaceState and window.location
const mockReplaceState = vi.fn();
Object.defineProperty(window, 'history', {
  value: { replaceState: mockReplaceState },
  writable: true,
});

import { useUrlFilterState } from './useUrlFilterState';

function setSearchParams(params: Record<string, string>) {
  // Clear existing params
  for (const key of [...mockSearchParams.keys()]) {
    mockSearchParams.delete(key);
  }
  for (const [key, value] of Object.entries(params)) {
    mockSearchParams.set(key, value);
  }
}

describe('useUrlFilterState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSearchParams({});
    Object.defineProperty(window, 'location', {
      value: { search: '', pathname: '/experiences' },
      writable: true,
    });
  });

  it('initializes with empty filters when no URL params', () => {
    const { result } = renderHook(() => useUrlFilterState());

    expect(result.current.filters).toEqual({
      categories: [],
      cities: [],
      priceMin: null,
      priceMax: null,
      duration: null,
      minRating: null,
      search: null,
    });
    expect(result.current.activeFilterCount).toBe(0);
    expect(result.current.filterKey).toBe('');
  });

  it('parses filters from URL search params', () => {
    setSearchParams({
      categories: 'Tours,Food',
      cities: 'London',
      priceMin: '10',
      priceMax: '100',
      duration: 'short',
      minRating: '4.0',
      search: 'walking',
    });

    const { result } = renderHook(() => useUrlFilterState());

    expect(result.current.filters.categories).toEqual(['Tours', 'Food']);
    expect(result.current.filters.cities).toEqual(['London']);
    expect(result.current.filters.priceMin).toBe('10');
    expect(result.current.filters.priceMax).toBe('100');
    expect(result.current.filters.duration).toBe('short');
    expect(result.current.filters.minRating).toBe('4.0');
    expect(result.current.filters.search).toBe('walking');
  });

  it('counts active filters correctly', () => {
    setSearchParams({
      categories: 'Tours',
      priceMin: '10',
      priceMax: '50',
      search: 'tour',
    });

    const { result } = renderHook(() => useUrlFilterState());

    // categories (1) + price range (1, combined) + search (1) = 3
    expect(result.current.activeFilterCount).toBe(3);
  });

  it('counts price min and max as one filter', () => {
    setSearchParams({ priceMin: '10' });
    const { result: r1 } = renderHook(() => useUrlFilterState());
    expect(r1.current.activeFilterCount).toBe(1);

    setSearchParams({ priceMax: '100' });
    const { result: r2 } = renderHook(() => useUrlFilterState());
    expect(r2.current.activeFilterCount).toBe(1);

    setSearchParams({ priceMin: '10', priceMax: '100' });
    const { result: r3 } = renderHook(() => useUrlFilterState());
    expect(r3.current.activeFilterCount).toBe(1);
  });

  it('setFilter updates a single-value filter', () => {
    const { result } = renderHook(() => useUrlFilterState());

    act(() => {
      result.current.setFilter('duration', 'half-day');
    });

    expect(result.current.filters.duration).toBe('half-day');
  });

  it('setFilter updates a multi-value filter with array', () => {
    const { result } = renderHook(() => useUrlFilterState());

    act(() => {
      result.current.setFilter('categories', ['Tours', 'Food']);
    });

    expect(result.current.filters.categories).toEqual(['Tours', 'Food']);
  });

  it('setFilter clears a filter with null', () => {
    setSearchParams({ duration: 'short' });
    const { result } = renderHook(() => useUrlFilterState());

    act(() => {
      result.current.setFilter('duration', null);
    });

    expect(result.current.filters.duration).toBeNull();
  });

  it('setFilter converts empty string to null', () => {
    const { result } = renderHook(() => useUrlFilterState());

    act(() => {
      result.current.setFilter('search', '');
    });

    expect(result.current.filters.search).toBeNull();
  });

  it('toggleFilter adds a value to multi-value filter', () => {
    const { result } = renderHook(() => useUrlFilterState());

    act(() => {
      result.current.toggleFilter('categories', 'Tours');
    });

    expect(result.current.filters.categories).toEqual(['Tours']);
  });

  it('toggleFilter removes existing value from multi-value filter', () => {
    setSearchParams({ categories: 'Tours,Food' });
    const { result } = renderHook(() => useUrlFilterState());

    act(() => {
      result.current.toggleFilter('categories', 'Tours');
    });

    expect(result.current.filters.categories).toEqual(['Food']);
  });

  it('clearFilters resets all filters', () => {
    setSearchParams({
      categories: 'Tours',
      priceMin: '10',
      duration: 'short',
    });
    const { result } = renderHook(() => useUrlFilterState());

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filters).toEqual({
      categories: [],
      cities: [],
      priceMin: null,
      priceMax: null,
      duration: null,
      minRating: null,
      search: null,
    });
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('removeFilter clears a specific filter', () => {
    setSearchParams({ duration: 'short', search: 'walking' });
    const { result } = renderHook(() => useUrlFilterState());

    act(() => {
      result.current.removeFilter('duration');
    });

    expect(result.current.filters.duration).toBeNull();
    expect(result.current.filters.search).toBe('walking');
  });

  it('generates a stable filterKey from filters', () => {
    setSearchParams({ categories: 'Tours', priceMin: '10' });
    const { result } = renderHook(() => useUrlFilterState());

    expect(result.current.filterKey).toContain('categories=Tours');
    expect(result.current.filterKey).toContain('priceMin=10');
  });

  it('syncs filter changes to URL via replaceState', () => {
    const { result } = renderHook(() => useUrlFilterState());

    act(() => {
      result.current.setFilter('search', 'london tours');
    });

    expect(mockReplaceState).toHaveBeenCalled();
  });

  it('handles empty categories string gracefully', () => {
    setSearchParams({ categories: '' });
    const { result } = renderHook(() => useUrlFilterState());

    expect(result.current.filters.categories).toEqual([]);
  });
});
