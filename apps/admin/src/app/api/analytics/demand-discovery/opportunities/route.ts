import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Default profitability assumptions when no BiddingProfile exists
const DEFAULTS = {
  aov: 197,
  commissionRate: 0.18,
  cvr: 0.015,
};

/**
 * GET /api/analytics/demand-discovery/opportunities
 * Returns city x category opportunity matrix ranked by predicted ROAS
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const minScore = parseInt(searchParams.get('minScore') || '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);

    // 1. Build city x category matrix from products
    const products = await prisma.product.findMany({
      where: { city: { not: null }, categories: { isEmpty: false } },
      select: {
        city: true,
        categories: true,
        priceFrom: true,
        holibobProductId: true,
      },
    });

    const matrix = new Map<
      string,
      {
        productCount: number;
        totalPrice: number;
        priceCount: number;
      }
    >();

    for (const p of products) {
      if (!p.city) continue;
      for (const cat of p.categories) {
        const key = `${p.city}|||${cat}`;
        const existing = matrix.get(key) || { productCount: 0, totalPrice: 0, priceCount: 0 };
        existing.productCount++;
        if (p.priceFrom) {
          existing.totalPrice += Number(p.priceFrom);
          existing.priceCount++;
        }
        matrix.set(key, existing);
      }
    }

    // 2. Get bidding profiles for AOV/CVR/commission
    const profiles = await prisma.biddingProfile.findMany({
      select: {
        avgOrderValue: true,
        avgCommissionRate: true,
        conversionRate: true,
      },
    });

    // Use portfolio averages if available, else defaults
    let portfolioAov = DEFAULTS.aov;
    let portfolioCvr = DEFAULTS.cvr;
    let portfolioCommission = DEFAULTS.commissionRate;

    if (profiles.length > 0) {
      const totalAov = profiles.reduce((sum, p) => sum + Number(p.avgOrderValue), 0);
      const totalCvr = profiles.reduce((sum, p) => sum + p.conversionRate, 0);
      const totalComm = profiles.reduce((sum, p) => sum + p.avgCommissionRate / 100, 0);
      portfolioAov = totalAov / profiles.length;
      portfolioCvr = totalCvr / profiles.length;
      portfolioCommission = totalComm / profiles.length;
    }

    // 3. Get SEO opportunity data keyed by location + niche
    const opportunities = await prisma.sEOOpportunity.findMany({
      where: {
        status: { in: ['PAID_CANDIDATE', 'IDENTIFIED', 'EVALUATED'] },
        location: { not: null },
      },
      select: {
        keyword: true,
        location: true,
        niche: true,
        searchVolume: true,
        cpc: true,
        difficulty: true,
        intent: true,
      },
    });

    // Group opportunities by location + niche
    const oppIndex = new Map<
      string,
      {
        keywords: string[];
        totalVolume: number;
        avgCpc: number;
        totalCpc: number;
        count: number;
        bestIntent: string;
      }
    >();
    for (const opp of opportunities) {
      if (!opp.location) continue;
      const key = `${opp.location}|||${opp.niche}`;
      const existing = oppIndex.get(key) || {
        keywords: [],
        totalVolume: 0,
        avgCpc: 0,
        totalCpc: 0,
        count: 0,
        bestIntent: 'INFORMATIONAL',
      };
      existing.keywords.push(opp.keyword);
      existing.totalVolume += opp.searchVolume;
      existing.totalCpc += Number(opp.cpc);
      existing.count++;
      if (
        opp.intent === 'TRANSACTIONAL' ||
        (opp.intent === 'COMMERCIAL' && existing.bestIntent !== 'TRANSACTIONAL')
      ) {
        existing.bestIntent = opp.intent;
      }
      oppIndex.set(key, existing);
    }

    // 4. Get active campaigns to check coverage
    const campaigns = await prisma.adCampaign.findMany({
      where: { status: { in: ['ACTIVE', 'DRAFT', 'PAUSED'] } },
      select: {
        id: true,
        keywords: true,
        geoTargets: true,
        status: true,
        roas: true,
      },
    });

    // 5. Build opportunity rows
    type OpportunityRow = {
      city: string;
      category: string;
      productCount: number;
      avgPrice: number;
      searchVolume: number;
      cpc: number;
      intent: string;
      topKeywords: string[];
      revenuePerClick: number;
      predictedRoas: number;
      opportunityScore: number;
      hasCampaign: boolean;
      campaignStatus: string | null;
      campaignRoas: number | null;
    };

    const rows: OpportunityRow[] = [];

    for (const [key, data] of matrix) {
      const [city, category] = key.split('|||') as [string, string];
      const oppKey = `${city}|||${category}`;
      const oppData = oppIndex.get(oppKey);

      const searchVolume = oppData?.totalVolume || 0;
      const cpc = oppData && oppData.count > 0 ? oppData.totalCpc / oppData.count : 0;
      const avgPrice = data.priceCount > 0 ? data.totalPrice / data.priceCount : portfolioAov;

      // Revenue per click = AOV * CVR * commission rate
      const revenuePerClick = avgPrice * portfolioCvr * portfolioCommission;
      // Predicted ROAS = revenue per click / CPC
      const predictedRoas = cpc > 0 ? revenuePerClick / cpc : 0;

      // Opportunity score (0-100)
      const roasScore = Math.min(40, predictedRoas * 10);
      const volumeScore = Math.min(30, (Math.log10(Math.max(searchVolume, 1)) / 5) * 30);
      const intentBonus =
        oppData?.bestIntent === 'TRANSACTIONAL'
          ? 20
          : oppData?.bestIntent === 'COMMERCIAL'
            ? 15
            : 5;
      const productBonus = Math.min(10, (data.productCount / 20) * 10);
      const opportunityScore = Math.round(roasScore + volumeScore + intentBonus + productBonus);

      if (opportunityScore < minScore) continue;

      // Check campaign coverage
      let hasCampaign = false;
      let campaignStatus: string | null = null;
      let campaignRoas: number | null = null;

      for (const c of campaigns) {
        const geoMatch = c.geoTargets.some((g) => g.toLowerCase().includes(city.toLowerCase()));
        const kwMatch = c.keywords.some(
          (kw) =>
            kw.toLowerCase().includes(category.toLowerCase()) ||
            kw.toLowerCase().includes(city.toLowerCase())
        );
        if (geoMatch && kwMatch) {
          hasCampaign = true;
          campaignStatus = c.status;
          campaignRoas = c.roas;
          break;
        }
      }

      rows.push({
        city,
        category,
        productCount: data.productCount,
        avgPrice: Math.round(avgPrice),
        searchVolume,
        cpc: Math.round(cpc * 100) / 100,
        intent: oppData?.bestIntent || 'UNKNOWN',
        topKeywords: (oppData?.keywords || []).slice(0, 3),
        revenuePerClick: Math.round(revenuePerClick * 100) / 100,
        predictedRoas: Math.round(predictedRoas * 100) / 100,
        opportunityScore,
        hasCampaign,
        campaignStatus,
        campaignRoas: campaignRoas !== null ? Math.round(campaignRoas * 100) / 100 : null,
      });
    }

    rows.sort((a, b) => b.opportunityScore - a.opportunityScore);
    const limited = rows.slice(0, limit);

    const uncoveredCount = limited.filter((r) => !r.hasCampaign && r.opportunityScore >= 50).length;

    return NextResponse.json({
      opportunities: limited,
      totals: {
        total: rows.length,
        displayed: limited.length,
        uncoveredHighValue: uncoveredCount,
        avgPredictedRoas:
          limited.length > 0
            ? Math.round(
                (limited.reduce((s, r) => s + r.predictedRoas, 0) / limited.length) * 100
              ) / 100
            : 0,
      },
      assumptions: {
        aov: Math.round(portfolioAov),
        cvr: Math.round(portfolioCvr * 10000) / 100,
        commissionRate: Math.round(portfolioCommission * 10000) / 100,
      },
    });
  } catch (error) {
    console.error('[Demand Discovery - Opportunities] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}
