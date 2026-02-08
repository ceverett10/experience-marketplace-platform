import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';

export const dynamic = 'force-dynamic';

/**
 * GET /api/suppliers
 * Returns list of suppliers with microsite info
 *
 * Query params:
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 50)
 * - search: Search by name
 * - layout: Filter by layout type (MARKETPLACE, CATALOG, PRODUCT_SPOTLIGHT)
 * - launched: Filter by launched status (true, false)
 * - sort: Sort field (productCount, name, createdAt)
 * - order: Sort order (asc, desc)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const skip = (page - 1) * pageSize;

    // Filters
    const search = searchParams.get('search') || '';
    const layoutFilter = searchParams.get('layout') || '';
    const launchedFilter = searchParams.get('launched');

    // Sorting
    const sortField = searchParams.get('sort') || 'productCount';
    const sortOrder = searchParams.get('order') || 'desc';

    // Build where clause
    const where: Record<string, unknown> = {
      // Exclude fake city-* suppliers
      NOT: {
        holibobSupplierId: { startsWith: 'city-' },
      },
    };

    if (search) {
      where['name'] = { contains: search, mode: 'insensitive' };
    }

    // Layout filter based on product count thresholds
    if (layoutFilter === 'MARKETPLACE') {
      where['productCount'] = { gte: 51 };
    } else if (layoutFilter === 'CATALOG') {
      where['productCount'] = { gte: 2, lt: 51 };
    } else if (layoutFilter === 'PRODUCT_SPOTLIGHT') {
      where['productCount'] = { equals: 1 };
    }

    // Launched filter (has microsite)
    if (launchedFilter === 'true') {
      where['microsite'] = { isNot: null };
    } else if (launchedFilter === 'false') {
      where['microsite'] = null;
    }

    // Build orderBy
    const orderBy: Record<string, string> = {};
    if (sortField === 'productCount') {
      orderBy['productCount'] = sortOrder;
    } else if (sortField === 'name') {
      orderBy['name'] = sortOrder;
    } else if (sortField === 'createdAt') {
      orderBy['createdAt'] = sortOrder;
    } else {
      orderBy['productCount'] = 'desc';
    }

    // Get total count
    const totalCount = await prisma.supplier.count({ where });

    // Get suppliers with microsite info
    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      select: {
        id: true,
        holibobSupplierId: true,
        name: true,
        slug: true,
        productCount: true,
        rating: true,
        reviewCount: true,
        cities: true,
        categories: true,
        createdAt: true,
        lastSyncedAt: true,
        microsite: {
          select: {
            id: true,
            fullDomain: true,
            status: true,
            layoutType: true,
            cachedProductCount: true,
            createdAt: true,
          },
        },
      },
    });

    // Transform data
    const data = suppliers.map((s) => ({
      id: s.id,
      holibobSupplierId: s.holibobSupplierId,
      name: s.name,
      slug: s.slug,
      productCount: s.productCount,
      rating: s.rating,
      reviewCount: s.reviewCount,
      cities: s.cities.slice(0, 3), // Limit to 3 cities for display
      categories: s.categories.slice(0, 3), // Limit to 3 categories
      createdAt: s.createdAt.toISOString(),
      lastSyncedAt: s.lastSyncedAt?.toISOString() || null,
      // Microsite info
      hasMicrosite: !!s.microsite,
      micrositeUrl: s.microsite ? `https://${s.microsite.fullDomain}` : null,
      micrositeStatus: s.microsite?.status || null,
      layoutType: s.microsite?.layoutType || getLayoutType(s.productCount),
      micrositeCreatedAt: s.microsite?.createdAt?.toISOString() || null,
    }));

    // Get summary stats
    const stats = await prisma.$queryRaw<
      Array<{ layout: string; total: bigint; launched: bigint }>
    >`
      SELECT
        CASE
          WHEN s."productCount" >= 51 THEN 'MARKETPLACE'
          WHEN s."productCount" >= 2 THEN 'CATALOG'
          ELSE 'PRODUCT_SPOTLIGHT'
        END as layout,
        COUNT(*) as total,
        COUNT(m.id) as launched
      FROM suppliers s
      LEFT JOIN microsite_configs m ON s.id = m."supplierId"
      WHERE s."holibobSupplierId" NOT LIKE 'city-%'
      GROUP BY 1
      ORDER BY 1
    `;

    const summary = {
      MARKETPLACE: { total: 0, launched: 0 },
      CATALOG: { total: 0, launched: 0 },
      PRODUCT_SPOTLIGHT: { total: 0, launched: 0 },
    };

    for (const row of stats) {
      const key = row.layout as keyof typeof summary;
      if (summary[key]) {
        summary[key] = {
          total: Number(row.total),
          launched: Number(row.launched),
        };
      }
    }

    return NextResponse.json({
      suppliers: data,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      summary,
    });
  } catch (error) {
    console.error('[Suppliers API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch suppliers' },
      { status: 500 }
    );
  }
}

// Helper to determine layout type from product count
function getLayoutType(productCount: number): string {
  if (productCount >= 51) return 'MARKETPLACE';
  if (productCount >= 2) return 'CATALOG';
  return 'PRODUCT_SPOTLIGHT';
}
