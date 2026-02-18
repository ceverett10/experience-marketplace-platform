'use client';

import { useEffect, useRef } from 'react';
import { CheckboxFilter, ButtonGroupFilter, PriceRangeFilter } from './FilterDropdown';
import type { FilterState, FilterKey } from '@/hooks/useUrlFilterState';
import type { FilterCounts } from '@/hooks/useMarketplaceExperiences';

interface FilterOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  filterCounts: FilterCounts;
  filteredCount: number;
  primaryColor?: string;
  onSetFilter: (key: FilterKey, value: string | string[] | null) => void;
  onToggleFilter: (key: 'categories' | 'cities', value: string) => void;
  onClearFilters: () => void;
}

/**
 * Full-screen mobile filter overlay.
 * Slides up from bottom with backdrop. All filter sections expanded vertically.
 * Sticky "Show X results" button at bottom.
 */
export function FilterOverlay({
  isOpen,
  onClose,
  filters,
  filterCounts,
  filteredCount,
  primaryColor = '#0F766E',
  onSetFilter,
  onToggleFilter,
  onClearFilters,
}: FilterOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const durationOptions = filterCounts.durations.map((d) => ({
    label: d.label,
    value: d.value,
    count: d.count,
  }));

  const ratingOptions = filterCounts.ratings.map((r) => ({
    label: r.label,
    value: r.value,
    count: r.count,
  }));

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Overlay panel */}
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filter experiences"
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClearFilters}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close filters"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable filter sections */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Categories */}
          {filterCounts.categories.length > 0 && (
            <FilterSection title="Category">
              <CheckboxFilter
                options={filterCounts.categories}
                selected={filters.categories}
                onToggle={(val) => onToggleFilter('categories', val)}
              />
            </FilterSection>
          )}

          {/* Cities */}
          {filterCounts.cities.length > 0 && (
            <FilterSection title="City">
              <CheckboxFilter
                options={filterCounts.cities}
                selected={filters.cities}
                onToggle={(val) => onToggleFilter('cities', val)}
              />
            </FilterSection>
          )}

          {/* Price */}
          {filterCounts.priceRanges.length > 0 && (
            <FilterSection title="Price">
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
            </FilterSection>
          )}

          {/* Duration */}
          {durationOptions.length > 0 && (
            <FilterSection title="Duration">
              <ButtonGroupFilter
                options={durationOptions}
                selected={filters.duration}
                onSelect={(val) => onSetFilter('duration', val)}
                primaryColor={primaryColor}
              />
            </FilterSection>
          )}

          {/* Rating */}
          {ratingOptions.length > 0 && (
            <FilterSection title="Rating">
              <ButtonGroupFilter
                options={ratingOptions}
                selected={filters.minRating ? parseFloat(filters.minRating) : null}
                onSelect={(val) => onSetFilter('minRating', val !== null ? String(val) : null)}
                primaryColor={primaryColor}
              />
            </FilterSection>
          )}
        </div>

        {/* Sticky footer */}
        <div className="border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl py-3 text-center text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Show {filteredCount} experience{filteredCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </>
  );
}

/** Simple section wrapper with title + divider */
function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 py-4 first:pt-0 last:border-b-0">
      <h3 className="mb-2.5 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}
