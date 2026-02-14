import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/microsites/enrich-opportunities
 *
 * Backfill existing OPPORTUNITY microsites with rich homepageConfig
 * (destinations, categories, testimonials, Unsplash images).
 *
 * This is a one-time migration endpoint. It queues MICROSITE_HOMEPAGE_ENRICH
 * jobs for all active OPPORTUNITY microsites that lack rich config.
 */
export async function POST() {
  try {
    // Find OPPORTUNITY microsites that need enrichment
    // (missing destinations in homepageConfig)
    const microsites = await prisma.micrositeConfig.findMany({
      where: {
        entityType: 'OPPORTUNITY',
        status: { in: ['ACTIVE', 'GENERATING', 'REVIEW'] },
      },
      select: {
        id: true,
        siteName: true,
        fullDomain: true,
        homepageConfig: true,
        opportunityId: true,
      },
    });

    // Filter to those without rich config (no destinations)
    const needsEnrichment = microsites.filter((ms) => {
      const config = ms.homepageConfig as Record<string, unknown> | null;
      const destinations = config?.['destinations'];
      return !destinations || !Array.isArray(destinations) || destinations.length === 0;
    });

    if (needsEnrichment.length === 0) {
      return NextResponse.json({
        message: 'All OPPORTUNITY microsites already have rich homepageConfig',
        totalOpportunity: microsites.length,
        enriched: 0,
      });
    }

    // Queue enrichment jobs
    const { addJob } = await import('@experience-marketplace/jobs');

    let queued = 0;
    for (const ms of needsEnrichment) {
      await addJob('MICROSITE_HOMEPAGE_ENRICH' as any, {
        micrositeId: ms.id,
      });
      queued++;
    }

    return NextResponse.json({
      message: `Queued ${queued} OPPORTUNITY microsites for homepage enrichment`,
      totalOpportunity: microsites.length,
      enriched: queued,
      microsites: needsEnrichment.map((ms) => ({
        id: ms.id,
        siteName: ms.siteName,
        fullDomain: ms.fullDomain,
      })),
    });
  } catch (error) {
    console.error('[Enrich Opportunities] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enrich opportunities' },
      { status: 500 }
    );
  }
}
