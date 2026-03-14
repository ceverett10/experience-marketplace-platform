/**
 * In-memory rate limiter for login attempts.
 * Tracks failed login attempts per email address.
 * Resets on successful login or after the window expires.
 */

interface RateLimitEntry {
  count: number;
  firstAttemptAt: number;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const attempts = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes to prevent memory leaks
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (now - entry.firstAttemptAt > WINDOW_MS) {
        attempts.delete(key);
      }
    }
  },
  5 * 60 * 1000
).unref();

/**
 * Check if a login attempt should be rate-limited.
 * Returns the number of seconds until the rate limit resets, or 0 if allowed.
 */
export function checkRateLimit(email: string): number {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry) return 0;

  // Window expired — reset
  if (now - entry.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
    return 0;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const resetAt = entry.firstAttemptAt + WINDOW_MS;
    return Math.ceil((resetAt - now) / 1000);
  }

  return 0;
}

/** Record a failed login attempt. */
export function recordFailedAttempt(email: string): void {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

/** Clear rate limit on successful login. */
export function clearRateLimit(email: string): void {
  attempts.delete(email.toLowerCase().trim());
}
