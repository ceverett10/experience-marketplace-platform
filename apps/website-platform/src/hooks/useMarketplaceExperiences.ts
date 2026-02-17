'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FilterState } from './useUrlFilterState';

/** Shape returned by /api/microsite-experiences */
export interface ExperienceListItem {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  imageUrl: string;
  price: { amount: number; currency: string; formatted: string };
  duration: { formatted: string; minutes: number };
  rating: { average: number; count: number } | null;
  location: { name: string };
  categories: string[];
  cityId: string | null;
}

export interface FilterCounts {
  categories: { name: string; count: number }[];
  priceRanges: { label: string; min: number; max: number | null; count: number }[];
  durations: { label: string; value: string; count: number }[];
  ratings: { label: string; value: number; count: number }[];
  cities: { name: string; count: number }[];
}

interface ApiResponse {
  experiences: ExperienceListItem[];
  page: number;
  totalCount: number;
  filteredCount: number;
  hasMore: boolean;
  filterCounts: FilterCounts;
  error?: string;
}

interface UseMarketplaceExperiencesOptions {
  /** Initial experiences from server render (avoids fetch on first load) */
  initialExperiences: ExperienceListItem[];
  initialTotalCount: number;
  initialFilteredCount: number;
  initialHasMore: boolean;
  initialFilterCounts: FilterCounts;
  /** Current filter state from useUrlFilterState */
  filters: FilterState;
  /** Stable key that changes when filters change */
  filterKey: string;
  /** Extra params always sent with API calls (holibobSupplierId, etc.) */
  extraApiParams: Record<string, string>;
}

const DEBOUNCE_MS = 150;
const EMPTY_FILTER_COUNTS: FilterCounts = {
  categories: [],
  priceRanges: [],
  durations: [],
  ratings: [],
  cities: [],
};

/**
 * Core data-fetching hook for Marketplace Microsites.
 *
 * - Uses AbortController to cancel stale requests on rapid filter changes
 * - 150ms debounce prevents rapid-fire fetches on multi-checkbox clicks
 * - isLoading set immediately (before debounce) for instant visual feedback
 * - First render uses server-provided initial data (no fetch)
 * - loadMore appends results, preserving all active filters
 */
export function useMarketplaceExperiences({
  initialExperiences,
  initialTotalCount,
  initialFilteredCount,
  initialHasMore,
  initialFilterCounts,
  filters,
  filterKey,
  extraApiParams,
}: UseMarketplaceExperiencesOptions) {
  const [experiences, setExperiences] = useState<ExperienceListItem[]>(initialExperiences);
  const [filterCounts, setFilterCounts] = useState<FilterCounts>(initialFilterCounts);
  const [filteredCount, setFilteredCount] = useState(initialFilteredCount);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Refs for lifecycle management
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRenderRef = useRef(true);
  const lastFilterKeyRef = useRef(filterKey);

  /** Build query string from filters + extra params */
  const buildQueryString = useCallback(
    (page: number) => {
      const params = new URLSearchParams();

      // Extra params (holibobSupplierId, etc.)
      for (const [key, value] of Object.entries(extraApiParams)) {
        if (value) params.set(key, value);
      }

      // Filter params
      if (filters.categories.length > 0) params.set('categories', filters.categories.join(','));
      if (filters.cities.length > 0) params.set('cities', filters.cities.join(','));
      if (filters.priceMin) params.set('priceMin', filters.priceMin);
      if (filters.priceMax) params.set('priceMax', filters.priceMax);
      if (filters.duration) params.set('duration', filters.duration);
      if (filters.minRating) params.set('minRating', filters.minRating);
      if (filters.search) params.set('search', filters.search);

      params.set('page', String(page));

      return params.toString();
    },
    [filters, extraApiParams]
  );

  /** Fetch experiences from the API */
  const fetchExperiences = useCallback(
    async (page: number, append: boolean) => {
      // Abort any in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const qs = buildQueryString(page);
        const res = await fetch(`/api/microsite-experiences?${qs}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data: ApiResponse = await res.json();

        // Ignore if this request was aborted (a newer one is in flight)
        if (controller.signal.aborted) return;

        if (append) {
          setExperiences((prev) => [...prev, ...data.experiences]);
        } else {
          setExperiences(data.experiences);
        }

        setFilterCounts(data.filterCounts ?? EMPTY_FILTER_COUNTS);
        setFilteredCount(data.filteredCount);
        setTotalCount(data.totalCount);
        setHasMore(data.hasMore);
        setCurrentPage(page);
        setError(data.error ?? null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return; // Silently ignore aborted requests
        }
        console.error('[useMarketplaceExperiences] Fetch error:', err);
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load experiences');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [buildQueryString]
  );

  // React to filter changes with debounce
  useEffect(() => {
    // Skip the initial render — we already have server data
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      lastFilterKeyRef.current = filterKey;
      return;
    }

    // Skip if filterKey hasn't actually changed
    if (filterKey === lastFilterKeyRef.current) return;
    lastFilterKeyRef.current = filterKey;

    // Set loading immediately for instant visual feedback
    setIsLoading(true);
    setError(null);

    // Clear previous debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the actual fetch
    debounceTimerRef.current = setTimeout(() => {
      fetchExperiences(1, false);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filterKey, fetchExperiences]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  /** Load more results (append to existing list) */
  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    fetchExperiences(currentPage + 1, true);
  }, [isLoadingMore, hasMore, currentPage, fetchExperiences]);

  return {
    experiences,
    filterCounts,
    filteredCount,
    totalCount,
    hasMore,
    isLoading,
    isLoadingMore,
    loadMore,
    error,
  };
}
