/**
 * Holibob analytics pipeline — fires funnel events to the shared
 * BigQuery ingestion endpoint for cross-channel reporting.
 *
 * All helpers are safe to call server-side (they no-op outside the browser).
 * Events are fire-and-forget — they never block the UI.
 */

const ENDPOINT = 'https://holibob-analytics.vercel.app/api/track';
const CHANNEL = 'holibob_experiences_platform';
const SESSION_KEY = 'hb_session';

type HolibobEvent =
  | 'session_start'
  | 'page_view'
  | 'search'
  | 'product_card_view'
  | 'product_detail_view'
  | 'availability_check'
  | 'add_to_cart'
  | 'cart_view'
  | 'checkout_complete';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // sessionStorage unavailable (private browsing, quota) — generate ephemeral ID
    return crypto.randomUUID();
  }
}

/**
 * Returns true if this is a brand-new session (no existing session ID in storage).
 * Call BEFORE getSessionId() — once called, the session exists.
 */
export function isNewSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !sessionStorage.getItem(SESSION_KEY);
  } catch {
    return true;
  }
}

/**
 * Fire an analytics event to the Holibob pipeline.
 * Fire-and-forget — never blocks the UI or throws.
 */
export function trackHolibob(event: HolibobEvent, properties: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;

  const sessionId = getSessionId();
  if (!sessionId) return;

  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      sessionId,
      channel: CHANNEL,
      timestamp: new Date().toISOString(),
      properties,
    }),
    keepalive: true,
  }).catch(() => {
    // Fire-and-forget — never block the UI
  });
}
