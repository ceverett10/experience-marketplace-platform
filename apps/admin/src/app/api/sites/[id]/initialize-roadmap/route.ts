import { NextResponse } from 'next/server';
import { initializeSiteRoadmap } from '@experience-marketplace/jobs';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify site exists
    const site = await prisma.site.findUnique({
      where: { id },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Initialize roadmap for this site
    await initializeSiteRoadmap(id);

    return NextResponse.json({
      success: true,
      message: `Roadmap initialized for site ${site.name}`,
      siteId: id,
    });
  } catch (error) {
    console.error('[API] Error initializing roadmap:', error);
    return NextResponse.json({ error: 'Failed to initialize roadmap' }, { status: 500 });
  }
}
