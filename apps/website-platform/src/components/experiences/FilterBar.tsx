'use client';

import { useState, useCallback } from 'react';
import { FilterChip } from './FilterChip';
import { CheckboxFilter, ButtonGroupFilter, PriceRangeFilter } from './FilterDropdown';
import type { FilterState, FilterKey } from '@/hooks/useUrlFilterState';
import type { FilterCounts } from '@/hooks/useMarketplaceExperiences';

interface FilterBarProps {
  filters: FilterState;
  filterCounts: FilterCounts;
  activeFilterCount: number;
  primaryColor?: string;
  onSetFilter: (key: FilterKey, value: string | string[] | null) => void;
  onToggleFilter: (key: 'categories' | 'cities', value: string) => void;
  onClearFilters: () => void;
  /** Open mobile overlay */
  onOpenMobileFilters?: () => void;
}

type OpenDropdown = 'categories' | 'cities' | 'price' | 'duration' | 'rating' | null;

/**
 * Horizontal filter bar with chip-style buttons.
 * Desktop: inline chips with dropdown panels.
 * Mobile: single "Filters (N)" button that opens FilterOverlay.
 */
export function FilterBar({
  filters,
  filterCounts,
  activeFilterCount,
  primaryColor = '#0F766E',
  onSetFilter,
  onToggleFilter,
  onClearFilters,
  onOpenMobileFilters,
}: FilterBarProps) {
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);

  const toggleDropdown = useCallback((key: OpenDropdown) => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  }, []);

  // Duration filter options from filterCounts
  const durationOptions = filterCounts.durations.map((d) => ({
    label: d.label,
    value: d.value,
    count: d.count,
  }));

  // Rating filter options
  const ratingOptions = filterCounts.ratings.map((r) => ({
    label: r.label,
    value: r.value,
    count: r.count,
  }));

  return (
    <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        {/* Mobile: single button */}
        <div className="md:hidden">
          <button
            type="button"
            onClick={onOpenMobileFilters}
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
                style={{ backgroundColor: primaryColor }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Desktop: inline chips */}
        <div className="hidden items-center gap-2 md:flex">
          {/* Categories chip */}
          {filterCounts.categories.length > 0 && (
            <FilterChip
              label="Category"
              activeCount={filters.categories.length}
              isOpen={openDropdown === 'categories'}
              onToggle={() => toggleDropdown('categories')}
              primaryColor={primaryColor}
            >
              <CheckboxFilter
                options={filterCounts.categories}
                selected={filters.categories}
                onToggle={(val) => onToggleFilter('categories', val)}
              />
            </FilterChip>
          )}

          {/* Cities chip */}
          {filterCounts.cities.length > 0 && (
            <FilterChip
              label="City"
              activeCount={filters.cities.length}
              isOpen={openDropdown === 'cities'}
              onToggle={() => toggleDropdown('cities')}
              primaryColor={primaryColor}
            >
              <CheckboxFilter
                options={filterCounts.cities}
                selected={filters.cities}
                onToggle={(val) => onToggleFilter('cities', val)}
              />
            </FilterChip>
          )}

          {/* Price chip */}
          {filterCounts.priceRanges.length > 0 && (
            <FilterChip
              label="Price"
              activeCount={filters.priceMin || filters.priceMax ? 1 : 0}
              isOpen={openDropdown === 'price'}
              onToggle={() => toggleDropdown('price')}
              primaryColor={primaryColor}
            >
              <PriceRangeFilter
                ranges={filterCounts.priceRanges}
                selectedMin={filters.priceMin}
                selectedMax={filters.priceMax}
                onSelect={(min, max) => {
                  onSetFilter('priceMin', min);
                  onSetFilter('priceMax', max);
                }}
                primaryColor={primaryColor}
              />
            </FilterChip>
          )}

          {/* Duration chip */}
          {durationOptions.length > 0 && (
            <FilterChip
              label="Duration"
              activeCount={filters.duration ? 1 : 0}
              isOpen={openDropdown === 'duration'}
              onToggle={() => toggleDropdown('duration')}
              primaryColor={primaryColor}
            >
              <ButtonGroupFilter
                options={durationOptions}
                selected={filters.duration}
                onSelect={(val) => onSetFilter('duration', val)}
                primaryColor={primaryColor}
              />
            </FilterChip>
          )}

          {/* Rating chip */}
          {ratingOptions.length > 0 && (
            <FilterChip
              label="Rating"
              activeCount={filters.minRating ? 1 : 0}
              isOpen={openDropdown === 'rating'}
              onToggle={() => toggleDropdown('rating')}
              primaryColor={primaryColor}
            >
              <ButtonGroupFilter
                options={ratingOptions}
                selected={filters.minRating ? parseFloat(filters.minRating) : null}
                onSelect={(val) => onSetFilter('minRating', val !== null ? String(val) : null)}
                primaryColor={primaryColor}
              />
            </FilterChip>
          )}

          {/* Clear all button */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="ml-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
