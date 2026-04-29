'use client';

import Image from 'next/image';
import { PoweredByHolibob } from '@/components/ui/PoweredByHolibob';

interface BookingSummaryPanelProps {
  productName: string;
  productImage?: string;
  selectedDate?: string | null;
  selectedOptions?: Array<{ label: string; value: string }>;
  totalGuests?: number;
  primaryColor?: string;
  /** From experience.hasFreeCancellation — controls whether the
      "Free cancellation" trust row is rendered. Defaults to false so we
      never claim free cancellation for products that don't offer it. */
  hasFreeCancellation?: boolean;
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function BookingSummaryPanel({
  productName,
  productImage,
  selectedDate,
  selectedOptions,
  totalGuests,
  primaryColor = '#0d9488',
  hasFreeCancellation = false,
}: BookingSummaryPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Product image */}
      {productImage && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl">
          <Image
            src={productImage}
            alt={productName}
            fill
            className="object-cover"
            sizes="300px"
            unoptimized
          />
        </div>
      )}

      <h3 className="mt-3 text-sm font-semibold text-gray-900 line-clamp-2">{productName}</h3>

      {/* Selection summary */}
      <div className="mt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Your Selection
        </p>

        {selectedDate ? (
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              style={{ color: primaryColor }}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
              />
            </svg>
            <span className="text-sm text-gray-700">{formatDisplayDate(selectedDate)}</span>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No date selected yet</p>
        )}

        {selectedOptions && selectedOptions.length > 0 && (
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              style={{ color: primaryColor }}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
              />
            </svg>
            <div className="text-sm text-gray-700">
              {selectedOptions.map((opt, i) => (
                <p key={i}>{opt.value}</p>
              ))}
            </div>
          </div>
        )}

        {totalGuests != null && totalGuests > 0 && (
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              style={{ color: primaryColor }}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
              />
            </svg>
            <span className="text-sm text-gray-700">
              {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
            </span>
          </div>
        )}
      </div>

      {/* Trust signals — labelled "Includes" section, sitting tightly under
          "Your selection" so the visual weight stays at the top of the panel
          and the Powered-by mark gets the empty space below. */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Includes</p>
        <ul className="space-y-1.5">
          {[
            // Product-level: only render when the API confirms it. We never
            // fabricate free cancellation for products that don't offer it.
            ...(hasFreeCancellation ? ['Free cancellation'] : []),
            // Platform-level — true for every booking on the platform:
            'Instant confirmation',
            'Secure payments',
            'Best price guarantee',
            '24/7 support',
          ].map((signal) => (
            <li key={signal} className="flex items-center gap-2 text-xs text-gray-700">
              <svg
                className="h-3 w-3 flex-shrink-0 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {signal}
            </li>
          ))}
        </ul>
      </div>

      {/* Powered-by mark anchored to the bottom of the panel — uses mt-auto
          to absorb any extra vertical space below the trust list. */}
      <div className="mt-auto pt-6 flex justify-center">
        <PoweredByHolibob variant="widget" />
      </div>
    </div>
  );
}
