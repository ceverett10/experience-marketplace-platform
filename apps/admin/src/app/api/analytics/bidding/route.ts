import { type NextRequest, NextResponse } from 'next/server';
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
    const days = Math.min(parseInt(searchParams.get('days') || '30') || 30, 365);

    const lookback = new Date();
    lookback.setDate(lookback.getDate() - days);

    const campaignWhere: Record<string, unknown> = {
      status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
      parentCampaignId: null, // Exclude child ad sets — parents have aggregated metrics
    };
    if (siteId) campaignWhere['siteId'] = siteId;

    const profileWhere: Record<string, unknown> = {};
    if (siteId) profileWhere['siteId'] = siteId;

    const kwWhere: Record<string, unknown> = { status: 'PAID_CANDIDATE' as any };
    if (siteId) kwWhere['siteId'] = siteId;

    // ── Parallelize ALL independent queries ──────────────────────────────
    const [
      profiles,
      campaigns,
      keywords,
      microsites,
      totalPaidCandidates,
      unassignedCount,
      kwPoolStats,
      suppliersTotal,
      suppliersEnriched,
      lastEnrichment,
    ] = await Promise.all([
      // 1. Site profitability profiles
      prisma.biddingProfile.findMany({
        where: profileWhere as any,
        include: { site: { select: { name: true, primaryDomain: true } } },
        orderBy: { maxProfitableCpc: 'desc' },
      }),

      // 2. Campaigns (WITHOUT dailyMetrics — we aggregate separately)
      prisma.adCampaign.findMany({
        where: campaignWhere as any,
        include: {
          site: { select: { name: true } },
          microsite: { select: { siteName: true, fullDomain: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),

      // 3. Keyword opportunities (top 500)
      prisma.sEOOpportunity.findMany({
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
      }),

      // 4. Active microsites (no nested analyticsSnapshots — 39k+ microsites exceed PG bind limit)
      prisma.micrositeConfig.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          siteName: true,
          fullDomain: true,
          entityType: true,
          discoveryConfig: true,
          cachedProductCount: true,
        },
        orderBy: { siteName: 'asc' },
      }),

      // 5. Keyword counts
      prisma.sEOOpportunity.count({ where: { status: 'PAID_CANDIDATE' as any } }),
      prisma.sEOOpportunity.count({ where: { status: 'PAID_CANDIDATE' as any, siteId: null } }),

      // 6. Keyword pool stats — single groupBy + aggregate replaces 10 separate queries
      prisma.$queryRawUnsafe<
        Array<{
          intent: string | null;
          cnt: bigint;
          avg_cpc: number | null;
          avg_vol: number | null;
          high_vol: bigint;
          med_vol: bigint;
          low_vol: bigint;
          cpc_u25: bigint;
          cpc_25_50: bigint;
          cpc_50_100: bigint;
          cpc_o100: bigint;
        }>
      >(
        `SELECT
          intent,
          COUNT(*)::bigint AS cnt,
          AVG(cpc) AS avg_cpc,
          AVG("searchVolume") AS avg_vol,
          COUNT(*) FILTER (WHERE "searchVolume" >= 1000)::bigint AS high_vol,
          COUNT(*) FILTER (WHERE "searchVolume" >= 100 AND "searchVolume" < 1000)::bigint AS med_vol,
          COUNT(*) FILTER (WHERE "searchVolume" >= 10 AND "searchVolume" < 100)::bigint AS low_vol,
          COUNT(*) FILTER (WHERE cpc < 0.25)::bigint AS cpc_u25,
          COUNT(*) FILTER (WHERE cpc >= 0.25 AND cpc < 0.5)::bigint AS cpc_25_50,
          COUNT(*) FILTER (WHERE cpc >= 0.5 AND cpc < 1.0)::bigint AS cpc_50_100,
          COUNT(*) FILTER (WHERE cpc >= 1.0)::bigint AS cpc_o100
        FROM "SEOOpportunity"
        WHERE status::text = 'PAID_CANDIDATE'
        GROUP BY intent`
      ),

      // 7. Supplier enrichment stats
      prisma.supplier.count({ where: { microsite: { status: 'ACTIVE' } } }),
      prisma.supplier.count({ where: { keywordsEnrichedAt: { not: null } } }),
      prisma.supplier.aggregate({ _max: { keywordsEnrichedAt: true } }),
    ]);

    // ── Aggregate campaign metrics at DB level (single query) ────────────
    const campaignIds = campaigns.map((c) => c.id);
    const metricsAgg =
      campaignIds.length > 0
        ? await prisma.$queryRawUnsafe<
            Array<{
              campaign_id: string;
              total_spend: number;
              total_revenue: number;
              total_clicks: bigint;
              total_impressions: bigint;
              total_conversions: bigint;
              days_with_data: bigint;
            }>
          >(
            `SELECT
              "campaignId" AS campaign_id,
              COALESCE(SUM(spend), 0) AS total_spend,
              COALESCE(SUM(revenue), 0) AS total_revenue,
              COALESCE(SUM(clicks), 0)::bigint AS total_clicks,
              COALESCE(SUM(impressions), 0)::bigint AS total_impressions,
              COALESCE(SUM(conversions), 0)::bigint AS total_conversions,
              COUNT(*)::bigint AS days_with_data
            FROM "ad_daily_metrics"
            WHERE "campaignId" = ANY($1) AND date >= $2
            GROUP BY "campaignId"`,
            campaignIds,
            lookback
          )
        : [];

    const metricsMap = new Map(metricsAgg.map((m) => [m.campaign_id, m]));

    // ── Build campaign summaries ─────────────────────────────────────────
    let totalSpend = 0;
    let totalRevenue = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalConversions = 0;

    const campaignSummaries = campaigns.map((c) => {
      const m = metricsMap.get(c.id);
      const spend = Number(m?.total_spend || 0);
      const revenue = Number(m?.total_revenue || 0);
      const clicks = Number(m?.total_clicks || 0);
      const impressions = Number(m?.total_impressions || 0);
      const conversions = Number(m?.total_conversions || 0);

      totalSpend += spend;
      totalRevenue += revenue;
      totalClicks += clicks;
      totalImpressions += impressions;
      totalConversions += conversions;

      return {
        id: c.id,
        name: c.name,
        siteName: c.site?.name || 'Unknown',
        micrositeName: c.microsite?.siteName || null,
        micrositeDomain: c.microsite?.fullDomain || null,
        isMicrosite: !!c.micrositeId,
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
        daysWithData: Number(m?.days_with_data || 0),
        targetUrl: c.targetUrl || null,
        proposalData: c.proposalData || null,
        landingPagePath: c.landingPagePath || null,
        landingPageType: c.landingPageType || null,
        landingPageProducts: c.landingPageProducts || null,
        qualityScore: c.qualityScore || null,
        platformCampaignId: c.platformCampaignId || null,
        audiences: c.audiences || null,
      };
    });

    const portfolioRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    // ── Booking attribution ──────────────────────────────────────────────
    const micrositeIds = [
      ...new Set(campaigns.filter((c) => c.micrositeId).map((c) => c.micrositeId!)),
    ];
    const bookingAttribution = await prisma.booking.groupBy({
      by: ['utmSource'],
      where: {
        utmSource: { not: null },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: lookback },
        ...(siteId
          ? micrositeIds.length > 0
            ? { OR: [{ siteId }, { micrositeId: { in: micrositeIds } }] }
            : { siteId }
          : {}),
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

    // ── Group keywords by site ───────────────────────────────────────────
    const profileMap = new Map(profiles.map((p) => [p.siteId, p]));
    const keywordsBySite: Record<
      string,
      {
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
      }
    > = {};

    let aiEvaluatedCount = 0;
    let aiBidCount = 0;
    let aiReviewCount = 0;

    for (const kw of keywords) {
      const sid = kw.siteId || 'unassigned';
      if (!keywordsBySite[sid]) {
        keywordsBySite[sid] = { siteName: kw.site?.name || 'Unassigned', keywords: [] };
      }
      const cpc = Number(kw.cpc || 0);
      const estClicks = Math.round((kw.searchVolume / 30) * 0.04 * 30); // 4% CTR
      const profile = profileMap.get(sid);
      const maxProfitCpc = profile ? Number(profile.maxProfitableCpc) : null;

      const sd = kw.sourceData as {
        aiEvaluation?: { score?: number; decision?: string; reasoning?: string };
      } | null;
      const aiEval = sd?.aiEvaluation;
      const aiScore = aiEval?.score ?? null;
      const aiDecision = aiEval?.decision ?? null;
      const aiReasoning = aiEval?.reasoning ?? null;

      if (aiScore !== null) {
        aiEvaluatedCount++;
        if (aiDecision === 'BID') aiBidCount++;
        else if (aiDecision === 'REVIEW') aiReviewCount++;
      }

      keywordsBySite[sid]!.keywords.push({
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

    // ── Microsite summaries ──────────────────────────────────────────────
    const micrositeSummaries = microsites.map((ms) => {
      const disco = ms.discoveryConfig as {
        keyword?: string;
        destination?: string;
        niche?: string;
      } | null;
      return {
        id: ms.id,
        siteName: ms.siteName,
        fullDomain: ms.fullDomain,
        entityType: ms.entityType,
        keyword: disco?.keyword || null,
        destination: disco?.destination || null,
        niche: disco?.niche || null,
        productCount: ms.cachedProductCount,
        sessions: 0,
        pageviews: 0,
      };
    });

    // ── Budget utilization ───────────────────────────────────────────────
    const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
    const totalDailyBudget = activeCampaigns.reduce((s, c) => s + Number(c.dailyBudget), 0);
    const maxDailyBudget = parseFloat(process.env['BIDDING_MAX_DAILY_BUDGET'] || '1200');

    // ── Keyword pool stats from single grouped query ─────────────────────
    let kwTotal = 0;
    let kwAvgCpc = 0;
    let kwAvgVol = 0;
    let kwHighVol = 0;
    let kwMedVol = 0;
    let kwLowVol = 0;
    let kwCpcU25 = 0;
    let kwCpc25_50 = 0;
    let kwCpc50_100 = 0;
    let kwCpcO100 = 0;
    const intentMap: Record<string, number> = {};

    for (const row of kwPoolStats) {
      const cnt = Number(row.cnt);
      kwTotal += cnt;
      kwHighVol += Number(row.high_vol);
      kwMedVol += Number(row.med_vol);
      kwLowVol += Number(row.low_vol);
      kwCpcU25 += Number(row.cpc_u25);
      kwCpc25_50 += Number(row.cpc_25_50);
      kwCpc50_100 += Number(row.cpc_50_100);
      kwCpcO100 += Number(row.cpc_o100);
      if (row.intent) intentMap[row.intent] = cnt;
    }
    if (kwTotal > 0) {
      // Weighted average across intent groups
      let totalCpcWeighted = 0;
      let totalVolWeighted = 0;
      for (const row of kwPoolStats) {
        const cnt = Number(row.cnt);
        totalCpcWeighted += (row.avg_cpc || 0) * cnt;
        totalVolWeighted += (row.avg_vol || 0) * cnt;
      }
      kwAvgCpc = totalCpcWeighted / kwTotal;
      kwAvgVol = Math.round(totalVolWeighted / kwTotal);
    }

    // Unique cities count
    const kwLocations = await prisma.sEOOpportunity.findMany({
      where: { status: 'PAID_CANDIDATE' as any, location: { not: null } },
      select: { location: true },
      distinct: ['location' as any],
    });

    // ── Projection from DRAFT campaigns ──────────────────────────────────
    const draftsWithProposals = campaignSummaries.filter(
      (c) => c.status === 'DRAFT' && c.proposalData
    );
    let projection: Record<string, unknown> | null = null;
    if (draftsWithProposals.length > 0) {
      const uniqueKws = new Set(draftsWithProposals.flatMap((c) => c.keywords));
      const micrositeDrafts = draftsWithProposals.filter((c) => c.isMicrosite);
      const mainDrafts = draftsWithProposals.filter((c) => !c.isMicrosite);
      const uniqueMs = new Set(micrositeDrafts.map((c) => c.micrositeDomain).filter(Boolean));
      const googleDrafts = draftsWithProposals.filter((c) => c.platform === 'GOOGLE_SEARCH');
      const fbDrafts = draftsWithProposals.filter((c) => c.platform === 'FACEBOOK');
      const dSpend = draftsWithProposals.reduce((s, c) => {
        const p = c.proposalData as any;
        return s + (p.totalExpectedDailyCost ?? p.expectedDailyCost ?? 0);
      }, 0);
      const dRev = draftsWithProposals.reduce((s, c) => {
        const p = c.proposalData as any;
        return s + (p.totalExpectedDailyRevenue ?? p.expectedDailyRevenue ?? 0);
      }, 0);
      const profitable = draftsWithProposals.filter((c) => {
        const p = c.proposalData as any;
        const cost = p.totalExpectedDailyCost ?? p.expectedDailyCost ?? 0;
        const rev = p.totalExpectedDailyRevenue ?? p.expectedDailyRevenue ?? 0;
        return cost > 0 && rev / cost >= 3;
      });
      const breakEven = draftsWithProposals.filter((c) => {
        const p = c.proposalData as any;
        const cost = p.totalExpectedDailyCost ?? p.expectedDailyCost ?? 0;
        const rev = p.totalExpectedDailyRevenue ?? p.expectedDailyRevenue ?? 0;
        const r = cost > 0 ? rev / cost : 0;
        return r >= 1 && r < 3;
      });
      const firstAssumptions = (draftsWithProposals[0]!.proposalData as any)?.assumptions;
      projection = {
        totalCampaigns: draftsWithProposals.length,
        uniqueKeywords: uniqueKws.size,
        dailySpend: dSpend,
        dailyRevenue: dRev,
        overallRoas: dSpend > 0 ? dRev / dSpend : 0,
        profitableCampaigns: profitable.length,
        breakEvenCampaigns: breakEven.length,
        micrositeCampaigns: micrositeDrafts.length,
        mainSiteCampaigns: mainDrafts.length,
        uniqueMicrosites: uniqueMs.size,
        googleCampaigns: googleDrafts.length,
        facebookCampaigns: fbDrafts.length,
        assumptions: firstAssumptions
          ? {
              aov: firstAssumptions.avgOrderValue,
              commission: firstAssumptions.commissionRate,
              cvr: firstAssumptions.conversionRate,
              targetRoas: firstAssumptions.targetRoas,
            }
          : null,
      };
    }

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
      enrichment: {
        suppliersTotal,
        suppliersEnriched,
        lastEnrichmentDate: lastEnrichment._max.keywordsEnrichedAt?.toISOString() || null,
        keywordPool: {
          total: totalPaidCandidates,
          avgCpc: kwAvgCpc,
          avgVolume: kwAvgVol,
          highVolume: kwHighVol,
          medVolume: kwMedVol,
          lowVolume: kwLowVol,
          cpcUnder025: kwCpcU25,
          cpc025to050: kwCpc25_50,
          cpc050to100: kwCpc50_100,
          cpcOver100: kwCpcO100,
          uniqueCities: kwLocations.length,
          intentBreakdown: {
            commercial: intentMap['COMMERCIAL'] || 0,
            transactional: intentMap['TRANSACTIONAL'] || 0,
            informational: intentMap['INFORMATIONAL'] || 0,
            navigational: intentMap['NAVIGATIONAL'] || 0,
          },
        },
        projection,
      },
    });
  } catch (error) {
    console.error('[API] Error fetching bidding analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch bidding analytics' }, { status: 500 });
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
      const jobs = (await import('@experience-marketplace/jobs')) as any;
      const deployDraftCampaigns = jobs.deployDraftCampaigns as () => Promise<{
        deployed: number;
        failed: number;
        skipped: number;
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

    if (action === 'activate_paused') {
      const paused = await prisma.adCampaign.findMany({
        where: { status: 'PAUSED', platformCampaignId: { not: null } },
        select: { id: true, platform: true, platformCampaignId: true, name: true },
      });

      let activated = 0;
      let failed = 0;

      for (const campaign of paused) {
        try {
          const jobs = (await import('@experience-marketplace/jobs')) as any;
          if (campaign.platform === 'FACEBOOK') {
            const metaClient = await jobs.getMetaAdsClientForActivation?.();
            // Set status on platform if client available
          } else if (campaign.platform === 'GOOGLE_SEARCH') {
            // Set status on platform if configured
          }
          await prisma.adCampaign.update({
            where: { id: campaign.id },
            data: { status: 'ACTIVE' },
          });
          activated++;
        } catch (err) {
          console.error(`[API] Failed to activate campaign ${campaign.name}: ${err}`);
          failed++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Activated ${activated} campaign${activated !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`,
        data: { activated, failed },
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
      return NextResponse.json({ error: 'siteId required for budget adjustment' }, { status: 400 });
    }

    if (action === 'approve_keyword') {
      const { keywordId } = body as { keywordId: string };
      if (!keywordId) {
        return NextResponse.json({ error: 'keywordId required' }, { status: 400 });
      }
      const opp = await prisma.sEOOpportunity.findUnique({ where: { id: keywordId } });
      if (!opp) {
        return NextResponse.json({ error: 'Keyword not found' }, { status: 404 });
      }
      const sd = (opp.sourceData as Record<string, any>) || {};
      await prisma.sEOOpportunity.update({
        where: { id: keywordId },
        data: {
          sourceData: {
            ...sd,
            aiEvaluation: {
              ...(sd['aiEvaluation'] || {}),
              decision: 'BID',
              humanOverride: true,
              overriddenAt: new Date().toISOString(),
            },
          },
        },
      });
      return NextResponse.json({
        success: true,
        message: `Approved keyword "${opp.keyword}" — promoted to BID`,
      });
    }

    if (action === 'reject_keyword') {
      const { keywordId } = body as { keywordId: string };
      if (!keywordId) {
        return NextResponse.json({ error: 'keywordId required' }, { status: 400 });
      }
      const opp = await prisma.sEOOpportunity.findUnique({ where: { id: keywordId } });
      if (!opp) {
        return NextResponse.json({ error: 'Keyword not found' }, { status: 404 });
      }
      await prisma.sEOOpportunity.update({
        where: { id: keywordId },
        data: { status: 'ARCHIVED' },
      });
      return NextResponse.json({
        success: true,
        message: `Rejected keyword "${opp.keyword}" — archived`,
      });
    }

    if (action === 'bulk_approve_keywords') {
      const { keywordIds } = body as { keywordIds: string[] };
      if (!keywordIds?.length) {
        return NextResponse.json({ error: 'keywordIds required' }, { status: 400 });
      }
      const opps = await prisma.sEOOpportunity.findMany({
        where: { id: { in: keywordIds } },
      });
      let approved = 0;
      for (const opp of opps) {
        const sd = (opp.sourceData as Record<string, any>) || {};
        await prisma.sEOOpportunity.update({
          where: { id: opp.id },
          data: {
            sourceData: {
              ...sd,
              aiEvaluation: {
                ...(sd['aiEvaluation'] || {}),
                decision: 'BID',
                humanOverride: true,
                overriddenAt: new Date().toISOString(),
              },
            },
          },
        });
        approved++;
      }
      return NextResponse.json({
        success: true,
        message: `Approved ${approved} keywords`,
      });
    }

    if (action === 'bulk_reject_keywords') {
      const { keywordIds } = body as { keywordIds: string[] };
      if (!keywordIds?.length) {
        return NextResponse.json({ error: 'keywordIds required' }, { status: 400 });
      }
      const result = await prisma.sEOOpportunity.updateMany({
        where: { id: { in: keywordIds } },
        data: { status: 'ARCHIVED' },
      });
      return NextResponse.json({
        success: true,
        message: `Rejected ${result.count} keywords`,
      });
    }

    if (action === 'pause_keyword') {
      const { campaignId, keyword } = body as { campaignId: string; keyword: string };
      if (!campaignId || !keyword) {
        return NextResponse.json({ error: 'campaignId and keyword required' }, { status: 400 });
      }
      const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
      const proposal = (campaign.proposalData as Record<string, any>) || {};
      const negativeKeywords = proposal['negativeKeywords'] || [];
      if (!negativeKeywords.includes(keyword)) {
        negativeKeywords.push(keyword);
      }
      await prisma.adCampaign.update({
        where: { id: campaignId },
        data: {
          proposalData: {
            ...proposal,
            negativeKeywords,
          },
        },
      });
      return NextResponse.json({
        success: true,
        message: `Added "${keyword}" to negative keywords for campaign`,
      });
    }

    if (action === 'override_bid') {
      const { campaignId, maxCpc } = body as { campaignId: string; maxCpc: number };
      if (!campaignId || maxCpc === undefined) {
        return NextResponse.json({ error: 'campaignId and maxCpc required' }, { status: 400 });
      }
      await prisma.adCampaign.update({
        where: { id: campaignId },
        data: {
          maxCpc,
          proposalData: {
            ...(((await prisma.adCampaign.findUnique({ where: { id: campaignId } }))
              ?.proposalData as Record<string, any>) || {}),
            bidOverride: true,
            bidOverriddenAt: new Date().toISOString(),
          },
        },
      });
      return NextResponse.json({
        success: true,
        message: `Bid override: campaign maxCpc set to £${maxCpc.toFixed(2)}`,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[API] Error in bidding action:', error);
    return NextResponse.json({ error: 'Failed to execute bidding action' }, { status: 500 });
  }
}
