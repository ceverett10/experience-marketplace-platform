import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { encryptToken } from '@experience-marketplace/jobs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') {
      where['status'] = status;
    } else {
      where['status'] = { not: 'ARCHIVED' };
    }

    const partners = await prisma.partner.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { mcpApiKeys: true } },
        mcpApiKeys: {
          select: {
            id: true,
            name: true,
            key: true,
            scopes: true,
            rateLimitRpm: true,
            isActive: true,
            lastUsedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Mask sensitive fields
    const masked = partners.map((p) => ({
      id: p.id,
      name: p.name,
      contactEmail: p.contactEmail,
      holibobPartnerId: p.holibobPartnerId,
      holibobApiUrl: p.holibobApiUrl,
      paymentModel: p.paymentModel,
      status: p.status,
      apiKeyCount: p._count.mcpApiKeys,
      activeKeyCount: p.mcpApiKeys.filter((k) => k.isActive).length,
      mcpApiKeys: p.mcpApiKeys.map((k) => ({
        ...k,
        key: maskKey(k.key),
      })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    // Stats
    const allPartners = await prisma.partner.findMany({ select: { status: true } });
    const stats = {
      total: allPartners.length,
      active: allPartners.filter((p) => p.status === 'ACTIVE').length,
      suspended: allPartners.filter((p) => p.status === 'SUSPENDED').length,
    };

    const totalKeys = await prisma.mcpApiKey.count();

    return NextResponse.json({ partners: masked, stats: { ...stats, totalKeys } });
  } catch (error) {
    console.error('[API] Error fetching partners:', error);
    return NextResponse.json({ error: 'Failed to fetch partners' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, contactEmail, holibobPartnerId, holibobApiKey, holibobApiSecret, holibobApiUrl, paymentModel } = body;

    if (!name || !contactEmail || !holibobPartnerId || !holibobApiKey) {
      return NextResponse.json(
        { error: 'name, contactEmail, holibobPartnerId, and holibobApiKey are required' },
        { status: 400 }
      );
    }

    // Encrypt credentials
    const encryptedApiKey = encryptToken(holibobApiKey);
    const encryptedApiSecret = holibobApiSecret ? encryptToken(holibobApiSecret) : null;

    // Create partner
    const partner = await prisma.partner.create({
      data: {
        name,
        contactEmail,
        holibobPartnerId,
        holibobApiKey: encryptedApiKey,
        holibobApiSecret: encryptedApiSecret,
        holibobApiUrl: holibobApiUrl || 'https://api.production.holibob.tech/graphql',
        paymentModel: paymentModel || 'REQUIRED',
      },
    });

    // Generate a default MCP API key
    const mcpKey = `mcp_live_${randomBytes(32).toString('hex')}`;
    const apiKey = await prisma.mcpApiKey.create({
      data: {
        partnerId: partner.id,
        key: mcpKey,
        name: 'Production',
        scopes: ['discovery', 'booking', 'payment'],
      },
    });

    return NextResponse.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        contactEmail: partner.contactEmail,
        holibobPartnerId: partner.holibobPartnerId,
        paymentModel: partner.paymentModel,
        status: partner.status,
      },
      // Show the key in plaintext ONCE at creation time
      mcpApiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: mcpKey,
        scopes: apiKey.scopes,
      },
    });
  } catch (error) {
    console.error('[API] Error creating partner:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function maskKey(key: string): string {
  if (key.length <= 12) return '****';
  return `${key.slice(0, 9)}...${key.slice(-4)}`;
}
