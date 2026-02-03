export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { errorTracking, circuitBreakers } from '@experience-marketplace/jobs';

/**
 * GET /api/operations/errors
 * Returns paginated error log entries with filtering + circuit breaker status
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Single error detail
    const errorId = searchParams.get('id');
    if (errorId) {
      const entry = await errorTracking.getErrorLog(errorId);
      if (!entry) {
        return NextResponse.json({ error: 'Error log not found' }, { status: 404 });
      }
      return NextResponse.json(entry);
    }

    // Filters
    const jobType = searchParams.get('jobType') || undefined;
    const siteId = searchParams.get('siteId') || undefined;
    const category = searchParams.get('category') || undefined;
    const severity = searchParams.get('severity') || undefined;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);

    // Time window for summary stats
    const timeWindow = parseInt(searchParams.get('timeWindow') || '86400000');

    // Fetch error logs + stats + circuit breakers in parallel
    const [errorLogs, errorStats, circuitBreakerStatus] = await Promise.all([
      errorTracking.getErrorLogs({
        jobType,
        siteId,
        category,
        severity,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        page,
        limit,
      }),
      errorTracking.getErrorStats(timeWindow),
      circuitBreakers.getAllStatus(),
    ]);

    // Compute error rate
    const errorRate =
      timeWindow > 0 ? parseFloat((errorStats.total / (timeWindow / 3600000)).toFixed(2)) : 0;

    // Determine overall health
    let health: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const openCircuits = Object.values(circuitBreakerStatus).filter(
      (s) => s.state === 'OPEN'
    ).length;

    if (errorStats.criticalCount > 0) health = 'critical';
    else if (errorStats.total > 50 || openCircuits > 0) health = 'degraded';

    return NextResponse.json({
      health,
      summary: {
        totalErrors: errorStats.total,
        criticalCount: errorStats.criticalCount,
        retryableCount: errorStats.retryableCount,
        errorRate,
        byCategory: errorStats.byCategory,
        byType: errorStats.byType,
        timeWindowHours: timeWindow / 3600000,
      },
      errors: errorLogs.entries,
      pagination: {
        page: errorLogs.page,
        limit: errorLogs.limit,
        total: errorLogs.total,
        totalPages: Math.ceil(errorLogs.total / errorLogs.limit),
      },
      circuitBreakers: circuitBreakerStatus,
    });
  } catch (error) {
    console.error('[API] Error fetching error logs:', error);
    return NextResponse.json({ error: 'Failed to fetch error logs' }, { status: 500 });
  }
}

/**
 * POST /api/operations/errors
 * Actions: reset circuit breaker, cleanup old errors
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action, service, retentionDays } = body;

    if (action === 'reset-circuit-breaker' && service) {
      const breaker = circuitBreakers.getBreaker(service);
      await breaker.reset();
      return NextResponse.json({
        success: true,
        message: `Circuit breaker for ${service} has been reset`,
      });
    }

    if (action === 'reset-all-circuit-breakers') {
      await circuitBreakers.resetAll();
      return NextResponse.json({
        success: true,
        message: 'All circuit breakers have been reset',
      });
    }

    if (action === 'cleanup-old-errors') {
      const deletedCount = await errorTracking.cleanupOldErrors(retentionDays || 30);
      return NextResponse.json({
        success: true,
        message: `Cleaned up ${deletedCount} old error records`,
        deletedCount,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API] Error performing error action:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
