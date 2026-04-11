/**
 * Client-side error reporting utility.
 * Fire-and-forget — reports errors to /api/errors/report for DB persistence.
 */

const REPORT_URL = '/api/errors/report';
const MAX_DEDUP_ENTRIES = 20;

// In-memory dedup to avoid flooding the endpoint with the same error
const recentErrors = new Set<string>();

function dedupeKey(error: Error): string {
  return `${error.name}:${error.message}`;
}

export function reportError(error: Error, context?: Record<string, unknown>): void {
  try {
    const key = dedupeKey(error);
    if (recentErrors.has(key)) return;

    recentErrors.add(key);
    if (recentErrors.size > MAX_DEDUP_ENTRIES) {
      // Evict oldest entry
      const first = recentErrors.values().next().value;
      if (first) recentErrors.delete(first);
    }

    const payload = JSON.stringify({
      errorName: error.name,
      errorMessage: error.message.slice(0, 2000),
      stackTrace: error.stack?.slice(0, 5000),
      context: {
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        ...context,
      },
    });

    // Prefer sendBeacon (works during page unload, non-blocking)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(REPORT_URL, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(REPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Silently ignore — error reporting should never throw
      });
    }
  } catch {
    // Never throw from error reporting
  }
}
