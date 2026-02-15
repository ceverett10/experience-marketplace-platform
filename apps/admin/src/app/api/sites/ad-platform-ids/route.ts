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
 * Set pixel/conversion IDs and propagate to all sites and microsites.
 *
 * Body: { metaPixelId?: string, googleAdsId?: string, googleAdsConversionAction?: string }
 * If no IDs provided, falls back to env vars (META_PIXEL_ID, GOOGLE_ADS_ID, GOOGLE_ADS_CONVERSION_ACTION).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { metaPixelId, googleAdsId, googleAdsConversionAction } = body as {
      metaPixelId?: string;
      googleAdsId?: string;
      googleAdsConversionAction?: string;
    };

    // Fall back to env vars when no IDs provided (e.g. from dashboard button)
    if (!metaPixelId && !googleAdsId) {
      metaPixelId = process.env['META_PIXEL_ID'] || undefined;
      googleAdsId = process.env['GOOGLE_ADS_ID'] || undefined;
      googleAdsConversionAction = googleAdsConversionAction || process.env['GOOGLE_ADS_CONVERSION_ACTION'] || undefined;
    }

    if (!metaPixelId && !googleAdsId) {
      return NextResponse.json(
        { error: 'No pixel IDs provided and no env vars (META_PIXEL_ID, GOOGLE_ADS_ID) configured' },
        { status: 400 }
      );
    }

    const adFields = {
      ...(metaPixelId ? { metaPixelId } : {}),
      ...(googleAdsId ? { googleAdsId } : {}),
      ...(googleAdsConversionAction ? { googleAdsConversionAction } : {}),
    };

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
        data: { seoConfig: { ...current, ...adFields } as any },
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
            data: { seoConfig: { ...current, ...adFields } as any },
          });
          micrositesUpdated++;
        })
      );
    }

    return NextResponse.json({
      success: true,
      metaPixelId: metaPixelId || null,
      googleAdsId: googleAdsId || null,
      googleAdsConversionAction: googleAdsConversionAction || null,
      sitesUpdated,
      micrositesUpdated,
    });
  } catch (error) {
    console.error('[API] Error syncing ad platform IDs:', error);
    return NextResponse.json({ error: 'Failed to sync ad platform IDs' }, { status: 500 });
  }
}
