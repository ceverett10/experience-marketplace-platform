import { NextResponse } from 'next/server';
import { processAllSiteRoadmaps } from '@experience-marketplace/jobs';
import { prisma } from '@experience-marketplace/database';
import { getSession, requireSuperAdmin } from '@/lib/require-role';
import { logAudit, getClientIp } from '@/lib/audit';

/**
 * GET /api/settings/roadmap-processor
 * Returns the status of the autonomous roadmap processor
 */
export async function GET() {
  // Any authenticated admin can view status
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get count of sites and their processing status
    const [totalSites, pausedSites, activeSites] = await Promise.all([
      prisma.site.count(),
      prisma.site.count({ where: { autonomousProcessesPaused: true } }),
      prisma.site.count({ where: { autonomousProcessesPaused: false } }),
    ]);

    // Get recent job activity (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentJobs = await prisma.job.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: oneHourAgo },
      },
      _count: true,
    });

    const jobStats = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };

    for (const job of recentJobs) {
      const status = job.status.toLowerCase() as keyof typeof jobStats;
      if (status in jobStats) {
        jobStats[status] = job._count;
      }
    }

    // Get platform settings for pause state
    const platformSettings = await prisma.platformSettings.findUnique({
      where: { id: 'platform_settings_singleton' },
      select: {
        allAutonomousProcessesPaused: true,
        pausedAt: true,
        pauseReason: true,
      },
    });

    return NextResponse.json({
      success: true,
      processor: {
        intervalMinutes: 5,
        isGloballyPaused: platformSettings?.allAutonomousProcessesPaused || false,
        pausedAt: platformSettings?.pausedAt,
        pauseReason: platformSettings?.pauseReason,
      },
      sites: {
        total: totalSites,
        active: activeSites,
        paused: pausedSites,
      },
      recentActivity: {
        periodMinutes: 60,
        ...jobStats,
        total: Object.values(jobStats).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    console.error('Failed to fetch roadmap processor status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch processor status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/roadmap-processor
 * Manually triggers the roadmap processor — SUPER_ADMIN only
 */
export async function POST(request: Request) {
  const result = await requireSuperAdmin();
  if ('error' in result) return result.error;

  try {
    // Check if globally paused
    const platformSettings = await prisma.platformSettings.findUnique({
      where: { id: 'platform_settings_singleton' },
      select: { allAutonomousProcessesPaused: true },
    });

    if (platformSettings?.allAutonomousProcessesPaused) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot run processor while all autonomous processes are paused',
        },
        { status: 400 }
      );
    }

    // Run the processor
    const processorResult = await processAllSiteRoadmaps();

    await logAudit({
      userId: result.session.userId,
      userEmail: result.session.email,
      action: 'TRIGGER_ROADMAP_PROCESSOR',
      details: {
        sitesProcessed: processorResult.sitesProcessed,
        tasksQueued: processorResult.tasksQueued,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      success: true,
      message: `Processed ${processorResult.sitesProcessed} sites, queued ${processorResult.tasksQueued} tasks`,
      result: {
        sitesProcessed: processorResult.sitesProcessed,
        tasksQueued: processorResult.tasksQueued,
        errors: processorResult.errors,
      },
    });
  } catch (error) {
    console.error('Failed to run roadmap processor:', error);
    return NextResponse.json({ success: false, error: 'Failed to run processor' }, { status: 500 });
  }
}
