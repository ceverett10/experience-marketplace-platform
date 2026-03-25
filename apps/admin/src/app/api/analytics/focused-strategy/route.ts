import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface FocusedCombo {
  city: string;
  category: string;
  status: string;
  dailyBudget: number;
}

/**
 * GET /api/analytics/focused-strategy
 * Returns the active focused strategy config with per-combination performance data
 */
export async function GET(): Promise<NextResponse> {
  try {
    const config = await prisma.focusedStrategyConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      return NextResponse.json({ active: false, config: null, combinations: [] });
    }

    const combinations = (config.combinations as unknown as FocusedCombo[]) || [];

    // Get all focused-strategy campaigns
    const campaigns = await prisma.adCampaign.findMany({
      where: {
        proposalData: { path: ['focusedStrategy'], equals: true },
      },
      select: {
        id: true,
        name: true,
        status: true,
        platform: true,
        keywords: true,
        dailyBudget: true,
        totalSpend: true,
        totalClicks: true,
        totalImpressions: true,
        conversions: true,
        revenue: true,
        roas: true,
        proposalData: true,
        dailyMetrics: {
          where: {
            date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          select: {
            date: true,
            spend: true,
            clicks: true,
            impressions: true,
            conversions: true,
            revenue: true,
          },
          orderBy: { date: 'desc' },
        },
      },
    });

    // Group campaigns by combo
    const comboPerformance = combinations.map((combo) => {
      const comboId = `${combo.city}|||${combo.category}`;
      const comboCampaigns = campaigns.filter((c) => {
        const pd = c.proposalData as Record<string, unknown> | null;
        return pd?.['focusedComboId'] === comboId;
      });

      // Aggregate 7-day metrics
      let weekSpend = 0;
      let weekClicks = 0;
      let weekImpressions = 0;
      let weekConversions = 0;
      let weekRevenue = 0;

      for (const campaign of comboCampaigns) {
        for (const m of campaign.dailyMetrics) {
          weekSpend += Number(m.spend);
          weekClicks += m.clicks;
          weekImpressions += m.impressions;
          weekConversions += m.conversions;
          weekRevenue += Number(m.revenue);
        }
      }

      const weekRoas = weekSpend > 0 ? weekRevenue / weekSpend : 0;

      // Lifetime totals
      let lifetimeSpend = 0;
      let lifetimeRevenue = 0;
      let lifetimeConversions = 0;

      for (const campaign of comboCampaigns) {
        lifetimeSpend += Number(campaign.totalSpend);
        lifetimeRevenue += Number(campaign.revenue);
        lifetimeConversions += campaign.conversions;
      }

      const lifetimeRoas = lifetimeSpend > 0 ? lifetimeRevenue / lifetimeSpend : 0;

      return {
        city: combo.city,
        category: combo.category,
        status: combo.status,
        dailyBudget: combo.dailyBudget,
        campaignCount: comboCampaigns.length,
        week: {
          spend: Math.round(weekSpend * 100) / 100,
          clicks: weekClicks,
          impressions: weekImpressions,
          conversions: weekConversions,
          revenue: Math.round(weekRevenue * 100) / 100,
          roas: Math.round(weekRoas * 100) / 100,
        },
        lifetime: {
          spend: Math.round(lifetimeSpend * 100) / 100,
          revenue: Math.round(lifetimeRevenue * 100) / 100,
          conversions: lifetimeConversions,
          roas: Math.round(lifetimeRoas * 100) / 100,
        },
      };
    });

    // Portfolio totals
    const totalWeekSpend = comboPerformance.reduce((s, c) => s + c.week.spend, 0);
    const totalWeekRevenue = comboPerformance.reduce((s, c) => s + c.week.revenue, 0);
    const portfolioRoas = totalWeekSpend > 0 ? totalWeekRevenue / totalWeekSpend : 0;

    return NextResponse.json({
      active: true,
      config: {
        id: config.id,
        targetRoas: config.targetRoas,
        totalDailyBudget: Number(config.totalDailyBudget),
        rampPhase: config.rampPhase,
        pauseRoas: config.pauseRoas,
        scaleRoas: config.scaleRoas,
      },
      combinations: comboPerformance,
      portfolio: {
        weekSpend: Math.round(totalWeekSpend * 100) / 100,
        weekRevenue: Math.round(totalWeekRevenue * 100) / 100,
        weekRoas: Math.round(portfolioRoas * 100) / 100,
        activeCombos: comboPerformance.filter((c) => c.status === 'ACTIVE').length,
        pausedCombos: comboPerformance.filter((c) => c.status === 'PAUSED').length,
        pendingCombos: comboPerformance.filter((c) => c.status === 'PENDING').length,
      },
    });
  } catch (error) {
    console.error('[Focused Strategy API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch focused strategy data' }, { status: 500 });
  }
}
