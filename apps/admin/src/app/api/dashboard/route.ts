import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(): Promise<NextResponse> {
  try {
    // Fetch real data from database
    const [totalSites, activeSites, totalBookings, revenueData, topSites] = await Promise.all([
      // Total sites count
      prisma.site.count(),

      // Active sites count
      prisma.site.count({
        where: { status: 'ACTIVE' },
      }),

      // Total bookings count
      prisma.booking.count(),

      // Total revenue (sum of all confirmed bookings)
      prisma.booking.aggregate({
        _sum: { totalAmount: true },
        where: { status: 'CONFIRMED' },
      }),

      // Top performing sites with booking counts
      prisma.site.findMany({
        where: { status: 'ACTIVE' },
        take: 5,
        include: {
          _count: {
            select: { bookings: true },
          },
          domains: {
            where: { status: 'ACTIVE' },
            take: 1,
          },
        },
        orderBy: {
          bookings: {
            _count: 'desc',
          },
        },
      }),
    ]);

    const totalRevenue = revenueData._sum.totalAmount || 0;

    // Calculate conversion rate (placeholder - would need page views data)
    const conversionRate = totalBookings > 0 ? ((totalBookings / 1000) * 100).toFixed(1) : '0.0';

    return NextResponse.json({
      stats: {
        totalSites,
        activeSites,
        totalBookings,
        totalRevenue,
        conversionRate: parseFloat(conversionRate),
        contentPending: 0, // TODO: Add content pending count when content management is implemented
        changes: {
          sites: 0, // TODO: Calculate period-over-period changes
          bookings: 0,
          revenue: 0,
        },
      },
      topSites: topSites.map((site) => ({
        id: site.id,
        name: site.name,
        domain: site.domains[0]?.domain || site.primaryDomain || 'No domain',
        bookings: site._count.bookings,
        revenue: 0, // TODO: Calculate per-site revenue
      })),
    });
  } catch (error) {
    console.error('[API] Error fetching dashboard data:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
