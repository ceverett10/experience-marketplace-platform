import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/bidding
 * Returns bidding engine analytics: portfolio ROAS, campaign performance, site profitability,
 * keyword opportunities with AI quality scores, and microsite data.
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
        microsite: { select: { siteName: true, fullDomain: true } },
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
        micrositeName: (c as any).microsite?.siteName || null,
        micrositeDomain: (c as any).microsite?.fullDomain || null,
        isMicrosite: !!(c as any).micrositeId,
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
        proposalData: c.proposalData || null,
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

    // --- PAID_CANDIDATE keyword opportunities per site ---
    // Count total and unassigned for summary
    const totalPaidCandidates = await prisma.sEOOpportunity.count({
      where: { status: 'PAID_CANDIDATE' as any },
    });
    const unassignedCount = await prisma.sEOOpportunity.count({
      where: { status: 'PAID_CANDIDATE' as any, siteId: null },
    });

    const kwWhere: Record<string, unknown> = { status: 'PAID_CANDIDATE' as any };
    if (siteId) kwWhere['siteId'] = siteId;

    const keywords = await prisma.sEOOpportunity.findMany({
      where: kwWhere as any,
      select: {
        id: true,
        keyword: true,
        searchVolume: true,
        cpc: true,
        difficulty: true,
        intent: true,
        priorityScore: true,
        location: true,
        niche: true,
        siteId: true,
        sourceData: true,
        site: { select: { name: true } },
      },
      orderBy: { priorityScore: 'desc' },
      take: 500,
    });

    // Group keywords by site for the response
    const keywordsBySite: Record<string, {
      siteName: string;
      keywords: Array<{
        id: string;
        keyword: string;
        searchVolume: number;
        cpc: number;
        difficulty: number;
        intent: string;
        priorityScore: number;
        location: string | null;
        niche: string;
        estimatedMonthlyClicks: number;
        estimatedMonthlyCost: number;
        maxBid: number | null;
        aiScore: number | null;
        aiDecision: string | null;
        aiReasoning: string | null;
      }>;
    }> = {};

    // Count AI evaluation stats
    let aiEvaluatedCount = 0;
    let aiBidCount = 0;
    let aiReviewCount = 0;

    for (const kw of keywords) {
      const sid = kw.siteId || 'unassigned';
      if (!keywordsBySite[sid]) {
        keywordsBySite[sid] = {
          siteName: kw.site?.name || 'Unassigned',
          keywords: [],
        };
      }
      const cpc = Number(kw.cpc || 0);
      const estClicks = Math.round((kw.searchVolume / 30) * 0.04 * 30); // 4% CTR
      const profile = profiles.find((p) => p.siteId === sid);
      const maxProfitCpc = profile ? Number(profile.maxProfitableCpc) : null;

      // Extract AI evaluation from sourceData
      const sd = kw.sourceData as { aiEvaluation?: {
        score?: number;
        decision?: string;
        reasoning?: string;
      } } | null;
      const aiEval = sd?.aiEvaluation;
      const aiScore = aiEval?.score ?? null;
      const aiDecision = aiEval?.decision ?? null;
      const aiReasoning = aiEval?.reasoning ?? null;

      if (aiScore !== null) {
        aiEvaluatedCount++;
        if (aiDecision === 'BID') aiBidCount++;
        else if (aiDecision === 'REVIEW') aiReviewCount++;
      }

      keywordsBySite[sid].keywords.push({
        id: kw.id,
        keyword: kw.keyword,
        searchVolume: kw.searchVolume,
        cpc,
        difficulty: kw.difficulty,
        intent: kw.intent,
        priorityScore: kw.priorityScore,
        location: kw.location,
        niche: kw.niche,
        estimatedMonthlyClicks: estClicks,
        estimatedMonthlyCost: Math.round(estClicks * cpc * 100) / 100,
        maxBid: maxProfitCpc ? Math.min(maxProfitCpc, cpc * 1.2) : null,
        aiScore,
        aiDecision,
        aiReasoning,
      });
    }

    // --- Active Microsites ---
    const microsites = await prisma.micrositeConfig.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        siteName: true,
        fullDomain: true,
        entityType: true,
        discoveryConfig: true,
        homepageConfig: true,
        cachedProductCount: true,
        analyticsSnapshots: {
          where: { date: { gte: lookback } },
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
      orderBy: { siteName: 'asc' },
    });

    const micrositeSummaries = microsites.map((ms) => {
      const disco = ms.discoveryConfig as {
        keyword?: string; destination?: string; niche?: string;
      } | null;
      const latestSnapshot = ms.analyticsSnapshots[0];

      return {
        id: ms.id,
        siteName: ms.siteName,
        fullDomain: ms.fullDomain,
        entityType: ms.entityType,
        keyword: disco?.keyword || null,
        destination: disco?.destination || null,
        niche: disco?.niche || null,
        productCount: ms.cachedProductCount,
        sessions: latestSnapshot?.sessions || 0,
        pageviews: latestSnapshot?.pageviews || 0,
      };
    });

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
      keywordsBySite,
      keywordSummary: {
        total: totalPaidCandidates,
        assigned: totalPaidCandidates - unassignedCount,
        unassigned: unassignedCount,
        aiEvaluated: aiEvaluatedCount,
        aiBid: aiBidCount,
        aiReview: aiReviewCount,
      },
      microsites: micrositeSummaries,
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

    if (action === 'deploy_drafts') {
      const jobs = await import('@experience-marketplace/jobs') as any;
      const deployDraftCampaigns = jobs.deployDraftCampaigns as () => Promise<{
        deployed: number; failed: number; skipped: number;
      }>;
      const result = await deployDraftCampaigns();
      return NextResponse.json({
        success: true,
        message: `Deployed ${result.deployed} campaigns (${result.failed} failed, ${result.skipped} skipped)`,
        data: result,
      });
    }

    if (action === 'reject_drafts') {
      const deleted = await prisma.adCampaign.deleteMany({
        where: { status: 'DRAFT' },
      });
      return NextResponse.json({
        success: true,
        message: `Rejected and deleted ${deleted.count} draft campaign${deleted.count !== 1 ? 's' : ''}`,
      });
    }

    if (action === 'set_budget_cap') {
      const { addJob } = await import('@experience-marketplace/jobs');
      const jobId = await addJob('BIDDING_ENGINE_RUN' as any, {
        mode: 'full',
        maxDailyBudget: body.dailyBudgetCap,
      });
      return NextResponse.json({
        success: true,
        message: `Re-running engine with \u00A3${body.dailyBudgetCap}/day budget`,
        jobId,
      });
    }

    if (action === 'run_enrichment') {
      const { addJob } = await import('@experience-marketplace/jobs');
      const jobId = await addJob('KEYWORD_ENRICHMENT' as any, {
        maxProductsPerSupplier: body.maxProducts || 100,
        maxSuppliersPerRun: body.maxSuppliers,
        skipDataForSeo: body.skipValidation || false,
        dryRun: body.dryRun || false,
        location: body.location || 'United Kingdom',
      });
      return NextResponse.json({
        success: true,
        message: 'Bulk keyword enrichment started',
        jobId,
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
