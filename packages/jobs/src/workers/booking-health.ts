/**
 * Booking Health Workers
 *
 * Two scheduled jobs that detect booking-funnel outages early. Both were
 * added after the 2026-04-15 P0 incident, where a Holibob API contract
 * mismatch broke 100% of bookings on production for ~2 weeks before anyone
 * noticed (PR #391 → fixed in PR #401).
 *
 * 1. handleBookingErrorAlert — passive monitor.
 *    Polls BookingFunnelEvent every 5 min for rows with `errorCode IS NOT NULL`
 *    in the last 10 min. If the count crosses a threshold, pages via
 *    `sendAlert`. De-duped per errorCode in Redis (1h TTL) so a sustained
 *    outage doesn't fire every 5 minutes.
 *
 * 2. handleBookingHealthCanary — active probe.
 *    Calls `client.discoverProducts()` and `client.createBooking()` against
 *    the live Holibob endpoint. Verifies both queries succeed and the
 *    create-booking input shape is still accepted. The basket is abandoned
 *    (no availability added, no commit) so no payment is taken — Holibob
 *    sees the same shape as a real user who closes the tab.
 *
 * Together they cover both real-user-failure detection (item 1) and
 * preemptive contract-break detection (item 2).
 */

import { type Job } from 'bullmq';
import type IORedis from 'ioredis';
import { prisma } from '@experience-marketplace/database';
import { createHolibobClient } from '@experience-marketplace/holibob-api';
import type { JobResult } from '../types/index.js';
import { sendAlert } from '../errors/alerts.js';
import { createRedisConnection } from '../queues/index.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Window of recent funnel events scanned on each poll. */
const ERROR_LOOKBACK_MINUTES = 10;

/** Below this count we don't alert — keeps single transient errors quiet. */
const ERROR_ALERT_THRESHOLD = 3;

/** How long an alert for a given errorCode is suppressed after firing. */
const ALERT_DEDUP_TTL_SECONDS = 60 * 60; // 1 hour

const ALERT_DEDUP_KEY_PREFIX = 'booking-health:alert-dedup:';

/** Redis key recording the last successful canary run (for ops visibility). */
const CANARY_LAST_SUCCESS_KEY = 'booking-health:canary:last-success';

// ---------------------------------------------------------------------------
// 1. Funnel-event error alert
// ---------------------------------------------------------------------------

interface ErrorBreakdownRow {
  errorCode: string;
  count: number;
  sampleMessage: string | null;
}

/**
 * Aggregates BookingFunnelEvent rows in the last `lookbackMinutes` by
 * errorCode and returns one entry per distinct code, sorted by count desc.
 */
async function fetchRecentErrorBreakdown(lookbackMinutes: number): Promise<ErrorBreakdownRow[]> {
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000);

  const rows = await prisma.bookingFunnelEvent.findMany({
    where: {
      createdAt: { gte: since },
      errorCode: { not: null },
    },
    select: {
      errorCode: true,
      errorMessage: true,
    },
  });

  const grouped = new Map<string, { count: number; sampleMessage: string | null }>();
  for (const row of rows) {
    if (!row.errorCode) continue;
    const existing = grouped.get(row.errorCode);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(row.errorCode, { count: 1, sampleMessage: row.errorMessage ?? null });
    }
  }

  return Array.from(grouped.entries())
    .map(([errorCode, { count, sampleMessage }]) => ({ errorCode, count, sampleMessage }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Checks Redis for an existing dedup key for the given errorCode. If absent,
 * sets it with a TTL and returns true (alert allowed). If present, returns
 * false (suppress).
 *
 * Uses SET NX EX so the check-and-set is atomic across multiple workers.
 */
async function shouldFireAlert(redis: IORedis, errorCode: string): Promise<boolean> {
  const key = `${ALERT_DEDUP_KEY_PREFIX}${errorCode}`;
  const result = await redis.set(key, '1', 'EX', ALERT_DEDUP_TTL_SECONDS, 'NX');
  return result === 'OK';
}

export async function handleBookingErrorAlert(_job: Job): Promise<JobResult> {
  const redis = createRedisConnection();
  try {
    const breakdown = await fetchRecentErrorBreakdown(ERROR_LOOKBACK_MINUTES);
    const totalErrors = breakdown.reduce((sum, row) => sum + row.count, 0);

    if (totalErrors === 0) {
      return {
        success: true,
        message: 'No booking funnel errors in the last window',
        data: { totalErrors: 0, lookbackMinutes: ERROR_LOOKBACK_MINUTES },
        timestamp: new Date(),
      };
    }

    // Filter to error codes that crossed the threshold AND haven't already
    // alerted in the current TTL window.
    const alertable: ErrorBreakdownRow[] = [];
    for (const row of breakdown) {
      if (row.count < ERROR_ALERT_THRESHOLD) continue;
      if (await shouldFireAlert(redis, row.errorCode)) {
        alertable.push(row);
      }
    }

    if (alertable.length > 0) {
      const summary = alertable.map((r) => `${r.errorCode}: ${r.count}`).join(', ');

      await sendAlert({
        level: 'critical',
        title: 'Booking funnel errors detected',
        message:
          `${totalErrors} booking funnel error(s) in the last ${ERROR_LOOKBACK_MINUTES} minutes. ` +
          `Codes crossing alert threshold (${ERROR_ALERT_THRESHOLD}+): ${summary}.`,
        context: {
          totalErrors,
          lookbackMinutes: ERROR_LOOKBACK_MINUTES,
          breakdown: alertable.map((r) => ({
            errorCode: r.errorCode,
            count: r.count,
            sampleMessage: r.sampleMessage,
          })),
        },
      });
    }

    return {
      success: true,
      message: `Scanned ${totalErrors} funnel errors, fired ${alertable.length} alert(s)`,
      data: {
        totalErrors,
        distinctCodes: breakdown.length,
        alertsFired: alertable.length,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Booking Error Alert] Fatal error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during error-alert scan',
      timestamp: new Date(),
    };
  } finally {
    await redis.quit().catch(() => {
      /* ignore */
    });
  }
}

// ---------------------------------------------------------------------------
// 2. Synthetic booking canary
// ---------------------------------------------------------------------------

function buildHolibobClient() {
  const apiUrl = process.env['HOLIBOB_API_URL'];
  const partnerId = process.env['HOLIBOB_PARTNER_ID'];
  const apiKey = process.env['HOLIBOB_API_KEY'];
  const apiSecret = process.env['HOLIBOB_API_SECRET'];

  if (!apiUrl || !partnerId || !apiKey) {
    throw new Error(
      'Missing Holibob configuration: HOLIBOB_API_URL, HOLIBOB_PARTNER_ID, HOLIBOB_API_KEY'
    );
  }

  return createHolibobClient({ apiUrl, partnerId, apiKey, apiSecret });
}

export async function handleBookingHealthCanary(_job: Job): Promise<JobResult> {
  // Decide whether to actually probe Holibob. We don't want CI / local dev
  // runs creating real abandoned baskets, but on Heroku we always want the
  // canary running.
  //
  // Heroku doesn't set NODE_ENV by default, but it always sets DYNO (e.g.
  // "worker-heavy.1"). Use DYNO as the production marker. BOOKING_CANARY_ENABLED
  // can override in either direction:
  //   - "true"  → run the probe regardless
  //   - "false" → skip even on Heroku (handy if Holibob is having an outage
  //     and we want to silence the canary temporarily)
  const explicit = process.env['BOOKING_CANARY_ENABLED'];
  const onHeroku = !!process.env['DYNO'];
  const enabled =
    explicit === 'true' ||
    (explicit !== 'false' && (onHeroku || process.env['NODE_ENV'] === 'production'));
  if (!enabled) {
    return {
      success: true,
      message: 'Canary skipped — not on Heroku/production and BOOKING_CANARY_ENABLED is not "true"',
      timestamp: new Date(),
    };
  }

  const failures: { step: string; error: string }[] = [];
  let bookingId: string | undefined;
  let productCount = 0;

  try {
    const client = buildHolibobClient();

    // Step 1: discoverProducts. The Holibob discovery API requires either
    // freeText or placeIds — use a generic widely-supported destination.
    try {
      const response = await client.discoverProducts({ freeText: 'london', currency: 'GBP' });
      productCount = response?.products?.length ?? 0;
      if (productCount === 0) {
        failures.push({
          step: 'discoverProducts',
          error: 'discoverProducts returned 0 products for freeText="london"',
        });
      }
    } catch (err) {
      failures.push({
        step: 'discoverProducts',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step 2: createBooking. This is the contract that PR #391 broke. We
    // pass the same default input shape used by the website API route so a
    // mismatch shows up here before it reaches users. The booking is
    // abandoned (no availability added, no commit) so nothing is charged.
    try {
      const booking = await client.createBooking({ autoFillQuestions: true });
      bookingId = booking.id;
    } catch (err) {
      failures.push({
        step: 'createBooking',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (failures.length > 0) {
      await sendAlert({
        level: 'critical',
        title: 'Booking health canary FAILED',
        message:
          `Synthetic booking probe against Holibob failed at ${failures.length} step(s). ` +
          `This usually means an API contract change — start by checking ` +
          `recent diffs to packages/holibob-api/ and the Holibob changelog.`,
        context: {
          failures,
          productCount,
          bookingId: bookingId ?? null,
        },
      });

      return {
        success: false,
        error: `Canary failed: ${failures.map((f) => f.step).join(', ')}`,
        data: { failures, productCount },
        timestamp: new Date(),
      };
    }

    // Record success for ops visibility.
    const redis = createRedisConnection();
    try {
      await redis.set(CANARY_LAST_SUCCESS_KEY, new Date().toISOString());
    } finally {
      await redis.quit().catch(() => {
        /* ignore */
      });
    }

    return {
      success: true,
      message: `Canary OK: discovered ${productCount} products, created basket ${bookingId}`,
      data: { productCount, bookingId },
      timestamp: new Date(),
    };
  } catch (error) {
    // Treat config-level failures (missing env vars) as critical too — a
    // misconfigured canary is a silent canary, which defeats the point.
    const message = error instanceof Error ? error.message : String(error);
    await sendAlert({
      level: 'critical',
      title: 'Booking health canary errored before probe',
      message: `Canary could not run: ${message}. Check Holibob env vars on worker-infra.`,
    });
    return {
      success: false,
      error: message,
      timestamp: new Date(),
    };
  }
}
