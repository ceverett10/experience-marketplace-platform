'use client';

import { useState } from 'react';
import { useBrand } from '@/lib/site-context';
import type { Experience } from '@/lib/holibob';
import type { BookingStats } from '@/lib/booking-analytics';
import { AvailabilityModal } from './AvailabilityModal';
import { PriceDisplay } from '@/components/ui/PriceDisplay';
import { getProductPricingConfig } from '@/lib/pricing';

interface BookingWidgetProps {
  experience: Experience;
  /** Booking statistics for urgency messaging */
  bookingStats?: BookingStats;
}

export function BookingWidget({ experience, bookingStats }: BookingWidgetProps) {
  const brand = useBrand();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Check for free cancellation
  const hasFreeCancellation =
    experience.cancellationPolicy?.toLowerCase().includes('free') ||
    experience.cancellationPolicy?.toLowerCase().includes('full refund');

  // Show urgency badge based on real booking data or review count
  const isPopular =
    bookingStats?.isHighDemand ||
    bookingStats?.isTrending ||
    (experience.rating && experience.rating.count > 10);

  // Show booking count if significant (3+ bookings this week)
  const showBookingCount = bookingStats && bookingStats.bookingsThisWeek >= 3;

  const primaryColor = brand?.primaryColor ?? '#0d9488'; // teal-600
  const pricingConfig = getProductPricingConfig(experience.id);

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
          <PriceDisplay
            priceFormatted={experience.price.formatted}
            priceAmount={experience.price.amount}
            currency={experience.price.currency}
            pricingConfig={pricingConfig}
            variant="detail"
            primaryColor={primaryColor}
            showFrom={false}
          />
          {/* Social proof: Booking count */}
          {showBookingCount && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
              <svg className="h-4 w-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
              </svg>
              Booked {bookingStats!.bookingsThisWeek} times this week
            </p>
          )}
        </div>

        {/* Book Button */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full rounded-xl py-4 text-base font-semibold text-white transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={
            {
              backgroundColor: primaryColor,
              '--tw-ring-color': primaryColor,
            } as React.CSSProperties
          }
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
                <p className="text-xs text-gray-500">
                  Cancel up to 24 hours before the activity for a full refund
                </p>
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

          {/* Best Price Guarantee */}
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold text-gray-900">Best price guarantee</p>
              <p className="text-xs text-gray-500">
                Find it cheaper? We&apos;ll match the price
              </p>
            </div>
          </div>
        </div>

        {/* Secured by Stripe */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Payments secured by Stripe
        </div>

        {/* Duration & Language Quick Info */}
        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{experience.duration.formatted}</span>
          </div>
          {experience.languages && experience.languages.length > 0 && (
            <div className="flex items-center gap-1.5">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
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
