/**
 * Google Analytics 4 event tracking utilities.
 *
 * All helpers are safe to call even when GA is not loaded (e.g. in dev or tests).
 * Event names follow GA4 recommended event naming:
 * https://developers.google.com/analytics/devguides/collection/ga4/reference/events
 */

// Extend window with gtag
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function sendEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

// ─── Search Events ──────────────────────────────────────────────────────────

export function trackSearch(searchTerm: string, destination?: string) {
  sendEvent('search', {
    search_term: searchTerm,
    ...(destination && { destination }),
  });
}

// ─── E-commerce / Booking Events (GA4 recommended) ─────────────────────────

export function trackViewItem(item: {
  id: string;
  name: string;
  price?: number;
  currency?: string;
}) {
  sendEvent('view_item', {
    items: [
      {
        item_id: item.id,
        item_name: item.name,
        price: item.price,
        currency: item.currency ?? 'GBP',
      },
    ],
  });
}

export function trackBeginCheckout(booking: {
  id: string;
  value?: number;
  currency?: string;
  itemName?: string;
}) {
  sendEvent('begin_checkout', {
    transaction_id: booking.id,
    value: booking.value,
    currency: booking.currency ?? 'GBP',
    items: booking.itemName
      ? [{ item_name: booking.itemName }]
      : [],
  });
}

export function trackAddPaymentInfo(booking: {
  id: string;
  value?: number;
  currency?: string;
}) {
  sendEvent('add_payment_info', {
    transaction_id: booking.id,
    value: booking.value,
    currency: booking.currency ?? 'GBP',
    payment_type: 'stripe',
  });
}

export function trackPurchase(booking: {
  id: string;
  value?: number;
  currency?: string;
  itemName?: string;
}) {
  sendEvent('purchase', {
    transaction_id: booking.id,
    value: booking.value,
    currency: booking.currency ?? 'GBP',
    items: booking.itemName
      ? [{ item_name: booking.itemName }]
      : [],
  });
}

// ─── Content Interaction Events ─────────────────────────────────────────────

export function trackSelectContent(contentType: string, itemId: string) {
  sendEvent('select_content', {
    content_type: contentType,
    item_id: itemId,
  });
}

export function trackSelectCategory(categoryName: string) {
  sendEvent('select_content', {
    content_type: 'category',
    item_id: categoryName,
  });
}

export function trackSelectDestination(destinationName: string) {
  sendEvent('select_content', {
    content_type: 'destination',
    item_id: destinationName,
  });
}
