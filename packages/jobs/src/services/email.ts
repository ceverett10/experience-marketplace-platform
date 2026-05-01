/**
 * Resend wrapper for transactional emails sent from background jobs.
 *
 * Mirrors the helper in apps/website-platform/src/lib/email.ts (which sends
 * the contact-form notification). Both share `RESEND_API_KEY` and
 * `RESEND_FROM_EMAIL`. We don't share a single module across packages yet
 * because the website helper is small and the duplication is worth the
 * dependency simplicity.
 */

import { Resend } from 'resend';

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  if (cachedClient) return cachedClient;
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) return null;
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional override; defaults to RESEND_FROM_EMAIL. */
  from?: string;
  /** Optional Reply-To. */
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email via Resend. Never throws.
 *
 * Returns `{ ok: false }` and logs to stderr on:
 * - missing env vars (RESEND_API_KEY or RESEND_FROM_EMAIL)
 * - Resend returning an error
 * - network/transport failure
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getClient();
  const from = input.from ?? process.env['RESEND_FROM_EMAIL'];

  if (!client || !from) {
    console.info('[email] Skipping send — RESEND_API_KEY or RESEND_FROM_EMAIL not configured');
    return { ok: false, error: 'not-configured' };
  }

  try {
    const result = await client.emails.send({
      from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (result.error) {
      console.error('[email] Resend returned error:', result.error);
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id };
  } catch (err) {
    console.error('[email] Send failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
