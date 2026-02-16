'use client';

/**
 * Email Collection Popup
 *
 * GDPR-compliant email collection for the Holibob platform prize draw.
 * Shows 5 seconds after page load, excludes checkout/payment/legal pages.
 *
 * Features:
 * - React Portal for proper z-index layering
 * - localStorage persistence (never shows again if dismissed)
 * - Site-branded colors
 * - Separate marketing consent checkbox (not pre-ticked)
 * - Links to Prize Draw Terms and Privacy Policy
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSite, useBrand } from '@/lib/site-context';

const POPUP_DELAY_MS = 5000; // 5 seconds
const POPUP_DISMISSED_KEY = 'holibob_email_popup_dismissed';
const POPUP_SUBMITTED_KEY = 'holibob_email_popup_submitted';

// Pages where popup should not appear
const EXCLUDED_PATHS = [
  '/checkout',
  '/payment',
  '/privacy',
  '/terms',
  '/prize-draw-terms',
  '/unsubscribed',
];

interface EmailPopupProps {
  prizeDrawId?: string;
}

export function EmailPopup({ prizeDrawId }: EmailPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const site = useSite();
  const brand = useBrand();
  const pathname = usePathname();
  const primaryColor = brand?.primaryColor ?? '#6366f1';

  // Check if current page should show popup
  const shouldExcludePage = EXCLUDED_PATHS.some((path) => pathname.startsWith(path));

  // Portal mounting (SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Show popup after delay (if not dismissed/submitted before)
  useEffect(() => {
    if (!mounted || shouldExcludePage) return;

    // Check localStorage for previous dismissal/submission
    const dismissed = localStorage.getItem(POPUP_DISMISSED_KEY);
    const submitted = localStorage.getItem(POPUP_SUBMITTED_KEY);

    if (dismissed || submitted) {
      return; // Don't show popup
    }

    // Show popup after delay
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, POPUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [mounted, shouldExcludePage]);

  // Handle escape key and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleDismiss = useCallback(() => {
    setIsOpen(false);
    localStorage.setItem(POPUP_DISMISSED_KEY, Date.now().toString());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          marketingConsent,
          prizeDrawId,
          consentSource: 'popup',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to subscribe');
      }

      setSuccess(true);
      localStorage.setItem(POPUP_SUBMITTED_KEY, Date.now().toString());

      // Auto-close after success
      setTimeout(() => {
        setIsOpen(false);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Don't render if not mounted or not open
  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleDismiss}
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

        {/* Header with prize icon */}
        <div className="px-6 py-8 text-center text-white" style={{ backgroundColor: primaryColor }}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Win £1,000</h2>
          <p className="mt-2 text-white/90">of experiences in the next 12 months</p>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">You&apos;re entered!</h3>
              <p className="mt-2 text-sm text-gray-600">
                Good luck! We&apos;ll notify you if you win.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-center text-sm text-gray-600">
                Enter your email for a chance to win. Winner drawn soon!
              </p>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
              )}

              <div>
                <label htmlFor="popup-email" className="sr-only">
                  Email address
                </label>
                <input
                  type="email"
                  id="popup-email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2"
                  style={
                    {
                      '--tw-ring-color': primaryColor,
                    } as React.CSSProperties
                  }
                />
              </div>

              {/* Marketing consent checkbox - NOT pre-ticked (GDPR requirement) */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="popup-marketing-consent"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                  style={{ accentColor: primaryColor }}
                />
                <label htmlFor="popup-marketing-consent" className="text-sm text-gray-600">
                  I&apos;d like to receive exclusive offers, travel inspiration, and experience
                  recommendations from Holibob. You can unsubscribe at any time.
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {isSubmitting ? 'Entering...' : 'Enter Prize Draw'}
              </button>

              {/* Legal links */}
              <p className="text-center text-xs text-gray-500">
                By entering, you agree to Holibob&apos;s{' '}
                <Link href="/prize-draw-terms" className="underline hover:text-gray-700">
                  Prize Draw Terms
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="underline hover:text-gray-700">
                  Privacy Policy
                </Link>
                .
              </p>

              {/* Powered by Holibob */}
              <p className="text-center text-xs text-gray-400">Powered by Holibob</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
