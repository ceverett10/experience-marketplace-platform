/**
 * Daily Operations Digest
 *
 * Aggregates the last 24 hours of activity and emails a summary to ops at
 * 07:00 UTC. Sections in v1:
 *   - Errors (ErrorLog, grouped by jobType + errorCategory)
 *   - Booking funnel (Booking + BookingFunnelEvent)
 *   - Contact messages (ContactMessage)
 *
 * Future additions (separate PR): paid-traffic spend/ROAS, site activity.
 *
 * Sent via Resend to CONTACT_NOTIFICATION_EMAIL using the shared
 * RESEND_FROM_EMAIL. Failures never throw — the job result reflects them
 * so the scheduler can surface them in normal job-failure dashboards.
 */

import { prisma } from '@experience-marketplace/database';
import { sendEmail } from './email.js';

interface ErrorBreakdownRow {
  jobType: string;
  category: string;
  severity: string;
  count: number;
  sampleMessage: string;
  sampleSiteId: string | null;
}

interface BookingSummary {
  total: number;
  confirmed: number;
  cancelled: number;
  failed: number;
  pending: number;
  funnelErrors: number;
  funnelErrorCodes: Array<{ code: string; count: number }>;
}

interface ContactSummary {
  total: number;
  bySubject: Array<{ subject: string; count: number }>;
}

export interface DigestData {
  windowStart: Date;
  windowEnd: Date;
  errors: {
    total: number;
    byCategory: Array<{ category: string; count: number }>;
    bySeverity: Array<{ severity: string; count: number }>;
    topRows: ErrorBreakdownRow[];
  };
  bookings: BookingSummary;
  contactMessages: ContactSummary;
}

const TOP_N_ERROR_GROUPS = 10;

export async function gatherDigestData(now: Date = new Date()): Promise<DigestData> {
  const windowEnd = now;
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

  const [
    errorTotal,
    errorByCategory,
    errorBySeverity,
    rawTopErrors,
    bookingByStatus,
    funnelErrorRows,
    contactTotal,
    contactBySubject,
  ] = await Promise.all([
    prisma.errorLog.count({ where: { createdAt: { gte: windowStart, lte: windowEnd } } }),
    prisma.errorLog.groupBy({
      by: ['errorCategory'],
      where: { createdAt: { gte: windowStart, lte: windowEnd } },
      _count: { _all: true },
      orderBy: { _count: { errorCategory: 'desc' } },
    }),
    prisma.errorLog.groupBy({
      by: ['errorSeverity'],
      where: { createdAt: { gte: windowStart, lte: windowEnd } },
      _count: { _all: true },
    }),
    prisma.errorLog.groupBy({
      by: ['jobType', 'errorCategory', 'errorSeverity'],
      where: { createdAt: { gte: windowStart, lte: windowEnd } },
      _count: { _all: true },
      orderBy: { _count: { jobType: 'desc' } },
      take: TOP_N_ERROR_GROUPS,
    }),
    prisma.booking.groupBy({
      by: ['status'],
      where: { createdAt: { gte: windowStart, lte: windowEnd } },
      _count: { _all: true },
    }),
    prisma.bookingFunnelEvent.groupBy({
      by: ['errorCode'],
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        errorCode: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.contactMessage.count({ where: { createdAt: { gte: windowStart, lte: windowEnd } } }),
    prisma.contactMessage.groupBy({
      by: ['subject'],
      where: { createdAt: { gte: windowStart, lte: windowEnd } },
      _count: { _all: true },
      orderBy: { _count: { subject: 'desc' } },
    }),
  ]);

  // For each top error group, fetch one sample message so the email shows
  // a useful preview rather than just counts.
  const topRows: ErrorBreakdownRow[] = await Promise.all(
    rawTopErrors.map(async (row) => {
      const sample = await prisma.errorLog.findFirst({
        where: {
          jobType: row.jobType,
          errorCategory: row.errorCategory,
          errorSeverity: row.errorSeverity,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: { errorMessage: true, siteId: true },
        orderBy: { createdAt: 'desc' },
      });
      return {
        jobType: row.jobType,
        category: row.errorCategory,
        severity: row.errorSeverity,
        count: row._count._all,
        sampleMessage: sample?.errorMessage?.slice(0, 240) ?? '(no message)',
        sampleSiteId: sample?.siteId ?? null,
      };
    })
  );

  const bookingByStatusMap: Record<string, number> = {};
  for (const row of bookingByStatus) {
    bookingByStatusMap[row.status] = row._count._all;
  }

  const funnelErrors = funnelErrorRows.reduce((sum, r) => sum + r._count._all, 0);

  return {
    windowStart,
    windowEnd,
    errors: {
      total: errorTotal,
      byCategory: errorByCategory.map((r) => ({
        category: r.errorCategory,
        count: r._count._all,
      })),
      bySeverity: errorBySeverity.map((r) => ({
        severity: r.errorSeverity,
        count: r._count._all,
      })),
      topRows,
    },
    bookings: {
      total: bookingByStatus.reduce((sum, r) => sum + r._count._all, 0),
      confirmed: bookingByStatusMap['CONFIRMED'] ?? 0,
      cancelled: bookingByStatusMap['CANCELLED'] ?? 0,
      failed: bookingByStatusMap['FAILED'] ?? 0,
      pending: bookingByStatusMap['PENDING'] ?? 0,
      funnelErrors,
      funnelErrorCodes: funnelErrorRows
        .filter((r) => r.errorCode != null)
        .map((r) => ({ code: r.errorCode as string, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
    },
    contactMessages: {
      total: contactTotal,
      bySubject: contactBySubject.map((r) => ({
        subject: r.subject,
        count: r._count._all,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(d: Date): string {
  return d.toUTCString();
}

function renderErrors(d: DigestData): string {
  const { errors } = d;
  if (errors.total === 0) {
    return `<p style="margin:0;color:#16a34a;">✓ No errors logged in the last 24 hours.</p>`;
  }

  const categoryRows = errors.byCategory
    .map(
      (r) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#475569;">${escapeHtml(r.category)}</td><td style="padding:4px 0;text-align:right;font-variant-numeric:tabular-nums;">${r.count}</td></tr>`
    )
    .join('');

  const severityRows = errors.bySeverity
    .map(
      (r) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#475569;">${escapeHtml(r.severity)}</td><td style="padding:4px 0;text-align:right;font-variant-numeric:tabular-nums;">${r.count}</td></tr>`
    )
    .join('');

  const topRows = errors.topRows
    .map(
      (r) =>
        `<tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:8px 12px 8px 0;vertical-align:top;">
            <div style="font-weight:600;">${escapeHtml(r.jobType)}</div>
            <div style="font-size:12px;color:#64748b;">${escapeHtml(r.category)} · ${escapeHtml(r.severity)}</div>
            <div style="font-size:13px;color:#334155;margin-top:4px;">${escapeHtml(r.sampleMessage)}</div>
          </td>
          <td style="padding:8px 0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${r.count}</td>
        </tr>`
    )
    .join('');

  return `
    <p style="margin:0 0 12px;"><strong>${errors.total}</strong> error${errors.total === 1 ? '' : 's'} logged.</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="vertical-align:top;width:50%;padding-right:16px;">
          <p style="font-size:11px;text-transform:uppercase;color:#64748b;margin:0 0 6px;letter-spacing:0.05em;">By Category</p>
          <table>${categoryRows}</table>
        </td>
        <td style="vertical-align:top;width:50%;">
          <p style="font-size:11px;text-transform:uppercase;color:#64748b;margin:0 0 6px;letter-spacing:0.05em;">By Severity</p>
          <table>${severityRows}</table>
        </td>
      </tr>
    </table>
    <p style="font-size:11px;text-transform:uppercase;color:#64748b;margin:0 0 6px;letter-spacing:0.05em;">Top Groups</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">${topRows}</table>
  `;
}

function renderBookings(d: DigestData): string {
  const { bookings } = d;
  if (bookings.total === 0 && bookings.funnelErrors === 0) {
    return `<p style="margin:0;color:#64748b;">No booking activity in the last 24 hours.</p>`;
  }

  const funnelErrorRows = bookings.funnelErrorCodes
    .map(
      (e) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#475569;">${escapeHtml(e.code)}</td><td style="padding:4px 0;text-align:right;font-variant-numeric:tabular-nums;">${e.count}</td></tr>`
    )
    .join('');

  const statTile = (label: string, value: number, color: string) => `
    <td style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;text-align:center;background:#f8fafc;">
      <div style="font-size:22px;font-weight:700;color:${color};font-variant-numeric:tabular-nums;">${value}</div>
      <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin-top:2px;">${label}</div>
    </td>
  `;

  return `
    <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:16px;">
      <tr>
        ${statTile('Total', bookings.total, '#0f172a')}
        ${statTile('Confirmed', bookings.confirmed, '#16a34a')}
        ${statTile('Failed', bookings.failed, '#dc2626')}
        ${statTile('Cancelled', bookings.cancelled, '#64748b')}
      </tr>
    </table>
    ${
      bookings.funnelErrors > 0
        ? `
      <p style="margin:8px 0 6px;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;">Funnel Error Codes</p>
      <table style="font-size:13px;border-collapse:collapse;">${funnelErrorRows}</table>`
        : ''
    }
  `;
}

function renderContactMessages(d: DigestData): string {
  const { contactMessages } = d;
  if (contactMessages.total === 0) {
    return `<p style="margin:0;color:#64748b;">No new contact messages.</p>`;
  }

  const subjectRows = contactMessages.bySubject
    .map(
      (s) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#475569;">${escapeHtml(s.subject)}</td><td style="padding:4px 0;text-align:right;font-variant-numeric:tabular-nums;">${s.count}</td></tr>`
    )
    .join('');

  const adminBaseUrl = process.env['ADMIN_BASE_URL'] || 'https://admin.experiencess.com';
  return `
    <p style="margin:0 0 12px;"><strong>${contactMessages.total}</strong> new message${contactMessages.total === 1 ? '' : 's'}.</p>
    <table style="font-size:13px;border-collapse:collapse;margin-bottom:12px;">${subjectRows}</table>
    <p style="margin:0;"><a href="${escapeHtml(adminBaseUrl)}/contact-messages" style="color:#0284c7;font-size:13px;">Open contact messages in admin →</a></p>
  `;
}

export function renderDigestEmail(d: DigestData): { subject: string; html: string; text: string } {
  const dateStr = d.windowStart.toISOString().slice(0, 10);
  const subject = `Daily ops digest — ${dateStr}`;

  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; max-width:720px; margin:0 auto; padding:24px; background:#ffffff;">
  <h1 style="margin:0 0 4px;font-size:22px;">Daily ops digest</h1>
  <p style="margin:0 0 24px;color:#64748b;font-size:13px;">
    ${escapeHtml(fmtDate(d.windowStart))} — ${escapeHtml(fmtDate(d.windowEnd))}
  </p>

  <h2 style="font-size:16px;margin:24px 0 12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Errors</h2>
  ${renderErrors(d)}

  <h2 style="font-size:16px;margin:32px 0 12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Bookings</h2>
  ${renderBookings(d)}

  <h2 style="font-size:16px;margin:32px 0 12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Contact messages</h2>
  ${renderContactMessages(d)}

  <p style="margin-top:32px;font-size:11px;color:#94a3b8;">
    Generated by the daily-digest job · 7am UTC daily · holibob-experiences-demand-gen
  </p>
</body>
</html>`;

  const lines: string[] = [];
  lines.push(`Daily ops digest — ${dateStr}`);
  lines.push(`${fmtDate(d.windowStart)} — ${fmtDate(d.windowEnd)}`);
  lines.push('');
  lines.push('=== ERRORS ===');
  if (d.errors.total === 0) {
    lines.push('No errors logged in the last 24 hours.');
  } else {
    lines.push(`Total: ${d.errors.total}`);
    lines.push(
      'By category: ' + d.errors.byCategory.map((c) => `${c.category} (${c.count})`).join(', ')
    );
    lines.push(
      'By severity: ' + d.errors.bySeverity.map((s) => `${s.severity} (${s.count})`).join(', ')
    );
    lines.push('');
    lines.push('Top groups:');
    for (const row of d.errors.topRows) {
      lines.push(`  [${row.count}] ${row.jobType} · ${row.category} · ${row.severity}`);
      lines.push(`        ${row.sampleMessage}`);
    }
  }
  lines.push('');
  lines.push('=== BOOKINGS ===');
  if (d.bookings.total === 0 && d.bookings.funnelErrors === 0) {
    lines.push('No booking activity.');
  } else {
    lines.push(
      `Total ${d.bookings.total}  confirmed ${d.bookings.confirmed}  failed ${d.bookings.failed}  cancelled ${d.bookings.cancelled}`
    );
    if (d.bookings.funnelErrors > 0) {
      lines.push(`Funnel errors: ${d.bookings.funnelErrors}`);
      for (const e of d.bookings.funnelErrorCodes) {
        lines.push(`  ${e.code}: ${e.count}`);
      }
    }
  }
  lines.push('');
  lines.push('=== CONTACT MESSAGES ===');
  if (d.contactMessages.total === 0) {
    lines.push('No new contact messages.');
  } else {
    lines.push(`Total: ${d.contactMessages.total}`);
    for (const s of d.contactMessages.bySubject) {
      lines.push(`  ${s.subject}: ${s.count}`);
    }
  }

  return { subject, html, text: lines.join('\n') };
}

export interface RunDigestResult {
  ok: boolean;
  reason?: string;
  emailId?: string;
  data: DigestData;
}

/**
 * Run the daily digest end-to-end: aggregate, render, send.
 * Never throws.
 */
export async function runDailyDigest(now: Date = new Date()): Promise<RunDigestResult> {
  const data = await gatherDigestData(now);
  const recipient = process.env['CONTACT_NOTIFICATION_EMAIL'];
  if (!recipient) {
    return { ok: false, reason: 'CONTACT_NOTIFICATION_EMAIL not set', data };
  }

  const { subject, html, text } = renderDigestEmail(data);
  const result = await sendEmail({ to: recipient, subject, html, text });
  if (!result.ok) {
    return { ok: false, reason: result.error ?? 'send-failed', data };
  }
  return { ok: true, emailId: result.id, data };
}
