'use client';

import Script from 'next/script';

interface GoogleAnalyticsProps {
  measurementId: string | null | undefined;
}

/**
 * Google Analytics 4 component for tracking page views and user behavior
 * Only renders if a valid measurement ID is provided
 */
export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  // Don't render anything if no measurement ID is provided
  if (!measurementId) {
    return null;
  }

  return (
    <>
      {/* Google Analytics Script */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            page_path: window.location.pathname,
            send_page_view: true
          });
        `}
      </Script>
    </>
  );
}
