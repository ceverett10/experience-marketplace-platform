'use client';

import { useState } from 'react';
import { useBrand } from '@/lib/site-context';
import { AvailabilityModal } from './AvailabilityModal';

interface MobileBookingCTAProps {
  productId: string;
  productName: string;
  priceFormatted: string;
}

export function MobileBookingCTA({
  productId,
  productName,
  priceFormatted,
}: MobileBookingCTAProps) {
  const brand = useBrand();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const primaryColor = brand?.primaryColor ?? '#0d9488';

  return (
    <>
      {/* Mobile Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] lg:hidden">
        <div className="flex items-center justify-between">
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
