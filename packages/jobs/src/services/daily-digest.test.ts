import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockSendEmail } = vi.hoisted(() => {
  return {
    mockPrisma: {
      errorLog: {
        count: vi.fn(),
        groupBy: vi.fn(),
        findFirst: vi.fn(),
      },
      booking: { groupBy: vi.fn() },
      bookingFunnelEvent: { groupBy: vi.fn() },
      contactMessage: {
        count: vi.fn(),
        groupBy: vi.fn(),
      },
    },
    mockSendEmail: vi.fn(),
  };
});

vi.mock('@experience-marketplace/database', () => ({ prisma: mockPrisma }));
vi.mock('./email', () => ({ sendEmail: mockSendEmail }));

import { gatherDigestData, renderDigestEmail, runDailyDigest } from './daily-digest';

const NOW = new Date('2026-05-01T07:00:00Z');

function defaultMocks(): void {
  mockPrisma.errorLog.count.mockResolvedValue(0);
  mockPrisma.errorLog.groupBy.mockResolvedValue([]);
  mockPrisma.errorLog.findFirst.mockResolvedValue(null);
  mockPrisma.booking.groupBy.mockResolvedValue([]);
  mockPrisma.bookingFunnelEvent.groupBy.mockResolvedValue([]);
  mockPrisma.contactMessage.count.mockResolvedValue(0);
  mockPrisma.contactMessage.groupBy.mockResolvedValue([]);
}

describe('gatherDigestData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks();
  });

  it('returns a 24h window relative to now', async () => {
    const data = await gatherDigestData(NOW);
    expect(data.windowEnd).toEqual(NOW);
    expect(data.windowEnd.getTime() - data.windowStart.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('aggregates errors by category and severity, with sample messages', async () => {
    mockPrisma.errorLog.count.mockResolvedValue(7);
    mockPrisma.errorLog.groupBy
      .mockResolvedValueOnce([
        { errorCategory: 'NOT_FOUND', _count: { _all: 5 } },
        { errorCategory: 'EXTERNAL_API', _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { errorSeverity: 'MEDIUM', _count: { _all: 5 } },
        { errorSeverity: 'HIGH', _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        {
          jobType: 'EXPERIENCE_NOT_FOUND',
          errorCategory: 'NOT_FOUND',
          errorSeverity: 'MEDIUM',
          _count: { _all: 5 },
        },
      ]);
    mockPrisma.errorLog.findFirst.mockResolvedValue({
      errorMessage: 'Holibob returned no product for /experiences/abc',
      siteId: 'site_1',
    });

    const data = await gatherDigestData(NOW);
    expect(data.errors.total).toBe(7);
    expect(data.errors.byCategory).toEqual([
      { category: 'NOT_FOUND', count: 5 },
      { category: 'EXTERNAL_API', count: 2 },
    ]);
    expect(data.errors.topRows).toHaveLength(1);
    expect(data.errors.topRows[0]).toMatchObject({
      jobType: 'EXPERIENCE_NOT_FOUND',
      category: 'NOT_FOUND',
      count: 5,
      sampleSiteId: 'site_1',
    });
    expect(data.errors.topRows[0]?.sampleMessage).toContain('experiences/abc');
  });

  it('counts bookings by status', async () => {
    mockPrisma.booking.groupBy.mockResolvedValue([
      { status: 'CONFIRMED', _count: { _all: 4 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ]);

    const data = await gatherDigestData(NOW);
    expect(data.bookings.total).toBe(5);
    expect(data.bookings.confirmed).toBe(4);
    expect(data.bookings.failed).toBe(1);
    expect(data.bookings.cancelled).toBe(0);
  });

  it('counts funnel error codes and sorts by frequency', async () => {
    mockPrisma.bookingFunnelEvent.groupBy.mockResolvedValue([
      { errorCode: 'PAYMENT_DECLINED', _count: { _all: 2 } },
      { errorCode: 'AVAILABILITY_GONE', _count: { _all: 5 } },
    ]);

    const data = await gatherDigestData(NOW);
    expect(data.bookings.funnelErrors).toBe(7);
    expect(data.bookings.funnelErrorCodes[0]).toEqual({ code: 'AVAILABILITY_GONE', count: 5 });
  });

  it('summarizes contact messages by subject', async () => {
    mockPrisma.contactMessage.count.mockResolvedValue(3);
    mockPrisma.contactMessage.groupBy.mockResolvedValue([
      { subject: 'Booking enquiry', _count: { _all: 2 } },
      { subject: 'Other', _count: { _all: 1 } },
    ]);

    const data = await gatherDigestData(NOW);
    expect(data.contactMessages.total).toBe(3);
    expect(data.contactMessages.bySubject).toEqual([
      { subject: 'Booking enquiry', count: 2 },
      { subject: 'Other', count: 1 },
    ]);
  });
});

describe('renderDigestEmail', () => {
  it('produces a date-stamped subject and a plain-text body', async () => {
    defaultMocks();
    const data = await gatherDigestData(NOW);
    const { subject, html, text } = renderDigestEmail(data);
    expect(subject).toBe('Daily ops digest — 2026-04-30');
    expect(html).toContain('Daily ops digest');
    expect(text).toContain('=== ERRORS ===');
    expect(text).toContain('=== BOOKINGS ===');
    expect(text).toContain('=== CONTACT MESSAGES ===');
  });

  it('shows the no-errors message when total is 0', async () => {
    defaultMocks();
    const data = await gatherDigestData(NOW);
    const { html } = renderDigestEmail(data);
    expect(html).toContain('No errors logged');
  });

  it('escapes HTML in error sample messages', async () => {
    mockPrisma.errorLog.count.mockResolvedValue(1);
    mockPrisma.errorLog.groupBy
      .mockResolvedValueOnce([{ errorCategory: 'NOT_FOUND', _count: { _all: 1 } }])
      .mockResolvedValueOnce([{ errorSeverity: 'MEDIUM', _count: { _all: 1 } }])
      .mockResolvedValueOnce([
        {
          jobType: 'X',
          errorCategory: 'NOT_FOUND',
          errorSeverity: 'MEDIUM',
          _count: { _all: 1 },
        },
      ]);
    mockPrisma.errorLog.findFirst.mockResolvedValue({
      errorMessage: '<script>alert(1)</script> evil',
      siteId: null,
    });
    mockPrisma.booking.groupBy.mockResolvedValue([]);
    mockPrisma.bookingFunnelEvent.groupBy.mockResolvedValue([]);
    mockPrisma.contactMessage.count.mockResolvedValue(0);
    mockPrisma.contactMessage.groupBy.mockResolvedValue([]);

    const data = await gatherDigestData(NOW);
    const { html } = renderDigestEmail(data);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('runDailyDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks();
  });

  it('returns ok=false when CONTACT_NOTIFICATION_EMAIL is not set', async () => {
    delete process.env['CONTACT_NOTIFICATION_EMAIL'];
    const result = await runDailyDigest(NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('CONTACT_NOTIFICATION_EMAIL');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('sends email and returns ok with id when configured', async () => {
    process.env['CONTACT_NOTIFICATION_EMAIL'] = 'craig@example.com';
    mockSendEmail.mockResolvedValue({ ok: true, id: 'em_test' });
    const result = await runDailyDigest(NOW);
    expect(result.ok).toBe(true);
    expect(result.emailId).toBe('em_test');
    expect(mockSendEmail).toHaveBeenCalledOnce();
    const args = mockSendEmail.mock.calls[0]?.[0];
    expect(args.to).toBe('craig@example.com');
    expect(args.subject).toMatch(/Daily ops digest/);
  });

  it('returns ok=false when sendEmail fails', async () => {
    process.env['CONTACT_NOTIFICATION_EMAIL'] = 'craig@example.com';
    mockSendEmail.mockResolvedValue({ ok: false, error: 'rate-limited' });
    const result = await runDailyDigest(NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('rate-limited');
  });
});
