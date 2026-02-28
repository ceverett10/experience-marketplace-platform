'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

interface GoogleAnalyticsProps {
  measurementId: string | null | undefined;
  googleAdsId?: string | null; // e.g., 'AW-XXXXXXXXX' for conversion tracking
}

/**
 * Google Analytics 4 + Google Ads tag component with SPA route change tracking.
 * Tracks page views on both initial load and client-side navigation.
 * Loads gtag.js when either measurementId or googleAdsId is provided.
 */
export function GoogleAnalytics({ measurementId, googleAdsId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The primary tag ID used to load gtag.js — prefer GA4 measurement ID, fall back to Google Ads ID
  const primaryTagId = measurementId || googleAdsId;

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

  if (!primaryTagId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${primaryTagId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          ${measurementId ? `gtag('config', '${measurementId}', { page_path: window.location.pathname, send_page_view: true });` : ''}
          ${googleAdsId ? `gtag('config', '${googleAdsId}');` : ''}
        `}
      </Script>
    </>
  );
}
