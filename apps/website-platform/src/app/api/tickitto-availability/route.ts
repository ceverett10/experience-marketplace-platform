/**
 * Tickitto Availability Widget API Route
 *
 * GET /api/tickitto-availability?eventId=xxx - Get Tickitto availability widget URL
 *
 * Returns a session_id and view_url to embed the Tickitto ticket selection widget in an iframe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTickittoClient } from '@/lib/tickitto';

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get('eventId');
    const t1 = request.nextUrl.searchParams.get('t1') ?? undefined;
    const t2 = request.nextUrl.searchParams.get('t2') ?? undefined;

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const client = getTickittoClient();
    const session = await client.getAvailabilityWidget(eventId, { t1, t2 });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.session_id,
        widgetUrl: session.view_url,
      },
    });
  } catch (error) {
    console.error('[API /tickitto-availability] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get availability',
      },
      { status: 500 }
    );
  }
}
