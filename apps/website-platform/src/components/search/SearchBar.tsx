'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useBrand } from '@/lib/site-context';

interface SearchBarProps {
  variant?: 'hero' | 'compact';
  defaultLocation?: string;
  defaultDate?: string;
  defaultGuests?: number;
  className?: string;
}

export function SearchBar({
  variant = 'hero',
  defaultLocation = '',
  defaultDate = '',
  defaultGuests = 2,
  className = '',
}: SearchBarProps) {
  const router = useRouter();
  const brand = useBrand();

  const [location, setLocation] = useState(defaultLocation);
  const [date, setDate] = useState(defaultDate);
  const [guests, setGuests] = useState(defaultGuests);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams();
    if (location) params.set('location', location);
    if (date) params.set('date', date);
    if (guests !== 2) params.set('guests', guests.toString());

    router.push(`/experiences?${params.toString()}`);
  };

  if (variant === 'compact') {
    return (
      <form onSubmit={handleSubmit} className={`flex items-center gap-2 ${className}`}>
        <input
          type="text"
          placeholder="Where to?"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2"
          style={{ '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties}
        />
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: brand?.primaryColor ?? '#6366f1' }}
        >
          Search
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`w-full rounded-2xl bg-white p-2 shadow-xl ${className}`}
    >
      <div className="grid gap-2 md:grid-cols-4">
        {/* Location */}
        <div className="relative">
          <label
            htmlFor="search-location"
            className="absolute left-4 top-2 text-xs font-medium text-gray-500"
          >
            Where
          </label>
          <input
            id="search-location"
            type="text"
            placeholder="Search destinations"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-xl border-0 pb-2 pl-4 pr-4 pt-6 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset"
            style={{ '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties}
          />
        </div>

        {/* Date */}
        <div className="relative">
          <label
            htmlFor="search-date"
            className="absolute left-4 top-2 text-xs font-medium text-gray-500"
          >
            When
          </label>
          <input
            id="search-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full rounded-xl border-0 pb-2 pl-4 pr-4 pt-6 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset"
            style={{ '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties}
          />
        </div>

        {/* Guests */}
        <div className="relative">
          <label
            htmlFor="search-guests"
            className="absolute left-4 top-2 text-xs font-medium text-gray-500"
          >
            Who
          </label>
          <select
            id="search-guests"
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="w-full appearance-none rounded-xl border-0 pb-2 pl-4 pr-10 pt-6 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset"
            style={{ '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <option key={num} value={num}>
                {num} {num === 1 ? 'guest' : 'guests'}
              </option>
            ))}
          </select>
        </div>

        {/* Search Button */}
        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            backgroundColor: brand?.primaryColor ?? '#6366f1',
            '--tw-ring-color': brand?.primaryColor ?? '#6366f1',
          } as React.CSSProperties}
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
          <span className="hidden sm:inline">Search</span>
        </button>
      </div>
    </form>
  );
}
