/**
 * Alert dispatch service
 *
 * Centralised place to send out-of-band alerts (booking outages, infra
 * incidents) without requiring a hard dependency on any particular vendor.
 *
 * Behaviour:
 * - Always logs a structured `[ALERT]` line to stderr (Heroku log drains can
 *   still pick this up, and existing log search continues to work).
 * - If `ALERT_WEBHOOK_URL` is set, POSTs a Slack-compatible payload to it.
 *   Works with native Slack incoming webhooks as well as any tool that
 *   accepts the `{ text, attachments }` shape (Microsoft Teams via gateway,
 *   custom relays, etc.).
 * - Failures to send to the webhook never throw — alerting must not take
 *   down a worker. They are logged at `console.error`.
 *
 * Integration is intentionally optional: in dev/test the webhook env var is
 * unset, alerts just log. Set the secret in Heroku to enable push delivery.
 */

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface AlertPayload {
  level: AlertLevel;
  /** Short human title shown as the alert headline. */
  title: string;
  /** Body text — one or two short paragraphs is ideal. */
  message: string;
  /** Free-form context (counts, error codes, sample IDs). Rendered as a key/value block. */
  context?: Record<string, unknown>;
}

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  info: ':information_source:',
  warning: ':warning:',
  critical: ':rotating_light:',
};

const LEVEL_COLOR: Record<AlertLevel, string> = {
  info: '#36a64f',
  warning: '#f2c744',
  critical: '#d72c0d',
};

function buildSlackPayload(alert: AlertPayload): Record<string, unknown> {
  const fields = Object.entries(alert.context ?? {}).map(([key, value]) => ({
    title: key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
    short: false,
  }));

  return {
    text: `${LEVEL_EMOJI[alert.level]} *${alert.title}*`,
    attachments: [
      {
        color: LEVEL_COLOR[alert.level],
        text: alert.message,
        fields,
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

/**
 * Send an alert. Never throws.
 *
 * The promise resolves once the structured log line has been written and
 * (if configured) the webhook POST completes. Webhook failures are swallowed.
 */
export async function sendAlert(alert: AlertPayload): Promise<void> {
  const structured = {
    level: alert.level,
    title: alert.title,
    message: alert.message,
    context: alert.context,
    timestamp: new Date().toISOString(),
  };
  console.error('[ALERT]', JSON.stringify(structured));

  const webhookUrl = process.env['ALERT_WEBHOOK_URL'];
  if (!webhookUrl) {
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSlackPayload(alert)),
    });
    if (!res.ok) {
      console.error('[ALERT] Webhook returned non-2xx', {
        status: res.status,
        statusText: res.statusText,
      });
    }
  } catch (err) {
    console.error('[ALERT] Failed to POST to webhook', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
