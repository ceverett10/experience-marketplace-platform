import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface SeoConfig {
  titleTemplate?: string;
  defaultDescription?: string;
  keywords?: string[];
  gaMeasurementId?: string | null;
  [key: string]: unknown;
}

interface BulkUpdateItem {
  siteId: string;
  gaMeasurementId: string | null;
}

/**
 * GET /api/sites/analytics/bulk
 * Get analytics configuration for all active sites
 */
export async function GET() {
  try {
    const sites = await prisma.site.findMany({
      where: {
        status: { in: ['ACTIVE', 'REVIEW'] },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryDomain: true,
        status: true,
        seoConfig: true,
      },
      orderBy: { name: 'asc' },
    });

    const sitesWithAnalytics = sites.map((site) => {
      const seoConfig = site.seoConfig as SeoConfig | null;
      return {
        id: site.id,
        name: site.name,
        slug: site.slug,
        primaryDomain: site.primaryDomain,
        status: site.status,
        gaMeasurementId: seoConfig?.gaMeasurementId || null,
        hasAnalytics: !!seoConfig?.gaMeasurementId,
      };
    });

    const summary = {
      total: sites.length,
      withAnalytics: sitesWithAnalytics.filter((s) => s.hasAnalytics).length,
      withoutAnalytics: sitesWithAnalytics.filter((s) => !s.hasAnalytics).length,
    };

    return NextResponse.json({
      sites: sitesWithAnalytics,
      summary,
    });
  } catch (error) {
    console.error('[API] Error fetching bulk analytics config:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics config' }, { status: 500 });
  }
}

/**
 * POST /api/sites/analytics/bulk
 * Bulk update analytics configuration for multiple sites
 *
 * Body options:
 * 1. Set same GA ID for all active sites:
 *    { gaMeasurementId: "G-XXXXXXXXXX" }
 *
 * 2. Set different GA IDs per site:
 *    { sites: [{ siteId: "xxx", gaMeasurementId: "G-XXXXXXXXXX" }, ...] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { gaMeasurementId, sites: siteUpdates } = body as {
      gaMeasurementId?: string;
      sites?: BulkUpdateItem[];
    };

    // Validate input
    if (!gaMeasurementId && !siteUpdates) {
      return NextResponse.json(
        { error: 'Either gaMeasurementId or sites array is required' },
        { status: 400 }
      );
    }

    // Validate GA measurement ID format
    const validateGaId = (id: string | null): boolean => {
      if (!id) return true; // null is valid (removes config)
      return /^G-[A-Z0-9]+$/i.test(id);
    };

    if (gaMeasurementId && !validateGaId(gaMeasurementId)) {
      return NextResponse.json(
        { error: 'Invalid GA measurement ID format. Expected format: G-XXXXXXXXXX' },
        { status: 400 }
      );
    }

    const results: Array<{
      siteId: string;
      siteName: string;
      success: boolean;
      gaMeasurementId: string | null;
      error?: string;
    }> = [];

    if (gaMeasurementId) {
      // Option 1: Set same GA ID for all active sites
      const activeSites = await prisma.site.findMany({
        where: {
          status: { in: ['ACTIVE', 'REVIEW'] },
        },
        select: {
          id: true,
          name: true,
          seoConfig: true,
        },
      });

      for (const site of activeSites) {
        try {
          const currentSeoConfig = (site.seoConfig as SeoConfig) || {};
          const updatedSeoConfig: SeoConfig = {
            ...currentSeoConfig,
            gaMeasurementId,
          };

          await prisma.site.update({
            where: { id: site.id },
            data: { seoConfig: updatedSeoConfig as any },
          });

          results.push({
            siteId: site.id,
            siteName: site.name,
            success: true,
            gaMeasurementId,
          });
        } catch (err) {
          results.push({
            siteId: site.id,
            siteName: site.name,
            success: false,
            gaMeasurementId: null,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    } else if (siteUpdates) {
      // Option 2: Set different GA IDs per site
      for (const update of siteUpdates) {
        if (!validateGaId(update.gaMeasurementId)) {
          results.push({
            siteId: update.siteId,
            siteName: 'Unknown',
            success: false,
            gaMeasurementId: null,
            error: 'Invalid GA measurement ID format',
          });
          continue;
        }

        try {
          const site = await prisma.site.findUnique({
            where: { id: update.siteId },
            select: { id: true, name: true, seoConfig: true },
          });

          if (!site) {
            results.push({
              siteId: update.siteId,
              siteName: 'Unknown',
              success: false,
              gaMeasurementId: null,
              error: 'Site not found',
            });
            continue;
          }

          const currentSeoConfig = (site.seoConfig as SeoConfig) || {};
          const updatedSeoConfig: SeoConfig = {
            ...currentSeoConfig,
            gaMeasurementId: update.gaMeasurementId,
          };

          await prisma.site.update({
            where: { id: update.siteId },
            data: { seoConfig: updatedSeoConfig as any },
          });

          results.push({
            siteId: site.id,
            siteName: site.name,
            success: true,
            gaMeasurementId: update.gaMeasurementId,
          });
        } catch (err) {
          results.push({
            siteId: update.siteId,
            siteName: 'Unknown',
            success: false,
            gaMeasurementId: null,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    const summary = {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };

    return NextResponse.json({
      success: summary.failed === 0,
      results,
      summary,
    });
  } catch (error) {
    console.error('[API] Error bulk updating analytics config:', error);
    return NextResponse.json({ error: 'Failed to bulk update analytics config' }, { status: 500 });
  }
}
