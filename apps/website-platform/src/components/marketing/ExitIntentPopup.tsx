'use client';

/**
 * Exit-Intent Popup
 *
 * Detects when the user moves their mouse toward the browser's address bar
 * (leaving the page) and shows either:
 * - A quick feedback survey (PPC visitors on /experiences or experience detail pages)
 * - Trust signals + CTA (organic visitors on experience detail pages)
 *
 * Session-scoped (sessionStorage) — only shows once per visit.
 *
 * Shows on:
 * - Experience list page when visitor came from a paid ad (PPC)
 * - Experience detail pages (all visitors)
 * - Homepage when visitor came from a paid ad (PPC)
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useBrand } from '@/lib/site-context';

const EXIT_SHOWN_KEY = 'holibob_exit_popup_shown';

const FEEDBACK_OPTIONS = [
  { id: 'JUST_BROWSING', label: 'Just browsing, not ready to book' },
  { id: 'TOO_EXPENSIVE', label: 'Prices are too high' },
  { id: 'WRONG_DESTINATION', label: "Didn't find what I was looking for" },
  { id: 'DATES_UNAVAILABLE', label: 'My dates aren\u2019t available' },
  { id: 'NEED_MORE_INFO', label: 'Need more info before deciding' },
  { id: 'DONT_TRUST_SITE', label: 'Not sure I trust this site' },
] as const;

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

function sendFeedback(reason: string, comment: string | undefined) {
  fetch('/api/exit-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason,
      comment: comment || undefined,
      landingPage: window.location.pathname,
    }),
    keepalive: true,
  }).catch(() => {});
}

export function ExitIntentPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isPpc, setIsPpc] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const brand = useBrand();
  const pathname = usePathname();
  const primaryColor = brand?.primaryColor ?? '#0d9488';

  const isExperiencePage = pathname.startsWith('/experiences/') && pathname !== '/experiences';
  const isExperiencesList = pathname === '/experiences';
  const isHomepage = pathname === '/';

  useEffect(() => {
    setMounted(true);
    if (isPpcFromCookie()) {
      setIsPpc(true);
    }
  }, []);

  // PPC visitors: show on homepage, experiences list, and experience detail pages
  // Organic visitors: show on experience detail pages only
  const shouldShowPopup = isPpc
    ? isHomepage || isExperiencesList || isExperiencePage
    : isExperiencePage;

  // PPC visitors get the feedback survey; organic visitors get trust signals
  const showFeedbackSurvey = isPpc;

  const handleMouseLeave = useCallback((e: MouseEvent) => {
    if (e.clientY > 10) return;
    if (sessionStorage.getItem(EXIT_SHOWN_KEY)) return;

    sessionStorage.setItem(EXIT_SHOWN_KEY, 'true');
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!mounted || !shouldShowPopup) return;

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

  const handleSubmitFeedback = () => {
    if (!selectedReason) return;
    sendFeedback(selectedReason, comment || undefined);
    setSubmitted(true);
    setTimeout(() => setIsOpen(false), 1500);
  };

  if (!mounted || !isOpen) return null;

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

        {showFeedbackSurvey ? (
          // ── PPC Feedback Survey ──
          submitted ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-8 w-8 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">Thanks for your feedback!</p>
              <p className="mt-1 text-sm text-gray-500">It helps us improve.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div
                className="px-6 py-6 text-center text-white"
                style={{ backgroundColor: primaryColor }}
              >
                <h2 className="text-xl font-bold">Quick question before you go</h2>
                <p className="mt-1 text-sm text-white/90">What stopped you from booking today?</p>
              </div>

              {/* Options */}
              <div className="px-6 py-5">
                <div className="space-y-2">
                  {FEEDBACK_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setSelectedReason(option.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                        selectedReason === option.id
                          ? 'border-current bg-opacity-10 font-medium'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      style={
                        selectedReason === option.id
                          ? {
                              borderColor: primaryColor,
                              color: primaryColor,
                              backgroundColor: `${primaryColor}10`,
                            }
                          : undefined
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {selectedReason && (
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Any other feedback? (optional)"
                    className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300"
                    rows={2}
                    maxLength={500}
                  />
                )}

                <button
                  onClick={handleSubmitFeedback}
                  disabled={!selectedReason}
                  className="mt-4 w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: primaryColor }}
                >
                  Submit feedback
                </button>

                <button
                  onClick={handleClose}
                  className="mt-2 w-full py-2 text-xs text-gray-400 hover:text-gray-500"
                >
                  No thanks
                </button>
              </div>
            </>
          )
        ) : (
          // ── Organic Trust Signals (existing behavior) ──
          <>
            {/* Header */}
            <div
              className="px-6 py-8 text-center text-white"
              style={{ backgroundColor: primaryColor }}
            >
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
              <h2 className="text-2xl font-bold">Still deciding?</h2>
              <p className="mt-2 text-white/90">Don&apos;t miss out on this experience</p>
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
                    <p className="text-xs text-gray-500">
                      Secure your spot with no upfront payment
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
                    <p className="text-sm font-semibold text-gray-900">
                      Free cancellation available
                    </p>
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

              <button
                onClick={handleClose}
                className="mt-6 w-full rounded-xl py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                Continue browsing
              </button>

              <p className="mt-3 text-center text-xs text-gray-400">
                Availability is limited and prices may change
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
