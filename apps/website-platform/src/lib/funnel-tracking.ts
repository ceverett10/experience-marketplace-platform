/**
 * Booking Funnel Tracking
 *
 * Fire-and-forget server-side event tracking for the booking flow.
 * Events are written to the BookingFunnelEvent table without blocking API responses.
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
}

/**
 * Track a booking funnel event. Fire-and-forget — does not block the caller.
 */
export function trackFunnelEvent(params: TrackFunnelEventParams): void {
  void (async () => {
    try {
      const cookieStore = await cookies();
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
        },
      });
    } catch (err) {
      console.error('[funnel-tracking] Failed to track event:', err);
    }
  })();
}
