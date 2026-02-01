import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addJob } from '@experience-marketplace/jobs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // Build query filters
    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    // Fetch opportunities from database
    const opportunities = await prisma.sEOOpportunity.findMany({
      where,
      orderBy: {
        priorityScore: 'desc',
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Calculate stats
    const stats = {
      total: await prisma.sEOOpportunity.count(),
      identified: await prisma.sEOOpportunity.count({ where: { status: 'IDENTIFIED' } }),
      evaluated: await prisma.sEOOpportunity.count({ where: { status: 'EVALUATED' } }),
      assigned: await prisma.sEOOpportunity.count({ where: { status: 'ASSIGNED' } }),
      highPriority: await prisma.sEOOpportunity.count({
        where: { priorityScore: { gte: 75 } },
      }),
    };

    return NextResponse.json({
      opportunities: opportunities.map((opp) => ({
        id: opp.id,
        keyword: opp.keyword,
        searchVolume: opp.searchVolume,
        difficulty: opp.difficulty,
        cpc: opp.cpc.toNumber(),
        intent: opp.intent,
        niche: opp.niche,
        location: opp.location,
        priorityScore: opp.priorityScore,
        status: opp.status,
        source: opp.source,
        siteId: opp.siteId,
        createdAt: opp.createdAt.toISOString(),
      })),
      stats,
    });
  } catch (error) {
    console.error('[API] Error fetching opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { opportunityId, action, destinations, categories } = body;

    if (action === 'start-scan') {
      // Trigger an SEO opportunity scan job
      const jobId = await addJob('SEO_OPPORTUNITY_SCAN', {
        destinations,
        categories,
        forceRescan: true,
      });

      return NextResponse.json({
        success: true,
        jobId,
        message: 'Opportunity scan started'
      });
    }

    if (action === 'fix-stuck') {
      // Find all stuck opportunities (ASSIGNED but no site)
      const stuckOpportunities = await prisma.sEOOpportunity.findMany({
        where: {
          status: 'ASSIGNED',
          siteId: null,
        },
      });

      if (stuckOpportunities.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No stuck opportunities found',
          fixed: 0,
        });
      }

      // Re-queue site creation for each stuck opportunity
      const jobIds: string[] = [];
      for (const opp of stuckOpportunities) {
        const destination = opp.location?.split(',')[0] || 'Experiences';
        const niche = opp.niche;

        const jobId = await addJob('SITE_CREATE', {
          opportunityId: opp.id,
          brandConfig: {
            name: `${destination} ${niche.charAt(0).toUpperCase() + niche.slice(1)}`,
            tagline: `Discover the best ${niche} in ${destination}`,
          },
          autoPublish: false,
        });

        jobIds.push(jobId);
      }

      return NextResponse.json({
        success: true,
        message: `Re-queued site creation for ${stuckOpportunities.length} stuck opportunities`,
        fixed: stuckOpportunities.length,
        jobIds,
      });
    }

    if (action === 'dismiss') {
      await prisma.sEOOpportunity.update({
        where: { id: opportunityId },
        data: { status: 'ARCHIVED' },
      });
    } else if (action === 'create-site') {
      // Create a new site from the opportunity
      const opportunity = await prisma.sEOOpportunity.findUnique({
        where: { id: opportunityId },
      });

      if (!opportunity) {
        return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
      }

      // Create site with slug generation
      const siteName = opportunity.keyword
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      const site = await prisma.site.create({
        data: {
          name: siteName,
          slug: opportunity.keyword.toLowerCase().replace(/\s+/g, '-'),
          status: 'DRAFT',
          holibobPartnerId: 'default', // TODO: Set proper partner ID
        },
      });

      // Update opportunity
      await prisma.sEOOpportunity.update({
        where: { id: opportunityId },
        data: {
          status: 'ASSIGNED',
          siteId: site.id,
        },
      });

      return NextResponse.json({ site });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Error updating opportunity:', error);
    return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 });
  }
}
