/**
 * Client-side Funnel Event API
 *
 * POST /api/funnel-event - Log a funnel event from client code.
 *
 * The server-side `trackFunnelEvent` helper requires `next/headers` access
 * (for cookie-based session/UTM attribution) so it cannot be called directly
 * from a client component. This endpoint provides a thin shim: validate input,
 * resolve the site from the request hostname, then call `trackFunnelEvent`.
 *
 * Used by client components (CheckoutClient, BookingForm, StripePaymentForm)
 * to record errors and intermediate states that don't pass through an API.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { trackFunnelEvent, BookingFunnelStep } from '@/lib/funnel-tracking';

const RequestSchema = z.object({
  step: z.nativeEnum(BookingFunnelStep),
  productId: z.string().optional(),
  bookingId: z.string().optional(),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(2000).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  landingPage: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid event payload' }, { status: 400 });
    }

    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    trackFunnelEvent({
      step: parsed.data.step,
      siteId: site.id,
      productId: parsed.data.productId,
      bookingId: parsed.data.bookingId,
      errorCode: parsed.data.errorCode,
      errorMessage: parsed.data.errorMessage,
      durationMs: parsed.data.durationMs,
      landingPage: parsed.data.landingPage,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Funnel Event API] Failed to record event:', err);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
