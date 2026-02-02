'use client';

import { useState, useEffect } from 'react';
import { useBrand } from '@/lib/site-context';

interface MobileBookingCTAProps {
  productId: string;
  productName: string;
  priceFormatted: string;
}

export function MobileBookingCTA({ productId, productName, priceFormatted }: MobileBookingCTAProps) {
  const brand = useBrand();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);

  // Track hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const primaryColor = brand?.primaryColor ?? '#0d9488';

  const handleClick = () => {
    // Debug: show alert to verify JS is running
    const newCount = clickCount + 1;
    setClickCount(newCount);
    setIsModalOpen(true);
    alert(`Button clicked! Count: ${newCount}, Hydrated: ${isHydrated}`);
  };

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
            onClick={handleClick}
            className="min-h-[48px] rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm"
            style={{ backgroundColor: primaryColor }}
          >
            {isHydrated ? `Check availability (${clickCount})` : 'Loading...'}
          </button>
        </div>
      </div>

      {/* Spacer for mobile sticky CTA */}
      <div className="h-20 lg:hidden" />

      {/* Simple modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-bold">It Works!</h2>
            <p className="mb-4 text-gray-600">Product: {productName}</p>
            <button
              onClick={() => setIsModalOpen(false)}
              className="w-full rounded-lg bg-gray-900 py-3 text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
