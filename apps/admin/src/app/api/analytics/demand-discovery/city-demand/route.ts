import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/demand-discovery/city-demand
 * Returns demand data aggregated by city: products, search volume, GSC performance, revenue
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 1. Get products grouped by city
    const products = await prisma.product.findMany({
      where: { city: { not: null } },
      select: {
        city: true,
        categories: true,
        priceFrom: true,
        supplierId: true,
        bookingCount: true,
      },
    });

    // Build city map from products
    const cityMap = new Map<
      string,
      {
        productCount: number;
        categories: Set<string>;
        suppliers: Set<string>;
        avgPrice: number;
        totalPrice: number;
        priceCount: number;
        bookingCount: number;
      }
    >();

    for (const p of products) {
      if (!p.city) continue;
      const city = p.city;
      const existing = cityMap.get(city) || {
        productCount: 0,
        categories: new Set<string>(),
        suppliers: new Set<string>(),
        avgPrice: 0,
        totalPrice: 0,
        priceCount: 0,
        bookingCount: 0,
      };
      existing.productCount++;
      for (const cat of p.categories) existing.categories.add(cat);
      existing.suppliers.add(p.supplierId);
      if (p.priceFrom) {
        existing.totalPrice += Number(p.priceFrom);
        existing.priceCount++;
      }
      existing.bookingCount += p.bookingCount;
      cityMap.set(city, existing);
    }

    const cityNames = Array.from(cityMap.keys());
    if (cityNames.length === 0) {
      return NextResponse.json({
        cities: [],
        totals: { cities: 0, totalVolume: 0, totalRevenue: 0 },
      });
    }

    // 2. Get SEO opportunity data by city (location field)
    const opportunities = await prisma.sEOOpportunity.findMany({
      where: {
        location: { in: cityNames },
        status: { in: ['PAID_CANDIDATE', 'IDENTIFIED', 'EVALUATED', 'PUBLISHED', 'MONITORING'] },
      },
      select: {
        location: true,
        searchVolume: true,
        cpc: true,
        difficulty: true,
      },
    });

    const cityOpportunityMap = new Map<
      string,
      { totalVolume: number; totalCpc: number; totalDifficulty: number; count: number }
    >();
    for (const opp of opportunities) {
      if (!opp.location) continue;
      const existing = cityOpportunityMap.get(opp.location) || {
        totalVolume: 0,
        totalCpc: 0,
        totalDifficulty: 0,
        count: 0,
      };
      existing.totalVolume += opp.searchVolume;
      existing.totalCpc += Number(opp.cpc);
      existing.totalDifficulty += opp.difficulty;
      existing.count++;
      cityOpportunityMap.set(opp.location, existing);
    }

    // 3. Get GSC performance data - query by city names in the query field
    const gscData = await Promise.all(
      cityNames.slice(0, 100).map(async (city) => {
        const metrics = await prisma.performanceMetric.aggregate({
          where: {
            date: { gte: startDate },
            query: { contains: city.toLowerCase(), mode: 'insensitive' },
          },
          _sum: { clicks: true, impressions: true },
        });
        return {
          city,
          clicks: metrics._sum.clicks || 0,
          impressions: metrics._sum.impressions || 0,
        };
      })
    );

    const gscMap = new Map(gscData.map((d) => [d.city, d]));

    // 4. Get booking revenue by city (via products)
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

    // Map bookings to products to get city
    const productCityMap = new Map<string, string>();
    const allProducts = await prisma.product.findMany({
      where: { city: { not: null } },
      select: { holibobProductId: true, city: true },
    });
    for (const p of allProducts) {
      if (p.city) productCityMap.set(p.holibobProductId, p.city);
    }

    const cityRevenueMap = new Map<string, { revenue: number; bookings: number }>();
    for (const b of bookings) {
      if (!b.holibobProductId) continue;
      const city = productCityMap.get(b.holibobProductId);
      if (!city) continue;
      const existing = cityRevenueMap.get(city) || { revenue: 0, bookings: 0 };
      existing.revenue += Number(b.totalAmount);
      existing.bookings++;
      cityRevenueMap.set(city, existing);
    }

    // 5. Get active campaign count per city
    const campaigns = await prisma.adCampaign.findMany({
      where: { status: { in: ['ACTIVE', 'DRAFT'] } },
      select: { geoTargets: true },
    });

    const cityCampaignMap = new Map<string, number>();
    for (const c of campaigns) {
      for (const geo of c.geoTargets) {
        for (const city of cityNames) {
          if (geo.toLowerCase().includes(city.toLowerCase())) {
            cityCampaignMap.set(city, (cityCampaignMap.get(city) || 0) + 1);
          }
        }
      }
    }

    // 6. Assemble city demand data
    let totalVolume = 0;
    let totalRevenue = 0;

    const cities = cityNames
      .map((city) => {
        const data = cityMap.get(city)!;
        const oppData = cityOpportunityMap.get(city);
        const gsc = gscMap.get(city);
        const revenue = cityRevenueMap.get(city);
        const campaignCount = cityCampaignMap.get(city) || 0;

        const searchVolume = oppData?.totalVolume || 0;
        const avgCpc = oppData && oppData.count > 0 ? oppData.totalCpc / oppData.count : 0;
        const avgDifficulty =
          oppData && oppData.count > 0 ? oppData.totalDifficulty / oppData.count : 0;
        const avgPrice = data.priceCount > 0 ? data.totalPrice / data.priceCount : 0;
        const cityRevenue = revenue?.revenue || 0;

        totalVolume += searchVolume;
        totalRevenue += cityRevenue;

        // Demand score: weighted combination of signals (0-100)
        const volumeScore = Math.min(40, (Math.log10(Math.max(searchVolume, 1)) / 5) * 40);
        const gscScore = Math.min(30, (Math.log10(Math.max(gsc?.impressions || 0, 1)) / 5) * 30);
        const revenueScore = Math.min(20, (Math.log10(Math.max(cityRevenue, 1)) / 5) * 20);
        const productScore = Math.min(10, (data.productCount / 50) * 10);
        const demandScore = Math.round(volumeScore + gscScore + revenueScore + productScore);

        return {
          city,
          productCount: data.productCount,
          categoryCount: data.categories.size,
          supplierCount: data.suppliers.size,
          topCategories: Array.from(data.categories).slice(0, 5),
          avgPrice: Math.round(avgPrice),
          searchVolume,
          avgCpc: Math.round(avgCpc * 100) / 100,
          avgDifficulty: Math.round(avgDifficulty),
          gscClicks: gsc?.clicks || 0,
          gscImpressions: gsc?.impressions || 0,
          bookings: revenue?.bookings || 0,
          revenue: Math.round(cityRevenue),
          activeCampaigns: campaignCount,
          demandScore,
        };
      })
      .sort((a, b) => b.demandScore - a.demandScore);

    return NextResponse.json({
      cities,
      totals: {
        cities: cities.length,
        totalVolume,
        totalRevenue: Math.round(totalRevenue),
      },
    });
  } catch (error) {
    console.error('[Demand Discovery - City Demand] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch city demand data' }, { status: 500 });
  }
}
