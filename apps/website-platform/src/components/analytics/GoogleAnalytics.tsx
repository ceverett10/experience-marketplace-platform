'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

interface GoogleAnalyticsProps {
  measurementId: string | null | undefined;
  googleAdsId?: string | null; // e.g., 'AW-XXXXXXXXX' for conversion tracking
}

/**
 * Google Analytics 4 + Google Ads SPA route change tracking.
 * The gtag.js script is loaded server-side in layout.tsx <head> for
 * tag verification compatibility. This component only handles
 * client-side navigation page view tracking.
 */
export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track page views on route changes (SPA navigation)
  useEffect(() => {
    if (!measurementId || !window.gtag) return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    window.gtag('config', measurementId, {
      page_path: url,
    });

    // Track AI referral source if present (set by middleware from referer header)
    const aiSource = document.cookie
      .split('; ')
      .find((c) => c.startsWith('ai_referral_source='))
      ?.split('=')[1];
    if (aiSource) {
      window.gtag('event', 'ai_referral', {
        ai_source: aiSource,
        page_path: url,
      });
    }
  }, [pathname, searchParams, measurementId]);

  // No rendering needed — gtag.js is loaded in layout.tsx <head>
  return null;
}
