/**
 * Booking Funnel Tracking
 *
 * Server-side event tracking for the booking flow.
 * Cookie values are read synchronously within the request context,
 * then the DB write is fire-and-forget to avoid blocking the response.
 *
 * In Next.js 14 cookies() is synchronous but relies on AsyncLocalStorage.
 * We MUST read cookie values BEFORE any async boundary, because Next.js
 * invalidates the request store after the response is sent.
 */

import { prisma } from '@/lib/prisma';
import { BookingFunnelStep } from '@prisma/client';
import { cookies } from 'next/headers';

export { BookingFunnelStep };

interface TrackFunnelEventParams {
  step: BookingFunnelStep;
  siteId: string;
  productId?: string;
  bookingId?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  landingPage?: string;
}

/**
 * Track a booking funnel event.
 *
 * Reads cookies synchronously (must be called within the request context),
 * then fires a non-blocking DB write.
 */
export function trackFunnelEvent(params: TrackFunnelEventParams): void {
  // Read cookies SYNCHRONOUSLY within the request context.
  // In Next.js 14, cookies() is sync and uses AsyncLocalStorage.
  // We must extract all values here — NOT inside a detached async block.
  let sessionId = 'unknown';
  let utmSource: string | null = null;
  let utmMedium: string | null = null;
  let utmCampaign: string | null = null;

  try {
    const cookieStore = cookies();
    sessionId = cookieStore.get('funnel_session')?.value ?? 'unknown';
    const utmRaw = cookieStore.get('utm_params')?.value;
    if (utmRaw) {
      try {
        const utm = JSON.parse(utmRaw) as { source?: string; medium?: string; campaign?: string };
        utmSource = utm.source || null;
        utmMedium = utm.medium || null;
        utmCampaign = utm.campaign || null;
      } catch {
        // Invalid UTM cookie — ignore
      }
    }
  } catch (err) {
    // cookies() can throw if called outside a request context (e.g., in tests)
    console.warn(
      '[funnel-tracking] Could not read cookies:',
      err instanceof Error ? err.message : err
    );
  }

  // Fire-and-forget: only the DB write is async.
  // All request-scoped data has already been extracted above.
  prisma.bookingFunnelEvent
    .create({
      data: {
        step: params.step,
        siteId: params.siteId,
        sessionId,
        productId: params.productId ?? null,
        bookingId: params.bookingId ?? null,
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage?.slice(0, 2000) ?? null,
        durationMs: params.durationMs ?? null,
        utmSource,
        utmMedium,
        utmCampaign,
        landingPage: params.landingPage ?? null,
      },
    })
    .catch((err) => {
      console.error('[funnel-tracking] Failed to write event:', err);
    });
}
