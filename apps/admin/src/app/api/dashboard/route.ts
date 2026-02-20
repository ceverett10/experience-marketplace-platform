import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET(): Promise<NextResponse> {
  try {
    // Define 30-day period boundaries
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [
      totalSites,
      activeSites,
      currentBookings,
      currentRevenue,
      previousBookings,
      previousRevenue,
      sessionsData,
      revenuePerSite,
      contentPending,
      topSites,
    ] = await Promise.all([
      // Total sites count
      prisma.site.count(),

      // Active sites count
      prisma.site.count({
        where: { status: 'ACTIVE' },
      }),

      // Current period bookings (last 30 days)
      prisma.booking.count({
        where: { createdAt: { gte: thirtyDaysAgo, lte: now } },
      }),

      // Current period revenue (last 30 days, CONFIRMED)
      prisma.booking.aggregate({
        _sum: { totalAmount: true },
        where: {
          status: 'CONFIRMED',
          createdAt: { gte: thirtyDaysAgo, lte: now },
        },
      }),

      // Previous period bookings (30-60 days ago)
      prisma.booking.count({
        where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),

      // Previous period revenue (30-60 days ago, CONFIRMED)
      prisma.booking.aggregate({
        _sum: { totalAmount: true },
        where: {
          status: 'CONFIRMED',
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),

      // Total sessions from analytics snapshots (last 30 days) for conversion rate
      prisma.siteAnalyticsSnapshot.aggregate({
        _sum: { sessions: true },
        where: { date: { gte: thirtyDaysAgo, lte: now } },
      }),

      // Revenue per site (CONFIRMED bookings, last 30 days)
      prisma.booking.groupBy({
        by: ['siteId'],
        where: {
          status: 'CONFIRMED',
          createdAt: { gte: thirtyDaysAgo, lte: now },
        },
        _sum: { totalAmount: true },
      }),

      // Content pending review
      prisma.page.count({
        where: { status: 'REVIEW' },
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

    const totalRevenue = Number(currentRevenue._sum.totalAmount || 0);
    const prevRevenue = Number(previousRevenue._sum.totalAmount || 0);

    // Real conversion rate from sessions data
    const totalSessions = sessionsData._sum.sessions || 0;
    const conversionRate =
      totalSessions > 0 ? ((currentBookings / totalSessions) * 100).toFixed(1) : '0.0';

    // Per-site revenue lookup
    const revenueMap = new Map(
      revenuePerSite.map((r) => [r.siteId, Number(r._sum.totalAmount || 0)])
    );

    return NextResponse.json({
      stats: {
        totalSites,
        activeSites,
        totalBookings: currentBookings,
        totalRevenue,
        conversionRate: parseFloat(conversionRate),
        contentPending,
        changes: {
          sites: 0,
          bookings: calcChange(currentBookings, previousBookings),
          revenue: calcChange(totalRevenue, prevRevenue),
        },
      },
      topSites: topSites.map((site) => ({
        id: site.id,
        name: site.name,
        domain: site.domains[0]?.domain || site.primaryDomain || 'No domain',
        bookings: site._count.bookings,
        revenue: revenueMap.get(site.id) || 0,
      })),
    });
  } catch (error) {
    console.error('[API] Error fetching dashboard data:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
