/**
 * Daily Operations Digest worker.
 *
 * Scheduled at 7am UTC. Aggregates the last 24h and emails the summary.
 * Failure to send (Resend down, missing env vars) returns a failed JobResult
 * so it surfaces in the standard job-failure dashboard.
 */

import { type Job } from 'bullmq';
import type { JobResult } from '../types/index.js';
import { runDailyDigest } from '../services/daily-digest.js';

export async function handleDailyDigestEmail(_job: Job): Promise<JobResult> {
  try {
    const result = await runDailyDigest();
    if (!result.ok) {
      return {
        success: false,
        error: `Daily digest send failed: ${result.reason ?? 'unknown'}`,
        errorCategory: 'EXTERNAL_API',
        errorSeverity: 'MEDIUM',
        retryable: true,
        timestamp: new Date(),
        data: {
          windowStart: result.data.windowStart.toISOString(),
          windowEnd: result.data.windowEnd.toISOString(),
          errorTotal: result.data.errors.total,
          bookingTotal: result.data.bookings.total,
          contactMessageTotal: result.data.contactMessages.total,
        },
      };
    }
    return {
      success: true,
      message: `Daily digest sent (Resend id ${result.emailId ?? '?'})`,
      data: {
        emailId: result.emailId ?? null,
        windowStart: result.data.windowStart.toISOString(),
        windowEnd: result.data.windowEnd.toISOString(),
        errorTotal: result.data.errors.total,
        bookingTotal: result.data.bookings.total,
        contactMessageTotal: result.data.contactMessages.total,
      },
      timestamp: new Date(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Daily digest threw: ${message}`,
      errorCategory: 'UNKNOWN',
      errorSeverity: 'HIGH',
      retryable: true,
      timestamp: new Date(),
    };
  }
}
