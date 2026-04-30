import { Resend } from 'resend';

interface ContactNotificationInput {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  domain: string;
  createdAt: Date;
}

let cachedClient: Resend | null = null;
function getClient(): Resend | null {
  if (cachedClient) return cachedClient;
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) return null;
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailContent(input: ContactNotificationInput): {
  subject: string;
  html: string;
  text: string;
} {
  const adminBaseUrl = process.env['ADMIN_BASE_URL'] || 'https://admin.experiencess.com';
  const adminLink = `${adminBaseUrl}/contact-messages`;

  const subject = `[Contact] ${input.subject} — ${input.name}`;

  const phoneLine = input.phone ? `Phone: ${input.phone}\n` : '';
  const text = [
    `New contact form submission from ${input.domain}`,
    '',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `${phoneLine}Subject: ${input.subject}`,
    `Submitted: ${input.createdAt.toUTCString()}`,
    '',
    'Message:',
    input.message,
    '',
    `View in admin: ${adminLink}`,
  ].join('\n');

  const phoneRow = input.phone
    ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Phone</td><td style="padding:4px 0;"><a href="tel:${escapeHtml(input.phone)}">${escapeHtml(input.phone)}</a></td></tr>`
    : '';

  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; max-width:640px; margin:0 auto; padding:24px;">
  <h2 style="margin:0 0 4px;">New contact form submission</h2>
  <p style="margin:0 0 20px; color:#64748b; font-size:14px;">Submitted via <strong>${escapeHtml(input.domain)}</strong></p>

  <table style="font-size:14px; border-collapse:collapse; margin-bottom:20px;">
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Name</td><td style="padding:4px 0;"><strong>${escapeHtml(input.name)}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Email</td><td style="padding:4px 0;"><a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></td></tr>
    ${phoneRow}
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Subject</td><td style="padding:4px 0;">${escapeHtml(input.subject)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Submitted</td><td style="padding:4px 0;">${escapeHtml(input.createdAt.toUTCString())}</td></tr>
  </table>

  <div style="border-left:3px solid #0ea5e9; padding:8px 16px; background:#f8fafc; margin-bottom:20px;">
    <p style="margin:0 0 4px; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Message</p>
    <div style="white-space:pre-wrap; font-size:14px;">${escapeHtml(input.message)}</div>
  </div>

  <p style="font-size:13px; color:#64748b;">
    Reply to this email to respond directly to the sender, or
    <a href="${escapeHtml(adminLink)}" style="color:#0284c7;">view in admin</a>.
  </p>
</body>
</html>`;

  return { subject, html, text };
}

/**
 * Send a notification email when a contact form is submitted.
 * Fail-soft: returns false on any error and logs — never throws.
 * The DB record is the source of truth; the admin page is the backstop.
 */
export async function sendContactNotification(input: ContactNotificationInput): Promise<boolean> {
  const to = process.env['CONTACT_NOTIFICATION_EMAIL'];
  const from = process.env['RESEND_FROM_EMAIL'];
  const client = getClient();

  if (!client || !to || !from) {
    console.info(
      '[contact-email] Skipping send — RESEND_API_KEY, RESEND_FROM_EMAIL, or CONTACT_NOTIFICATION_EMAIL not configured'
    );
    return false;
  }

  const { subject, html, text } = buildEmailContent(input);

  try {
    const result = await client.emails.send({
      from,
      to,
      replyTo: input.email,
      subject,
      html,
      text,
    });
    if (result.error) {
      console.error('[contact-email] Resend returned error:', result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[contact-email] Send failed:', err);
    return false;
  }
}
