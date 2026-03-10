import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 200);
    const skip = (page - 1) * pageSize;

    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || 'all';
    const ownerFilter = searchParams.get('owner') || 'all';

    // Build where clause
    const where: Prisma.PageWhereInput = {
      type: 'LANDING',
      slug: { startsWith: 'destinations/' },
    };

    if (statusFilter !== 'all') {
      where.status = statusFilter as Prisma.PageWhereInput['status'];
    }

    if (ownerFilter === 'sites') {
      where.siteId = { not: null };
    } else if (ownerFilter === 'microsites') {
      where.micrositeId = { not: null };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { site: { name: { contains: search, mode: 'insensitive' } } },
        { microsite: { siteName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [totalCount, pages, statsRaw] = await Promise.all([
      prisma.page.count({ where }),
      prisma.page.findMany({
        where,
        include: {
          site: {
            select: {
              id: true,
              name: true,
              primaryDomain: true,
              domains: { where: { status: 'ACTIVE' }, select: { domain: true }, take: 1 },
            },
          },
          microsite: {
            select: { id: true, siteName: true, fullDomain: true },
          },
          content: {
            select: { id: true, qualityScore: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      // Stats query — counts for all destination pages (unfiltered)
      prisma.$queryRaw<{ status: string; has_content: boolean; has_site: boolean; cnt: bigint }[]>`
        SELECT
          status::text,
          "contentId" IS NOT NULL AS has_content,
          "siteId" IS NOT NULL AS has_site,
          COUNT(*)::bigint AS cnt
        FROM "Page"
        WHERE type = 'LANDING' AND slug LIKE 'destinations/%'
        GROUP BY status, "contentId" IS NOT NULL, "siteId" IS NOT NULL
      `,
    ]);

    // Aggregate stats
    let total = 0;
    let published = 0;
    let withContent = 0;
    let sitesCount = 0;
    let micrositesCount = 0;

    for (const row of statsRaw) {
      const cnt = Number(row.cnt);
      total += cnt;
      if (row.status === 'PUBLISHED') published += cnt;
      if (row.has_content) withContent += cnt;
      if (row.has_site) sitesCount += cnt;
      else micrositesCount += cnt;
    }

    const items = pages.map((p) => {
      const isSite = !!p.siteId;
      let url: string | null = null;

      if (isSite && p.site) {
        const domain = p.site.primaryDomain || p.site.domains[0]?.domain;
        if (domain) url = `https://${domain}/${p.slug}`;
      } else if (p.microsite) {
        url = `https://${p.microsite.fullDomain}/${p.slug}`;
      }

      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        status: p.status,
        hasContent: !!p.contentId,
        qualityScore: p.content?.qualityScore ?? null,
        ownerType: isSite ? ('site' as const) : ('microsite' as const),
        ownerName: isSite ? (p.site?.name ?? 'Unknown') : (p.microsite?.siteName ?? 'Unknown'),
        url,
        createdAt: p.createdAt.toISOString(),
        publishedAt: p.publishedAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({
      items,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      stats: { total, published, withContent, sites: sitesCount, microsites: micrositesCount },
    });
  } catch (error) {
    console.error('[API] Error fetching destinations:', error);
    return NextResponse.json({ error: 'Failed to fetch destinations' }, { status: 500 });
  }
}
