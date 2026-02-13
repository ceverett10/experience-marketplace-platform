import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/bidding
 * Returns bidding engine analytics: portfolio ROAS, campaign performance, site profitability.
 *
 * Query params:
 *   siteId - Filter to a specific site
 *   days   - Lookback period (default: 30)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const siteId = searchParams.get('siteId') || undefined;
    const days = parseInt(searchParams.get('days') || '30');

    const lookback = new Date();
    lookback.setDate(lookback.getDate() - days);

    // --- Site Profitability Profiles ---
    const profileWhere: Record<string, unknown> = {};
    if (siteId) profileWhere['siteId'] = siteId;

    const profiles = await prisma.biddingProfile.findMany({
      where: profileWhere as any,
      include: { site: { select: { name: true, primaryDomain: true } } },
      orderBy: { maxProfitableCpc: 'desc' },
    });

    // --- Campaign Performance ---
    const campaignWhere: Record<string, unknown> = {};
    if (siteId) campaignWhere['siteId'] = siteId;

    const campaigns = await prisma.adCampaign.findMany({
      where: campaignWhere as any,
      include: {
        site: { select: { name: true } },
        dailyMetrics: {
          where: { date: { gte: lookback } },
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Aggregate portfolio metrics
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

      totalSpend += spend;
      totalRevenue += revenue;
      totalClicks += clicks;
      totalImpressions += impressions;
      totalConversions += conversions;

      return {
        id: c.id,
        name: c.name,
        siteName: c.site?.name || 'Unknown',
        platform: c.platform,
        status: c.status,
        dailyBudget: Number(c.dailyBudget),
        maxCpc: Number(c.maxCpc),
        keywords: c.keywords,
        spend,
        revenue,
        clicks,
        impressions,
        conversions,
        roas: spend > 0 ? revenue / spend : 0,
        ctr: impressions > 0 ? clicks / impressions : 0,
        avgCpc: clicks > 0 ? spend / clicks : 0,
        daysWithData: c.dailyMetrics.length,
      };
    });

    const portfolioRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    // --- Booking attribution summary ---
    const bookingAttribution = await prisma.booking.groupBy({
      by: ['utmSource'],
      where: {
        utmSource: { not: null },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: lookback },
        ...(siteId ? { siteId } : {}),
      },
      _sum: { totalAmount: true, commissionAmount: true },
      _count: true,
    });

    const paidBookings = bookingAttribution
      .filter((b) => b.utmSource)
      .map((b) => ({
        source: b.utmSource,
        bookings: b._count,
        revenue: Number(b._sum.totalAmount || 0),
        commission: Number(b._sum.commissionAmount || 0),
      }));

    // --- Budget utilization ---
    const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
    const totalDailyBudget = activeCampaigns.reduce(
      (s, c) => s + Number(c.dailyBudget),
      0
    );
    const maxDailyBudget = parseFloat(
      process.env['BIDDING_MAX_DAILY_BUDGET'] || '200'
    );

    return NextResponse.json({
      period: { days, since: lookback.toISOString() },
      portfolio: {
        totalSpend,
        totalRevenue,
        totalClicks,
        totalImpressions,
        totalConversions,
        roas: portfolioRoas,
        avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      },
      budget: {
        dailyAllocated: totalDailyBudget,
        dailyCap: maxDailyBudget,
        utilization: maxDailyBudget > 0 ? totalDailyBudget / maxDailyBudget : 0,
        activeCampaigns: activeCampaigns.length,
        totalCampaigns: campaigns.length,
      },
      profiles: profiles.map((p) => ({
        siteId: p.siteId,
        siteName: p.site?.name || 'Unknown',
        domain: (p.site as any)?.primaryDomain || null,
        avgOrderValue: Number(p.avgOrderValue),
        avgCommissionRate: p.avgCommissionRate,
        conversionRate: p.conversionRate,
        maxProfitableCpc: Number(p.maxProfitableCpc),
        isAutoBidding: p.isAutoBidding,
        lastCalculatedAt: p.lastCalculatedAt?.toISOString() || null,
      })),
      campaigns: campaignSummaries,
      attribution: paidBookings,
    });
  } catch (error) {
    console.error('[API] Error fetching bidding analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bidding analytics' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics/bidding
 * Manual bidding engine controls.
 *
 * Actions:
 *   run_engine   — Trigger a bidding engine run (full, optimize_only, report_only)
 *   pause_all    — Pause all active campaigns
 *   adjust_budget — Update portfolio daily budget cap
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = body as { action: string };

    if (action === 'run_engine') {
      const { addJob } = await import('@experience-marketplace/jobs');
      const mode = body.mode || 'full';
      const jobId = await addJob('BIDDING_ENGINE_RUN' as any, {
        mode,
        maxDailyBudget: body.maxDailyBudget,
      });
      return NextResponse.json({
        success: true,
        message: `Triggered bidding engine in ${mode} mode`,
        jobId,
      });
    }

    if (action === 'pause_all') {
      const updated = await prisma.adCampaign.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'PAUSED' },
      });
      return NextResponse.json({
        success: true,
        message: `Paused ${updated.count} active campaigns`,
      });
    }

    if (action === 'adjust_budget') {
      const { siteId: targetSiteId, dailyBudgetCap } = body as {
        siteId?: string;
        dailyBudgetCap: number;
      };
      if (targetSiteId) {
        await prisma.biddingProfile.update({
          where: { siteId: targetSiteId },
          data: { dailyBudgetCap },
        });
        return NextResponse.json({
          success: true,
          message: `Updated budget cap for site to £${dailyBudgetCap}/day`,
        });
      }
      return NextResponse.json(
        { error: 'siteId required for budget adjustment' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Error in bidding action:', error);
    return NextResponse.json(
      { error: 'Failed to execute bidding action' },
      { status: 500 }
    );
  }
}
