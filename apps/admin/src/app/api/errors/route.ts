import { NextResponse } from 'next/server';
import { errorTracking, circuitBreakers } from '@experience-marketplace/jobs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeWindow = parseInt(searchParams.get('timeWindow') || '86400000'); // Default 24h

    // Get error statistics
    const errorStats = await errorTracking.getErrorStats(timeWindow);

    // Get circuit breaker status
    const circuitBreakerStatus = circuitBreakers.getAllStatus();

    // Calculate health metrics
    const totalErrors = errorStats.total;
    const errorRate = timeWindow > 0 ? (totalErrors / (timeWindow / 3600000)).toFixed(2) : 0; // errors per hour

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (errorStats.criticalCount > 0) {
      overallHealth = 'critical';
    } else if (totalErrors > 50) {
      overallHealth = 'degraded';
    }

    // Count open circuit breakers
    const openCircuits = Object.values(circuitBreakerStatus).filter(
      (status) => status.state === 'OPEN'
    ).length;

    if (openCircuits > 0) {
      overallHealth = 'degraded';
    }

    return NextResponse.json({
      health: overallHealth,
      metrics: {
        totalErrors,
        errorRate: parseFloat(errorRate as string),
        criticalErrors: errorStats.criticalCount,
        retryableErrors: errorStats.retryableCount,
        openCircuits,
        timeWindowHours: timeWindow / 3600000,
      },
      errorsByCategory: errorStats.byCategory,
      errorsByType: errorStats.byType,
      circuitBreakers: circuitBreakerStatus,
    });
  } catch (error) {
    console.error('[API] Error fetching error stats:', error);
    return NextResponse.json({ error: 'Failed to fetch error stats' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, service } = body;

    if (action === 'reset-circuit-breaker' && service) {
      const breaker = circuitBreakers.getBreaker(service);
      breaker.reset();

      return NextResponse.json({
        success: true,
        message: `Circuit breaker for ${service} has been reset`,
      });
    }

    if (action === 'reset-all-circuit-breakers') {
      circuitBreakers.resetAll();

      return NextResponse.json({
        success: true,
        message: 'All circuit breakers have been reset',
      });
    }

    if (action === 'cleanup-old-errors') {
      const retentionDays = body.retentionDays || 30;
      const deletedCount = await errorTracking.cleanupOldErrors(retentionDays);

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
