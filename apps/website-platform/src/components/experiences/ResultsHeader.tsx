'use client';

import type { FilterState, FilterKey } from '@/hooks/useUrlFilterState';

interface ResultsHeaderProps {
  filteredCount: number;
  totalCount: number;
  isLoading: boolean;
  filters: FilterState;
  onRemoveFilter: (key: FilterKey) => void;
  onClearFilters: () => void;
  primaryColor?: string;
}

/** Human-readable labels for active filter pills */
const FILTER_LABELS: Record<string, string> = {
  categories: 'Category',
  cities: 'City',
  priceMin: 'Min price',
  priceMax: 'Max price',
  duration: 'Duration',
  minRating: 'Rating',
  search: 'Search',
};

const DURATION_LABELS: Record<string, string> = {
  short: 'Under 2 hours',
  'half-day': '2–4 hours',
  'full-day': '4–8 hours',
  'multi-day': 'Multi-day',
};

/**
 * Results count header with dismissible active filter pills.
 * Shows "X experiences found" and allows removing individual filters.
 */
export function ResultsHeader({
  filteredCount,
  totalCount,
  isLoading,
  filters,
  onRemoveFilter,
  onClearFilters,
  primaryColor = '#0F766E',
}: ResultsHeaderProps) {
  // Build list of active filter pills
  const activePills: { key: FilterKey; label: string; display: string }[] = [];

  if (filters.categories.length > 0) {
    activePills.push({
      key: 'categories',
      label: 'Category',
      display:
        filters.categories.length === 1
          ? filters.categories[0]!
          : `${filters.categories.length} categories`,
    });
  }
  if (filters.cities.length > 0) {
    activePills.push({
      key: 'cities',
      label: 'City',
      display: filters.cities.length === 1 ? filters.cities[0]! : `${filters.cities.length} cities`,
    });
  }
  if (filters.priceMin || filters.priceMax) {
    const min = filters.priceMin ? `£${filters.priceMin}` : '£0';
    const max = filters.priceMax ? `£${filters.priceMax}` : '+';
    activePills.push({
      key: 'priceMin',
      label: 'Price',
      display: filters.priceMax ? `${min}–${max}` : `${min}${max}`,
    });
  }
  if (filters.duration) {
    activePills.push({
      key: 'duration',
      label: 'Duration',
      display: DURATION_LABELS[filters.duration] ?? filters.duration,
    });
  }
  if (filters.minRating) {
    activePills.push({
      key: 'minRating',
      label: 'Rating',
      display: `${filters.minRating}+`,
    });
  }
  if (filters.search) {
    activePills.push({
      key: 'search',
      label: 'Search',
      display: `"${filters.search}"`,
    });
  }

  const hasFilters = activePills.length > 0;

  return (
    <div className="mb-4">
      {/* Count */}
      <div className="flex items-baseline gap-2">
        <p className="text-lg font-semibold text-gray-900">
          {isLoading ? (
            <span className="inline-block h-5 w-32 animate-pulse rounded bg-gray-200 align-middle" />
          ) : (
            <>
              {filteredCount.toLocaleString()} experience{filteredCount !== 1 ? 's' : ''}
              {hasFilters && filteredCount !== totalCount && (
                <span className="ml-1 text-sm font-normal text-gray-500">
                  of {totalCount.toLocaleString()}
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Active filter pills */}
      {activePills.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {activePills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => {
                // For combined price filter, clear both min and max
                if (pill.key === 'priceMin') {
                  onRemoveFilter('priceMin');
                  onRemoveFilter('priceMax');
                } else {
                  onRemoveFilter(pill.key);
                }
              }}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-gray-50"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              {pill.display}
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ))}
          {activePills.length > 1 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
