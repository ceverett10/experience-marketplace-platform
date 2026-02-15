'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBrand } from '@/lib/site-context';
import type { Experience } from '@/lib/holibob';

interface TickittoBookingWidgetProps {
  eventId: string;
  experience: Experience;
}

export function TickittoBookingWidget({ eventId, experience }: TickittoBookingWidgetProps) {
  const brand = useBrand();
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryColor = brand?.primaryColor ?? '#0d9488';

  // Listen for postMessage events from the Tickitto widget
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Only accept messages from Tickitto domains
      if (!event.origin.includes('tickitto.tech') && !event.origin.includes('tickitto.com')) {
        return;
      }

      const data = event.data;
      if (typeof data === 'object' && data !== null) {
        // Handle widget events (close, complete, resize, etc.)
        if (data.type === 'tickitto:close' || data.action === 'close') {
          setIsWidgetOpen(false);
          setWidgetUrl(null);
        }
        if (data.type === 'tickitto:complete' || data.action === 'complete') {
          setIsWidgetOpen(false);
          setWidgetUrl(null);
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isWidgetOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isWidgetOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isWidgetOpen) {
        setIsWidgetOpen(false);
        setWidgetUrl(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWidgetOpen]);

  async function loadWidget() {
    setIsLoading(true);
    setError(null);

    try {
      // Always fetch a fresh session - Tickitto sessions expire after ~5 minutes
      const response = await fetch(`/api/tickitto-availability?eventId=${encodeURIComponent(eventId)}`);
      const data = await response.json();

      if (data.success && data.data?.widgetUrl) {
        setWidgetUrl(data.data.widgetUrl);
        setIsWidgetOpen(true);
      } else {
        setError(data.error ?? 'Failed to load ticket selection');
      }
    } catch (err) {
      setError('Failed to load ticket selection');
      console.error('[TickittoBookingWidget] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-xl">
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

        {/* CTA Button */}
        <button
          onClick={loadWidget}
          disabled={isLoading}
          className="w-full rounded-xl px-6 py-4 text-lg font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading tickets...
            </span>
          ) : (
            'Select tickets'
          )}
        </button>

        {error && (
          <p className="mt-3 text-center text-sm text-red-600">{error}</p>
        )}

        {/* Event info badges */}
        <div className="mt-4 space-y-2">
          {experience.cancellationPolicy && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg
                className="h-4 w-4 flex-shrink-0 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                />
              </svg>
              <span>{experience.cancellationPolicy}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg
              className="h-4 w-4 flex-shrink-0 text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Instant confirmation</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg
              className="h-4 w-4 flex-shrink-0 text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>E-ticket delivery</span>
          </div>
        </div>
      </div>

      {/* Tickitto Widget - Full page below header */}
      {isWidgetOpen && widgetUrl && (
        <div className="fixed inset-x-0 bottom-0 top-[100px] sm:top-[73px] z-40 bg-white">
          {/* Close button - floating top-right */}
          <button
            onClick={() => { setIsWidgetOpen(false); setWidgetUrl(null); }}
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 shadow-md hover:bg-gray-200 transition-colors"
            aria-label="Close ticket selection"
          >
            <svg className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Widget iframe - fills space below header */}
          <iframe
            src={widgetUrl}
            className="h-full w-full border-0"
            title="Select tickets"
            allow="payment; clipboard-write; encrypted-media"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}
    </div>
  );
}
