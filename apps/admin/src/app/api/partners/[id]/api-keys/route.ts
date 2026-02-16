import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, scopes, rateLimitRpm } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Verify partner exists and is active
    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }
    if (partner.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Cannot create keys for inactive partner' },
        { status: 400 }
      );
    }

    // Generate key
    const key = `mcp_live_${randomBytes(32).toString('hex')}`;

    const apiKey = await prisma.mcpApiKey.create({
      data: {
        partnerId: id,
        key,
        name,
        scopes: scopes || ['discovery', 'booking', 'payment'],
        rateLimitRpm: rateLimitRpm || 60,
      },
    });

    // Return plaintext key ONCE
    return NextResponse.json({
      success: true,
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key, // Plaintext — only shown at creation time
        scopes: apiKey.scopes,
        rateLimitRpm: apiKey.rateLimitRpm,
        createdAt: apiKey.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[API] Error creating API key:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { keyId } = body;

    if (!keyId) {
      return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
    }

    // Verify key belongs to this partner
    const apiKey = await prisma.mcpApiKey.findFirst({
      where: { id: keyId, partnerId: id },
    });

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    // Soft revoke
    await prisma.mcpApiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, keyId });
  } catch (error) {
    console.error('[API] Error revoking API key:', error);
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
}
