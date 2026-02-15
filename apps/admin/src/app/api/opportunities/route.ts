import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addJob } from '@experience-marketplace/jobs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search') || '';

    // Pagination params
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 200);
    const skip = (page - 1) * pageSize;

    // Sort params
    const sortField = searchParams.get('sort') || 'priorityScore';
    const sortOrder = searchParams.get('order') || 'desc';

    // Build query filters
    const where: any = {};
    if (status === 'ARCHIVED') {
      where.status = 'ARCHIVED';
    } else if (status && status !== 'all') {
      where.status = status;
    } else {
      // Default "all" excludes ARCHIVED so discarded opportunities are hidden
      where.status = { not: 'ARCHIVED' };
    }

    if (search) {
      where.OR = [
        { keyword: { contains: search, mode: 'insensitive' } },
        { niche: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy
    const orderBy: Record<string, string> = {};
    if (['priorityScore', 'searchVolume', 'difficulty', 'createdAt', 'cpc'].includes(sortField)) {
      orderBy[sortField] = sortOrder;
    } else {
      orderBy['priorityScore'] = 'desc';
    }

    // Fetch paginated opportunities, total count, and stats in parallel
    const [totalCount, opportunities, statusCounts, highPriorityCount] = await Promise.all([
      prisma.sEOOpportunity.count({ where }),
      prisma.sEOOpportunity.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          site: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      // Single groupBy for all status counts
      prisma.sEOOpportunity.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.sEOOpportunity.count({
        where: { priorityScore: { gte: 75 } },
      }),
    ]);

    // Build stats from groupBy
    const statusMap: Record<string, number> = {};
    let totalAll = 0;
    for (const row of statusCounts) {
      statusMap[row.status] = row._count.id;
      totalAll += row._count.id;
    }

    const stats = {
      total: totalAll,
      identified: statusMap['IDENTIFIED'] || 0,
      evaluated: statusMap['EVALUATED'] || 0,
      assigned: statusMap['ASSIGNED'] || 0,
      highPriority: highPriorityCount,
      archived: statusMap['ARCHIVED'] || 0,
    };

    return NextResponse.json({
      opportunities: opportunities.map((opp) => ({
        id: opp.id,
        keyword: opp.keyword,
        searchVolume: opp.searchVolume ?? 0,
        difficulty: opp.difficulty ?? 0,
        cpc: opp.cpc ? Number(opp.cpc) : 0,
        intent: opp.intent,
        niche: opp.niche ?? '',
        location: opp.location,
        priorityScore: opp.priorityScore ?? 0,
        status: opp.status,
        source: opp.source,
        siteId: opp.siteId,
        explanation: opp.explanation,
        createdAt: opp.createdAt?.toISOString() ?? new Date().toISOString(),
        sourceData: opp.sourceData as any,
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
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

    if (action === 'generate-explanation') {
      // Generate AI explanation for why this opportunity is attractive
      const opportunity = await prisma.sEOOpportunity.findUnique({
        where: { id: opportunityId },
      });

      if (!opportunity) {
        return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
      }

      // Prepare data for AI analysis
      const opportunityData = {
        keyword: opportunity.keyword,
        searchVolume: opportunity.searchVolume,
        difficulty: opportunity.difficulty,
        cpc: opportunity.cpc.toNumber(),
        intent: opportunity.intent,
        niche: opportunity.niche,
        location: opportunity.location,
        priorityScore: opportunity.priorityScore,
        sourceData: opportunity.sourceData,
      };

      // Call Anthropic API to generate explanation
      const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
      if (!anthropicApiKey) {
        return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
      }

      const prompt = `Analyze this SEO opportunity and explain in 2-3 concise sentences why this is an attractive keyword to target:

Keyword: ${opportunityData.keyword}
Search Volume: ${opportunityData.searchVolume.toLocaleString()}/month
Keyword Difficulty: ${opportunityData.difficulty}/100
Cost Per Click: $${opportunityData.cpc}
Search Intent: ${opportunityData.intent}
Niche: ${opportunityData.niche}
Location: ${opportunityData.location || 'Not specified'}
Priority Score: ${opportunityData.priorityScore}/100

${opportunityData.sourceData ? `Additional Data from DataForSEO:\n${JSON.stringify(opportunityData.sourceData, null, 2)}` : ''}

Provide a clear, actionable explanation focusing on:
1. The commercial opportunity (search volume, CPC, competition balance)
2. Why this fits well for the ${opportunityData.niche} niche
3. Any location-specific advantages

Keep it concise and business-focused.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Anthropic API] Error:', errorData);
        return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 });
      }

      const data = await response.json();
      const explanation = data.content[0].text;

      // Update opportunity with explanation
      await prisma.sEOOpportunity.update({
        where: { id: opportunityId },
        data: { explanation },
      });

      return NextResponse.json({
        success: true,
        explanation,
      });
    }

    if (action === 'start-scan') {
      // Trigger an SEO opportunity scan job
      // scanVersion: 'standard' (default) = full 5-iteration scan (~$2.20)
      // scanVersion: 'quick' = reduced 2-iteration scan (~$0.50)
      const { scanVersion = 'standard' } = body;
      const isQuickScan = scanVersion === 'quick';

      const jobId = await addJob('SEO_OPPORTUNITY_SCAN', {
        destinations,
        categories,
        forceRescan: true,
        // Quick scan uses fewer iterations and suggestions
        maxIterations: isQuickScan ? 2 : 5,
        initialSuggestionsCount: isQuickScan ? 30 : 60,
        scanVersion,
      });

      const versionLabel = isQuickScan ? 'Quick' : 'Standard';
      return NextResponse.json({
        success: true,
        jobId,
        message: `${versionLabel} opportunity scan started`,
        scanVersion,
      });
    }

    if (action === 'start-optimized-scan') {
      // Trigger the recursive AI optimization scan
      // This runs 5 iterations of AI refinement to find the best opportunities
      const { maxIterations = 5, destinationFocus, categoryFocus, budgetLimit } = body;

      const jobId = await addJob('SEO_OPPORTUNITY_OPTIMIZE', {
        maxIterations,
        destinationFocus: destinationFocus || destinations,
        categoryFocus: categoryFocus || categories,
        budgetLimit,
      });

      return NextResponse.json({
        success: true,
        jobId,
        message: `Optimized opportunity scan started with ${maxIterations} iterations`,
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

    if (action === 'bulk-create-microsites') {
      const { minScore = 50, batchSize = 200 } = body;

      // Find all eligible opportunities: high priority, not yet actioned, no linked site or microsite
      const eligibleOpps = await prisma.sEOOpportunity.findMany({
        where: {
          priorityScore: { gte: minScore },
          status: { in: ['IDENTIFIED', 'EVALUATED'] },
          siteId: null,
          micrositeConfig: null,
        },
        orderBy: { priorityScore: 'desc' },
        take: batchSize,
      });

      if (eligibleOpps.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No eligible opportunities found',
          queued: 0,
          skipped: 0,
        });
      }

      let queued = 0;
      let skipped = 0;

      for (const opp of eligibleOpps) {
        // Generate subdomain from keyword
        const subdomain = opp.keyword
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);

        // Check if subdomain already exists
        const existing = await prisma.micrositeConfig.findFirst({
          where: { subdomain, parentDomain: 'experiencess.com' },
        });
        if (existing) {
          skipped++;
          continue;
        }

        try {
          await addJob(
            'MICROSITE_CREATE',
            {
              opportunityId: opp.id,
              parentDomain: 'experiencess.com',
              subdomain,
              entityType: 'OPPORTUNITY',
              discoveryConfig: {
                keyword: opp.keyword,
                destination: opp.location || undefined,
                niche: opp.niche,
                searchTerms: [opp.keyword],
              },
            },
            {
              priority: 5,
              delay: queued * 2000, // Stagger: 2s between each job
            }
          );

          await prisma.sEOOpportunity.update({
            where: { id: opp.id },
            data: { status: 'MICROSITE_ASSIGNED' },
          });

          queued++;
        } catch (error) {
          console.error(
            `[Bulk Microsites] Failed to queue for "${opp.keyword}":`,
            error instanceof Error ? error.message : error
          );
          skipped++;
        }
      }

      const totalEligible = await prisma.sEOOpportunity.count({
        where: {
          priorityScore: { gte: minScore },
          status: { in: ['IDENTIFIED', 'EVALUATED'] },
          siteId: null,
          micrositeConfig: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Queued ${queued} microsite creation jobs (${skipped} skipped)`,
        queued,
        skipped,
        remainingEligible: totalEligible,
        batchSize,
      });
    }

    if (action === 'dismiss') {
      await prisma.sEOOpportunity.update({
        where: { id: opportunityId },
        data: { status: 'ARCHIVED' },
      });
    } else if (action === 'create-site') {
      // Queue the full SITE_CREATE job which handles:
      // - Brand identity generation (name, tagline, colors, typography)
      // - Favicon generation
      // - Logo generation
      // - Homepage configuration
      // - Site roadmap initialization
      // - Blog topic generation
      const opportunity = await prisma.sEOOpportunity.findUnique({
        where: { id: opportunityId },
      });

      if (!opportunity) {
        return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
      }

      // Extract domain suggestion from sourceData if available
      const sourceData = opportunity.sourceData as Record<string, unknown> | null;
      const domainSuggestions = sourceData?.['domainSuggestions'] as {
        primary?: string;
        alternatives?: string[];
      } | null;

      // Generate brand config from opportunity data
      const destination = opportunity.location?.split(',')[0] || 'Experiences';
      const niche = opportunity.niche || 'experiences';

      // Queue the SITE_CREATE job
      const jobId = await addJob('SITE_CREATE', {
        opportunityId: opportunity.id,
        domain: domainSuggestions?.primary,
        brandConfig: {
          name: `${destination} ${niche.charAt(0).toUpperCase() + niche.slice(1)}`,
          tagline: `Discover the best ${niche} in ${destination}`,
        },
        autoPublish: false,
      });

      // Mark opportunity as ASSIGNED (the job will link the site once created)
      await prisma.sEOOpportunity.update({
        where: { id: opportunityId },
        data: { status: 'ASSIGNED' },
      });

      return NextResponse.json({
        success: true,
        jobId,
        message:
          'Site creation job queued - brand identity, homepage, and content will be generated',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Error in opportunities handler:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
