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

    // Fetch sites from database
    const sites = await prisma.site.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        brand: true,
        domains: {
          where: {
            status: 'ACTIVE',
          },
          take: 1,
        },
        _count: {
          select: {
            pages: true,
            domains: true,
          },
        },
      },
    });

    // Calculate aggregate stats
    const allSites = await prisma.site.findMany();
    const stats = {
      totalSites: allSites.length,
      activeSites: allSites.filter((s) => s.status === 'ACTIVE').length,
      draftSites: allSites.filter((s) => s.status === 'DRAFT').length,
      totalRevenue: 0, // TODO: Calculate from bookings
      totalVisitors: 0, // TODO: Calculate from analytics
    };

    return NextResponse.json({
      sites: sites.map((site) => ({
        id: site.id,
        name: site.name,
        status: site.status,
        domain: site.primaryDomain || site.domains[0]?.domain || null,
        monthlyVisitors: 0, // TODO: Calculate from analytics
        monthlyBookings: 0, // TODO: Calculate from bookings
        monthlyRevenue: 0, // TODO: Calculate from bookings
        brandColor: site.brand?.primaryColor || '#6366f1',
        pageCount: site._count.pages,
        domainCount: site._count.domains,
        createdAt: site.createdAt.toISOString(),
      })),
      stats,
    });
  } catch (error) {
    console.error('[API] Error fetching sites:', error);
    return NextResponse.json({ error: 'Failed to fetch sites' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    // Create slug from name
    const slug = name.toLowerCase().replace(/\s+/g, '-');

    // Create new site
    const site = await prisma.site.create({
      data: {
        name,
        slug,
        status: 'DRAFT',
        holibobPartnerId: 'default', // TODO: Set proper partner ID
      },
    });

    return NextResponse.json({ site });
  } catch (error) {
    console.error('[API] Error creating site:', error);
    return NextResponse.json({ error: 'Failed to create site' }, { status: 500 });
  }
}

