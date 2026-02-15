import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface SeoConfig {
  metaPixelId?: string | null;
  googleAdsId?: string | null;
  [key: string]: unknown;
}

/**
 * GET /api/sites/ad-platform-ids
 * Show current ad platform ID configuration across all sites and microsites.
 */
export async function GET() {
  try {
    const sites = await prisma.site.findMany({
      where: { status: { in: ['ACTIVE', 'REVIEW'] } },
      select: { id: true, name: true, primaryDomain: true, seoConfig: true },
      orderBy: { name: 'asc' },
    });

    const micrositeCount = await prisma.micrositeConfig.count({
      where: { status: { in: ['ACTIVE', 'REVIEW', 'GENERATING'] } },
    });

    // Sample microsites for visibility
    const micrositeSample = await prisma.micrositeConfig.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullDomain: true, seoConfig: true },
      take: 5,
      orderBy: { updatedAt: 'desc' },
    });

    const siteDetails = sites.map((site) => {
      const config = site.seoConfig as SeoConfig | null;
      return {
        id: site.id,
        name: site.name,
        primaryDomain: site.primaryDomain,
        metaPixelId: config?.metaPixelId || null,
        googleAdsId: config?.googleAdsId || null,
      };
    });

    const withPixel = siteDetails.filter((s) => s.metaPixelId).length;
    const withGoogleAds = siteDetails.filter((s) => s.googleAdsId).length;

    return NextResponse.json({
      sites: siteDetails,
      microsites: {
        totalActive: micrositeCount,
        sample: micrositeSample.map((ms) => ({
          id: ms.id,
          fullDomain: ms.fullDomain,
          metaPixelId: (ms.seoConfig as SeoConfig)?.metaPixelId || null,
          googleAdsId: (ms.seoConfig as SeoConfig)?.googleAdsId || null,
        })),
      },
      summary: {
        totalSites: sites.length,
        sitesWithPixel: withPixel,
        sitesWithGoogleAds: withGoogleAds,
        totalMicrosites: micrositeCount,
      },
      envVars: {
        META_AD_ACCOUNT_ID: process.env['META_AD_ACCOUNT_ID'] ? 'SET' : 'NOT SET',
        META_PIXEL_ID: process.env['META_PIXEL_ID'] || 'NOT SET',
        GOOGLE_ADS_CUSTOMER_ID: process.env['GOOGLE_ADS_CUSTOMER_ID'] ? 'SET' : 'NOT SET',
        GOOGLE_ADS_ID: process.env['GOOGLE_ADS_ID'] || 'NOT SET',
        GOOGLE_ADS_CONVERSION_ACTION: process.env['GOOGLE_ADS_CONVERSION_ACTION'] || 'NOT SET',
      },
    });
  } catch (error) {
    console.error('[API] Error fetching ad platform IDs:', error);
    return NextResponse.json({ error: 'Failed to fetch ad platform IDs' }, { status: 500 });
  }
}

/**
 * POST /api/sites/ad-platform-ids
 * Manually set pixel/conversion IDs and propagate to all sites and microsites.
 *
 * Body: { metaPixelId?: string, googleAdsId?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { metaPixelId, googleAdsId } = body as {
      metaPixelId?: string;
      googleAdsId?: string;
    };

    if (!metaPixelId && !googleAdsId) {
      return NextResponse.json(
        { error: 'Provide at least one of metaPixelId or googleAdsId' },
        { status: 400 }
      );
    }

    // Propagate to sites
    const sites = await prisma.site.findMany({
      where: { status: { in: ['ACTIVE', 'REVIEW'] } },
      select: { id: true, seoConfig: true },
    });

    let sitesUpdated = 0;
    for (const site of sites) {
      const current = (site.seoConfig as Record<string, unknown>) || {};
      await prisma.site.update({
        where: { id: site.id },
        data: {
          seoConfig: {
            ...current,
            ...(metaPixelId ? { metaPixelId } : {}),
            ...(googleAdsId ? { googleAdsId } : {}),
          } as any,
        },
      });
      sitesUpdated++;
    }

    // Propagate to microsites
    const microsites = await prisma.micrositeConfig.findMany({
      where: { status: { in: ['ACTIVE', 'REVIEW', 'GENERATING'] } },
      select: { id: true, seoConfig: true },
    });

    let micrositesUpdated = 0;
    const BATCH_SIZE = 50;
    for (let i = 0; i < microsites.length; i += BATCH_SIZE) {
      const batch = microsites.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (ms) => {
          const current = (ms.seoConfig as Record<string, unknown>) || {};
          await prisma.micrositeConfig.update({
            where: { id: ms.id },
            data: {
              seoConfig: {
                ...current,
                ...(metaPixelId ? { metaPixelId } : {}),
                ...(googleAdsId ? { googleAdsId } : {}),
              } as any,
            },
          });
          micrositesUpdated++;
        })
      );
    }

    return NextResponse.json({
      success: true,
      metaPixelId: metaPixelId || null,
      googleAdsId: googleAdsId || null,
      sitesUpdated,
      micrositesUpdated,
    });
  } catch (error) {
    console.error('[API] Error syncing ad platform IDs:', error);
    return NextResponse.json({ error: 'Failed to sync ad platform IDs' }, { status: 500 });
  }
}
