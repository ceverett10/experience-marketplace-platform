import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';

/**
 * Debug endpoint to check domain → site → page mapping
 * Usage: /admin/api/debug/domain-mapping?domain=london-food-tours.com
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const domainParam = searchParams.get('domain');

    if (!domainParam) {
      return NextResponse.json(
        { error: 'Domain parameter required. Usage: ?domain=london-food-tours.com' },
        { status: 400 }
      );
    }

    // Clean domain (remove www prefix and port)
    const cleanDomain = domainParam.replace(/^www\./, '').split(':')[0];

    // Step 1: Check if Domain record exists
    const domainRecord = await prisma.domain.findUnique({
      where: { domain: cleanDomain },
      include: {
        site: {
          include: {
            brand: true,
            pages: {
              where: {
                slug: 'privacy',
                type: 'LEGAL',
              },
              include: {
                content: true,
              },
            },
          },
        },
      },
    });

    // Step 2: Get ALL sites (for debugging)
    const allSites = await prisma.site.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        domains: {
          select: {
            domain: true,
            status: true,
          },
        },
      },
    });

    // Step 3: If no domain record, try finding by site slug
    let siteBySlug = null;
    if (!domainRecord) {
      // Try extracting site slug from domain (e.g., london-food-tours.com → london-food-tours)
      const potentialSlug = cleanDomain.split('.')[0];
      siteBySlug = await prisma.site.findUnique({
        where: { slug: potentialSlug },
        include: {
          brand: true,
          domains: true,
          pages: {
            where: {
              slug: 'privacy',
              type: 'LEGAL',
            },
            include: {
              content: true,
            },
          },
        },
      });
    }

    // Step 4: Get privacy pages for ALL sites
    const allPrivacyPages = await prisma.page.findMany({
      where: {
        slug: 'privacy',
        type: 'LEGAL',
      },
      include: {
        content: true,
        site: {
          select: {
            id: true,
            name: true,
            slug: true,
            domains: {
              select: {
                domain: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      debug: {
        requestedDomain: domainParam,
        cleanedDomain: cleanDomain,
      },
      domainRecord: domainRecord
        ? {
            found: true,
            domain: domainRecord.domain,
            status: domainRecord.status,
            siteId: domainRecord.siteId,
            site: domainRecord.site
              ? {
                  id: domainRecord.site.id,
                  name: domainRecord.site.name,
                  slug: domainRecord.site.slug,
                  status: domainRecord.site.status,
                  brand: domainRecord.site.brand?.name,
                  privacyPage: domainRecord.site.pages[0] || null,
                }
              : null,
          }
        : {
            found: false,
            message: `No Domain record found for '${cleanDomain}'`,
          },
      siteBySlug: siteBySlug
        ? {
            found: true,
            id: siteBySlug.id,
            name: siteBySlug.name,
            slug: siteBySlug.slug,
            status: siteBySlug.status,
            brand: siteBySlug.brand?.name,
            domains: siteBySlug.domains,
            privacyPage: siteBySlug.pages[0] || null,
          }
        : {
            found: false,
            message: 'No site found by slug extraction',
          },
      allSites: allSites.map((site) => ({
        id: site.id,
        name: site.name,
        slug: site.slug,
        status: site.status,
        domains: site.domains.map((d) => d.domain),
      })),
      allPrivacyPages: allPrivacyPages.map((page) => ({
        pageId: page.id,
        siteName: page.site.name,
        siteSlug: page.site.slug,
        siteDomains: page.site.domains.map((d) => d.domain),
        hasContent: !!page.contentId,
        contentPreview: page.content?.body?.substring(0, 100),
        pageStatus: page.status,
      })),
    });
  } catch (error) {
    console.error('[Debug API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch debug data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
