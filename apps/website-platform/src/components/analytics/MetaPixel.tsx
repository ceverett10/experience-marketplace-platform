'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Extend window with Meta Pixel
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

interface MetaPixelProps {
  pixelId: string | null | undefined;
}

/**
 * Meta (Facebook) Pixel component with SPA route change tracking.
 * Fires PageView on initial load and client-side navigation.
 *
 * Standard events (ViewContent, InitiateCheckout, Purchase) are fired
 * via the helper functions exported from this module.
 */
export function MetaPixel({ pixelId }: MetaPixelProps) {
  const pathname = usePathname();

  // Track page views on route changes (SPA navigation)
  useEffect(() => {
    if (!pixelId || !window.fbq) return;
    window.fbq('track', 'PageView');
  }, [pathname, pixelId]);

  if (!pixelId) {
    return null;
  }

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');
      `}
    </Script>
  );
}

// ─── Meta Pixel Event Helpers ──────────────────────────────────────────────

function sendMetaEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', eventName, params);
  }
}

export function trackMetaViewContent(item: {
  id: string;
  name: string;
  value?: number;
  currency?: string;
}) {
  sendMetaEvent('ViewContent', {
    content_ids: [item.id],
    content_name: item.name,
    content_type: 'product',
    value: item.value,
    currency: item.currency ?? 'GBP',
  });
}

export function trackMetaInitiateCheckout(booking: {
  id: string;
  value?: number;
  currency?: string;
}) {
  sendMetaEvent('InitiateCheckout', {
    content_ids: [booking.id],
    value: booking.value,
    currency: booking.currency ?? 'GBP',
    num_items: 1,
  });
}

export function trackMetaAddPaymentInfo(booking: {
  id: string;
  value?: number;
  currency?: string;
}) {
  sendMetaEvent('AddPaymentInfo', {
    content_ids: [booking.id],
    value: booking.value,
    currency: booking.currency ?? 'GBP',
  });
}

export function trackMetaPurchase(booking: {
  id: string;
  value?: number;
  currency?: string;
}) {
  sendMetaEvent('Purchase', {
    content_ids: [booking.id],
    value: booking.value,
    currency: booking.currency ?? 'GBP',
    content_type: 'product',
  });
}
