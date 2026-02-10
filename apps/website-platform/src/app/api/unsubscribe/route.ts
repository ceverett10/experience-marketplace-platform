/**
 * Unsubscribe API Route
 *
 * GET /api/unsubscribe?token=xxx - Unsubscribe from marketing emails
 *
 * Uses a unique token per subscriber for one-click unsubscribe
 * as required by CAN-SPAM and GDPR.
 *
 * Note: Unsubscribing from marketing does NOT remove prize draw entry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    // Redirect to homepage with error
    const url = new URL('/unsubscribed', request.url);
    url.searchParams.set('error', 'invalid');
    return NextResponse.redirect(url);
  }

  try {
    const subscriber = await prisma.subscriber.findUnique({
      where: { unsubscribeToken: token },
    });

    if (!subscriber) {
      // Token not found - redirect with error
      const url = new URL('/unsubscribed', request.url);
      url.searchParams.set('error', 'not_found');
      return NextResponse.redirect(url);
    }

    // Update subscriber to unsubscribed
    await prisma.subscriber.update({
      where: { id: subscriber.id },
      data: {
        marketingConsent: false,
        marketingStatus: 'UNSUBSCRIBED',
        unsubscribedAt: new Date(),
      },
    });

    // Redirect to confirmation page
    return NextResponse.redirect(new URL('/unsubscribed', request.url));
  } catch (error) {
    console.error('Unsubscribe error:', error);

    // Redirect with error on failure
    const url = new URL('/unsubscribed', request.url);
    url.searchParams.set('error', 'failed');
    return NextResponse.redirect(url);
  }
}
