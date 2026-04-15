import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendAlert } from './alerts';

describe('sendAlert', () => {
  const originalEnv = process.env;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ALERT_WEBHOOK_URL;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('always emits a structured [ALERT] log', async () => {
    await sendAlert({
      level: 'critical',
      title: 'Test outage',
      message: 'Things are bad',
      context: { count: 7 },
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ALERT]',
      expect.stringContaining('"title":"Test outage"')
    );
    const payload = JSON.parse(consoleErrorSpy.mock.calls[0]![1] as string);
    expect(payload).toMatchObject({
      level: 'critical',
      title: 'Test outage',
      message: 'Things are bad',
      context: { count: 7 },
    });
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not POST when ALERT_WEBHOOK_URL is unset', async () => {
    await sendAlert({ level: 'info', title: 'x', message: 'y' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs a Slack-shaped payload when ALERT_WEBHOOK_URL is set', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/services/abc';
    fetchSpy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

    await sendAlert({
      level: 'warning',
      title: 'Heads up',
      message: 'Watch this',
      context: { errorCode: 'X', count: 3 },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://hooks.example.com/services/abc');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });

    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('Heads up');
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].text).toBe('Watch this');
    expect(body.attachments[0].fields).toEqual([
      { title: 'errorCode', value: 'X', short: false },
      { title: 'count', value: '3', short: false },
    ]);
  });

  it('does not throw when the webhook returns a 5xx', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/services/abc';
    fetchSpy.mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable' });

    await expect(
      sendAlert({ level: 'critical', title: 't', message: 'm' })
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ALERT] Webhook returned non-2xx',
      expect.objectContaining({ status: 503 })
    );
  });

  it('does not throw when fetch itself rejects', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/services/abc';
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    await expect(
      sendAlert({ level: 'critical', title: 't', message: 'm' })
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ALERT] Failed to POST to webhook',
      expect.objectContaining({ error: 'connection refused' })
    );
  });
});
