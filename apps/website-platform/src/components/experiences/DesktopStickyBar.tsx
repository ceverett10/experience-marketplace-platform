'use client';

/**
 * Desktop Sticky Booking Bar
 *
 * Appears at the top of the page when the BookingWidget scrolls out of view.
 * Shows price + CTA button to encourage booking. Hidden on mobile (MobileBookingCTA handles that).
 */

import { useState, useEffect } from 'react';
import { useBrand } from '@/lib/site-context';
import { PriceDisplay } from '@/components/ui/PriceDisplay';
import { getProductPricingConfig } from '@/lib/pricing';
import { AvailabilityModal } from './AvailabilityModal';

interface DesktopStickyBarProps {
  productId: string;
  productName: string;
  priceFormatted: string;
  priceAmount: number;
  priceCurrency: string;
}

export function DesktopStickyBar({
  productId,
  productName,
  priceFormatted,
  priceAmount,
  priceCurrency,
}: DesktopStickyBarProps) {
  const brand = useBrand();
  const [isVisible, setIsVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const primaryColor = brand?.primaryColor ?? '#0d9488';
  const pricingConfig = getProductPricingConfig(productId);

  useEffect(() => {
    const handleScroll = () => {
      // Show bar when user scrolls past ~600px (roughly past the booking widget on desktop)
      setIsVisible(window.scrollY > 600);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <div
        className={`fixed left-0 right-0 top-0 z-40 hidden border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur transition-transform duration-300 supports-[backdrop-filter]:bg-white/80 lg:block ${
          isVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ top: 'var(--header-height, 105px)' }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <h2 className="max-w-md truncate text-sm font-semibold text-gray-900">
              {productName}
            </h2>
            <PriceDisplay
              priceFormatted={priceFormatted}
              priceAmount={priceAmount}
              currency={priceCurrency}
              pricingConfig={pricingConfig}
              variant="compact"
              primaryColor={primaryColor}
            />
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Check availability
          </button>
        </div>
      </div>

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
