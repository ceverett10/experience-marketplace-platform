'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { useBrand } from '@/lib/site-context';

interface ExperienceFiltersProps {
  currentFilters: {
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
  };
}

const categories = [
  { id: 'tours', name: 'Tours & Sightseeing' },
  { id: 'day-trips', name: 'Day Trips' },
  { id: 'attractions', name: 'Attractions & Shows' },
  { id: 'food-drink', name: 'Food & Drink' },
  { id: 'adventure', name: 'Adventure' },
  { id: 'culture', name: 'Culture & History' },
  { id: 'nature', name: 'Nature & Wildlife' },
  { id: 'water', name: 'Water Activities' },
];

const priceRanges = [
  { id: '0-25', label: 'Under £25', min: 0, max: 25 },
  { id: '25-50', label: '£25 - £50', min: 25, max: 50 },
  { id: '50-100', label: '£50 - £100', min: 50, max: 100 },
  { id: '100-200', label: '£100 - £200', min: 100, max: 200 },
  { id: '200+', label: '£200+', min: 200, max: undefined },
];

const sortOptions = [
  { id: 'recommended', name: 'Recommended' },
  { id: 'price-low', name: 'Price: Low to High' },
  { id: 'price-high', name: 'Price: High to Low' },
  { id: 'rating', name: 'Highest Rated' },
  { id: 'popular', name: 'Most Popular' },
];

export function ExperienceFilters({ currentFilters }: ExperienceFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = useBrand();

  const createQueryString = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      // Reset to page 1 when filters change
      params.delete('page');

      return params.toString();
    },
    [searchParams]
  );

  const handleFilterChange = (updates: Record<string, string | undefined>) => {
    const queryString = createQueryString(updates);
    router.push(`${pathname}?${queryString}`);
  };

  const clearFilters = () => {
    router.push(pathname);
  };

  const hasActiveFilters = !!(
    currentFilters.category ||
    currentFilters.minPrice ||
    currentFilters.maxPrice
  );

  return (
    <div className="space-y-6">
      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="text-sm font-medium hover:underline"
          style={{ color: brand?.primaryColor ?? '#6366f1' }}
        >
          Clear all filters
        </button>
      )}

      {/* Sort */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Sort by</h3>
        <div className="mt-3 space-y-2">
          {sortOptions.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="radio"
                name="sort"
                value={option.id}
                checked={(currentFilters.sort ?? 'recommended') === option.id}
                onChange={() => handleFilterChange({ sort: option.id })}
                className="h-4 w-4 border-gray-300 focus:ring-2"
                style={{ accentColor: brand?.primaryColor ?? '#6366f1' }}
              />
              <span className="text-sm text-gray-700">{option.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Categories</h3>
        <div className="mt-3 space-y-2">
          {categories.map((category) => (
            <label
              key={category.id}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="checkbox"
                checked={currentFilters.category === category.id}
                onChange={() =>
                  handleFilterChange({
                    category:
                      currentFilters.category === category.id
                        ? undefined
                        : category.id,
                  })
                }
                className="h-4 w-4 rounded border-gray-300 focus:ring-2"
                style={{ accentColor: brand?.primaryColor ?? '#6366f1' }}
              />
              <span className="text-sm text-gray-700">{category.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Price Range</h3>
        <div className="mt-3 space-y-2">
          {priceRanges.map((range) => {
            const isSelected =
              currentFilters.minPrice === String(range.min) &&
              (range.max === undefined
                ? !currentFilters.maxPrice
                : currentFilters.maxPrice === String(range.max));

            return (
              <label
                key={range.id}
                className="flex cursor-pointer items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {
                    if (isSelected) {
                      handleFilterChange({
                        minPrice: undefined,
                        maxPrice: undefined,
                      });
                    } else {
                      handleFilterChange({
                        minPrice: String(range.min),
                        maxPrice: range.max ? String(range.max) : undefined,
                      });
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 focus:ring-2"
                  style={{ accentColor: brand?.primaryColor ?? '#6366f1' }}
                />
                <span className="text-sm text-gray-700">{range.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Duration */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Duration</h3>
        <div className="mt-3 space-y-2">
          {[
            { id: '0-3', label: 'Up to 3 hours' },
            { id: '3-6', label: '3 to 6 hours' },
            { id: '6-12', label: '6 to 12 hours' },
            { id: '12+', label: 'Full day or longer' },
          ].map((duration) => (
            <label
              key={duration.id}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 focus:ring-2"
                style={{ accentColor: brand?.primaryColor ?? '#6366f1' }}
              />
              <span className="text-sm text-gray-700">{duration.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Rating */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Rating</h3>
        <div className="mt-3 space-y-2">
          {[4.5, 4.0, 3.5, 3.0].map((rating) => (
            <label
              key={rating}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 focus:ring-2"
                style={{ accentColor: brand?.primaryColor ?? '#6366f1' }}
              />
              <span className="flex items-center gap-1 text-sm text-gray-700">
                <svg
                  className="h-4 w-4 text-yellow-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {rating}+ & up
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
