'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

/** Filter keys managed by this hook */
const FILTER_KEYS = [
  'categories',
  'cities',
  'priceMin',
  'priceMax',
  'duration',
  'minRating',
  'search',
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

export interface FilterState {
  categories: string[];
  cities: string[];
  priceMin: string | null;
  priceMax: string | null;
  duration: string | null;
  minRating: string | null;
  search: string | null;
}

function parseFiltersFromParams(params: URLSearchParams): FilterState {
  return {
    categories: params.get('categories')?.split(',').filter(Boolean) ?? [],
    cities: params.get('cities')?.split(',').filter(Boolean) ?? [],
    priceMin: params.get('priceMin'),
    priceMax: params.get('priceMax'),
    duration: params.get('duration'),
    minRating: params.get('minRating'),
    search: params.get('search'),
  };
}

function filtersToKey(f: FilterState): string {
  const parts: string[] = [];
  if (f.categories.length > 0) parts.push(`categories=${f.categories.join(',')}`);
  if (f.cities.length > 0) parts.push(`cities=${f.cities.join(',')}`);
  if (f.priceMin) parts.push(`priceMin=${f.priceMin}`);
  if (f.priceMax) parts.push(`priceMax=${f.priceMax}`);
  if (f.duration) parts.push(`duration=${f.duration}`);
  if (f.minRating) parts.push(`minRating=${f.minRating}`);
  if (f.search) parts.push(`search=${f.search}`);
  return parts.join('&');
}

function countActiveFilters(f: FilterState): number {
  let count = 0;
  if (f.categories.length > 0) count++;
  if (f.cities.length > 0) count++;
  if (f.priceMin || f.priceMax) count++;
  if (f.duration) count++;
  if (f.minRating) count++;
  if (f.search) count++;
  return count;
}

/**
 * Sync filter state with URL search params.
 *
 * Uses local React state as the source of truth (immediate re-renders),
 * and syncs to the URL via `window.history.replaceState` (no history entries).
 *
 * Preserves non-filter params (UTM tracking, holibobSupplierId, etc.).
 */
export function useUrlFilterState() {
  const searchParams = useSearchParams();

  // Initialize local state from URL on first render
  const [filters, setFiltersState] = useState<FilterState>(() =>
    parseFiltersFromParams(searchParams)
  );

  /** Sync filter state to URL without adding history entry */
  const syncToUrl = useCallback((newFilters: FilterState) => {
    const params = new URLSearchParams(window.location.search);
    // Remove all filter keys and page
    for (const key of FILTER_KEYS) {
      params.delete(key);
    }
    params.delete('page');

    // Set active filter params
    if (newFilters.categories.length > 0) params.set('categories', newFilters.categories.join(','));
    if (newFilters.cities.length > 0) params.set('cities', newFilters.cities.join(','));
    if (newFilters.priceMin) params.set('priceMin', newFilters.priceMin);
    if (newFilters.priceMax) params.set('priceMax', newFilters.priceMax);
    if (newFilters.duration) params.set('duration', newFilters.duration);
    if (newFilters.minRating) params.set('minRating', newFilters.minRating);
    if (newFilters.search) params.set('search', newFilters.search);

    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, []);

  const filterKey = useMemo(() => filtersToKey(filters), [filters]);
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  /**
   * Set a single filter value. Resets pagination to page 1.
   *
   * For multi-value keys (categories, cities): pass an array.
   * For single-value keys: pass a string or null to clear.
   */
  const setFilter = useCallback(
    (key: FilterKey, value: string | string[] | null) => {
      setFiltersState((prev) => {
        const next = { ...prev };

        if (key === 'categories' || key === 'cities') {
          next[key] = Array.isArray(value) ? value : value ? [value] : [];
        } else {
          next[key] = value === '' ? null : Array.isArray(value) ? value.join(',') : value;
        }

        syncToUrl(next);
        return next;
      });
    },
    [syncToUrl]
  );

  /** Toggle a value in a multi-value filter (add if missing, remove if present) */
  const toggleFilter = useCallback(
    (key: 'categories' | 'cities', value: string) => {
      setFiltersState((prev) => {
        const current = prev[key];
        const next = {
          ...prev,
          [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
        };
        syncToUrl(next);
        return next;
      });
    },
    [syncToUrl]
  );

  /** Clear all filters at once */
  const clearFilters = useCallback(() => {
    const cleared: FilterState = {
      categories: [],
      cities: [],
      priceMin: null,
      priceMax: null,
      duration: null,
      minRating: null,
      search: null,
    };
    setFiltersState(cleared);
    syncToUrl(cleared);
  }, [syncToUrl]);

  /** Remove a single filter entirely */
  const removeFilter = useCallback(
    (key: FilterKey) => {
      setFilter(key, null);
    },
    [setFilter]
  );

  return {
    filters,
    setFilter,
    toggleFilter,
    removeFilter,
    clearFilters,
    activeFilterCount,
    filterKey,
  };
}

export type { FilterKey };
