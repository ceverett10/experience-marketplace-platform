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
  try {
    const { id: bookingId } = await params;

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = await getHolibobClient(site);

    // Fetch booking to verify it exists and is ready for payment
    const booking = await client.getBookingQuestions(bookingId);

    if (!booking) {
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

    trackFunnelEvent({
      step: BookingFunnelStep.PAYMENT_STARTED,
      siteId: 'unknown',
      errorCode: 'PAYMENT_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    });

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }
      // If Holibob doesn't support payment intent (ON_ACCOUNT mode)
      if (error.message.includes('payment') || error.message.includes('stripe')) {
        return NextResponse.json(
          { error: 'Payment not required for this booking', skipPayment: true },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ error: 'Failed to get payment intent' }, { status: 500 });
  }
}
