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
              d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z"
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
