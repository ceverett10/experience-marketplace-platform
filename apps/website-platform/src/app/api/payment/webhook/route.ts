/**
 * Stripe Webhook Handler
 * POST /api/payment/webhook - Handle Stripe webhook events
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { getSiteFromHostname, DEFAULT_SITE_CONFIG } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

// Initialize Stripe
const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
  apiVersion: '2023-10-16',
});

const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await request.text();

    // Get Stripe signature
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing Stripe signature' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutExpired(session);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(paymentIntent);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle successful checkout
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.['bookingId'];
  const siteId = session.metadata?.['siteId'];

  if (!bookingId) {
    console.error('No booking ID in session metadata');
    return;
  }

  console.log(`Processing successful payment for booking ${bookingId}`);

  // Get site configuration
  // In production, we'd look up the site by ID
  const site = DEFAULT_SITE_CONFIG;

  // Get Holibob client
  const client = getHolibobClient(site);

  try {
    // Get current booking status
    const booking = await client.getBooking(bookingId);

    if (!booking) {
      console.error(`Booking ${bookingId} not found`);
      return;
    }

    // If booking is already confirmed, skip
    if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
      console.log(`Booking ${bookingId} already confirmed`);
      return;
    }

    // Update booking status via Holibob API
    // Note: This would typically involve a specific API call to mark payment complete
    // For now, we log the success
    console.log(`Payment successful for booking ${bookingId}`);
    console.log(`Payment intent: ${session.payment_intent}`);
    console.log(`Amount: ${session.amount_total} ${session.currency}`);

    // In production, you would:
    // 1. Update booking status in Holibob
    // 2. Send confirmation email to customer
    // 3. Notify the experience provider

  } catch (error) {
    console.error(`Error processing payment for booking ${bookingId}:`, error);
    throw error;
  }
}

/**
 * Handle expired checkout session
 */
async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.['bookingId'];

  if (!bookingId) {
    return;
  }

  console.log(`Checkout expired for booking ${bookingId}`);

  // In production, you might want to:
  // 1. Cancel or expire the booking
  // 2. Release any held inventory
  // 3. Send reminder email to customer
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const bookingId = paymentIntent.metadata?.['bookingId'];

  if (!bookingId) {
    return;
  }

  console.log(`Payment failed for booking ${bookingId}`);
  console.log(`Failure reason: ${paymentIntent.last_payment_error?.message}`);

  // In production, you would:
  // 1. Update booking status to reflect payment failure
  // 2. Send notification to customer
  // 3. Perhaps retry or offer alternative payment method
}
