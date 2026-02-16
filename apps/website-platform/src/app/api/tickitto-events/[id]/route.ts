/**
 * Tickitto Event Detail API Route
 *
 * GET /api/tickitto-events/[id] - Get a single Tickitto event
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTickittoClient, mapTickittoEventToExperience } from '@/lib/tickitto';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Event ID is required' }, { status: 400 });
    }

    const currency = request.nextUrl.searchParams.get('currency') ?? 'GBP';
    const client = getTickittoClient();
    const event = await client.getEvent(id, currency);

    if (!event) {
      return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      product: mapTickittoEventToExperience(event),
    });
  } catch (error) {
    console.error('[API /tickitto-events/[id]] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch event',
      },
      { status: 500 }
    );
  }
}
