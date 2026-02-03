/**
 * Error Tracking Service
 * Logs errors to ErrorLog table, tracks patterns, and provides query methods
 */

import { prisma } from '@experience-marketplace/database';

export interface ErrorLogEntry {
  jobId: string;
  jobType: string;
  siteId?: string;
  errorName: string;
  errorMessage: string;
  errorCategory: string;
  errorSeverity: string;
  retryable: boolean;
  attemptsMade: number;
  context?: Record<string, any>;
  stackTrace?: string;
  timestamp: Date;
}

export interface ErrorLogFilters {
  jobType?: string;
  siteId?: string;
  category?: string;
  severity?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

/**
 * Categorize an error based on its message and name
 */
function categorizeError(errorName: string, errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  const name = errorName.toLowerCase();

  if (name.includes('externalapi') || msg.includes('api') || msg.includes('external'))
    return 'EXTERNAL_API';
  if (msg.includes('database') || msg.includes('prisma') || name.includes('prisma'))
    return 'DATABASE';
  if (msg.includes('config') || msg.includes('api key') || msg.includes('missing'))
    return 'CONFIGURATION';
  if (msg.includes('not found') || name.includes('notfound'))
    return 'NOT_FOUND';
  if (msg.includes('rate limit') || msg.includes('ratelimit') || msg.includes('429'))
    return 'RATE_LIMIT';
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused'))
    return 'NETWORK';
  return 'UNKNOWN';
}

/**
 * Determine severity based on error characteristics
 */
function determineSeverity(
  errorName: string,
  errorMessage: string,
  retryable: boolean
): string {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('critical') || msg.includes('api key') || msg.includes('config'))
    return 'CRITICAL';
  if (!retryable) return 'HIGH';
  if (msg.includes('rate limit') || msg.includes('timeout')) return 'MEDIUM';
  return 'LOW';
}

/**
 * Error tracking service
 */
export class ErrorTrackingService {
  /**
   * Log error to ErrorLog table and update Job record
   */
  async logError(entry: ErrorLogEntry): Promise<void> {
    try {
      const category =
        entry.errorCategory !== 'UNKNOWN'
          ? entry.errorCategory
          : categorizeError(entry.errorName, entry.errorMessage);

      const severity =
        entry.errorSeverity !== 'MEDIUM'
          ? entry.errorSeverity
          : determineSeverity(entry.errorName, entry.errorMessage, entry.retryable);

      // Write structured error to ErrorLog table
      await prisma.errorLog.create({
        data: {
          jobId: entry.jobId,
          jobType: entry.jobType,
          siteId: entry.siteId || null,
          errorName: entry.errorName,
          errorMessage: entry.errorMessage,
          errorCategory: category,
          errorSeverity: severity,
          stackTrace: entry.stackTrace || null,
          context: entry.context || undefined,
          attemptNumber: entry.attemptsMade,
          retryable: entry.retryable,
        },
      });

      // Also update Job record for backward compatibility
      await prisma.job.upsert({
        where: { id: entry.jobId },
        create: {
          id: entry.jobId,
          type: entry.jobType as any,
          status: 'FAILED',
          priority: 0,
          attempts: entry.attemptsMade,
          error: entry.errorMessage,
          payload: entry.context || {},
        },
        update: {
          status: 'FAILED',
          attempts: entry.attemptsMade,
          error: entry.errorMessage,
        },
      });

      console.error('[Error Tracking]', {
        jobId: entry.jobId,
        jobType: entry.jobType,
        error: entry.errorName,
        message: entry.errorMessage,
        category,
        severity,
        attempts: entry.attemptsMade,
      });
    } catch (error) {
      // Fallback to console if database logging fails
      console.error('[Error Tracking] Failed to log error to database:', error);
      console.error('[Error Tracking] Original error:', entry);
    }
  }

  /**
   * Check for error patterns and send alerts using aggregation
   */
  async checkErrorPatterns(): Promise<void> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const timeFilter = { createdAt: { gte: oneHourAgo } };

      // Use groupBy instead of loading all errors into memory
      const [errorsByType, criticalCount] = await Promise.all([
        prisma.errorLog.groupBy({
          by: ['jobType'],
          where: timeFilter,
          _count: { _all: true },
        }),
        prisma.errorLog.count({
          where: { ...timeFilter, errorSeverity: 'CRITICAL' },
        }),
      ]);

      // Alert if high failure rate for any job type
      for (const entry of errorsByType) {
        if (entry._count._all >= 10) {
          await this.sendAlert({
            level: 'warning',
            title: `High failure rate for ${entry.jobType}`,
            message: `${entry._count._all} ${entry.jobType} errors in the last hour`,
            context: { type: entry.jobType, count: entry._count._all, timeWindow: '1 hour' },
          });
        }
      }

      // Only fetch critical error details if there are any
      if (criticalCount > 0) {
        const criticalErrors = await prisma.errorLog.findMany({
          where: { ...timeFilter, errorSeverity: 'CRITICAL' },
          select: { id: true, jobType: true, errorMessage: true },
          take: 20,
        });

        await this.sendAlert({
          level: 'critical',
          title: 'Critical errors detected',
          message: `${criticalCount} critical errors in the last hour`,
          context: {
            errors: criticalErrors.map((e) => ({
              id: e.id,
              jobType: e.jobType,
              error: e.errorMessage,
            })),
          },
        });
      }
    } catch (error) {
      console.error('[Error Tracking] Error checking patterns:', error);
    }
  }

  /**
   * Get error statistics from ErrorLog table using database aggregation
   */
  async getErrorStats(timeWindow: number = 24 * 60 * 60 * 1000): Promise<{
    total: number;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
    criticalCount: number;
    retryableCount: number;
  }> {
    try {
      const since = new Date(Date.now() - timeWindow);
      const timeFilter = { createdAt: { gte: since } };

      // Use groupBy aggregations instead of loading all rows into memory
      const [categoryStats, typeStats, severityStats, retryableCount, total] =
        await Promise.all([
          prisma.errorLog.groupBy({
            by: ['errorCategory'],
            where: timeFilter,
            _count: { _all: true },
          }),
          prisma.errorLog.groupBy({
            by: ['jobType'],
            where: timeFilter,
            _count: { _all: true },
          }),
          prisma.errorLog.groupBy({
            by: ['errorSeverity'],
            where: timeFilter,
            _count: { _all: true },
          }),
          prisma.errorLog.count({
            where: { ...timeFilter, retryable: true },
          }),
          prisma.errorLog.count({ where: timeFilter }),
        ]);

      const byCategory: Record<string, number> = {};
      for (const s of categoryStats) {
        byCategory[s.errorCategory] = s._count._all;
      }

      const byType: Record<string, number> = {};
      for (const s of typeStats) {
        byType[s.jobType] = s._count._all;
      }

      const criticalCount =
        severityStats.find((s) => s.errorSeverity === 'CRITICAL')?._count._all || 0;

      return { total, byCategory, byType, criticalCount, retryableCount };
    } catch (error) {
      console.error('[Error Tracking] Error getting stats:', error);
      return {
        total: 0,
        byCategory: {},
        byType: {},
        criticalCount: 0,
        retryableCount: 0,
      };
    }
  }

  /**
   * Get paginated error log entries
   */
  async getErrorLogs(filters: ErrorLogFilters = {}): Promise<{
    entries: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 25;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (filters.jobType) where.jobType = filters.jobType;
      if (filters.siteId) where.siteId = filters.siteId;
      if (filters.category) where.errorCategory = filters.category;
      if (filters.severity) where.errorSeverity = filters.severity;
      if (filters.from || filters.to) {
        where.createdAt = {};
        if (filters.from) where.createdAt.gte = filters.from;
        if (filters.to) where.createdAt.lte = filters.to;
      }

      const [entries, total] = await Promise.all([
        prisma.errorLog.findMany({
          where,
          include: {
            site: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.errorLog.count({ where }),
      ]);

      return {
        entries: entries.map((e) => ({
          id: e.id,
          jobId: e.jobId,
          jobType: e.jobType,
          siteId: e.siteId,
          siteName: e.site?.name || null,
          errorName: e.errorName,
          errorMessage: e.errorMessage,
          errorCategory: e.errorCategory,
          errorSeverity: e.errorSeverity,
          attemptNumber: e.attemptNumber,
          retryable: e.retryable,
          createdAt: e.createdAt.toISOString(),
        })),
        total,
        page,
        limit,
      };
    } catch (error) {
      console.error('[Error Tracking] Error fetching error logs:', error);
      return { entries: [], total: 0, page: 1, limit: 25 };
    }
  }

  /**
   * Get a single error log entry with full details (stack trace, context)
   */
  async getErrorLog(id: string): Promise<any | null> {
    try {
      const entry = await prisma.errorLog.findUnique({
        where: { id },
        include: {
          site: { select: { name: true } },
          job: {
            select: {
              id: true,
              type: true,
              status: true,
              attempts: true,
              payload: true,
              result: true,
              createdAt: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
      });

      if (!entry) return null;

      return {
        id: entry.id,
        jobId: entry.jobId,
        jobType: entry.jobType,
        siteId: entry.siteId,
        siteName: entry.site?.name || null,
        errorName: entry.errorName,
        errorMessage: entry.errorMessage,
        errorCategory: entry.errorCategory,
        errorSeverity: entry.errorSeverity,
        stackTrace: entry.stackTrace,
        context: entry.context,
        attemptNumber: entry.attemptNumber,
        retryable: entry.retryable,
        createdAt: entry.createdAt.toISOString(),
        job: entry.job,
      };
    } catch (error) {
      console.error('[Error Tracking] Error fetching error log:', error);
      return null;
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlert(alert: {
    level: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    context?: Record<string, any>;
  }): Promise<void> {
    // TODO: Integrate with notification service (Slack, email, PagerDuty)
    console.warn('[ALERT]', {
      level: alert.level,
      title: alert.title,
      message: alert.message,
      context: alert.context,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Clean up old error logs
   */
  async cleanupOldErrors(retentionDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // Delete old error log entries
      const errorLogResult = await prisma.errorLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      });

      // Also clean up old failed jobs
      const jobResult = await prisma.job.deleteMany({
        where: {
          status: 'FAILED',
          updatedAt: { lt: cutoffDate },
        },
      });

      const totalDeleted = errorLogResult.count + jobResult.count;
      console.log(
        `[Error Tracking] Cleaned up ${errorLogResult.count} error logs and ${jobResult.count} failed jobs`
      );

      return totalDeleted;
    } catch (error) {
      console.error('[Error Tracking] Error cleaning up old errors:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const errorTracking = new ErrorTrackingService();
