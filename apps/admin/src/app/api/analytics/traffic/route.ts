import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/traffic
 * Returns traffic source breakdown aggregated across all sites AND microsites
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || getDefaultEndDate();

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Fetch all sites with GA4 configured
    const sites = await prisma.site.findMany({
      where: {
        status: { in: ['ACTIVE', 'REVIEW'] },
      },
      select: {
        id: true,
        name: true,
        seoConfig: true,
      },
    });

    // Filter sites with GA4
    const ga4Sites = sites.filter((s) => {
      const seoConfig = (s.seoConfig as Record<string, unknown>) || {};
      return !!seoConfig['ga4PropertyId'];
    });

    // Build name lookup for both sites and microsites
    const nameMap = new Map(sites.map((s) => [s.id, s.name]));

    // Fetch microsites for name lookup
    const microsites = await prisma.micrositeConfig.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, siteName: true },
    });
    for (const ms of microsites) {
      nameMap.set(ms.id, ms.siteName);
    }

    // Fetch site snapshots for the period
    const [siteSnapshots, micrositeSnapshots] = await Promise.all([
      prisma.siteAnalyticsSnapshot.findMany({
        where: {
          siteId: { in: ga4Sites.map((s) => s.id) },
          date: { gte: start, lte: end },
          ga4Synced: true,
        },
        select: {
          siteId: true,
          trafficSources: true,
          users: true,
          sessions: true,
        },
      }),
      prisma.micrositeAnalyticsSnapshot.findMany({
        where: {
          date: { gte: start, lte: end },
          ga4Synced: true,
        },
        select: {
          micrositeId: true,
          trafficSources: true,
          users: true,
          sessions: true,
        },
      }),
    ]);

    // Aggregate traffic sources across all sites and microsites
    const sourceMap = new Map<
      string,
      {
        source: string;
        medium: string;
        users: number;
        sessions: number;
        sites: Set<string>;
      }
    >();

    // Also track totals by medium
    const mediumMap = new Map<string, { users: number; sessions: number }>();

    let totalUsers = 0;
    let totalSessions = 0;

    // Helper to process a snapshot's traffic sources
    const processSnapshot = (
      entityId: string,
      snapshot: { users: number; sessions: number; trafficSources: unknown }
    ) => {
      totalUsers += snapshot.users;
      totalSessions += snapshot.sessions;

      const sources = snapshot.trafficSources as Array<{
        source: string;
        medium: string;
        users: number;
        sessions: number;
        bounceRate?: number;
      }> | null;

      if (sources) {
        for (const s of sources) {
          // By source/medium
          const key = `${s.source}|${s.medium}`;
          const existing = sourceMap.get(key) || {
            source: s.source,
            medium: s.medium,
            users: 0,
            sessions: 0,
            sites: new Set<string>(),
          };
          existing.users += s.users;
          existing.sessions += s.sessions;
          existing.sites.add(entityId);
          sourceMap.set(key, existing);

          // By medium only
          const mediumExisting = mediumMap.get(s.medium) || { users: 0, sessions: 0 };
          mediumExisting.users += s.users;
          mediumExisting.sessions += s.sessions;
          mediumMap.set(s.medium, mediumExisting);
        }
      }
    };

    // Process site snapshots
    for (const snapshot of siteSnapshots) {
      processSnapshot(snapshot.siteId, snapshot);
    }

    // Process microsite snapshots
    for (const snapshot of micrositeSnapshots) {
      processSnapshot(snapshot.micrositeId, snapshot);
    }

    // Format sources
    const sources = Array.from(sourceMap.values())
      .map((s) => ({
        source: s.source,
        medium: s.medium,
        users: s.users,
        sessions: s.sessions,
        siteCount: s.sites.size,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 50);

    // Format by medium with percentages
    const byMedium = Array.from(mediumMap.entries())
      .map(([medium, stats]) => ({
        medium,
        users: stats.users,
        sessions: stats.sessions,
        percentage: totalSessions > 0 ? (stats.sessions / totalSessions) * 100 : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    // Top landing pages from GSC data (sites + microsites combined)
    const [siteLandingPages, micrositeLandingPages] = await Promise.all([
      prisma.performanceMetric.groupBy({
        by: ['pageUrl', 'siteId'],
        where: {
          date: { gte: start, lte: end },
          pageUrl: { not: null },
        },
        _sum: { clicks: true },
        orderBy: { _sum: { clicks: 'desc' } },
        take: 10,
      }),
      prisma.micrositePerformanceMetric.groupBy({
        by: ['pageUrl', 'micrositeId'],
        where: {
          date: { gte: start, lte: end },
          pageUrl: { not: null },
        },
        _sum: { clicks: true },
        orderBy: { _sum: { clicks: 'desc' } },
        take: 10,
      }),
    ]);

    // Merge and sort landing pages from both sources
    const allLandingPages = [
      ...siteLandingPages.map((row) => ({
        path: row.pageUrl!,
        site: nameMap.get(row.siteId) || 'Unknown',
        sessions: row._sum.clicks || 0,
      })),
      ...micrositeLandingPages.map((row) => ({
        path: row.pageUrl!,
        site: nameMap.get(row.micrositeId) || 'Unknown',
        sessions: row._sum.clicks || 0,
      })),
    ]
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    // Calculate organic traffic specifically
    const organicData = mediumMap.get('organic') || { users: 0, sessions: 0 };
    const organic = {
      totalUsers: organicData.users,
      totalSessions: organicData.sessions,
      percentageOfTotal: totalSessions > 0 ? (organicData.sessions / totalSessions) * 100 : 0,
      topLandingPages: allLandingPages,
    };

    return NextResponse.json({
      sources,
      byMedium,
      organic,
      totals: {
        users: totalUsers,
        sessions: totalSessions,
        sitesWithData: ga4Sites.length + microsites.length,
      },
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    console.error('[Analytics Traffic API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch traffic analytics' }, { status: 500 });
  }
}

function getDefaultStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split('T')[0]!;
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0]!;
}
