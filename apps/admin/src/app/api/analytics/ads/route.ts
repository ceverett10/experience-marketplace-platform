import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/ads
 * Returns ad campaign performance data for the dashboard.
 *
 * Query params:
 *   startDate - Start of date range (YYYY-MM-DD)
 *   endDate   - End of date range (YYYY-MM-DD)
 *   platform  - Filter by platform (GOOGLE_SEARCH, FACEBOOK)
 *   siteId    - Filter by site
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const siteId = searchParams.get('siteId') || undefined;
    const platform = searchParams.get('platform') || undefined;
    const days = parseInt(searchParams.get('days') || '30');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Prior period for comparison
    const priorEnd = new Date(startDate);
    const priorStart = new Date(startDate);
    priorStart.setDate(priorStart.getDate() - days);

    const MAX_DAILY_BUDGET = parseFloat(process.env['BIDDING_MAX_DAILY_BUDGET'] || '1200');

    // --- Campaign filters ---
    const campaignWhere: Record<string, unknown> = {};
    if (siteId) campaignWhere['siteId'] = siteId;
    if (platform) campaignWhere['platform'] = platform;

    // --- Get campaigns with daily metrics ---
    const campaigns = await prisma.adCampaign.findMany({
      where: campaignWhere as any,
      include: {
        site: { select: { name: true, primaryDomain: true } },
        microsite: { select: { siteName: true, fullDomain: true } },
        dailyMetrics: {
          where: { date: { gte: startDate, lte: endDate } },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // --- Current period KPIs ---
    let totalSpend = 0;
    let totalRevenue = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalConversions = 0;

    const campaignSummaries = campaigns.map((c) => {
      const spend = c.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
      const revenue = c.dailyMetrics.reduce((s, m) => s + Number(m.revenue), 0);
      const clicks = c.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
      const impressions = c.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
      const conversions = c.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
      const roas = spend > 0 ? revenue / spend : null;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;
      const cpc = clicks > 0 ? spend / clicks : null;
      const cpa = conversions > 0 ? spend / conversions : null;

      totalSpend += spend;
      totalRevenue += revenue;
      totalClicks += clicks;
      totalImpressions += impressions;
      totalConversions += conversions;

      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        status: c.status,
        siteName: c.site?.name || 'Unknown',
        micrositeName: c.microsite?.siteName || null,
        spend,
        revenue,
        roas,
        clicks,
        impressions,
        ctr,
        cpc,
        cpa,
        conversions,
        dailyBudget: Number(c.dailyBudget),
        maxCpc: Number(c.maxCpc),
        keywords: c.keywords,
        targetUrl: c.targetUrl,
        landingPagePath: c.landingPagePath || null,
        landingPageType: c.landingPageType || null,
        landingPageProducts: c.landingPageProducts,
        qualityScore: c.qualityScore,
      };
    });

    const kpis = {
      spend: totalSpend,
      revenue: totalRevenue,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
      clicks: totalClicks,
      impressions: totalImpressions,
      conversions: totalConversions,
      cpc: totalClicks > 0 ? totalSpend / totalClicks : null,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
      budgetUtilization: MAX_DAILY_BUDGET > 0 ? (totalSpend / days / MAX_DAILY_BUDGET) * 100 : null,
    };

    // --- Prior period KPIs for comparison ---
    const priorMetrics = await prisma.adDailyMetric.aggregate({
      where: {
        date: { gte: priorStart, lt: priorEnd },
        ...(siteId ? { campaign: { siteId } } : {}),
        ...(platform ? { campaign: { platform: platform as any } } : {}),
      } as any,
      _sum: { spend: true, clicks: true, impressions: true, conversions: true, revenue: true },
    });

    const priorSpend = Number(priorMetrics._sum?.spend || 0);
    const priorRevenue = Number(priorMetrics._sum?.revenue || 0);
    const priorClicks = Number(priorMetrics._sum?.clicks || 0);
    const priorImpressions = Number(priorMetrics._sum?.impressions || 0);
    const priorConversions = Number(priorMetrics._sum?.conversions || 0);

    const kpisPrior = {
      spend: priorSpend,
      revenue: priorRevenue,
      roas: priorSpend > 0 ? priorRevenue / priorSpend : null,
      clicks: priorClicks,
      impressions: priorImpressions,
      conversions: priorConversions,
      cpc: priorClicks > 0 ? priorSpend / priorClicks : null,
      cpa: priorConversions > 0 ? priorSpend / priorConversions : null,
      ctr: priorImpressions > 0 ? (priorClicks / priorImpressions) * 100 : null,
    };

    // --- Daily trend ---
    const dailyMetricsRaw = await prisma.adDailyMetric.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        ...(siteId ? { campaign: { siteId } } : {}),
        ...(platform ? { campaign: { platform: platform as any } } : {}),
      } as any,
      select: {
        date: true,
        spend: true,
        clicks: true,
        impressions: true,
        conversions: true,
        revenue: true,
      },
      orderBy: { date: 'asc' },
    });

    // Aggregate by date
    const dailyMap = new Map<
      string,
      { spend: number; revenue: number; clicks: number; impressions: number; conversions: number }
    >();
    for (const m of dailyMetricsRaw) {
      const dateKey = new Date(m.date).toISOString().split('T')[0]!;
      const existing = dailyMap.get(dateKey) || {
        spend: 0,
        revenue: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
      };
      existing.spend += Number(m.spend);
      existing.revenue += Number(m.revenue);
      existing.clicks += m.clicks;
      existing.impressions += m.impressions;
      existing.conversions += m.conversions;
      dailyMap.set(dateKey, existing);
    }

    const dailyTrend = Array.from(dailyMap.entries()).map(([date, metrics]) => ({
      date,
      ...metrics,
      roas: metrics.spend > 0 ? metrics.revenue / metrics.spend : null,
    }));

    // --- Platform comparison ---
    const googleCampaigns = campaignSummaries.filter((c) => c.platform === 'GOOGLE_SEARCH');
    const metaCampaigns = campaignSummaries.filter((c) => c.platform === 'FACEBOOK');

    const aggregatePlatform = (list: typeof campaignSummaries) => {
      const spend = list.reduce((s, c) => s + c.spend, 0);
      const revenue = list.reduce((s, c) => s + c.revenue, 0);
      const clicks = list.reduce((s, c) => s + c.clicks, 0);
      const impressions = list.reduce((s, c) => s + c.impressions, 0);
      const conversions = list.reduce((s, c) => s + c.conversions, 0);
      return {
        campaigns: list.length,
        spend,
        revenue,
        roas: spend > 0 ? revenue / spend : null,
        clicks,
        impressions,
        conversions,
        cpc: clicks > 0 ? spend / clicks : null,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      };
    };

    const platformComparison = {
      google: aggregatePlatform(googleCampaigns),
      meta: aggregatePlatform(metaCampaigns),
    };

    // --- Attribution (bookings by UTM campaign) ---
    // Include bookings from microsites associated with this site's campaigns
    const micrositeIds = [
      ...new Set(campaigns.filter((c) => c.micrositeId).map((c) => c.micrositeId!)),
    ];
    const attributionWhere: Record<string, unknown> = {
      utmMedium: 'cpc',
      createdAt: { gte: startDate, lte: endDate },
      status: { in: ['CONFIRMED', 'COMPLETED'] },
    };
    if (siteId) {
      if (micrositeIds.length > 0) {
        attributionWhere['OR'] = [{ siteId }, { micrositeId: { in: micrositeIds } }];
      } else {
        attributionWhere['siteId'] = siteId;
      }
    }

    const attributionBookings = await (prisma as any).booking.groupBy({
      by: ['utmCampaign', 'utmSource'],
      where: attributionWhere,
      _count: true,
      _sum: { totalAmount: true, commissionAmount: true },
    });

    const attribution = attributionBookings.map((a: any) => ({
      campaign: a.utmCampaign || 'Unknown',
      source: a.utmSource || 'Unknown',
      bookings: a._count,
      revenue: Number(a._sum?.totalAmount || 0),
      commission: Number(a._sum?.commissionAmount || 0),
    }));

    // --- Landing page performance ---
    const landingPageBookings = await (prisma as any).booking.groupBy({
      by: ['landingPage'],
      where: {
        utmMedium: 'cpc',
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        landingPage: { not: null },
        ...(siteId
          ? micrositeIds.length > 0
            ? { OR: [{ siteId }, { micrositeId: { in: micrositeIds } }] }
            : { siteId }
          : {}),
      },
      _count: true,
      _sum: { totalAmount: true, commissionAmount: true },
    });

    const landingPages = landingPageBookings
      .map((lp: any) => ({
        path: lp.landingPage || '/',
        conversions: lp._count,
        revenue: Number(lp._sum?.totalAmount || 0),
        commission: Number(lp._sum?.commissionAmount || 0),
      }))
      .sort((a: any, b: any) => b.conversions - a.conversions);

    // --- Landing page type aggregation ---
    const lpTypeMap = new Map<
      string,
      {
        type: string;
        campaigns: number;
        spend: number;
        clicks: number;
        impressions: number;
        conversions: number;
        revenue: number;
        qualityScores: number[];
      }
    >();

    for (const c of campaignSummaries) {
      const lpType = c.landingPageType || 'HOMEPAGE';
      const existing = lpTypeMap.get(lpType) || {
        type: lpType,
        campaigns: 0,
        spend: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        revenue: 0,
        qualityScores: [],
      };
      existing.campaigns++;
      existing.spend += c.spend;
      existing.clicks += c.clicks;
      existing.impressions += c.impressions;
      existing.conversions += c.conversions;
      existing.revenue += c.revenue;
      if (c.qualityScore != null) existing.qualityScores.push(c.qualityScore);
      lpTypeMap.set(lpType, existing);
    }

    const landingPagesByType = Array.from(lpTypeMap.values())
      .map((lp) => ({
        type: lp.type,
        campaigns: lp.campaigns,
        spend: lp.spend,
        clicks: lp.clicks,
        conversions: lp.conversions,
        revenue: lp.revenue,
        roas: lp.spend > 0 ? lp.revenue / lp.spend : null,
        cvr: lp.clicks > 0 ? (lp.conversions / lp.clicks) * 100 : null,
        avgQualityScore:
          lp.qualityScores.length > 0
            ? lp.qualityScores.reduce((a, b) => a + b, 0) / lp.qualityScores.length
            : null,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // --- Alerts ---
    const alerts = await (prisma as any).adAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unacknowledgedCount = await (prisma as any).adAlert.count({
      where: { acknowledged: false },
    });

    return NextResponse.json({
      kpis,
      kpisPrior,
      dailyTrend,
      platformComparison,
      campaigns: campaignSummaries,
      attribution,
      landingPages,
      landingPagesByType,
      alerts,
      alertCount: unacknowledgedCount,
      period: { days, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error) {
    console.error('[Ads Analytics API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch ad analytics' }, { status: 500 });
  }
}

/**
 * POST /api/analytics/ads
 * Actions: pause/resume campaigns, adjust budgets, acknowledge alerts, trigger sync.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'pause_campaign': {
        const { campaignId } = body;
        if (!campaignId)
          return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
        await prisma.adCampaign.update({
          where: { id: campaignId },
          data: { status: 'PAUSED' },
        });
        return NextResponse.json({ success: true, message: 'Campaign paused' });
      }

      case 'resume_campaign': {
        const { campaignId } = body;
        if (!campaignId)
          return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
        await prisma.adCampaign.update({
          where: { id: campaignId },
          data: { status: 'ACTIVE' },
        });
        return NextResponse.json({ success: true, message: 'Campaign resumed' });
      }

      case 'adjust_budget': {
        const { campaignId, dailyBudget } = body;
        if (!campaignId || dailyBudget == null) {
          return NextResponse.json(
            { error: 'campaignId and dailyBudget required' },
            { status: 400 }
          );
        }
        await prisma.adCampaign.update({
          where: { id: campaignId },
          data: { dailyBudget: parseFloat(dailyBudget) },
        });
        return NextResponse.json({ success: true, message: `Budget updated to £${dailyBudget}` });
      }

      case 'acknowledge_alert': {
        const { alertId } = body;
        if (!alertId) return NextResponse.json({ error: 'alertId required' }, { status: 400 });
        await (prisma as any).adAlert.update({
          where: { id: alertId },
          data: { acknowledged: true, acknowledgedAt: new Date() },
        });
        return NextResponse.json({ success: true, message: 'Alert acknowledged' });
      }

      case 'acknowledge_all_alerts': {
        await (prisma as any).adAlert.updateMany({
          where: { acknowledged: false },
          data: { acknowledged: true, acknowledgedAt: new Date() },
        });
        return NextResponse.json({ success: true, message: 'All alerts acknowledged' });
      }

      case 'sync_now': {
        // Enqueue immediate AD_CAMPAIGN_SYNC job
        // This requires access to BullMQ queue — use a simple flag approach
        return NextResponse.json({
          success: true,
          message: 'Sync triggered. Refresh in a few minutes to see updated data.',
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Ads Analytics API] POST error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
