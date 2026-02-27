import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCategoryDisplayName } from '@experience-marketplace/shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/microsites
 * Returns all microsites (SUPPLIER, OPPORTUNITY, PRODUCT) with related entity info
 *
 * Query params:
 * - page, pageSize: Pagination (default: 1, 50)
 * - search: Search across siteName, supplier name, keyword, product title
 * - entityType: Filter by SUPPLIER, OPPORTUNITY, PRODUCT
 * - status: Filter by microsite status
 * - layout: Filter by layout type
 * - sort: Sort field (siteName, createdAt, pageViews)
 * - order: Sort order (asc, desc)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const skip = (page - 1) * pageSize;

    const search = searchParams.get('search') || '';
    const entityTypeFilter = searchParams.get('entityType') || '';
    const statusFilter = searchParams.get('status') || '';
    const layoutFilter = searchParams.get('layout') || '';

    const sortField = searchParams.get('sort') || 'createdAt';
    const sortOrder = searchParams.get('order') || 'desc';

    // Build where clause
    const where: Record<string, unknown> = {};

    if (entityTypeFilter) {
      where['entityType'] = entityTypeFilter;
    }

    if (statusFilter) {
      where['status'] = statusFilter;
    }

    if (layoutFilter) {
      where['layoutType'] = layoutFilter;
    }

    if (search) {
      where['OR'] = [
        { siteName: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
        { opportunity: { keyword: { contains: search, mode: 'insensitive' } } },
        { product: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Build orderBy
    const orderBy: Record<string, string> = {};
    if (['siteName', 'createdAt', 'pageViews', 'status'].includes(sortField)) {
      orderBy[sortField] = sortOrder;
    } else {
      orderBy['createdAt'] = 'desc';
    }

    // Get total count and microsites in parallel
    const [totalCount, microsites] = await Promise.all([
      prisma.micrositeConfig.count({ where }),
      prisma.micrositeConfig.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          siteName: true,
          subdomain: true,
          parentDomain: true,
          fullDomain: true,
          entityType: true,
          status: true,
          layoutType: true,
          cachedProductCount: true,
          pageViews: true,
          createdAt: true,
          supplier: {
            select: {
              name: true,
              productCount: true,
              cities: true,
              categories: true,
              rating: true,
            },
          },
          opportunity: {
            select: {
              keyword: true,
              priorityScore: true,
              searchVolume: true,
              location: true,
              niche: true,
            },
          },
          product: {
            select: {
              title: true,
              priceFrom: true,
              city: true,
              rating: true,
            },
          },
        },
      }),
    ]);

    // Transform data
    const data = microsites.map((m) => {
      // Compute the destination-focused site title (mirrors buildHomepageTitle in page.tsx)
      const cities = m.supplier?.cities ?? [];
      const categories = m.supplier?.categories ?? [];
      const topCity =
        cities[0] ?? m.opportunity?.location?.split(',')[0]?.trim() ?? m.product?.city ?? null;
      const rawCategory = categories[0] ?? m.opportunity?.niche ?? null;
      const topCategory = rawCategory ? getCategoryDisplayName(rawCategory) : null;

      let siteTitle: string;
      if (topCategory && topCity) {
        siteTitle = `Best ${topCategory} in ${topCity} - Book Online`;
        if (siteTitle.length > 60)
          siteTitle =
            `Things to Do in ${topCity} - Tours & Activities`.length <= 60
              ? `Things to Do in ${topCity} - Tours & Activities`
              : `Things to Do in ${topCity}`;
      } else if (topCity) {
        siteTitle =
          `Things to Do in ${topCity} - Tours & Activities`.length <= 60
            ? `Things to Do in ${topCity} - Tours & Activities`
            : `Things to Do in ${topCity}`;
      } else if (topCategory) {
        siteTitle = `Best ${topCategory} - Book Online`;
      } else {
        siteTitle = 'Discover Tours & Activities - Book Online';
      }

      return {
        id: m.id,
        siteName: m.siteName,
        siteTitle,
        fullDomain: m.fullDomain,
        entityType: m.entityType,
        status: m.status,
        layoutType: m.layoutType,
        cachedProductCount: m.cachedProductCount,
        pageViews: m.pageViews,
        createdAt: m.createdAt.toISOString(),
        sourceName: m.supplier?.name ?? m.opportunity?.keyword ?? m.product?.title ?? m.siteName,
        keyMetric:
          m.entityType === 'SUPPLIER'
            ? { label: 'Products', value: m.supplier?.productCount ?? m.cachedProductCount }
            : m.entityType === 'OPPORTUNITY'
              ? { label: 'Score', value: m.opportunity?.priorityScore ?? 0 }
              : { label: 'Price', value: m.product?.priceFrom ? `£${m.product.priceFrom}` : '-' },
        location:
          m.supplier?.cities?.slice(0, 2).join(', ') ??
          m.opportunity?.location ??
          m.product?.city ??
          null,
      };
    });

    // Summary stats: total and active counts by entity type
    const [entityCounts, activeCounts] = await Promise.all([
      prisma.micrositeConfig.groupBy({
        by: ['entityType'],
        _count: { id: true },
      }),
      prisma.micrositeConfig.groupBy({
        by: ['entityType'],
        _count: { id: true },
        where: { status: 'ACTIVE' },
      }),
    ]);

    const summary: Record<string, { total: number; active: number }> = {
      SUPPLIER: { total: 0, active: 0 },
      OPPORTUNITY: { total: 0, active: 0 },
      PRODUCT: { total: 0, active: 0 },
    };

    for (const row of entityCounts) {
      if (summary[row.entityType]) {
        summary[row.entityType]!.total = row._count.id;
      }
    }
    for (const row of activeCounts) {
      if (summary[row.entityType]) {
        summary[row.entityType]!.active = row._count.id;
      }
    }

    return NextResponse.json({
      microsites: data,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      summary,
    });
  } catch (error) {
    console.error('[Microsites API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch microsites' },
      { status: 500 }
    );
  }
}
