'use client';

import { useState } from 'react';
import { useBrand } from '@/lib/site-context';
import type { Experience } from '@/lib/holibob';
import { AvailabilityModal } from './AvailabilityModal';

interface BookingWidgetProps {
  experience: Experience;
}

export function BookingWidget({ experience }: BookingWidgetProps) {
  const brand = useBrand();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Check for free cancellation
  const hasFreeCancellation =
    experience.cancellationPolicy?.toLowerCase().includes('free') ||
    experience.cancellationPolicy?.toLowerCase().includes('full refund');

  // Simulate "likely to sell out" based on rating
  const isPopular = experience.rating && experience.rating.count > 50;

  const primaryColor = brand?.primaryColor ?? '#0d9488'; // teal-600

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-xl">
      {/* Popular Badge */}
      {isPopular && (
        <div className="rounded-t-2xl bg-rose-500 px-4 py-2 text-center text-sm font-semibold text-white">
          🔥 Likely to sell out
        </div>
      )}

      <div className="p-6">
        {/* Price Section */}
        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-gray-500">From</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: primaryColor }}>
              {experience.price.formatted}
            </span>
            <span className="text-gray-500">per person</span>
          </div>
        </div>

        {/* Book Button */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full rounded-xl py-4 text-base font-semibold text-white transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            backgroundColor: primaryColor,
            '--tw-ring-color': primaryColor,
          } as React.CSSProperties}
        >
          Check availability
        </button>

        {/* Trust Signals */}
        <div className="mt-6 space-y-3">
          {/* Free Cancellation */}
          {hasFreeCancellation && (
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="text-sm font-semibold text-gray-900">Free cancellation</p>
                <p className="text-xs text-gray-500">Cancel up to 24 hours in advance for a full refund</p>
              </div>
            </div>
          )}

          {/* Reserve Now Pay Later */}
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold text-gray-900">Reserve now & pay later</p>
              <p className="text-xs text-gray-500">
                Keep your travel plans flexible — book your spot and pay nothing today
              </p>
            </div>
          </div>
        </div>

        {/* Duration & Language Quick Info */}
        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{experience.duration.formatted}</span>
          </div>
          {experience.languages && experience.languages.length > 0 && (
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"
                />
              </svg>
              <span>{experience.languages[0]}</span>
            </div>
          )}
        </div>
      </div>

      {/* Availability Selection Modal */}
      <AvailabilityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        productId={experience.id}
        productName={experience.title}
        primaryColor={primaryColor}
      />
    </div>
  );
}
