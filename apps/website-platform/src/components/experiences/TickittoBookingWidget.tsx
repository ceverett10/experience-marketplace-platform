'use client';

import { useState, useEffect } from 'react';
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

  async function loadWidget() {
    if (widgetUrl) {
      setIsWidgetOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
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

      {/* Tickitto Widget Modal */}
      {isWidgetOpen && widgetUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative h-[90vh] w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            {/* Close button */}
            <button
              onClick={() => setIsWidgetOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg hover:bg-gray-100"
            >
              <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Widget iframe */}
            <iframe
              src={widgetUrl}
              className="h-full w-full rounded-2xl"
              title="Select tickets"
              allow="payment"
            />
          </div>
        </div>
      )}
    </div>
  );
}
