/**
 * Client-side funnel tracking.
 *
 * Wraps a fire-and-forget POST to /api/funnel-event so client components
 * can record errors that never reach an API route (Stripe-side failures,
 * fetch network errors, recovery exceptions, etc.) without blocking on
 * the response.
 */

import { BookingFunnelStep } from '@prisma/client';

export { BookingFunnelStep };

interface ClientFunnelEventParams {
  step: BookingFunnelStep;
  productId?: string;
  bookingId?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  landingPage?: string;
}

export function trackClientFunnelEvent(params: ClientFunnelEventParams): void {
  // Truncate up-front so we don't send oversized payloads.
  const body = JSON.stringify({
    step: params.step,
    productId: params.productId,
    bookingId: params.bookingId,
    errorCode: params.errorCode?.slice(0, 64),
    errorMessage: params.errorMessage?.slice(0, 2000),
    durationMs: params.durationMs,
    landingPage: params.landingPage,
  });

  // Fire-and-forget. Use keepalive so the request survives navigation.
  void fetch('/api/funnel-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch((err) => {
    console.error('[client-funnel-tracking] Failed to send event:', err);
  });
}

export function errorMessageFrom(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}
