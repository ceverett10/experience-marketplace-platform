export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/operations/paid-opportunities
 * Returns SEO opportunities with CPC < $0.10 that could be targeted with paid traffic.
 * Leverages existing DataForSEO CPC data — zero incremental API cost.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const maxCpc = parseFloat(searchParams.get('maxCpc') || '0.10');
    const minVolume = parseInt(searchParams.get('minVolume') || '100', 10);
    const siteId = searchParams.get('siteId') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const sortBy = searchParams.get('sortBy') || 'volume'; // volume, cpc, score

    const where: Record<string, unknown> = {
      cpc: { gt: 0, lte: maxCpc },
      searchVolume: { gte: minVolume },
    };

    if (siteId) {
      where['siteId'] = siteId;
    }

    const orderBy: Record<string, string> =
      sortBy === 'cpc'
        ? { cpc: 'asc' }
        : sortBy === 'score'
          ? { priorityScore: 'desc' }
          : { searchVolume: 'desc' };

    const [opportunities, totalCount, stats] = await Promise.all([
      prisma.sEOOpportunity.findMany({
        where,
        select: {
          id: true,
          keyword: true,
          cpc: true,
          searchVolume: true,
          difficulty: true,
          priorityScore: true,
          potentialValue: true,
          intent: true,
          niche: true,
          location: true,
          status: true,
          sourceData: true,
          site: { select: { id: true, name: true, primaryDomain: true } },
        },
        orderBy,
        take: limit,
      }),
      prisma.sEOOpportunity.count({ where }),
      prisma.sEOOpportunity.aggregate({
        where,
        _avg: { cpc: true, searchVolume: true, priorityScore: true },
        _sum: { searchVolume: true },
        _min: { cpc: true },
        _max: { searchVolume: true },
      }),
    ]);

    // Estimate monthly traffic potential and cost
    const enriched = opportunities.map((opp) => {
      const cpc = Number(opp.cpc);
      const volume = opp.searchVolume;
      // Assume 3-5% CTR on paid ads for these keywords
      const estimatedMonthlyClicks = Math.round(volume * 0.04);
      const estimatedMonthlyCost = +(estimatedMonthlyClicks * cpc).toFixed(2);

      // Extract cluster data from sourceData if available
      const sd = opp.sourceData as Record<string, unknown> | null;
      const clusterVolume =
        sd && typeof sd === 'object' && 'clusterData' in sd
          ? ((sd['clusterData'] as Record<string, unknown>)?.['clusterTotalVolume'] as number) ||
            volume
          : volume;

      return {
        id: opp.id,
        keyword: opp.keyword,
        cpc,
        searchVolume: volume,
        clusterVolume,
        difficulty: opp.difficulty,
        priorityScore: opp.priorityScore,
        potentialValue: opp.potentialValue ? Number(opp.potentialValue) : null,
        intent: opp.intent,
        niche: opp.niche,
        location: opp.location,
        status: opp.status,
        site: opp.site,
        estimatedMonthlyClicks,
        estimatedMonthlyCost,
        paidCandidate: opp.status === 'PAID_CANDIDATE',
      };
    });

    // Group by site for summary
    const bySite = new Map<string, { name: string; count: number; totalVolume: number }>();
    for (const opp of enriched) {
      if (opp.site) {
        const existing = bySite.get(opp.site.id);
        if (existing) {
          existing.count++;
          existing.totalVolume += opp.searchVolume;
        } else {
          bySite.set(opp.site.id, {
            name: opp.site.name,
            count: 1,
            totalVolume: opp.searchVolume,
          });
        }
      }
    }

    return NextResponse.json({
      opportunities: enriched,
      summary: {
        totalOpportunities: totalCount,
        avgCpc: stats._avg.cpc ? Number(stats._avg.cpc) : 0,
        avgVolume: stats._avg.searchVolume ? Math.round(stats._avg.searchVolume) : 0,
        totalMonthlyVolume: stats._sum.searchVolume || 0,
        lowestCpc: stats._min.cpc ? Number(stats._min.cpc) : 0,
        highestVolume: stats._max.searchVolume || 0,
        avgScore: stats._avg.priorityScore ? Math.round(stats._avg.priorityScore) : 0,
        bySite: Array.from(bySite.entries()).map(([id, data]) => ({
          siteId: id,
          ...data,
        })),
      },
      filters: { maxCpc, minVolume, siteId, limit, sortBy },
    });
  } catch (error) {
    console.error('[API] Error fetching paid opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch paid opportunities' }, { status: 500 });
  }
}
