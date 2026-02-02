import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET - Retrieve homepage config for a site
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
        homepageConfig: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      site: {
        id: site.id,
        name: site.name,
        homepageConfig: site.homepageConfig,
      },
    });
  } catch (error) {
    console.error('[API] Error fetching homepage config:', error);
    return NextResponse.json({ error: 'Failed to fetch homepage config' }, { status: 500 });
  }
}

/**
 * PUT - Update homepage config for a site
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate site exists
    const existingSite = await prisma.site.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingSite) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Update homepage config
    const updatedSite = await prisma.site.update({
      where: { id },
      data: {
        homepageConfig: body.homepageConfig,
      },
      select: {
        id: true,
        name: true,
        homepageConfig: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Homepage config updated successfully',
      site: {
        id: updatedSite.id,
        name: updatedSite.name,
        homepageConfig: updatedSite.homepageConfig,
      },
    });
  } catch (error) {
    console.error('[API] Error updating homepage config:', error);
    return NextResponse.json({ error: 'Failed to update homepage config' }, { status: 500 });
  }
}

/**
 * POST - Generate homepage config using AI for an existing site
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch site with brand and opportunity info
    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        brand: true,
        opportunities: {
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Import the AI generation function
    const { generateHomepageConfig } = await import('@experience-marketplace/jobs');

    // Prepare opportunity context (use site data if no opportunity)
    const opportunity = site.opportunities[0];
    const opportunityContext = {
      keyword: opportunity?.keyword || site.name,
      location: opportunity?.location || undefined,
      niche: opportunity?.niche || 'tours',
      searchVolume: opportunity?.searchVolume || 0,
      intent: opportunity?.intent || 'COMMERCIAL',
    };

    // Prepare brand identity context
    const brandIdentity = {
      name: site.brand?.name || site.name,
      tagline: site.brand?.tagline || site.description || '',
      primaryColor: site.brand?.primaryColor || '#6366f1',
      secondaryColor: site.brand?.secondaryColor || '#8b5cf6',
      accentColor: site.brand?.accentColor || '#f59e0b',
      headingFont: site.brand?.headingFont || 'Inter',
      bodyFont: site.brand?.bodyFont || 'Inter',
      logoUrl: site.brand?.logoUrl || null,
      toneOfVoice: {
        personality: ['Professional', 'Friendly'],
        writingStyle: 'Conversational',
        doList: [],
        dontList: [],
      },
      trustSignals: {
        expertise: [],
        certifications: [],
        valuePropositions: [],
        guarantees: [],
      },
      brandStory: {
        mission: '',
        vision: '',
        values: [],
        targetAudience: '',
        uniqueSellingPoints: [],
      },
      contentGuidelines: {
        keyThemes: [],
        contentPillars: [],
        semanticKeywords: [],
      },
    };

    // Generate homepage config
    const homepageConfig = await generateHomepageConfig(opportunityContext, brandIdentity);

    // Update site with generated config
    const updatedSite = await prisma.site.update({
      where: { id },
      data: {
        homepageConfig: homepageConfig as any,
      },
      select: {
        id: true,
        name: true,
        homepageConfig: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Homepage config generated successfully',
      site: {
        id: updatedSite.id,
        name: updatedSite.name,
        homepageConfig: updatedSite.homepageConfig,
      },
    });
  } catch (error) {
    console.error('[API] Error generating homepage config:', error);
    return NextResponse.json({ error: 'Failed to generate homepage config' }, { status: 500 });
  }
}
