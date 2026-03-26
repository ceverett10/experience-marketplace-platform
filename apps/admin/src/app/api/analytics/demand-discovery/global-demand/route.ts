import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Tour/experience categories to track globally
const TRACKED_CATEGORIES = [
  'food tours',
  'walking tours',
  'cooking classes',
  'wine tasting',
  'boat tours',
  'hiking tours',
  'city tours',
  'museum tours',
  'safari tours',
  'snorkeling tours',
  'kayaking tours',
  'cycling tours',
  'cultural tours',
  'adventure tours',
  'sightseeing tours',
  'street food tours',
  'pub crawl',
  'day trips',
  'sunset cruise',
  'photography tours',
];

// Top tourism markets to track
const TRACKED_LOCATIONS = [
  'United States',
  'United Kingdom',
  'Australia',
  'Canada',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'Brazil',
];

/**
 * GET /api/analytics/demand-discovery/global-demand
 * Returns the latest trend snapshots showing global demand for tour categories.
 * Combines stored TrendSnapshot data with live SEOOpportunity + GSC data.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 1. Get stored trend snapshots (if any exist from trend collection jobs)
    const snapshots = await prisma.trendSnapshot.findMany({
      where: { date: { gte: startDate } },
      orderBy: [{ date: 'desc' }, { demandScore: 'desc' }],
      take: 500,
    });

    // 2. Get SEOOpportunity data as a demand proxy (always available, no API cost)
    // Group by niche (category) to see what has most search volume globally
    const opportunities = await prisma.sEOOpportunity.findMany({
      where: {
        status: { in: ['PAID_CANDIDATE', 'IDENTIFIED', 'EVALUATED', 'PUBLISHED', 'MONITORING'] },
        searchVolume: { gt: 0 },
      },
      select: {
        keyword: true,
        searchVolume: true,
        cpc: true,
        difficulty: true,
        niche: true,
        location: true,
        intent: true,
      },
    });

    // Aggregate by category
    const categoryDemand = new Map<
      string,
      {
        totalVolume: number;
        keywords: number;
        avgCpc: number;
        totalCpc: number;
        avgDifficulty: number;
        totalDifficulty: number;
        topLocations: Map<string, number>;
        topKeywords: Array<{ keyword: string; volume: number; cpc: number }>;
      }
    >();

    for (const opp of opportunities) {
      const category = opp.niche || 'Unknown';
      const existing = categoryDemand.get(category) || {
        totalVolume: 0,
        keywords: 0,
        avgCpc: 0,
        totalCpc: 0,
        avgDifficulty: 0,
        totalDifficulty: 0,
        topLocations: new Map<string, number>(),
        topKeywords: [],
      };

      existing.totalVolume += opp.searchVolume;
      existing.keywords++;
      existing.totalCpc += Number(opp.cpc);
      existing.totalDifficulty += opp.difficulty;

      if (opp.location) {
        existing.topLocations.set(
          opp.location,
          (existing.topLocations.get(opp.location) || 0) + opp.searchVolume
        );
      }

      if (
        existing.topKeywords.length < 10 ||
        opp.searchVolume > (existing.topKeywords.at(-1)?.volume || 0)
      ) {
        existing.topKeywords.push({
          keyword: opp.keyword,
          volume: opp.searchVolume,
          cpc: Number(opp.cpc),
        });
        existing.topKeywords.sort((a, b) => b.volume - a.volume);
        if (existing.topKeywords.length > 10) existing.topKeywords.pop();
      }

      categoryDemand.set(category, existing);
    }

    // 3. Get GSC rising queries (last 30d vs prior 30d) for experience-related terms
    const currentStart = new Date();
    currentStart.setDate(currentStart.getDate() - 30);
    const priorStart = new Date();
    priorStart.setDate(priorStart.getDate() - 60);

    const [currentGsc, priorGsc] = await Promise.all([
      prisma.performanceMetric.groupBy({
        by: ['query'],
        where: {
          date: { gte: currentStart },
          query: { not: null },
          impressions: { gt: 5 },
        },
        _sum: { impressions: true, clicks: true },
        orderBy: { _sum: { impressions: 'desc' } },
        take: 500,
      }),
      prisma.performanceMetric.groupBy({
        by: ['query'],
        where: {
          date: { gte: priorStart, lt: currentStart },
          query: { not: null },
          impressions: { gt: 5 },
        },
        _sum: { impressions: true, clicks: true },
      }),
    ]);

    const priorMap = new Map(priorGsc.map((m) => [m.query, m._sum.impressions || 0]));

    // Filter to tour/experience related queries and calculate growth
    const tourKeywords = [
      'tour',
      'tours',
      'experience',
      'experiences',
      'class',
      'classes',
      'tasting',
      'cruise',
      'safari',
      'hiking',
      'kayak',
      'snorkel',
      'diving',
      'walking',
      'food',
      'cooking',
      'wine',
      'boat',
      'cycling',
      'adventure',
    ];

    const risingExperienceQueries = currentGsc
      .filter((m) => {
        if (!m.query) return false;
        const q = m.query.toLowerCase();
        return tourKeywords.some((kw) => q.includes(kw));
      })
      .map((m) => {
        const current = m._sum.impressions || 0;
        const prior = priorMap.get(m.query!) || 0;
        const growth = prior > 0 ? ((current - prior) / prior) * 100 : current > 20 ? 100 : 0;
        return {
          query: m.query!,
          currentImpressions: current,
          priorImpressions: prior,
          growth: Math.round(growth),
          clicks: m._sum.clicks || 0,
        };
      })
      .filter((q) => q.growth > 10 || q.currentImpressions > 50)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 50);

    // 4. Build category demand response
    const categories = Array.from(categoryDemand.entries())
      .map(([category, data]) => ({
        category,
        totalSearchVolume: data.totalVolume,
        keywordCount: data.keywords,
        avgCpc: data.keywords > 0 ? Math.round((data.totalCpc / data.keywords) * 100) / 100 : 0,
        avgDifficulty: data.keywords > 0 ? Math.round(data.totalDifficulty / data.keywords) : 0,
        topLocations: Array.from(data.topLocations.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([location, volume]) => ({ location, volume })),
        topKeywords: data.topKeywords,
      }))
      .sort((a, b) => b.totalSearchVolume - a.totalSearchVolume);

    // 5. Aggregate by location (city) demand
    const locationDemand = new Map<string, { volume: number; categories: Set<string> }>();
    for (const opp of opportunities) {
      if (!opp.location) continue;
      const existing = locationDemand.get(opp.location) || {
        volume: 0,
        categories: new Set<string>(),
      };
      existing.volume += opp.searchVolume;
      if (opp.niche) existing.categories.add(opp.niche);
      locationDemand.set(opp.location, existing);
    }

    const topLocations = Array.from(locationDemand.entries())
      .map(([location, data]) => ({
        location,
        totalSearchVolume: data.volume,
        categoryCount: data.categories.size,
        topCategories: Array.from(data.categories).slice(0, 5),
      }))
      .sort((a, b) => b.totalSearchVolume - a.totalSearchVolume)
      .slice(0, 30);

    // 6. Get latest trend snapshots grouped by date
    const snapshotsByDate = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const dateKey = new Date(s.date).toISOString().split('T')[0]!;
      if (!snapshotsByDate.has(dateKey)) snapshotsByDate.set(dateKey, []);
      snapshotsByDate.get(dateKey)!.push(s);
    }

    const trendTimeline = Array.from(snapshotsByDate.entries())
      .map(([date, daySnapshots]) => ({
        date,
        topCategories: daySnapshots
          .sort((a, b) => b.demandScore - a.demandScore)
          .slice(0, 10)
          .map((s) => ({
            category: s.category,
            location: s.location,
            trendScore: s.trendScore,
            trendDirection: s.trendDirection,
            searchVolume: s.searchVolume,
            demandScore: s.demandScore,
          })),
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    // 7. Aggregate TrendSnapshot data by category (Google Trends scores)
    const latestSnapshots = await prisma.trendSnapshot.findMany({
      where: {
        date: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      orderBy: [{ date: 'desc' }, { demandScore: 'desc' }],
    });

    // Group by category for the trends view
    const trendsByCategory = new Map<
      string,
      {
        trendScore: number;
        searchVolume: number;
        cpc: number;
        direction: string;
        demandScore: number;
        locations: Array<{ location: string; trendScore: number; searchVolume: number }>;
        count: number;
      }
    >();

    for (const snap of latestSnapshots) {
      const existing = trendsByCategory.get(snap.category) || {
        trendScore: 0,
        searchVolume: 0,
        cpc: 0,
        direction: 'stable',
        demandScore: 0,
        locations: [],
        count: 0,
      };
      existing.trendScore += snap.trendScore;
      existing.searchVolume += snap.searchVolume;
      existing.cpc += Number(snap.cpc);
      existing.demandScore += snap.demandScore;
      existing.count++;
      existing.locations.push({
        location: snap.location,
        trendScore: snap.trendScore,
        searchVolume: snap.searchVolume,
      });
      // Use the most dramatic direction
      if (
        snap.trendDirection === 'breakout' ||
        (snap.trendDirection === 'rising' && existing.direction !== 'breakout')
      ) {
        existing.direction = snap.trendDirection;
      }
      trendsByCategory.set(snap.category, existing);
    }

    const googleTrends = Array.from(trendsByCategory.entries())
      .map(([category, data]) => ({
        category,
        avgTrendScore: Math.round(data.trendScore / Math.max(data.count, 1)),
        totalSearchVolume: data.searchVolume,
        avgCpc: Math.round((data.cpc / Math.max(data.count, 1)) * 100) / 100,
        direction: data.direction,
        demandScore: Math.round(data.demandScore / Math.max(data.count, 1)),
        locationCount: data.locations.length,
        topLocations: data.locations
          .sort((a, b) => b.trendScore - a.trendScore)
          .slice(0, 5)
          .map((l) => ({ location: l.location, trendScore: l.trendScore })),
      }))
      .sort((a, b) => b.demandScore - a.demandScore);

    const lastCollected =
      latestSnapshots.length > 0
        ? new Date(latestSnapshots[0]!.date).toISOString().split('T')[0]
        : null;

    return NextResponse.json({
      categories,
      topLocations,
      risingQueries: risingExperienceQueries,
      googleTrends,
      trendTimeline,
      trackedCategories: TRACKED_CATEGORIES,
      trackedLocations: TRACKED_LOCATIONS,
      totals: {
        totalCategories: categories.length,
        totalSearchVolume: categories.reduce((s, c) => s + c.totalSearchVolume, 0),
        totalKeywords: opportunities.length,
        risingQueryCount: risingExperienceQueries.length,
        snapshotDays: snapshotsByDate.size,
        googleTrendsCategories: googleTrends.length,
        lastTrendCollection: lastCollected,
      },
    });
  } catch (error) {
    console.error('[Global Demand API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch global demand data' }, { status: 500 });
  }
}

/**
 * POST /api/analytics/demand-discovery/global-demand
 * Triggers a manual trend data collection run
 */
export async function POST(): Promise<NextResponse> {
  try {
    // Import addJob dynamically to avoid circular deps
    const { addJob } = await import('@experience-marketplace/jobs');
    await addJob('TREND_DATA_COLLECT' as never, {});
    return NextResponse.json({
      message: 'Trend data collection job queued. Data will appear in ~5 minutes.',
    });
  } catch (error) {
    console.error('[Global Demand API] Failed to queue trend collection:', error);
    return NextResponse.json({ error: 'Failed to queue trend collection' }, { status: 500 });
  }
}
