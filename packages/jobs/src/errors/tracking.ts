/**
 * Error Tracking Service
 * Logs errors, tracks patterns, and sends notifications
 */

import { prisma } from '@experience-marketplace/database';
import type { JobError } from './index';

export interface ErrorLogEntry {
  jobId: string;
  jobType: string;
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

/**
 * Error tracking service
 */
export class ErrorTrackingService {
  /**
   * Log error to database
   */
  async logError(entry: ErrorLogEntry): Promise<void> {
    try {
      // Store error in job record
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
        category: entry.errorCategory,
        severity: entry.errorSeverity,
        attempts: entry.attemptsMade,
      });
    } catch (error) {
      // Fallback to console if database logging fails
      console.error('[Error Tracking] Failed to log error to database:', error);
      console.error('[Error Tracking] Original error:', entry);
    }
  }

  /**
   * Check for error patterns and send alerts
   */
  async checkErrorPatterns(): Promise<void> {
    try {
      // Get recent failed jobs (last hour)
      const recentFailures = await prisma.job.findMany({
        where: {
          status: 'FAILED',
          updatedAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000),
          },
        },
      });

      // Group by job type instead of error category
      const errorsByType = recentFailures.reduce(
        (acc, job) => {
          acc[job.type] = (acc[job.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      // Alert if high failure rate for any job type
      for (const [type, count] of Object.entries(errorsByType)) {
        if (count >= 10) {
          await this.sendAlert({
            level: 'warning',
            title: `High failure rate for ${type}`,
            message: `${count} ${type} jobs failed in the last hour`,
            context: { type, count, timeWindow: '1 hour' },
          });
        }
      }

      // Check for jobs with error messages containing "config" or "critical"
      const criticalErrors = recentFailures.filter((job) => {
        const error = job.error?.toLowerCase() || '';
        return error.includes('config') || error.includes('critical') || error.includes('api key');
      });

      if (criticalErrors.length > 0) {
        await this.sendAlert({
          level: 'critical',
          title: 'Critical errors detected',
          message: `${criticalErrors.length} critical errors in the last hour`,
          context: {
            errors: criticalErrors.map((job) => ({
              id: job.id,
              type: job.type,
              error: job.error,
            })),
          },
        });
      }
    } catch (error) {
      console.error('[Error Tracking] Error checking patterns:', error);
    }
  }

  /**
   * Get error statistics
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

      const failures = await prisma.job.findMany({
        where: {
          status: 'FAILED',
          updatedAt: { gte: since },
        },
      });

      // Categorize errors by inspecting error messages
      const byCategory = failures.reduce(
        (acc, job) => {
          const error = job.error?.toLowerCase() || '';
          let category = 'UNKNOWN';

          if (error.includes('api') || error.includes('external')) category = 'EXTERNAL_API';
          else if (error.includes('database') || error.includes('prisma')) category = 'DATABASE';
          else if (error.includes('config') || error.includes('api key')) category = 'CONFIGURATION';
          else if (error.includes('not found')) category = 'NOT_FOUND';
          else if (error.includes('rate limit')) category = 'RATE_LIMIT';
          else if (error.includes('network') || error.includes('timeout')) category = 'NETWORK';

          acc[category] = (acc[category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const byType = failures.reduce(
        (acc, job) => {
          acc[job.type] = (acc[job.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const criticalCount = failures.filter((job) => {
        const error = job.error?.toLowerCase() || '';
        return error.includes('config') || error.includes('critical') || error.includes('api key');
      }).length;

      return {
        total: failures.length,
        byCategory,
        byType,
        criticalCount,
        retryableCount: failures.length - criticalCount,
      };
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

    // For critical alerts, could also write to a special notification table
    if (alert.level === 'critical') {
      // TODO: Write to notification table or external alerting service
    }
  }

  /**
   * Clean up old error logs
   */
  async cleanupOldErrors(retentionDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const result = await prisma.job.deleteMany({
        where: {
          status: 'FAILED',
          updatedAt: {
            lt: cutoffDate,
          },
        },
      });

      console.log(`[Error Tracking] Cleaned up ${result.count} old error records`);

      return result.count;
    } catch (error) {
      console.error('[Error Tracking] Error cleaning up old errors:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const errorTracking = new ErrorTrackingService();
