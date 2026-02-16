import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { trackFunnelEvent, BookingFunnelStep } from '@/lib/funnel-tracking';

const ALLOWED_STEPS = new Set<BookingFunnelStep>([
  BookingFunnelStep.LANDING_PAGE_VIEW,
  BookingFunnelStep.EXPERIENCE_CLICKED,
]);

/**
 * POST /api/funnel
 * Lightweight endpoint for client-side funnel event tracking.
 * Only allows top-of-funnel steps (page views, clicks) — mid/bottom funnel
 * events are tracked server-side in their respective API routes.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { step, productId, landingPage } = body;

    if (!step || !ALLOWED_STEPS.has(step as BookingFunnelStep)) {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
    }

    const headersList = await headers();
    const hostname = headersList.get('x-forwarded-host') || headersList.get('host') || '';
    const site = await getSiteFromHostname(hostname);
    const siteId = site?.id ?? 'unknown';

    trackFunnelEvent({
      step: step as BookingFunnelStep,
      siteId,
      productId: productId || undefined,
      landingPage: landingPage || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Don't leak errors for tracking endpoint
  }
}
