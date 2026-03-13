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
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
        style={{ color: primaryColor }}
      >
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {isOpen ? 'Hide Search' : 'Refine Search'}
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
