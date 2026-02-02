import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface SeoConfig {
  titleTemplate?: string;
  defaultDescription?: string;
  keywords?: string[];
  gaMeasurementId?: string | null;
  [key: string]: unknown;
}

/**
 * GET /api/sites/[id]/analytics
 * Retrieve analytics configuration for a site
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        seoConfig: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const seoConfig = site.seoConfig as SeoConfig | null;

    return NextResponse.json({
      siteId: site.id,
      siteName: site.name,
      siteSlug: site.slug,
      analytics: {
        gaMeasurementId: seoConfig?.gaMeasurementId || null,
      },
    });
  } catch (error) {
    console.error('[API] Error fetching analytics config:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics config' }, { status: 500 });
  }
}

/**
 * PATCH /api/sites/[id]/analytics
 * Update analytics configuration for a site
 *
 * Body: { gaMeasurementId: "G-XXXXXXXXXX" }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { gaMeasurementId } = body;

    // Validate GA measurement ID format if provided
    if (gaMeasurementId && typeof gaMeasurementId === 'string') {
      // GA4 measurement IDs start with G- followed by alphanumeric characters
      if (!gaMeasurementId.match(/^G-[A-Z0-9]+$/i)) {
        return NextResponse.json(
          { error: 'Invalid GA measurement ID format. Expected format: G-XXXXXXXXXX' },
          { status: 400 }
        );
      }
    }

    // Fetch current site
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        seoConfig: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Merge new analytics config with existing seoConfig
    const currentSeoConfig = (site.seoConfig as SeoConfig) || {};
    const updatedSeoConfig: SeoConfig = {
      ...currentSeoConfig,
      gaMeasurementId: gaMeasurementId || null,
    };

    // Update site
    const updatedSite = await prisma.site.update({
      where: { id },
      data: {
        seoConfig: updatedSeoConfig as any,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        seoConfig: true,
      },
    });

    const newSeoConfig = updatedSite.seoConfig as SeoConfig;

    return NextResponse.json({
      success: true,
      siteId: updatedSite.id,
      siteName: updatedSite.name,
      siteSlug: updatedSite.slug,
      analytics: {
        gaMeasurementId: newSeoConfig?.gaMeasurementId || null,
      },
      message: gaMeasurementId
        ? `Google Analytics configured with measurement ID: ${gaMeasurementId}`
        : 'Google Analytics configuration removed',
    });
  } catch (error) {
    console.error('[API] Error updating analytics config:', error);
    return NextResponse.json({ error: 'Failed to update analytics config' }, { status: 500 });
  }
}

/**
 * DELETE /api/sites/[id]/analytics
 * Remove analytics configuration from a site
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        seoConfig: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Remove gaMeasurementId from seoConfig
    const currentSeoConfig = (site.seoConfig as SeoConfig) || {};
    const { gaMeasurementId, ...restSeoConfig } = currentSeoConfig;

    await prisma.site.update({
      where: { id },
      data: {
        seoConfig: restSeoConfig as any,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Google Analytics configuration removed',
    });
  } catch (error) {
    console.error('[API] Error removing analytics config:', error);
    return NextResponse.json({ error: 'Failed to remove analytics config' }, { status: 500 });
  }
}
