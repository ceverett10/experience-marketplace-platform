'use client';

import { useState } from 'react';
import { ProductDiscoverySearch } from './ProductDiscoverySearch';
import { useBrand } from '@/lib/site-context';

interface PpcSearchAccordionProps {
  defaultDestination?: string;
  defaultWhat?: string;
  defaultDates?: { startDate?: string; endDate?: string };
}

export function PpcSearchAccordion({
  defaultDestination,
  defaultWhat,
  defaultDates,
}: PpcSearchAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const brand = useBrand();
  const primaryColor = brand?.primaryColor ?? '#0F766E';

  return (
    <div className="mt-3">
      {/* Animated button to draw PPC visitor attention */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 ${
          isOpen ? '' : 'ppc-refine-animate'
        }`}
        style={{ backgroundColor: primaryColor }}
      >
        {/* Shimmer overlay — only when closed */}
        {!isOpen && (
          <span className="ppc-refine-shimmer pointer-events-none absolute inset-0 rounded-full" />
        )}
        <svg
          className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        {isOpen ? 'Hide Search' : 'Refine Your Search'}
        {!isOpen && (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {isOpen && (
        <div className="mt-3">
          <ProductDiscoverySearch
            variant="hero"
            defaultDestination={defaultDestination}
            defaultWhat={defaultWhat}
            defaultDates={defaultDates}
          />
        </div>
      )}
    </div>
  );
}
