import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Regenerate all logo versions for a specific site
 * POST /api/sites/[id]/logo
 *
 * NOTE: Logo generation is disabled - using text-only branding (standard design)
 * for all sites and microsites due to insufficient quality from the generation service.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // Logo generation disabled - all sites use text-only branding (standard design)
  return NextResponse.json(
    {
      error: 'Logo generation disabled',
      message: 'Generated logos are disabled. All sites use text-only branding (standard design).',
    },
    { status: 403 }
  );
}

/**
 * Get logo generation status
 * GET /api/sites/[id]/logo
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: siteId } = await params;

    const { isLogoGenerationAvailable } = await import('@experience-marketplace/jobs').then(
      (m) => m
    );

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        name: true,
        brand: {
          select: {
            logoUrl: true,
            logoDarkUrl: true,
            faviconUrl: true,
            name: true,
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    return NextResponse.json({
      siteId,
      siteName: site.name,
      logoUrl: site.brand?.logoUrl || null,
      logoDarkUrl: site.brand?.logoDarkUrl || null,
      faviconUrl: site.brand?.faviconUrl || null,
      hasLogo: !!site.brand?.logoUrl,
      hasAllVersions: !!(site.brand?.logoUrl && site.brand?.logoDarkUrl && site.brand?.faviconUrl),
      canGenerateLogo: isLogoGenerationAvailable(),
    });
  } catch (error) {
    console.error('[Logo API] Error getting logo status:', error);
    return NextResponse.json({ error: 'Failed to get logo status' }, { status: 500 });
  }
}
