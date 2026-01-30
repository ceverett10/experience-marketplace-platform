'use client';

import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBrand } from '@/lib/site-context';

interface RecommendedTag {
  id: string;
  name: string;
}

interface RecommendedDestination {
  id: string;
  name: string;
  imageUrl?: string;
}

interface ProductDiscoverySearchProps {
  variant?: 'hero' | 'inline' | 'sidebar';
  defaultDestination?: string;
  defaultDates?: { startDate?: string; endDate?: string };
  defaultTravelers?: string;
  recommendedTags?: RecommendedTag[];
  recommendedDestinations?: RecommendedDestination[];
  popularSearchTerms?: string[];
  onSearch?: (params: SearchParams) => void;
  className?: string;
}

interface SearchParams {
  destination: string;
  startDate?: string;
  endDate?: string;
  travelers?: string;
  searchTerm?: string;
}

// Popular destinations for autocomplete
const POPULAR_DESTINATIONS = [
  {
    id: 'london',
    name: 'London, England',
    imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=100',
  },
  {
    id: 'edinburgh',
    name: 'Edinburgh, Scotland',
    imageUrl: 'https://images.unsplash.com/photo-1506377585622-bedcbb027afc?w=100',
  },
  {
    id: 'paris',
    name: 'Paris, France',
    imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=100',
  },
  {
    id: 'barcelona',
    name: 'Barcelona, Spain',
    imageUrl: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=100',
  },
  {
    id: 'rome',
    name: 'Rome, Italy',
    imageUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=100',
  },
  {
    id: 'amsterdam',
    name: 'Amsterdam, Netherlands',
    imageUrl: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=100',
  },
];

// Popular search suggestions
const POPULAR_SEARCHES = [
  'Food tours',
  'Walking tours',
  'Day trips',
  'Family activities',
  'Museum tickets',
  'Outdoor adventures',
  'Night tours',
  'Wine tasting',
];

export function ProductDiscoverySearch({
  variant = 'hero',
  defaultDestination = '',
  defaultDates = {},
  defaultTravelers = '',
  recommendedTags = [],
  recommendedDestinations = [],
  popularSearchTerms = POPULAR_SEARCHES,
  onSearch,
  className = '',
}: ProductDiscoverySearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const brand = useBrand();
  const inputRef = useRef<HTMLInputElement>(null);

  const [destination, setDestination] = useState(
    defaultDestination || searchParams.get('destination') || ''
  );
  const [startDate, setStartDate] = useState(
    defaultDates.startDate || searchParams.get('startDate') || ''
  );
  const [endDate, setEndDate] = useState(defaultDates.endDate || searchParams.get('endDate') || '');
  const [travelers, setTravelers] = useState(
    defaultTravelers || searchParams.get('travelers') || '2 adults'
  );
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');

  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false);
  const [showTravelersDropdown, setShowTravelersDropdown] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Traveler counts
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);

  const allDestinations =
    recommendedDestinations.length > 0 ? recommendedDestinations : POPULAR_DESTINATIONS;

  const filteredDestinations = destination
    ? allDestinations.filter((d) => d.name.toLowerCase().includes(destination.toLowerCase()))
    : allDestinations;

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();

      const params: SearchParams = {
        destination,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        travelers: `${adults} adults${children > 0 ? `, ${children} children` : ''}${infants > 0 ? `, ${infants} infants` : ''}`,
        searchTerm: searchTerm || undefined,
      };

      if (onSearch) {
        onSearch(params);
      } else {
        const urlParams = new URLSearchParams();
        if (destination) urlParams.set('destination', destination);
        if (startDate) urlParams.set('startDate', startDate);
        if (endDate) urlParams.set('endDate', endDate);
        if (adults !== 2 || children > 0 || infants > 0) {
          urlParams.set('adults', adults.toString());
          if (children > 0) urlParams.set('children', children.toString());
          if (infants > 0) urlParams.set('infants', infants.toString());
        }
        if (searchTerm) urlParams.set('q', searchTerm);

        router.push(`/experiences?${urlParams.toString()}`);
      }
    },
    [destination, startDate, endDate, adults, children, infants, searchTerm, onSearch, router]
  );

  const selectDestination = (dest: RecommendedDestination) => {
    setDestination(dest.name);
    setShowDestinationDropdown(false);
  };

  const updateTravelers = () => {
    setTravelers(
      `${adults} adult${adults !== 1 ? 's' : ''}${children > 0 ? `, ${children} child${children !== 1 ? 'ren' : ''}` : ''}${infants > 0 ? `, ${infants} infant${infants !== 1 ? 's' : ''}` : ''}`
    );
    setShowTravelersDropdown(false);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.search-dropdown')) {
        setShowDestinationDropdown(false);
        setShowTravelersDropdown(false);
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const primaryColor = brand?.primaryColor ?? '#0F766E';
  const primaryColorLight = brand?.primaryColor ? `${brand.primaryColor}15` : '#0F766E15';

  if (variant === 'sidebar') {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* Quick Search */}
        <div className="relative search-dropdown">
          <input
            type="text"
            placeholder="What are you looking for?"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pl-10 text-sm focus:border-transparent focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
          />
          <svg
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          {isSearchFocused && !searchTerm && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
              <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Popular searches
              </p>
              <div className="flex flex-wrap gap-2">
                {popularSearchTerms.slice(0, 6).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      setSearchTerm(term);
                      setIsSearchFocused(false);
                    }}
                    className="rounded-full px-3 py-1.5 text-sm transition-colors hover:opacity-80"
                    style={{ backgroundColor: primaryColorLight, color: primaryColor }}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="relative search-dropdown">
          <label className="mb-1.5 block text-xs font-medium text-gray-500">Destination</label>
          <input
            type="text"
            placeholder="Where to?"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            onFocus={() => setShowDestinationDropdown(true)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
          />

          {showDestinationDropdown && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-lg">
              {filteredDestinations.map((dest) => (
                <button
                  key={dest.id}
                  type="button"
                  onClick={() => selectDestination(dest)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  {dest.imageUrl && (
                    <img src={dest.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  )}
                  <span className="text-sm font-medium text-gray-900">{dest.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Check in</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Check out</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || new Date().toISOString().split('T')[0]}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />
          </div>
        </div>

        {/* Search Button */}
        <button
          type="button"
          onClick={() => handleSubmit()}
          className="w-full rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Search Experiences
        </button>

        {/* Quick Tags */}
        {(recommendedTags.length > 0 || popularSearchTerms.length > 0) && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
              Quick filters
            </p>
            <div className="flex flex-wrap gap-2">
              {(recommendedTags.length > 0
                ? recommendedTags
                : popularSearchTerms.map((t, i) => ({ id: i.toString(), name: t }))
              )
                .slice(0, 4)
                .map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSearchTerm(tag.name)}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    {tag.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Hero variant (default)
  return (
    <form onSubmit={handleSubmit} className={`w-full ${className}`}>
      {/* Main Search Bar */}
      <div className="rounded-2xl bg-white p-2 shadow-2xl shadow-black/10">
        <div className="grid gap-2 md:grid-cols-12">
          {/* Destination */}
          <div className="relative search-dropdown md:col-span-4">
            <label className="absolute left-4 top-2 text-xs font-medium text-gray-500">Where</label>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search destinations"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onFocus={() => setShowDestinationDropdown(true)}
              className="w-full rounded-xl border-0 pb-2 pl-4 pr-4 pt-6 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />

            {showDestinationDropdown && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-xl">
                <div className="p-2">
                  <p className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Popular destinations
                  </p>
                  {filteredDestinations.map((dest) => (
                    <button
                      key={dest.id}
                      type="button"
                      onClick={() => selectDestination(dest)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                    >
                      {dest.imageUrl && (
                        <img
                          src={dest.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      )}
                      <div>
                        <span className="block text-sm font-medium text-gray-900">{dest.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Check In */}
          <div className="relative md:col-span-2">
            <label className="absolute left-4 top-2 text-xs font-medium text-gray-500">
              Check in
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-xl border-0 pb-2 pl-4 pr-4 pt-6 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />
          </div>

          {/* Check Out */}
          <div className="relative md:col-span-2">
            <label className="absolute left-4 top-2 text-xs font-medium text-gray-500">
              Check out
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || new Date().toISOString().split('T')[0]}
              className="w-full rounded-xl border-0 pb-2 pl-4 pr-4 pt-6 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />
          </div>

          {/* Travelers */}
          <div className="relative search-dropdown md:col-span-2">
            <label className="absolute left-4 top-2 text-xs font-medium text-gray-500">Who</label>
            <button
              type="button"
              onClick={() => setShowTravelersDropdown(!showTravelersDropdown)}
              className="w-full rounded-xl border-0 pb-2 pl-4 pr-4 pt-6 text-left text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            >
              {travelers || 'Add guests'}
            </button>

            {showTravelersDropdown && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-gray-100 bg-white p-4 shadow-xl md:min-w-72 md:left-auto md:right-0">
                <div className="space-y-4">
                  {/* Adults */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Adults</p>
                      <p className="text-xs text-gray-500">Ages 13+</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setAdults(Math.max(1, adults - 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:border-gray-400"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{adults}</span>
                      <button
                        type="button"
                        onClick={() => setAdults(adults + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:border-gray-400"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Children */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Children</p>
                      <p className="text-xs text-gray-500">Ages 2-12</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setChildren(Math.max(0, children - 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:border-gray-400"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{children}</span>
                      <button
                        type="button"
                        onClick={() => setChildren(children + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:border-gray-400"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Infants */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Infants</p>
                      <p className="text-xs text-gray-500">Under 2</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setInfants(Math.max(0, infants - 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:border-gray-400"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{infants}</span>
                      <button
                        type="button"
                        onClick={() => setInfants(infants + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:border-gray-400"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={updateTravelers}
                  className="mt-4 w-full rounded-lg py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* Search Button */}
          <div className="md:col-span-2">
            <button
              type="submit"
              className="flex h-full w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={
                {
                  backgroundColor: primaryColor,
                  '--tw-ring-color': primaryColor,
                } as React.CSSProperties
              }
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <span className="hidden lg:inline">Search</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Search Tags */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="text-sm text-white/80">Popular:</span>
        {popularSearchTerms.slice(0, 5).map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => setSearchTerm(term)}
            className="rounded-full bg-white/20 px-3 py-1 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          >
            {term}
          </button>
        ))}
      </div>
    </form>
  );
}
