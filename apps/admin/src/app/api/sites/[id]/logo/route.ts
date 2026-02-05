import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Regenerate logo for a specific site
 * POST /api/sites/[id]/logo
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: siteId } = await params;

    // Import the logo generator functions dynamically
    const { regenerateLogo, isLogoGenerationAvailable } = await import(
      '@experience-marketplace/jobs'
    ).then((m) => m);

    if (!isLogoGenerationAvailable()) {
      return NextResponse.json(
        {
          error: 'Logo generation not available',
          message: 'OPENAI_API_KEY and R2 storage must be configured',
        },
        { status: 503 }
      );
    }

    // Get site with brand and opportunity context
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        seoConfig: true,
        brand: {
          select: {
            id: true,
            name: true,
            primaryColor: true,
            secondaryColor: true,
            logoUrl: true,
          },
        },
        opportunities: {
          take: 1,
          select: {
            niche: true,
            location: true,
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (!site.brand) {
      return NextResponse.json({ error: 'Site has no brand record' }, { status: 400 });
    }

    // Get opportunity context
    const opportunity = site.opportunities[0];
    const seoConfig = site.seoConfig as Record<string, unknown> | null;

    // Extract logo description from seoConfig if available
    const brandStory = seoConfig?.['brandStory'] as Record<string, unknown> | undefined;
    const usps = brandStory?.['uniqueSellingPoints'] as string[] | undefined;
    const logoDescription =
      (seoConfig?.['logoDescription'] as string) || usps?.[0] || undefined;

    console.log(`[Logo API] Regenerating logo for site ${siteId} (${site.name})`);

    // Generate new logo
    const logoResult = await regenerateLogo(
      {
        brandName: site.brand.name,
        niche: opportunity?.niche || 'travel experiences',
        primaryColor: site.brand.primaryColor,
        secondaryColor: site.brand.secondaryColor,
        logoDescription,
        location: opportunity?.location || undefined,
      },
      site.brand.logoUrl // Old logo URL for cleanup
    );

    // Update brand with new logo URL
    await prisma.brand.update({
      where: { id: site.brand.id },
      data: { logoUrl: logoResult.logoUrl },
    });

    console.log(`[Logo API] Logo regenerated for ${site.name}: ${logoResult.logoUrl}`);

    return NextResponse.json({
      success: true,
      logoUrl: logoResult.logoUrl,
      generatedAt: logoResult.generatedAt,
    });
  } catch (error) {
    console.error('[Logo API] Error regenerating logo:', error);
    return NextResponse.json(
      {
        error: 'Failed to regenerate logo',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
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
      hasLogo: !!site.brand?.logoUrl,
      canGenerateLogo: isLogoGenerationAvailable(),
    });
  } catch (error) {
    console.error('[Logo API] Error getting logo status:', error);
    return NextResponse.json({ error: 'Failed to get logo status' }, { status: 500 });
  }
}
