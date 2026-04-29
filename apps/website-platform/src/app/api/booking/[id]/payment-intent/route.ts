/**
 * Stripe Payment Intent API Route
 *
 * GET /api/booking/[id]/payment-intent - Get Stripe payment intent for checkout
 *
 * This fetches the Stripe payment intent from Holibob for bookings
 * where paymentType is REQUIRED (consumer payment collection).
 */

import { type NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';
import { trackFunnelEvent, BookingFunnelStep } from '@/lib/funnel-tracking';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/booking/[id]/payment-intent
 * Fetches Stripe payment intent from Holibob
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  // Bound outside the try so the error path can attribute the event to the
  // correct site when resolution succeeded before the failure.
  let resolvedSiteId = 'unknown';
  let resolvedBookingId: string | undefined;
  try {
    const { id: bookingId } = await params;
    resolvedBookingId = bookingId;

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);
    resolvedSiteId = site.id;

    // Get Holibob client
    const client = await getHolibobClient(site);

    // Fetch booking to verify it exists and is ready for payment
    const booking = await client.getBookingQuestions(bookingId);

    if (!booking) {
      trackFunnelEvent({
        step: BookingFunnelStep.PAYMENT_STARTED,
        siteId: resolvedSiteId,
        bookingId,
        errorCode: 'PAYMENT_BOOKING_NOT_FOUND',
        durationMs: Date.now() - startTime,
      });
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Note: We no longer gate on canCommit here. Holibob's canCommit may stay
    // false until after payment is initiated (it reflects "ready to finalise",
    // not "ready to pay"). If questions are incomplete, the Stripe call itself
    // will fail with a clear error from Holibob. Blocking here was preventing
    // all bookings from reaching payment — see incident 2026-04-17.
    if (!booking.canCommit) {
      console.warn(
        `[Payment Intent API] canCommit is false for booking ${bookingId} — proceeding to payment anyway`
      );
    }

    // Get the Stripe payment intent from Holibob
    console.info('[Payment Intent API] Fetching Stripe payment intent for booking:', bookingId);
    const paymentIntent = await client.getStripePaymentIntent({ id: bookingId });
    console.info('[Payment Intent API] Got payment intent:', {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      hasClientSecret: !!paymentIntent.clientSecret,
      hasApiKey: !!paymentIntent.apiKey,
    });

    trackFunnelEvent({
      step: BookingFunnelStep.PAYMENT_STARTED,
      siteId: site.id,
      bookingId,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json({
      success: true,
      data: {
        clientSecret: paymentIntent.clientSecret,
        apiKey: paymentIntent.apiKey,
        amount: paymentIntent.amount,
        paymentIntentId: paymentIntent.id,
        booking: {
          id: booking.id,
          totalPrice: booking.totalPrice,
        },
      },
    });
  } catch (error) {
    console.error('Get payment intent error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    let errorCode = 'PAYMENT_ERROR';
    if (error instanceof Error) {
      if (error.message.includes('not found')) errorCode = 'PAYMENT_BOOKING_NOT_FOUND';
      else if (error.message.includes('payment') || error.message.includes('stripe'))
        errorCode = 'PAYMENT_NOT_REQUIRED';
      else if (error.message.toLowerCase().includes('timeout')) errorCode = 'PAYMENT_TIMEOUT';
      else if (error.message.toLowerCase().includes('network')) errorCode = 'PAYMENT_NETWORK_ERROR';
    }

    trackFunnelEvent({
      step: BookingFunnelStep.PAYMENT_STARTED,
      siteId: resolvedSiteId,
      bookingId: resolvedBookingId,
      errorCode,
      errorMessage: message,
      durationMs: Date.now() - startTime,
    });

    if (errorCode === 'PAYMENT_BOOKING_NOT_FOUND') {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    if (errorCode === 'PAYMENT_NOT_REQUIRED') {
      return NextResponse.json(
        { error: 'Payment not required for this booking', skipPayment: true },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to get payment intent' }, { status: 500 });
  }
}
