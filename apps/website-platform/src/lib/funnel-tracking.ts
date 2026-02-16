/**
 * Booking Funnel Tracking
 *
 * Fire-and-forget server-side event tracking for the booking flow.
 * Events are written to the BookingFunnelEvent table without blocking API responses.
 *
 * IMPORTANT: cookies() must be read eagerly (within the request context) before
 * the detached promise runs, because Next.js cleans up the request context once
 * the route handler returns its response.
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
 * Track a booking funnel event. Fire-and-forget — does not block the caller.
 *
 * Reads cookies eagerly within the request scope, then writes to DB asynchronously.
 */
export function trackFunnelEvent(params: TrackFunnelEventParams): void {
  // Read cookies EAGERLY while still inside the request context.
  // The cookies() promise must be initiated here — not inside the detached async block.
  const cookiePromise = cookies();

  void (async () => {
    try {
      const cookieStore = await cookiePromise;
      const sessionId = cookieStore.get('funnel_session')?.value ?? 'unknown';
      const utmRaw = cookieStore.get('utm_params')?.value;
      let utm: { source?: string; medium?: string; campaign?: string } = {};
      if (utmRaw) {
        try {
          utm = JSON.parse(utmRaw);
        } catch {
          // Invalid UTM cookie — ignore
        }
      }

      await prisma.bookingFunnelEvent.create({
        data: {
          step: params.step,
          siteId: params.siteId,
          sessionId,
          productId: params.productId ?? null,
          bookingId: params.bookingId ?? null,
          errorCode: params.errorCode ?? null,
          errorMessage: params.errorMessage?.slice(0, 2000) ?? null,
          durationMs: params.durationMs ?? null,
          utmSource: utm.source || null,
          utmMedium: utm.medium || null,
          utmCampaign: utm.campaign || null,
          landingPage: params.landingPage ?? null,
        },
      });
    } catch (err) {
      console.error('[funnel-tracking] Failed to track event:', err);
    }
  })();
}
