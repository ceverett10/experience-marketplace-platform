import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const STATUSES = ['NEW', 'READ', 'REPLIED', 'ARCHIVED'] as const;
type Status = (typeof STATUSES)[number];

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/contact-messages/[id]
 * Body: { status: 'NEW' | 'READ' | 'REPLIED' | 'ARCHIVED' }
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = (await request.json()) as { status?: string };
    const status = body.status;

    if (!status || !(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const existing = await prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Contact message not found' }, { status: 404 });
    }

    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: status as Status },
    });

    return NextResponse.json({
      success: true,
      message: { id: updated.id, status: updated.status },
    });
  } catch (error) {
    console.error('[ContactMessages API] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update contact message' }, { status: 500 });
  }
}
