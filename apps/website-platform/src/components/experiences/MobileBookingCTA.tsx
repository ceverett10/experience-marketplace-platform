'use client';

import { useState } from 'react';
import { useBrand } from '@/lib/site-context';
import type { BookingStats } from '@/lib/booking-analytics';
import { AvailabilityModal } from './AvailabilityModal';

interface MobileBookingCTAProps {
  productId: string;
  productName: string;
  priceFormatted: string;
  /** Booking statistics for urgency messaging */
  bookingStats?: BookingStats;
}

export function MobileBookingCTA({
  productId,
  productName,
  priceFormatted,
  bookingStats,
}: MobileBookingCTAProps) {
  const brand = useBrand();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const primaryColor = brand?.primaryColor ?? '#0d9488';

  // Show urgency banner for high-demand experiences
  const showUrgencyBanner = bookingStats?.isHighDemand || bookingStats?.isTrending;

  return (
    <>
      {/* Mobile Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] lg:hidden">
        {/* Urgency banner for high-demand experiences */}
        {showUrgencyBanner && (
          <div className="flex items-center justify-center gap-1.5 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-800">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
                clipRule="evenodd"
              />
            </svg>
            High demand - book soon to secure your spot
          </div>
        )}
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-gray-500">From</p>
            <p className="text-xl font-bold text-gray-900">{priceFormatted}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="min-h-[48px] rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity active:opacity-80"
            style={{ backgroundColor: primaryColor }}
          >
            Reserve now - Free cancellation
          </button>
        </div>
      </div>

      {/* Spacer for mobile sticky CTA */}
      <div className="h-20 lg:hidden" />

      {/* Availability Modal - uses createPortal internally */}
      <AvailabilityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        productId={productId}
        productName={productName}
        primaryColor={primaryColor}
      />
    </>
  );
}
