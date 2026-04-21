'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { trackHolibob, isNewSession } from '@/lib/holibob-analytics';

/**
 * Fires session_start (once per session) and page_view (every route change)
 * to the Holibob analytics pipeline. Mirrors the GoogleAnalytics component pattern.
 */
export function HolibobAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionStartFired = useRef(false);

  useEffect(() => {
    const page = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');

    // Fire session_start exactly once per browser session
    if (!sessionStartFired.current && isNewSession()) {
      trackHolibob('session_start', { page });
      sessionStartFired.current = true;
    }

    // Fire page_view on every route change
    trackHolibob('page_view', { page });
  }, [pathname, searchParams]);

  return null;
}
