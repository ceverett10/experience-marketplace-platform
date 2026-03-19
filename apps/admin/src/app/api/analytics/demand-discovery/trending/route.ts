import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/demand-discovery/trending
 * Returns trending search queries: compares last 30 days vs prior 30 days from GSC data
 */
export async function GET(): Promise<NextResponse> {
  try {
    const now = new Date();
    const currentStart = new Date();
    currentStart.setDate(now.getDate() - 30);
    const priorStart = new Date();
    priorStart.setDate(now.getDate() - 60);

    // Fetch current period grouped by query
    const [currentMetrics, priorMetrics] = await Promise.all([
      prisma.performanceMetric.groupBy({
        by: ['query'],
        where: {
          date: { gte: currentStart, lte: now },
          query: { not: null },
        },
        _sum: { clicks: true, impressions: true },
      }),
      prisma.performanceMetric.groupBy({
        by: ['query'],
        where: {
          date: { gte: priorStart, lt: currentStart },
          query: { not: null },
        },
        _sum: { clicks: true, impressions: true },
      }),
    ]);

    // Build lookup for prior period
    const priorMap = new Map<string, { clicks: number; impressions: number }>();
    for (const m of priorMetrics) {
      if (!m.query) continue;
      priorMap.set(m.query, {
        clicks: m._sum.clicks || 0,
        impressions: m._sum.impressions || 0,
      });
    }

    // Compare periods
    type TrendingRow = {
      query: string;
      currentImpressions: number;
      priorImpressions: number;
      impressionChange: number;
      currentClicks: number;
      priorClicks: number;
      clickChange: number;
      isBreakout: boolean;
      isNew: boolean;
    };

    const results: TrendingRow[] = [];

    for (const m of currentMetrics) {
      if (!m.query) continue;
      const currentImpressions = m._sum.impressions || 0;
      const currentClicks = m._sum.clicks || 0;

      // Filter out low-volume noise
      if (currentImpressions < 10) continue;

      const prior = priorMap.get(m.query);
      const priorImpressions = prior?.impressions || 0;
      const priorClicks = prior?.clicks || 0;

      const impressionChange =
        priorImpressions > 0
          ? ((currentImpressions - priorImpressions) / priorImpressions) * 100
          : currentImpressions > 0
            ? 100
            : 0;

      const clickChange =
        priorClicks > 0
          ? ((currentClicks - priorClicks) / priorClicks) * 100
          : currentClicks > 0
            ? 100
            : 0;

      // Breakout: was barely visible before, now significant
      const isBreakout = priorImpressions < 10 && currentImpressions > 50;
      const isNew = priorImpressions === 0 && currentImpressions > 20;

      results.push({
        query: m.query,
        currentImpressions,
        priorImpressions,
        impressionChange: Math.round(impressionChange),
        currentClicks,
        priorClicks,
        clickChange: Math.round(clickChange),
        isBreakout,
        isNew,
      });
    }

    // Also include queries that appeared in prior but not current (declining)
    for (const [query, prior] of priorMap) {
      if (prior.impressions < 20) continue;
      const hasCurrent = currentMetrics.some((m) => m.query === query);
      if (!hasCurrent) {
        results.push({
          query,
          currentImpressions: 0,
          priorImpressions: prior.impressions,
          impressionChange: -100,
          currentClicks: 0,
          priorClicks: prior.clicks,
          clickChange: -100,
          isBreakout: false,
          isNew: false,
        });
      }
    }

    // Sort by impression change (rising first)
    results.sort((a, b) => b.impressionChange - a.impressionChange);

    const rising = results.filter((r) => r.impressionChange > 20).slice(0, 50);
    const breakouts = results.filter((r) => r.isBreakout || r.isNew).slice(0, 20);
    const declining = results
      .filter((r) => r.impressionChange < -20)
      .sort((a, b) => a.impressionChange - b.impressionChange)
      .slice(0, 30);

    return NextResponse.json({
      rising,
      breakouts,
      declining,
      totals: {
        risingCount: rising.length,
        breakoutCount: breakouts.length,
        decliningCount: declining.length,
      },
    });
  } catch (error) {
    console.error('[Demand Discovery - Trending] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch trending data' }, { status: 500 });
  }
}
