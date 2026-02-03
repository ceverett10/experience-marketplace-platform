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
        explanation: opp.explanation,
        createdAt: opp.createdAt.toISOString(),
        sourceData: opp.sourceData as any, // Include domain suggestions, scan mode, projected value
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
          model: 'claude-3-5-haiku-20241022',
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
