'use client';

/**
 * GDPR Cookie Consent Banner
 *
 * Shows a non-intrusive banner at the bottom of the screen.
 * Persists consent in localStorage so it only shows once.
 */

import { useState, useEffect } from 'react';
import { useBrand } from '@/lib/site-context';

const CONSENT_KEY = 'holibob_cookie_consent';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const brand = useBrand();
  const primaryColor = brand?.primaryColor ?? '#0d9488';

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9998] border-t border-gray-200 bg-white p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.1)] sm:p-6">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-700">
            We use cookies to enhance your browsing experience, analyse site traffic, and personalise content.
            By clicking &quot;Accept&quot;, you consent to our use of cookies.{' '}
            <a href="/privacy" className="font-medium underline hover:text-gray-900">
              Privacy Policy
            </a>
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <button
            onClick={handleDecline}
            className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:px-4 sm:py-2"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="rounded-lg px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:px-4 sm:py-2"
            style={{ backgroundColor: primaryColor }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
