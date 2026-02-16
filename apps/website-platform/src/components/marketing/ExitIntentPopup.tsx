'use client';

/**
 * Exit-Intent Popup
 *
 * Detects when the user moves their mouse toward the browser's address bar
 * (leaving the page) and shows a time-limited incentive to complete booking.
 * Session-scoped (sessionStorage) — only shows once per visit.
 *
 * Shows on:
 * - Experience detail pages (all visitors)
 * - Homepage when visitor came from a paid ad (PPC)
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useBrand } from '@/lib/site-context';

const EXIT_SHOWN_KEY = 'holibob_exit_popup_shown';

/**
 * Detect PPC traffic from the utm_params cookie (set by middleware)
 */
function isPpcFromCookie(): boolean {
  try {
    const match = document.cookie.match(/(?:^|;\s*)utm_params=([^;]*)/);
    if (!match?.[1]) return false;
    const utm = JSON.parse(decodeURIComponent(match[1]));
    return !!(utm.gclid || utm.fbclid || utm.medium === 'cpc');
  } catch {
    return false;
  }
}

export function ExitIntentPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isHomepagePpc, setIsHomepagePpc] = useState(false);
  const brand = useBrand();
  const pathname = usePathname();
  const primaryColor = brand?.primaryColor ?? '#0d9488';

  // Experience detail page — all visitors
  const isExperiencePage = pathname.startsWith('/experiences/') && pathname !== '/experiences';
  // Homepage — PPC visitors only
  const isHomepage = pathname === '/';

  useEffect(() => {
    setMounted(true);
    // Check PPC status client-side from cookie
    if (isHomepage && isPpcFromCookie()) {
      setIsHomepagePpc(true);
    }
  }, [isHomepage]);

  const shouldShowPopup = isExperiencePage || isHomepagePpc;

  const handleMouseLeave = useCallback((e: MouseEvent) => {
    // Only trigger when mouse moves toward the top of the viewport (address bar)
    if (e.clientY > 10) return;

    // Check sessionStorage — only show once per session
    if (sessionStorage.getItem(EXIT_SHOWN_KEY)) return;

    sessionStorage.setItem(EXIT_SHOWN_KEY, 'true');
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!mounted || !shouldShowPopup) return;

    // Delay adding the listener so it doesn't fire immediately
    const timer = setTimeout(() => {
      document.addEventListener('mouseleave', handleMouseLeave);
    }, 5000);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [mounted, shouldShowPopup, handleMouseLeave]);

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!mounted || !isOpen) return null;

  // Adjust copy for homepage PPC vs experience detail page
  const headerTitle = isHomepagePpc
    ? 'Wait — check out these experiences!'
    : 'Still deciding?';
  const headerSubtitle = isHomepagePpc
    ? 'Don\u2019t leave without browsing our top-rated experiences'
    : 'Don\u2019t miss out on this experience';
  const ctaText = isHomepagePpc ? 'Browse Experiences' : 'Continue browsing';
  const ctaHref = isHomepagePpc ? '/experiences' : undefined;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="px-6 py-8 text-center text-white" style={{ backgroundColor: primaryColor }}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <svg
              className="h-8 w-8"
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
          </div>
          <h2 className="text-2xl font-bold">{headerTitle}</h2>
          <p className="mt-2 text-white/90">{headerSubtitle}</p>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="space-y-4">
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
                <p className="text-sm font-semibold text-gray-900">
                  Reserve now, pay nothing today
                </p>
                <p className="text-xs text-gray-500">Secure your spot with no upfront payment</p>
              </div>
            </div>

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
                <p className="text-sm font-semibold text-gray-900">Free cancellation available</p>
                <p className="text-xs text-gray-500">
                  Change of plans? Cancel for free up to 24 hours before
                </p>
              </div>
            </div>

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
                <p className="text-sm font-semibold text-gray-900">Best price guarantee</p>
                <p className="text-xs text-gray-500">
                  Find it cheaper elsewhere? We&apos;ll match it
                </p>
              </div>
            </div>
          </div>

          {ctaHref ? (
            <a
              href={ctaHref}
              className="mt-6 block w-full rounded-xl py-3.5 text-center text-base font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              {ctaText}
            </a>
          ) : (
            <button
              onClick={handleClose}
              className="mt-6 w-full rounded-xl py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              {ctaText}
            </button>
          )}

          <p className="mt-3 text-center text-xs text-gray-400">
            Availability is limited and prices may change
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
