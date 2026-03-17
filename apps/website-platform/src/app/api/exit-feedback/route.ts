import { type NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { trackFunnelEvent, BookingFunnelStep } from '@/lib/funnel-tracking';

/**
 * Valid exit feedback reasons.
 * Stored in the `errorCode` field of the BookingFunnelEvent.
 */
const VALID_REASONS = new Set([
  'JUST_BROWSING',
  'TOO_EXPENSIVE',
  'WRONG_DESTINATION',
  'DATES_UNAVAILABLE',
  'NEED_MORE_INFO',
  'DONT_TRUST_SITE',
  'OTHER',
]);

/**
 * POST /api/exit-feedback
 * Records why a PPC visitor left without booking.
 * Uses the BookingFunnelEvent table with step=EXIT_FEEDBACK.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reason, comment } = body as { reason?: string; comment?: string };

    if (!reason || !VALID_REASONS.has(reason)) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
    }

    const headersList = await headers();
    const hostname = headersList.get('x-forwarded-host') || headersList.get('host') || '';
    const site = await getSiteFromHostname(hostname);
    const siteId = site?.id ?? 'unknown';

    trackFunnelEvent({
      step: BookingFunnelStep.EXIT_FEEDBACK,
      siteId,
      errorCode: reason,
      errorMessage: typeof comment === 'string' ? comment.slice(0, 500) : undefined,
      landingPage: body.landingPage || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
