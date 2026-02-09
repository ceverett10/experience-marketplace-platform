'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export interface FilterOptions {
  categories: { name: string; count: number }[];
  priceRanges: { label: string; min: number; max: number | null; count: number }[];
  durations: { label: string; value: string; count: number }[];
  ratings: { label: string; value: number; count: number }[];
  cities: { name: string; count: number }[];
}

interface FilterSidebarProps {
  filterOptions: FilterOptions;
  primaryColor?: string;
  totalCount: number;
  filteredCount: number;
}

export function FilterSidebar({
  filterOptions,
  primaryColor = '#6366f1',
  totalCount,
  filteredCount,
}: FilterSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  type SectionKey = 'categories' | 'price' | 'duration' | 'rating' | 'cities';
  const [isExpanded, setIsExpanded] = useState<Record<SectionKey, boolean>>({
    categories: true,
    price: true,
    duration: false,
    rating: false,
    cities: false,
  });

  // Get current filter values from URL
  const currentFilters = {
    categories: searchParams.get('categories')?.split(',').filter(Boolean) ?? [],
    priceMin: searchParams.get('priceMin'),
    priceMax: searchParams.get('priceMax'),
    duration: searchParams.get('duration'),
    minRating: searchParams.get('minRating'),
    cities: searchParams.get('cities')?.split(',').filter(Boolean) ?? [],
  };

  const hasActiveFilters =
    currentFilters.categories.length > 0 ||
    currentFilters.priceMin ||
    currentFilters.priceMax ||
    currentFilters.duration ||
    currentFilters.minRating ||
    currentFilters.cities.length > 0;

  const updateFilters = useCallback(
    (key: string, value: string | string[] | null) => {
      const params = new URLSearchParams(searchParams.toString());

      // Reset to page 1 when filters change
      params.delete('page');

      if (value === null || (Array.isArray(value) && value.length === 0)) {
        params.delete(key);
      } else if (Array.isArray(value)) {
        params.set(key, value.join(','));
      } else {
        params.set(key, value);
      }

      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const clearAllFilters = useCallback(() => {
    router.push('/experiences', { scroll: false });
  }, [router]);

  const toggleCategory = (category: string) => {
    const current = currentFilters.categories;
    const updated = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    updateFilters('categories', updated);
  };

  const toggleCity = (city: string) => {
    const current = currentFilters.cities;
    const updated = current.includes(city) ? current.filter((c) => c !== city) : [...current, city];
    updateFilters('cities', updated);
  };

  const setPriceRange = (min: number, max: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');

    if (min === 0 && max === null) {
      params.delete('priceMin');
      params.delete('priceMax');
    } else {
      params.set('priceMin', String(min));
      if (max !== null) {
        params.set('priceMax', String(max));
      } else {
        params.delete('priceMax');
      }
    }

    router.push(`?${params.toString()}`, { scroll: false });
  };

  const toggleSection = (section: SectionKey) => {
    setIsExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <aside className="w-full lg:w-64 flex-shrink-0">
      <div className="sticky top-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-sm font-medium hover:underline"
                style={{ color: primaryColor }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* Result count */}
          <div className="mt-3 text-sm text-gray-600">
            Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} experiences
          </div>

          {/* Categories Filter */}
          {filterOptions.categories.length > 0 && (
            <FilterSection
              title="Categories"
              isExpanded={isExpanded.categories}
              onToggle={() => toggleSection('categories')}
            >
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filterOptions.categories.map((cat) => (
                  <label
                    key={cat.name}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={currentFilters.categories.includes(cat.name)}
                      onChange={() => toggleCategory(cat.name)}
                      className="h-4 w-4 rounded border-gray-300 focus:ring-2"
                      style={{ accentColor: primaryColor }}
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1 truncate">
                      {cat.name}
                    </span>
                    <span className="text-xs text-gray-400">{cat.count}</span>
                  </label>
                ))}
              </div>
            </FilterSection>
          )}

          {/* Price Filter */}
          {filterOptions.priceRanges.length > 0 && (
            <FilterSection
              title="Price Range"
              isExpanded={isExpanded.price}
              onToggle={() => toggleSection('price')}
            >
              <div className="space-y-2">
                {filterOptions.priceRanges.map((range) => {
                  const isActive =
                    currentFilters.priceMin === String(range.min) &&
                    (range.max === null
                      ? !currentFilters.priceMax
                      : currentFilters.priceMax === String(range.max));

                  return (
                    <button
                      key={range.label}
                      onClick={() =>
                        isActive ? setPriceRange(0, null) : setPriceRange(range.min, range.max)
                      }
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'text-white'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                      style={isActive ? { backgroundColor: primaryColor } : undefined}
                    >
                      <span>{range.label}</span>
                      <span className={isActive ? 'text-white/80' : 'text-gray-400'}>
                        {range.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </FilterSection>
          )}

          {/* Duration Filter */}
          {filterOptions.durations.length > 0 && (
            <FilterSection
              title="Duration"
              isExpanded={isExpanded.duration}
              onToggle={() => toggleSection('duration')}
            >
              <div className="space-y-2">
                {filterOptions.durations.map((dur) => {
                  const isActive = currentFilters.duration === dur.value;

                  return (
                    <button
                      key={dur.value}
                      onClick={() => updateFilters('duration', isActive ? null : dur.value)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'text-white'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                      style={isActive ? { backgroundColor: primaryColor } : undefined}
                    >
                      <span>{dur.label}</span>
                      <span className={isActive ? 'text-white/80' : 'text-gray-400'}>
                        {dur.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </FilterSection>
          )}

          {/* Rating Filter */}
          {filterOptions.ratings.length > 0 && (
            <FilterSection
              title="Rating"
              isExpanded={isExpanded.rating}
              onToggle={() => toggleSection('rating')}
            >
              <div className="space-y-2">
                {filterOptions.ratings.map((rating) => {
                  const isActive = currentFilters.minRating === String(rating.value);

                  return (
                    <button
                      key={rating.value}
                      onClick={() =>
                        updateFilters('minRating', isActive ? null : String(rating.value))
                      }
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'text-white'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                      style={isActive ? { backgroundColor: primaryColor } : undefined}
                    >
                      <span className="flex items-center gap-1">
                        <StarIcon className="h-4 w-4 text-yellow-400" />
                        {rating.label}
                      </span>
                      <span className={isActive ? 'text-white/80' : 'text-gray-400'}>
                        {rating.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </FilterSection>
          )}

          {/* Cities Filter */}
          {filterOptions.cities.length > 1 && (
            <FilterSection
              title="Location"
              isExpanded={isExpanded.cities}
              onToggle={() => toggleSection('cities')}
            >
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filterOptions.cities.map((city) => (
                  <label
                    key={city.name}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={currentFilters.cities.includes(city.name)}
                      onChange={() => toggleCity(city.name)}
                      className="h-4 w-4 rounded border-gray-300 focus:ring-2"
                      style={{ accentColor: primaryColor }}
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1 truncate">
                      {city.name}
                    </span>
                    <span className="text-xs text-gray-400">{city.count}</span>
                  </label>
                ))}
              </div>
            </FilterSection>
          )}
        </div>
      </div>
    </aside>
  );
}

function FilterSection({
  title,
  isExpanded,
  onToggle,
  children,
}: {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-gray-100 pt-4 mt-4">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-sm font-medium text-gray-900"
      >
        {title}
        <ChevronIcon className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      {isExpanded && <div className="mt-3">{children}</div>}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

// Mobile filter button component
export function MobileFilterButton({
  filterCount,
  onClick,
  primaryColor = '#6366f1',
}: {
  filterCount: number;
  onClick: () => void;
  primaryColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
        />
      </svg>
      Filters
      {filterCount > 0 && (
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {filterCount}
        </span>
      )}
    </button>
  );
}

// Mobile filter drawer
export function MobileFilterDrawer({
  isOpen,
  onClose,
  filterOptions,
  primaryColor,
  totalCount,
  filteredCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  filterOptions: FilterOptions;
  primaryColor?: string;
  totalCount: number;
  filteredCount: number;
}) {
  // Prevent body scroll when drawer is open
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold">Filters</h2>
          <button onClick={onClose} className="p-2 -m-2 text-gray-400 hover:text-gray-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <FilterSidebar
            filterOptions={filterOptions}
            primaryColor={primaryColor}
            totalCount={totalCount}
            filteredCount={filteredCount}
          />
        </div>

        <div className="sticky bottom-0 border-t border-gray-200 bg-white p-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg py-3 text-center font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Show {filteredCount.toLocaleString()} results
          </button>
        </div>
      </div>
    </div>
  );
}
