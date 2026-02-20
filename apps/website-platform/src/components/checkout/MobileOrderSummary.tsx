'use client';

import { useState } from 'react';

interface MobileOrderSummaryProps {
  experienceName: string;
  date?: string;
  totalPrice?: string;
  guestCount?: number;
  imageUrl?: string;
  primaryColor?: string;
}

export function MobileOrderSummary({
  experienceName,
  date,
  totalPrice,
  guestCount,
  imageUrl,
  primaryColor = '#0d9488',
}: MobileOrderSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm lg:hidden"
      data-testid="mobile-order-summary"
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <svg
            className="h-5 w-5 flex-shrink-0 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121 0 2.002-.881 2.002-2V5.625"
            />
          </svg>
          <span className="truncate text-sm font-medium text-gray-900">{experienceName}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-sm font-bold" style={{ color: primaryColor }}>
            {totalPrice ?? '-'}
          </span>
          <svg
            className={`h-4 w-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          <div className="flex gap-3">
            {imageUrl && (
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-gray-900">{experienceName}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                {date && <span>{date}</span>}
                {guestCount != null && guestCount > 0 && (
                  <span>
                    {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-base font-bold" style={{ color: primaryColor }}>
              {totalPrice ?? '-'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
