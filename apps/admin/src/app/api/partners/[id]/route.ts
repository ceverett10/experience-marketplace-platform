import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@experience-marketplace/jobs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        mcpApiKeys: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    return NextResponse.json({
      partner: {
        id: partner.id,
        name: partner.name,
        contactEmail: partner.contactEmail,
        holibobPartnerId: partner.holibobPartnerId,
        holibobApiUrl: partner.holibobApiUrl,
        // Mask credentials — never return plaintext
        holibobApiKey: maskCredential(partner.holibobApiKey),
        holibobApiSecret: partner.holibobApiSecret ? 'configured' : null,
        paymentModel: partner.paymentModel,
        status: partner.status,
        mcpApiKeys: partner.mcpApiKeys.map((k) => ({
          id: k.id,
          name: k.name,
          key: maskKey(k.key),
          scopes: k.scopes,
          rateLimitRpm: k.rateLimitRpm,
          isActive: k.isActive,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        })),
        createdAt: partner.createdAt.toISOString(),
        updatedAt: partner.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[API] Error fetching partner:', error);
    return NextResponse.json({ error: 'Failed to fetch partner' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      contactEmail,
      holibobPartnerId,
      holibobApiKey,
      holibobApiSecret,
      holibobApiUrl,
      paymentModel,
      status,
    } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data['name'] = name;
    if (contactEmail !== undefined) data['contactEmail'] = contactEmail;
    if (holibobPartnerId !== undefined) data['holibobPartnerId'] = holibobPartnerId;
    if (holibobApiUrl !== undefined) data['holibobApiUrl'] = holibobApiUrl;
    if (paymentModel !== undefined) data['paymentModel'] = paymentModel;
    if (status !== undefined) data['status'] = status;

    // Re-encrypt credentials if provided
    if (holibobApiKey) data['holibobApiKey'] = encryptToken(holibobApiKey);
    if (holibobApiSecret) data['holibobApiSecret'] = encryptToken(holibobApiSecret);

    const partner = await prisma.partner.update({
      where: { id },
      data,
    });

    // If suspending/archiving, deactivate all keys
    if (status === 'SUSPENDED' || status === 'ARCHIVED') {
      await prisma.mcpApiKey.updateMany({
        where: { partnerId: id },
        data: { isActive: false },
      });
    }

    return NextResponse.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        status: partner.status,
      },
    });
  } catch (error) {
    console.error('[API] Error updating partner:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Soft delete — archive and deactivate keys
    await prisma.mcpApiKey.updateMany({
      where: { partnerId: id },
      data: { isActive: false },
    });

    const partner = await prisma.partner.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    return NextResponse.json({
      success: true,
      partner: { id: partner.id, status: partner.status },
    });
  } catch (error) {
    console.error('[API] Error archiving partner:', error);
    return NextResponse.json({ error: 'Failed to archive partner' }, { status: 500 });
  }
}

function maskKey(key: string): string {
  if (key.length <= 12) return '****';
  return `${key.slice(0, 9)}...${key.slice(-4)}`;
}

function maskCredential(encrypted: string): string {
  // Just indicate it's configured — never reveal encrypted value
  return encrypted ? 'configured' : 'not set';
}
