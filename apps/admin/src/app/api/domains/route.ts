import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // Build query filters
    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    // Fetch domains from database
    const domains = await prisma.domain.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Calculate stats
    const allDomains = await prisma.domain.findMany();
    const stats = {
      total: allDomains.length,
      active: allDomains.filter((d) => d.status === 'ACTIVE').length,
      pending: allDomains.filter((d) =>
        ['REGISTERING', 'DNS_PENDING', 'SSL_PENDING'].includes(d.status)
      ).length,
      sslEnabled: allDomains.filter((d) => d.sslEnabled).length,
      expiringBoon: allDomains.filter((d) => {
        if (!d.expiresAt) return false;
        const daysUntilExpiry = Math.floor(
          (d.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        return daysUntilExpiry < 30;
      }).length,
    };

    return NextResponse.json({
      domains: domains.map((domain) => ({
        id: domain.id,
        domain: domain.domain,
        status: domain.status,
        registrar: domain.registrar,
        registeredAt: domain.registeredAt?.toISOString() || null,
        expiresAt: domain.expiresAt?.toISOString() || null,
        sslEnabled: domain.sslEnabled,
        sslExpiresAt: domain.sslExpiresAt?.toISOString() || null,
        dnsConfigured: domain.dnsConfigured,
        cloudflareZoneId: domain.cloudflareZoneId,
        autoRenew: domain.autoRenew,
        registrationCost: domain.registrationCost?.toNumber() || 0,
        siteName: domain.site?.name || null,
      })),
      stats,
    });
  } catch (error) {
    console.error('[API] Error fetching domains:', error);
    return NextResponse.json({ error: 'Failed to fetch domains' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { domain, siteId, registrar = 'namecheap', autoRenew = true } = body;

    // Queue domain registration job
    const { addJob } = await import('@experience-marketplace/jobs');
    await addJob('DOMAIN_REGISTER', {
      siteId,
      domain,
      registrar,
      autoRenew,
    });

    return NextResponse.json({
      success: true,
      message: `Domain registration queued for ${domain}`,
    });
  } catch (error) {
    console.error('[API] Error registering domain:', error);
    return NextResponse.json({ error: 'Failed to register domain' }, { status: 500 });
  }
}
