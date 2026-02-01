import { NextResponse } from 'next/server';
import { initializeSiteRoadmap } from '@experience-marketplace/jobs';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    // Get all sites
    const sites = await prisma.site.findMany({
      select: { id: true, name: true },
    });

    const results = {
      total: sites.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Initialize roadmap for each site
    for (const site of sites) {
      try {
        await initializeSiteRoadmap(site.id);
        results.successful++;
        console.log(`[API] Initialized roadmap for site: ${site.name}`);
      } catch (error) {
        results.failed++;
        results.errors.push(`${site.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error(`[API] Failed to initialize roadmap for ${site.name}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Initialized roadmaps for ${results.successful} of ${results.total} sites`,
      ...results,
    });
  } catch (error) {
    console.error('[API] Error initializing roadmaps:', error);
    return NextResponse.json({ error: 'Failed to initialize roadmaps' }, { status: 500 });
  }
}
