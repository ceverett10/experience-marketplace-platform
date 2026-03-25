import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/demand-discovery/category-demand
 * Returns demand data aggregated by experience category
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 1. Build category map from products
    const products = await prisma.product.findMany({
      where: { categories: { isEmpty: false } },
      select: {
        categories: true,
        city: true,
        priceFrom: true,
        bookingCount: true,
        holibobProductId: true,
      },
    });

    const categoryMap = new Map<
      string,
      {
        productCount: number;
        cities: Set<string>;
        totalPrice: number;
        priceCount: number;
        bookingCount: number;
        productIds: Set<string>;
      }
    >();

    for (const p of products) {
      for (const cat of p.categories) {
        const existing = categoryMap.get(cat) || {
          productCount: 0,
          cities: new Set<string>(),
          totalPrice: 0,
          priceCount: 0,
          bookingCount: 0,
          productIds: new Set<string>(),
        };
        existing.productCount++;
        if (p.city) existing.cities.add(p.city);
        if (p.priceFrom) {
          existing.totalPrice += Number(p.priceFrom);
          existing.priceCount++;
        }
        existing.bookingCount += p.bookingCount;
        existing.productIds.add(p.holibobProductId);
        categoryMap.set(cat, existing);
      }
    }

    const categoryNames = Array.from(categoryMap.keys());
    if (categoryNames.length === 0) {
      return NextResponse.json({
        categories: [],
        totals: { categories: 0, totalVolume: 0, totalRevenue: 0 },
      });
    }

    // 2. Get SEO opportunity data by niche (category)
    const opportunities = await prisma.sEOOpportunity.findMany({
      where: {
        niche: { in: categoryNames },
        status: { in: ['PAID_CANDIDATE', 'IDENTIFIED', 'EVALUATED', 'PUBLISHED', 'MONITORING'] },
      },
      select: {
        niche: true,
        searchVolume: true,
        cpc: true,
        difficulty: true,
      },
    });

    const categoryOppMap = new Map<
      string,
      { totalVolume: number; totalCpc: number; totalDifficulty: number; count: number }
    >();
    for (const opp of opportunities) {
      const existing = categoryOppMap.get(opp.niche) || {
        totalVolume: 0,
        totalCpc: 0,
        totalDifficulty: 0,
        count: 0,
      };
      existing.totalVolume += opp.searchVolume;
      existing.totalCpc += Number(opp.cpc);
      existing.totalDifficulty += opp.difficulty;
      existing.count++;
      categoryOppMap.set(opp.niche, existing);
    }

    // 3. Get booking revenue by category (via product mapping)
    const bookings = await prisma.booking.findMany({
      where: {
        createdAt: { gte: startDate },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        holibobProductId: { not: null },
      },
      select: {
        holibobProductId: true,
        totalAmount: true,
      },
    });

    // Map productId -> categories
    const productCategoryMap = new Map<string, string[]>();
    for (const p of products) {
      productCategoryMap.set(p.holibobProductId, p.categories);
    }

    const categoryRevenueMap = new Map<string, { revenue: number; bookings: number }>();
    for (const b of bookings) {
      if (!b.holibobProductId) continue;
      const cats = productCategoryMap.get(b.holibobProductId);
      if (!cats) continue;
      for (const cat of cats) {
        const existing = categoryRevenueMap.get(cat) || { revenue: 0, bookings: 0 };
        existing.revenue += Number(b.totalAmount);
        existing.bookings++;
        categoryRevenueMap.set(cat, existing);
      }
    }

    // 4. Get active campaign count per category (from keywords)
    const campaigns = await prisma.adCampaign.findMany({
      where: { status: { in: ['ACTIVE', 'DRAFT'] } },
      select: { keywords: true },
    });

    const categoryCampaignMap = new Map<string, number>();
    for (const c of campaigns) {
      for (const kw of c.keywords) {
        const kwLower = kw.toLowerCase();
        for (const cat of categoryNames) {
          if (kwLower.includes(cat.toLowerCase())) {
            categoryCampaignMap.set(cat, (categoryCampaignMap.get(cat) || 0) + 1);
          }
        }
      }
    }

    // 5. Assemble category demand data
    let totalVolume = 0;
    let totalRevenue = 0;

    const categories = categoryNames
      .map((cat) => {
        const data = categoryMap.get(cat)!;
        const oppData = categoryOppMap.get(cat);
        const revenue = categoryRevenueMap.get(cat);
        const campaignCount = categoryCampaignMap.get(cat) || 0;

        const searchVolume = oppData?.totalVolume || 0;
        const avgCpc = oppData && oppData.count > 0 ? oppData.totalCpc / oppData.count : 0;
        const avgDifficulty =
          oppData && oppData.count > 0 ? oppData.totalDifficulty / oppData.count : 0;
        const avgPrice = data.priceCount > 0 ? data.totalPrice / data.priceCount : 0;
        const catRevenue = revenue?.revenue || 0;

        totalVolume += searchVolume;
        totalRevenue += catRevenue;

        return {
          category: cat,
          productCount: data.productCount,
          cityCount: data.cities.size,
          topCities: Array.from(data.cities).slice(0, 5),
          avgPrice: Math.round(avgPrice),
          searchVolume,
          avgCpc: Math.round(avgCpc * 100) / 100,
          avgDifficulty: Math.round(avgDifficulty),
          bookings: revenue?.bookings || 0,
          revenue: Math.round(catRevenue),
          activeCampaigns: campaignCount,
        };
      })
      .sort((a, b) => b.searchVolume - a.searchVolume);

    return NextResponse.json({
      categories,
      totals: {
        categories: categories.length,
        totalVolume,
        totalRevenue: Math.round(totalRevenue),
      },
    });
  } catch (error) {
    console.error('[Demand Discovery - Category Demand] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch category demand data' }, { status: 500 });
  }
}
