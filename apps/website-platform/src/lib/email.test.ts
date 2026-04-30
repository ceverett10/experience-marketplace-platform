import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send: sendMock } })),
}));

const SAMPLE = {
  id: 'cm_test',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+44 7700 900000',
  subject: 'Booking enquiry',
  message: 'Hello, do you have availability on Friday?',
  domain: 'london-tours.com',
  createdAt: new Date('2026-04-30T10:00:00Z'),
};

async function importFresh() {
  vi.resetModules();
  return import('./email');
}

describe('sendContactNotification', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'em_123' }, error: null });
    process.env['RESEND_API_KEY'] = 're_test';
    process.env['RESEND_FROM_EMAIL'] = 'Sender <test@example.com>';
    process.env['CONTACT_NOTIFICATION_EMAIL'] = 'inbox@example.com';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns false and does not call Resend when RESEND_API_KEY is missing', async () => {
    delete process.env['RESEND_API_KEY'];
    const { sendContactNotification } = await importFresh();
    const result = await sendContactNotification(SAMPLE);
    expect(result).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns false and does not call Resend when CONTACT_NOTIFICATION_EMAIL is missing', async () => {
    delete process.env['CONTACT_NOTIFICATION_EMAIL'];
    const { sendContactNotification } = await importFresh();
    const result = await sendContactNotification(SAMPLE);
    expect(result).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends with the configured from/to and replyTo set to the customer', async () => {
    const { sendContactNotification } = await importFresh();
    const result = await sendContactNotification(SAMPLE);
    expect(result).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const args = sendMock.mock.calls[0][0];
    expect(args.from).toBe('Sender <test@example.com>');
    expect(args.to).toBe('inbox@example.com');
    expect(args.replyTo).toBe(SAMPLE.email);
    expect(args.subject).toContain(SAMPLE.subject);
    expect(args.subject).toContain(SAMPLE.name);
  });

  it('includes message body, source domain, and admin link in the email', async () => {
    const { sendContactNotification } = await importFresh();
    await sendContactNotification(SAMPLE);
    const args = sendMock.mock.calls[0][0];
    expect(args.text).toContain(SAMPLE.message);
    expect(args.text).toContain(SAMPLE.domain);
    expect(args.text).toContain('admin.experiencess.com/contact-messages');
    expect(args.html).toContain(SAMPLE.message);
    expect(args.html).toContain(SAMPLE.domain);
  });

  it('escapes HTML in user-controlled fields to prevent injection', async () => {
    const { sendContactNotification } = await importFresh();
    await sendContactNotification({
      ...SAMPLE,
      name: '<script>alert(1)</script>',
      message: 'normal text & "quoted"',
    });
    const args = sendMock.mock.calls[0][0];
    expect(args.html).not.toContain('<script>alert(1)</script>');
    expect(args.html).toContain('&lt;script&gt;');
    expect(args.html).toContain('&amp;');
    expect(args.html).toContain('&quot;');
  });

  it('returns false when Resend returns an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
    const { sendContactNotification } = await importFresh();
    const result = await sendContactNotification(SAMPLE);
    expect(result).toBe(false);
  });

  it('returns false (does not throw) when Resend throws', async () => {
    sendMock.mockRejectedValue(new Error('network'));
    const { sendContactNotification } = await importFresh();
    const result = await sendContactNotification(SAMPLE);
    expect(result).toBe(false);
  });

  it('respects ADMIN_BASE_URL override', async () => {
    process.env['ADMIN_BASE_URL'] = 'https://custom-admin.example.com';
    const { sendContactNotification } = await importFresh();
    await sendContactNotification(SAMPLE);
    const args = sendMock.mock.calls[0][0];
    expect(args.text).toContain('https://custom-admin.example.com/contact-messages');
  });
});
