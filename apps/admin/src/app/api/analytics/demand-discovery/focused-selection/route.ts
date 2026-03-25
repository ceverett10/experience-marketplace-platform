import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/demand-discovery/focused-selection
 * Scores and ranks cities and categories to recommend the top 5x5 focused strategy combos.
 * Cross-references: Product inventory, SEOOpportunity volume/CPC, GSC impressions,
 * Booking revenue, and existing campaign ROAS.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // 1. Product inventory by city × category
    const products = await prisma.product.findMany({
      where: { city: { not: null }, categories: { isEmpty: false } },
      select: { city: true, categories: true, priceFrom: true, holibobProductId: true },
    });

    const comboMap = new Map<
      string,
      { productCount: number; totalPrice: number; priceCount: number; productIds: Set<string> }
    >();
    const cityProductCount = new Map<string, number>();
    const cityCategories = new Map<string, Set<string>>();

    for (const p of products) {
      if (!p.city) continue;
      cityProductCount.set(p.city, (cityProductCount.get(p.city) || 0) + 1);
      if (!cityCategories.has(p.city)) cityCategories.set(p.city, new Set());
      for (const cat of p.categories) {
        cityCategories.get(p.city)!.add(cat);
        const key = `${p.city}|||${cat}`;
        const existing = comboMap.get(key) || {
          productCount: 0,
          totalPrice: 0,
          priceCount: 0,
          productIds: new Set<string>(),
        };
        existing.productCount++;
        if (p.priceFrom) {
          existing.totalPrice += Number(p.priceFrom);
          existing.priceCount++;
        }
        existing.productIds.add(p.holibobProductId);
        comboMap.set(key, existing);
      }
    }

    // 2. SEO opportunity data (search volume + CPC by location)
    const opportunities = await prisma.sEOOpportunity.findMany({
      where: {
        status: { in: ['PAID_CANDIDATE', 'IDENTIFIED', 'EVALUATED', 'PUBLISHED', 'MONITORING'] },
        location: { not: null },
      },
      select: { location: true, niche: true, searchVolume: true, cpc: true },
    });

    const cityVolumeMap = new Map<string, { volume: number; totalCpc: number; count: number }>();
    const comboVolumeMap = new Map<string, { volume: number; avgCpc: number; count: number }>();

    for (const opp of opportunities) {
      if (!opp.location) continue;
      // City-level
      const cv = cityVolumeMap.get(opp.location) || { volume: 0, totalCpc: 0, count: 0 };
      cv.volume += opp.searchVolume;
      cv.totalCpc += Number(opp.cpc);
      cv.count++;
      cityVolumeMap.set(opp.location, cv);

      // Combo-level
      const key = `${opp.location}|||${opp.niche}`;
      const comboV = comboVolumeMap.get(key) || { volume: 0, avgCpc: 0, count: 0 };
      comboV.volume += opp.searchVolume;
      comboV.avgCpc += Number(opp.cpc);
      comboV.count++;
      comboVolumeMap.set(key, comboV);
    }

    // 3. GSC impressions by city
    const cities = Array.from(cityProductCount.keys());
    const gscByCity = new Map<string, number>();

    // Batch GSC queries for top cities by product count
    const topCities = cities
      .sort((a, b) => (cityProductCount.get(b) || 0) - (cityProductCount.get(a) || 0))
      .slice(0, 50);

    await Promise.all(
      topCities.map(async (city) => {
        const metrics = await prisma.performanceMetric.aggregate({
          where: {
            date: { gte: ninetyDaysAgo },
            query: { contains: city.toLowerCase(), mode: 'insensitive' },
          },
          _sum: { impressions: true },
        });
        gscByCity.set(city, metrics._sum.impressions || 0);
      })
    );

    // 4. Booking revenue by city
    const bookings = await prisma.booking.findMany({
      where: {
        createdAt: { gte: ninetyDaysAgo },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        holibobProductId: { not: null },
      },
      select: { holibobProductId: true, totalAmount: true },
    });

    const productCityMap = new Map<string, string>();
    for (const p of products) {
      if (p.city) productCityMap.set(p.holibobProductId, p.city);
    }

    const cityRevenueMap = new Map<string, number>();
    for (const b of bookings) {
      if (!b.holibobProductId) continue;
      const city = productCityMap.get(b.holibobProductId);
      if (city) {
        cityRevenueMap.set(city, (cityRevenueMap.get(city) || 0) + Number(b.totalAmount));
      }
    }

    // 5. Score cities
    const maxVolume = Math.max(...Array.from(cityVolumeMap.values()).map((v) => v.volume), 1);
    const maxRevenue = Math.max(...Array.from(cityRevenueMap.values()), 1);
    const maxProducts = Math.max(...Array.from(cityProductCount.values()), 1);
    const maxGsc = Math.max(...Array.from(gscByCity.values()), 1);
    const maxCpc = Math.max(
      ...Array.from(cityVolumeMap.values()).map((v) => (v.count > 0 ? v.totalCpc / v.count : 0)),
      1
    );

    const scoredCities = topCities
      .map((city) => {
        const vol = cityVolumeMap.get(city);
        const revenue = cityRevenueMap.get(city) || 0;
        const productCount = cityProductCount.get(city) || 0;
        const gsc = gscByCity.get(city) || 0;
        const avgCpc = vol && vol.count > 0 ? vol.totalCpc / vol.count : 0;
        const categoryCount = cityCategories.get(city)?.size || 0;

        const score =
          0.3 * ((vol?.volume || 0) / maxVolume) +
          0.25 * (revenue / maxRevenue) +
          0.2 * (productCount / maxProducts) +
          0.15 * (gsc / maxGsc) +
          0.1 * (1 - avgCpc / maxCpc);

        return {
          city,
          score: Math.round(score * 100),
          searchVolume: vol?.volume || 0,
          avgCpc: Math.round(avgCpc * 100) / 100,
          revenue: Math.round(revenue),
          productCount,
          categoryCount,
          gscImpressions: gsc,
        };
      })
      .filter((c) => c.productCount >= 3)
      .sort((a, b) => b.score - a.score);

    // 6. For top 10 cities, score categories within each
    const cityBreakdowns = scoredCities.slice(0, 10).map((cityData) => {
      const categoriesForCity = Array.from(cityCategories.get(cityData.city) || []);

      const scoredCategories = categoriesForCity
        .map((cat) => {
          const key = `${cityData.city}|||${cat}`;
          const combo = comboMap.get(key);
          const vol = comboVolumeMap.get(key);

          if (!combo || combo.productCount < 3) return null;

          const avgPrice = combo.priceCount > 0 ? combo.totalPrice / combo.priceCount : 0;
          const searchVolume = vol?.volume || 0;
          const avgCpc = vol && vol.count > 0 ? vol.avgCpc / vol.count : 0;

          // Predicted ROAS = (avgPrice * CVR * commissionRate) / CPC
          const revenuePerClick = avgPrice * 0.015 * 0.18;
          const predictedRoas = avgCpc > 0 ? revenuePerClick / avgCpc : 0;

          const comboScore =
            0.35 * Math.min(1, predictedRoas / 3) +
            0.25 * Math.min(1, searchVolume / 5000) +
            0.2 * Math.min(1, combo.productCount / 20) +
            0.2 * Math.min(1, avgPrice / 200);

          return {
            category: cat,
            productCount: combo.productCount,
            avgPrice: Math.round(avgPrice),
            searchVolume,
            avgCpc: Math.round(avgCpc * 100) / 100,
            predictedRoas: Math.round(predictedRoas * 100) / 100,
            comboScore: Math.round(comboScore * 100),
          };
        })
        .filter(Boolean)
        .sort((a, b) => b!.comboScore - a!.comboScore)
        .slice(0, 10);

      return {
        ...cityData,
        categories: scoredCategories,
      };
    });

    // 7. Get current focused strategy config if exists
    const existingConfig = await prisma.focusedStrategyConfig.findFirst({
      where: { isActive: true },
    });

    return NextResponse.json({
      cities: cityBreakdowns,
      existingConfig: existingConfig
        ? {
            id: existingConfig.id,
            isActive: existingConfig.isActive,
            combinations: existingConfig.combinations,
            totalDailyBudget: Number(existingConfig.totalDailyBudget),
          }
        : null,
    });
  } catch (error) {
    console.error('[Focused Selection] Error:', error);
    return NextResponse.json({ error: 'Failed to compute focused selection' }, { status: 500 });
  }
}

/**
 * POST /api/analytics/demand-discovery/focused-selection
 * Lock in the selected 5x5 combinations and create/update the FocusedStrategyConfig
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { combinations, totalDailyBudget } = body as {
      combinations: Array<{ city: string; category: string }>;
      totalDailyBudget: number;
    };

    if (!combinations || combinations.length === 0) {
      return NextResponse.json({ error: 'At least one combination is required' }, { status: 400 });
    }

    if (combinations.length > 25) {
      return NextResponse.json({ error: 'Maximum 25 combinations allowed' }, { status: 400 });
    }

    // Validate each combo has products
    const validationErrors: string[] = [];
    for (const combo of combinations) {
      const count = await prisma.product.count({
        where: {
          city: { equals: combo.city, mode: 'insensitive' },
          categories: { has: combo.category },
        },
      });
      if (count < 3) {
        validationErrors.push(`${combo.category} in ${combo.city}: only ${count} products (min 3)`);
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      );
    }

    // Build combination records with initial status
    const comboRecords = combinations.map((c) => ({
      city: c.city,
      category: c.category,
      status: 'PENDING' as const,
      dailyBudget: totalDailyBudget / combinations.length,
    }));

    // Deactivate any existing active config
    await prisma.focusedStrategyConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Create new config
    const config = await prisma.focusedStrategyConfig.create({
      data: {
        isActive: true,
        combinations: comboRecords,
        totalDailyBudget: totalDailyBudget || 150,
        rampPhase: 1,
        rampWeekOf: new Date(),
      },
    });

    return NextResponse.json({
      id: config.id,
      combinations: comboRecords,
      message: `Focused strategy created with ${combinations.length} combinations`,
    });
  } catch (error) {
    console.error('[Focused Selection POST] Error:', error);
    return NextResponse.json({ error: 'Failed to save focused strategy' }, { status: 500 });
  }
}
