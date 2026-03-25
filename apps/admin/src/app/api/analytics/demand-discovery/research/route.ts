import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/analytics/demand-discovery/research
 * Live keyword research: accepts city + category, returns volume/CPC data
 * Uses existing SEOOpportunity data first, with option to discover related keywords
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { city, category } = body as { city?: string; category?: string };

    if (!city && !category) {
      return NextResponse.json(
        { error: 'At least one of city or category is required' },
        { status: 400 }
      );
    }

    // Build search terms
    const searchTerms: string[] = [];
    if (city && category) {
      searchTerms.push(
        `${category} in ${city}`,
        `${category} ${city}`,
        `${city} ${category}`,
        `best ${category} in ${city}`,
        `${category} tours ${city}`,
        `things to do in ${city}`
      );
    } else if (city) {
      searchTerms.push(
        `things to do in ${city}`,
        `tours in ${city}`,
        `experiences in ${city}`,
        `${city} activities`,
        `${city} tours`,
        `what to do in ${city}`,
        `best experiences ${city}`
      );
    } else if (category) {
      searchTerms.push(
        `best ${category}`,
        `${category} near me`,
        `${category} tours`,
        `${category} experiences`,
        `book ${category}`
      );
    }

    // 1. Check existing SEOOpportunity data for matching keywords
    const existingOpps = await prisma.sEOOpportunity.findMany({
      where: {
        OR: [
          ...(city ? [{ location: { equals: city, mode: 'insensitive' as const } }] : []),
          ...(category ? [{ niche: { equals: category, mode: 'insensitive' as const } }] : []),
          {
            keyword: {
              contains: (city || category || '').toLowerCase(),
              mode: 'insensitive' as const,
            },
          },
        ],
      },
      select: {
        keyword: true,
        searchVolume: true,
        cpc: true,
        difficulty: true,
        intent: true,
        location: true,
        niche: true,
        status: true,
        priorityScore: true,
      },
      orderBy: { searchVolume: 'desc' },
      take: 50,
    });

    // 2. Get products matching the city/category for context
    const productWhere: Record<string, unknown> = {};
    if (city) productWhere['city'] = { equals: city, mode: 'insensitive' };
    if (category) productWhere['categories'] = { has: category };

    const matchingProducts = await prisma.product.findMany({
      where: productWhere,
      select: {
        title: true,
        city: true,
        categories: true,
        priceFrom: true,
        rating: true,
        bookingCount: true,
      },
      orderBy: { bookingCount: 'desc' },
      take: 20,
    });

    // 3. Get GSC data for these search terms
    const gscResults = await Promise.all(
      searchTerms.slice(0, 10).map(async (term) => {
        const metrics = await prisma.performanceMetric.aggregate({
          where: {
            query: { contains: term.toLowerCase(), mode: 'insensitive' },
          },
          _sum: { clicks: true, impressions: true },
          _avg: { position: true },
        });
        return {
          term,
          clicks: metrics._sum.clicks || 0,
          impressions: metrics._sum.impressions || 0,
          avgPosition: metrics._avg.position || 0,
        };
      })
    );

    // 4. Get existing campaigns targeting this city/category
    const campaignWhere: Record<string, unknown>[] = [];
    if (city) {
      campaignWhere.push({ geoTargets: { has: city } });
    }
    if (category) {
      campaignWhere.push({
        keywords: {
          hasSome: [category.toLowerCase()],
        },
      });
    }

    const existingCampaigns = await prisma.adCampaign.findMany({
      where: {
        OR: campaignWhere.length > 0 ? campaignWhere : undefined,
        status: { in: ['ACTIVE', 'DRAFT', 'PAUSED'] },
      },
      select: {
        name: true,
        platform: true,
        status: true,
        keywords: true,
        dailyBudget: true,
        totalSpend: true,
        totalClicks: true,
        roas: true,
      },
      take: 10,
    });

    // 5. Calculate summary stats
    const totalVolume = existingOpps.reduce((s, o) => s + o.searchVolume, 0);
    const avgCpc =
      existingOpps.length > 0
        ? existingOpps.reduce((s, o) => s + Number(o.cpc), 0) / existingOpps.length
        : 0;
    const avgDifficulty =
      existingOpps.length > 0
        ? existingOpps.reduce((s, o) => s + o.difficulty, 0) / existingOpps.length
        : 0;

    const avgPrice =
      matchingProducts.length > 0
        ? matchingProducts.reduce((s, p) => s + Number(p.priceFrom || 0), 0) /
          matchingProducts.length
        : 0;

    return NextResponse.json({
      query: { city, category },
      summary: {
        totalKeywords: existingOpps.length,
        totalSearchVolume: totalVolume,
        avgCpc: Math.round(avgCpc * 100) / 100,
        avgDifficulty: Math.round(avgDifficulty),
        matchingProducts: matchingProducts.length,
        avgProductPrice: Math.round(avgPrice),
        existingCampaigns: existingCampaigns.length,
      },
      keywords: existingOpps.map((o) => ({
        keyword: o.keyword,
        searchVolume: o.searchVolume,
        cpc: Number(o.cpc),
        difficulty: o.difficulty,
        intent: o.intent,
        location: o.location,
        niche: o.niche,
        status: o.status,
        priorityScore: o.priorityScore,
      })),
      gscPerformance: gscResults.filter((r) => r.impressions > 0),
      products: matchingProducts.map((p) => ({
        title: p.title,
        city: p.city,
        categories: p.categories,
        price: Number(p.priceFrom || 0),
        rating: p.rating,
        bookings: p.bookingCount,
      })),
      campaigns: existingCampaigns.map((c) => ({
        name: c.name,
        platform: c.platform,
        status: c.status,
        keywords: c.keywords.slice(0, 5),
        dailyBudget: Number(c.dailyBudget),
        totalSpend: Number(c.totalSpend),
        totalClicks: c.totalClicks,
        roas: c.roas,
      })),
      suggestedSearchTerms: searchTerms,
    });
  } catch (error) {
    console.error('[Demand Discovery - Research] Error:', error);
    return NextResponse.json({ error: 'Failed to perform research' }, { status: 500 });
  }
}
