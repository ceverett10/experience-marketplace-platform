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

    // 4. Build category demand response (filter out non-tour categories)
    const excludedCategories = new Set([
      'paid_traffic',
      'unknown',
      '',
      'general',
      'other',
      'transfers',
      'transport',
    ]);
    const categories = Array.from(categoryDemand.entries())
      .filter(([category]) => !excludedCategories.has(category.toLowerCase()))
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
      where: { date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      orderBy: [{ date: 'desc' }, { demandScore: 'desc' }],
    });

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

// Categories for Google Trends collection (name + search terms)
const TREND_CATEGORIES = [
  { name: 'Food Tours', keywords: ['food tours', 'food tour', 'street food tour'] },
  { name: 'Walking Tours', keywords: ['walking tours', 'walking tour', 'guided walk'] },
  { name: 'Cooking Classes', keywords: ['cooking class', 'cooking classes'] },
  { name: 'Wine Tasting', keywords: ['wine tasting', 'wine tour', 'vineyard tour'] },
  { name: 'Boat Tours', keywords: ['boat tour', 'boat tours', 'boat trip'] },
  { name: 'City Tours', keywords: ['city tour', 'city tours', 'sightseeing tour'] },
  { name: 'Hiking Tours', keywords: ['hiking tour', 'hiking tours'] },
  { name: 'Museum Tours', keywords: ['museum tour', 'museum tickets'] },
  { name: 'Safari', keywords: ['safari tour', 'safari', 'wildlife safari'] },
  { name: 'Cultural Tours', keywords: ['cultural tour', 'heritage tour'] },
  { name: 'Adventure Tours', keywords: ['adventure tour', 'adventure activities'] },
  { name: 'Day Trips', keywords: ['day trip', 'day tours', 'day excursion'] },
  { name: 'Scuba Diving', keywords: ['scuba diving', 'diving tour'] },
  { name: 'Cycling Tours', keywords: ['cycling tour', 'bike tour'] },
  { name: 'Sunset Cruise', keywords: ['sunset cruise', 'sunset boat tour'] },
];

const TREND_LOCATIONS = ['United States', 'United Kingdom', 'Australia', 'Germany', 'France'];

/**
 * POST /api/analytics/demand-discovery/global-demand
 * Runs Google Trends collection inline via DataForSEO (no BullMQ required)
 */
export async function POST(): Promise<NextResponse> {
  const login = process.env['DATAFORSEO_API_LOGIN'];
  const password = process.env['DATAFORSEO_API_PASSWORD'];

  if (!login || !password) {
    return NextResponse.json(
      { error: 'DataForSEO credentials not configured (DATAFORSEO_API_LOGIN)' },
      { status: 500 }
    );
  }

  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  const baseUrl = 'https://api.dataforseo.com/v3';

  // Location code cache
  const locationCodes: Record<string, number> = {
    'United States': 2840,
    'United Kingdom': 2826,
    Australia: 2036,
    Germany: 2276,
    France: 2250,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let created = 0;
  let updated = 0;
  let apiCalls = 0;
  const errors: string[] = [];

  try {
    for (const location of TREND_LOCATIONS) {
      const locCode = locationCodes[location];
      if (!locCode) continue;

      for (const category of TREND_CATEGORIES) {
        try {
          // Call Google Trends explore
          const res = await fetch(`${baseUrl}/keywords_data/google_trends/explore/live`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([
              {
                keywords: category.keywords.slice(0, 5),
                location_code: locCode,
                language_code: 'en',
                time_range: 'past_12_months',
                type: 'web',
              },
            ]),
          });
          apiCalls++;

          let trendScore = 0;
          let trendDirection = 'stable';

          if (res.ok) {
            const data = await res.json();
            const taskResult = data.tasks?.[0]?.result?.[0];
            if (taskResult) {
              const graphItems = (taskResult.items || []).filter(
                (item: Record<string, unknown>) => item['type'] === 'google_trends_graph'
              );
              if (graphItems.length > 0) {
                const points = (graphItems[0]['data'] as Array<Record<string, unknown>>) || [];
                const recent = points.slice(-3);
                const older = points.slice(-6, -3);
                const recentAvg =
                  recent.reduce(
                    (s: number, p: Record<string, unknown>) =>
                      s + ((p['values'] as number[])?.[0] || 0),
                    0
                  ) / Math.max(recent.length, 1);
                const olderAvg =
                  older.length > 0
                    ? older.reduce(
                        (s: number, p: Record<string, unknown>) =>
                          s + ((p['values'] as number[])?.[0] || 0),
                        0
                      ) / Math.max(older.length, 1)
                    : recentAvg;

                trendScore = Math.round(recentAvg);
                if (olderAvg > 0) {
                  const change = ((recentAvg - olderAvg) / olderAvg) * 100;
                  if (change > 50) trendDirection = 'breakout';
                  else if (change > 15) trendDirection = 'rising';
                  else if (change < -15) trendDirection = 'declining';
                }
              }
            }
          }

          const demandScore = Math.round(
            trendScore * 0.6 +
              (trendDirection === 'breakout'
                ? 40
                : trendDirection === 'rising'
                  ? 30
                  : trendDirection === 'stable'
                    ? 20
                    : 10)
          );

          // Upsert snapshot
          const existing = await prisma.trendSnapshot.findUnique({
            where: {
              date_location_category: { date: today, location, category: category.name },
            },
          });

          if (existing) {
            await prisma.trendSnapshot.update({
              where: { id: existing.id },
              data: {
                trendScore,
                trendDirection,
                demandScore,
                relatedQueries: category.keywords,
              },
            });
            updated++;
          } else {
            await prisma.trendSnapshot.create({
              data: {
                date: today,
                location,
                category: category.name,
                trendScore,
                trendDirection,
                demandScore,
                relatedQueries: category.keywords,
              },
            });
            created++;
          }

          // Small delay between API calls
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (err) {
          errors.push(
            `${category.name}/${location}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    return NextResponse.json({
      message: `Collected ${created + updated} trend snapshots (${created} new, ${updated} updated). ${apiCalls} API calls. ${errors.length} errors.`,
      created,
      updated,
      apiCalls,
      errors: errors.slice(0, 5),
    });
  } catch (error) {
    console.error('[Global Demand API] Trend collection failed:', error);
    return NextResponse.json(
      {
        error: `Trend collection failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
