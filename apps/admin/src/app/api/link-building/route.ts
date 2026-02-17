import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addJob } from '@experience-marketplace/jobs';

/**
 * Count cross-site links (links to *.experiencess.com) in a content body.
 */
function countCrossSiteLinksInBody(body: string): number {
  const matches = body.match(/\]\(https?:\/\/[a-z0-9-]+\.experiencess\.com\//gi);
  return matches?.length ?? 0;
}

/**
 * GET /api/link-building
 * Returns link building data: backlinks, opportunities, linkable assets, and network stats.
 * Use ?type=network for internal cross-site link network data.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    const type = url.searchParams.get('type');

    // --- Network Stats endpoint ---
    if (type === 'network') {
      return await getNetworkStats();
    }

    const where = siteId ? { siteId } : {};

    // Fetch backlinks, opportunities, and assets in parallel
    const [backlinks, opportunities, assets, backlinkStats] = await Promise.all([
      prisma.backlink.findMany({
        where,
        orderBy: { domainAuthority: 'desc' },
        take: 50,
        include: {
          site: { select: { name: true, primaryDomain: true } },
        },
      }),
      prisma.linkOpportunity.findMany({
        where,
        orderBy: { priorityScore: 'desc' },
        take: 50,
        include: {
          site: { select: { name: true } },
        },
      }),
      prisma.linkableAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          site: { select: { name: true } },
        },
      }),
      // Aggregate backlink stats
      prisma.backlink.groupBy({
        by: ['siteId'],
        where: { ...where, isActive: true },
        _count: true,
        _avg: { domainAuthority: true },
      }),
    ]);

    // Compute summary stats
    const totalBacklinks = backlinks.filter((b) => b.isActive).length;
    const referringDomains = new Set(backlinks.filter((b) => b.isActive).map((b) => b.sourceDomain))
      .size;
    const avgDA =
      backlinks.length > 0
        ? Math.round(backlinks.reduce((sum, b) => sum + b.domainAuthority, 0) / backlinks.length)
        : 0;

    // Opportunity pipeline counts
    const pipelineCounts = {
      identified: opportunities.filter((o) => o.status === 'IDENTIFIED').length,
      researched: opportunities.filter((o) => o.status === 'RESEARCHED').length,
      outreachDrafted: opportunities.filter((o) => o.status === 'OUTREACH_DRAFTED').length,
      outreachSent: opportunities.filter((o) => o.status === 'OUTREACH_SENT').length,
      responded: opportunities.filter((o) => o.status === 'RESPONDED').length,
      acquired: opportunities.filter((o) => o.status === 'LINK_ACQUIRED').length,
      rejected: opportunities.filter((o) => o.status === 'REJECTED').length,
    };

    return NextResponse.json({
      summary: {
        totalBacklinks,
        referringDomains,
        avgDA,
        totalOpportunities: opportunities.length,
        totalAssets: assets.length,
        pipeline: pipelineCounts,
      },
      backlinks: backlinks.map((b) => ({
        id: b.id,
        sourceUrl: b.sourceUrl,
        sourceDomain: b.sourceDomain,
        targetUrl: b.targetUrl,
        anchorText: b.anchorText,
        domainAuthority: b.domainAuthority,
        isDoFollow: b.isDoFollow,
        isActive: b.isActive,
        acquisitionMethod: b.acquisitionMethod,
        firstSeenAt: b.firstSeenAt.toISOString(),
        siteName: b.site.name,
      })),
      opportunities: opportunities.map((o) => ({
        id: o.id,
        targetDomain: o.targetDomain,
        targetUrl: o.targetUrl,
        domainAuthority: o.domainAuthority,
        relevanceScore: o.relevanceScore,
        priorityScore: o.priorityScore,
        opportunityType: o.opportunityType,
        status: o.status,
        hasOutreach: !!o.outreachTemplate,
        siteName: o.site.name,
        createdAt: o.createdAt.toISOString(),
      })),
      assets: assets.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        assetType: a.assetType,
        backlinkCount: a.backlinkCount,
        socialShares: a.socialShares,
        siteName: a.site.name,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[API] Error fetching link building data:', error);
    return NextResponse.json({ error: 'Failed to fetch link building data' }, { status: 500 });
  }
}

/**
 * Network stats: cross-site link health across the microsite network.
 */
async function getNetworkStats(): Promise<NextResponse> {
  try {
    // 1. Total active microsites
    const totalMicrosites = await prisma.micrositeConfig.count({
      where: { status: 'ACTIVE' },
    });

    // 2. Total PUBLISHED blog pages across all microsites
    const totalBlogs = await prisma.page.count({
      where: {
        micrositeId: { not: null },
        type: 'BLOG',
        status: 'PUBLISHED',
      },
    });

    // 3. Sample blog content to calculate cross-site link stats
    // Get a random sample of 200 blog pages with their content
    const samplePages = await prisma.page.findMany({
      where: {
        micrositeId: { not: null },
        type: 'BLOG',
        status: 'PUBLISHED',
        contentId: { not: null },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        contentId: true,
        micrositeId: true,
      },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    });

    const contentIds = samplePages
      .map((p) => p.contentId)
      .filter((id): id is string => id !== null);

    const contents = contentIds.length > 0
      ? await prisma.content.findMany({
          where: { id: { in: contentIds } },
          select: { id: true, body: true },
        })
      : [];
    const contentMap = new Map(contents.map((c) => [c.id, c.body]));

    // Count cross-site links in each sampled blog
    let blogsWithLinks = 0;
    let totalCrossSiteLinks = 0;
    const recentLinks: Array<{
      pageTitle: string;
      pageSlug: string;
      micrositeId: string;
      linkCount: number;
      targets: string[];
    }> = [];

    for (const page of samplePages) {
      const body = contentMap.get(page.contentId || '');
      if (!body) continue;

      const linkCount = countCrossSiteLinksInBody(body);
      if (linkCount > 0) {
        blogsWithLinks++;
        totalCrossSiteLinks += linkCount;

        // Extract target domains for recent links display
        const targetMatches = body.match(/\]\(https?:\/\/([a-z0-9-]+\.experiencess\.com)\/[^)]*\)/gi) || [];
        const targets = targetMatches
          .map((m) => {
            const match = m.match(/https?:\/\/([a-z0-9-]+\.experiencess\.com)/i);
            return match?.[1] || '';
          })
          .filter(Boolean);

        if (recentLinks.length < 20) {
          recentLinks.push({
            pageTitle: page.title,
            pageSlug: page.slug,
            micrositeId: page.micrositeId || '',
            linkCount,
            targets: [...new Set(targets)],
          });
        }
      }
    }

    const sampleSize = samplePages.length;
    const enrichmentRate = sampleSize > 0 ? Math.round((blogsWithLinks / sampleSize) * 100) : 0;
    const avgLinksPerEnrichedBlog = blogsWithLinks > 0
      ? Math.round((totalCrossSiteLinks / blogsWithLinks) * 10) / 10
      : 0;

    // Extrapolate to full network
    const estimatedTotalCrossSiteLinks = sampleSize > 0
      ? Math.round((totalCrossSiteLinks / sampleSize) * totalBlogs)
      : 0;
    const estimatedBlogsWithLinks = sampleSize > 0
      ? Math.round((blogsWithLinks / sampleSize) * totalBlogs)
      : 0;

    // 4. Enrichment job history
    const recentJobs = await prisma.job.findMany({
      where: {
        type: {
          in: [
            'CROSS_SITE_LINK_ENRICHMENT',
            'LINK_BACKLINK_MONITOR',
            'LINK_OPPORTUNITY_SCAN',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        result: true,
        createdAt: true,
        completedAt: true,
        error: true,
      },
    });

    // 5. Microsites with footer links (all ACTIVE microsites have footer links deployed via layout.tsx)
    const micrositesWithFooterLinks = totalMicrosites; // All active microsites get footer links

    return NextResponse.json({
      network: {
        totalMicrosites,
        totalBlogs,
        micrositesWithFooterLinks,
        estimatedFooterLinkInstances: totalMicrosites * 5, // 5 links per footer
      },
      crossSiteLinks: {
        sampleSize,
        blogsWithLinks,
        totalCrossSiteLinksInSample: totalCrossSiteLinks,
        enrichmentRate,
        avgLinksPerEnrichedBlog,
        estimatedTotalCrossSiteLinks,
        estimatedBlogsWithLinks,
      },
      recentLinks,
      jobs: recentJobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        result: j.result as Record<string, unknown> | null,
        createdAt: j.createdAt.toISOString(),
        completedAt: j.completedAt?.toISOString() ?? null,
        error: j.error,
      })),
    });
  } catch (error) {
    console.error('[API] Error fetching network stats:', error);
    return NextResponse.json({ error: 'Failed to fetch network stats' }, { status: 500 });
  }
}

/**
 * POST /api/link-building
 * Trigger link building actions: scan, monitor, generate outreach, create assets
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action, siteId, ...params } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });
    }

    switch (action) {
      case 'scan-competitors': {
        const { competitorDomains } = params;
        const jobId = await addJob('LINK_OPPORTUNITY_SCAN', {
          siteId,
          competitorDomains: competitorDomains || [],
        });
        return NextResponse.json({ success: true, message: 'Competitor scan queued', jobId });
      }

      case 'monitor-backlinks': {
        const jobId = await addJob('LINK_BACKLINK_MONITOR', {
          siteId,
          checkExisting: true,
          discoverNew: true,
        });
        return NextResponse.json({ success: true, message: 'Backlink monitor queued', jobId });
      }

      case 'generate-outreach': {
        const { opportunityId, templateType } = params;
        if (!opportunityId || !templateType) {
          return NextResponse.json(
            { error: 'Missing opportunityId or templateType' },
            { status: 400 }
          );
        }
        const jobId = await addJob('LINK_OUTREACH_GENERATE', {
          siteId,
          opportunityId,
          templateType,
        });
        return NextResponse.json({ success: true, message: 'Outreach generation queued', jobId });
      }

      case 'create-asset': {
        const { assetType, targetKeyword, destination } = params;
        if (!assetType || !targetKeyword) {
          return NextResponse.json(
            { error: 'Missing assetType or targetKeyword' },
            { status: 400 }
          );
        }
        const jobId = await addJob('LINK_ASSET_GENERATE', {
          siteId,
          assetType,
          targetKeyword,
          destination,
        });
        return NextResponse.json({ success: true, message: 'Asset generation queued', jobId });
      }

      case 'trigger-enrichment': {
        const jobId = await addJob('CROSS_SITE_LINK_ENRICHMENT' as any, {
          percentagePerRun: 10,
        } as any);
        return NextResponse.json({ success: true, message: 'Cross-site link enrichment queued', jobId });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[API] Error in link building POST:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

/**
 * PATCH /api/link-building
 * Update opportunity status
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { opportunityId, status } = await request.json();

    if (!opportunityId || !status) {
      return NextResponse.json({ error: 'Missing opportunityId or status' }, { status: 400 });
    }

    const updated = await prisma.linkOpportunity.update({
      where: { id: opportunityId },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      id: updated.id,
      status: updated.status,
    });
  } catch (error) {
    console.error('[API] Error updating opportunity:', error);
    return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 });
  }
}
