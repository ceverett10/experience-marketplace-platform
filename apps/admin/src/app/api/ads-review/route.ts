import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/ads-review
 * Returns a list of review reports (newest first) and the latest report in full.
 *
 * Query params:
 *   reportId - Fetch a specific report by ID
 *   limit    - Number of reports to return (default 10)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const reportId = request.nextUrl.searchParams.get('reportId');
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '10'), 50);

    if (reportId) {
      const report = await prisma.adReviewReport.findUnique({ where: { id: reportId } });
      if (!report) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }
      return NextResponse.json({ report });
    }

    const reports = await prisma.adReviewReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        createdAt: true,
        completedAt: true,
        platformsReviewed: true,
        campaignsReviewed: true,
        totalSpendReviewed: true,
        overallHealthScore: true,
        criticalCount: true,
        warningCount: true,
        infoCount: true,
        topPriorities: true,
        executiveSummary: true,
      },
    });

    // Return latest full report alongside the summary list
    const latestFullReport =
      reports.length > 0
        ? await prisma.adReviewReport.findUnique({
            where: { id: reports[0]!.id },
          })
        : null;

    return NextResponse.json({ reports, latestFullReport });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Ads Review API] GET error:', message);
    return NextResponse.json(
      { error: 'Failed to fetch review reports', detail: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ads-review
 * Triggers a new ads review or performs actions on an existing report.
 *
 * Body:
 *   action: 'trigger'          — Queue a new ADS_REVIEW_AGENT job
 *     autoAction?: boolean     — If true, agent may pause wasteful campaigns
 *
 *   action: 'acknowledge'      — Mark a report as read (no-op, just for tracking)
 *     reportId: string
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      action: 'trigger' | 'acknowledge';
      autoAction?: boolean;
      reportId?: string;
    };

    if (body.action === 'trigger') {
      // Check if a review is already running
      const running = await prisma.adReviewReport.findFirst({
        where: { status: 'RUNNING' },
        orderBy: { createdAt: 'desc' },
      });

      if (running) {
        return NextResponse.json(
          {
            error: 'A review is already in progress',
            reportId: running.id,
            startedAt: running.createdAt,
          },
          { status: 409 }
        );
      }

      const { addJob } = await import('@experience-marketplace/jobs');
      await addJob('ADS_REVIEW_AGENT' as Parameters<typeof addJob>[0], {
        autoAction: body.autoAction ?? false,
      });

      return NextResponse.json({
        queued: true,
        message: 'Ads review agent queued — check back in a few minutes',
        autoAction: body.autoAction ?? false,
      });
    }

    if (body.action === 'acknowledge') {
      if (!body.reportId) {
        return NextResponse.json({ error: 'reportId required' }, { status: 400 });
      }

      await prisma.adReviewReport.update({
        where: { id: body.reportId },
        data: { status: 'COMPLETED' }, // Already completed — just surfacing for UI
      });

      return NextResponse.json({ acknowledged: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Ads Review API] POST error:', message);
    return NextResponse.json(
      { error: 'Failed to process request', detail: message },
      { status: 500 }
    );
  }
}
