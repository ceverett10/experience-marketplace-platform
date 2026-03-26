'use client';

import { useEffect } from 'react';
import { trackPurchase, trackGoogleAdsConversion } from '@/lib/analytics';
import { trackMetaPurchase } from '@/components/analytics/MetaPixel';

interface ConfirmationTrackingProps {
  bookingId: string;
  transactionId: string; // booking.code (e.g. EC6867) or UUID fallback
  value: number;
  currency: string;
  itemName?: string;
  itemId?: string; // Holibob product ID
  commissionAmount?: number; // gross - net, used as Google Ads conversion value
  googleAdsConversionLabel?: string | null;
}

/**
 * Fires GA4 purchase + Meta Pixel Purchase + Google Ads conversion on
 * the confirmation page — the industry-standard place to fire these events.
 *
 * Uses sessionStorage deduplication so refreshing the confirmation page
 * does not double-count the purchase.
 */
export function ConfirmationTracking({
  bookingId,
  transactionId,
  value,
  currency,
  itemName,
  itemId,
  commissionAmount,
  googleAdsConversionLabel,
}: ConfirmationTrackingProps) {
  useEffect(() => {
    const dedupKey = `purchase_tracked_${bookingId}`;
    if (sessionStorage.getItem(dedupKey)) return;
    sessionStorage.setItem(dedupKey, '1');

    // GA4 ecommerce purchase event
    trackPurchase({ id: transactionId, value, currency, itemName, itemId });

    // Meta Pixel purchase (client-side, deduped server-side via CAPI event_id = bookingId)
    trackMetaPurchase({ id: transactionId, value, currency });

    // Google Ads conversion — use commission as value for accurate ROAS; fall back to gross
    if (googleAdsConversionLabel) {
      trackGoogleAdsConversion(googleAdsConversionLabel, {
        id: transactionId,
        value: commissionAmount ?? value,
        currency,
      });
    }
  }, [
    bookingId,
    transactionId,
    value,
    currency,
    itemName,
    itemId,
    commissionAmount,
    googleAdsConversionLabel,
  ]);

  return null;
}
