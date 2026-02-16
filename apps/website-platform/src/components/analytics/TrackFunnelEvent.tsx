'use client';

import { useEffect } from 'react';

interface TrackFunnelEventProps {
  step: 'LANDING_PAGE_VIEW' | 'EXPERIENCE_CLICKED';
  productId?: string;
}

/**
 * Invisible component that fires a booking funnel event on mount.
 * Use on server-rendered pages to track top-of-funnel events.
 */
export function TrackFunnelEvent({ step, productId }: TrackFunnelEventProps) {
  useEffect(() => {
    fetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step,
        productId,
        landingPage: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {
      // Tracking failure is non-critical
    });
  }, [step, productId]);

  return null;
}
