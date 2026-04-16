import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';

const { mockPrisma, mockSendAlert, mockHolibobClient, mockCreateHolibobClient, mockRedisCtor } =
  vi.hoisted(() => {
    const mockPrisma = {
      bookingFunnelEvent: {
        findMany: vi.fn(),
      },
    };
    const mockSendAlert = vi.fn().mockResolvedValue(undefined);
    const mockHolibobClient = {
      discoverProducts: vi.fn(),
      createBooking: vi.fn(),
    };
    const mockCreateHolibobClient = vi.fn(() => mockHolibobClient);
    const mockRedisCtor = vi.fn(() => ({
      set: vi.fn().mockResolvedValue('OK'),
      quit: vi.fn().mockResolvedValue('OK'),
    }));
    return { mockPrisma, mockSendAlert, mockHolibobClient, mockCreateHolibobClient, mockRedisCtor };
  });

vi.mock('@experience-marketplace/database', () => ({ prisma: mockPrisma }));
vi.mock('@experience-marketplace/holibob-api', () => ({
  createHolibobClient: mockCreateHolibobClient,
}));
vi.mock('../errors/alerts', () => ({ sendAlert: mockSendAlert }));
vi.mock('../queues/index.js', () => ({
  createRedisConnection: () => mockRedisCtor(),
}));

import { handleBookingErrorAlert, handleBookingHealthCanary } from './booking-health';

function emptyJob(): Job {
  return { id: 'test-job', data: {}, attemptsMade: 0 } as unknown as Job;
}

describe('handleBookingErrorAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisCtor.mockImplementation(() => ({
      set: vi.fn().mockResolvedValue('OK'),
      quit: vi.fn().mockResolvedValue('OK'),
    }));
  });

  it('returns success and skips alerting when there are no recent errors', async () => {
    mockPrisma.bookingFunnelEvent.findMany.mockResolvedValue([]);

    const result = await handleBookingErrorAlert(emptyJob());

    expect(result.success).toBe(true);
    expect(mockSendAlert).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ totalErrors: 0 });
  });

  it('does not alert when error count is below the threshold', async () => {
    mockPrisma.bookingFunnelEvent.findMany.mockResolvedValue([
      { errorCode: 'BOOKING_CREATE_ERROR', errorMessage: 'one' },
      { errorCode: 'BOOKING_CREATE_ERROR', errorMessage: 'two' },
    ]);

    const result = await handleBookingErrorAlert(emptyJob());

    expect(result.success).toBe(true);
    expect(mockSendAlert).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ totalErrors: 2, alertsFired: 0 });
  });

  it('alerts when the threshold is crossed and de-dupes via Redis SET NX', async () => {
    mockPrisma.bookingFunnelEvent.findMany.mockResolvedValue([
      { errorCode: 'BOOKING_CREATE_ERROR', errorMessage: 'first sample' },
      { errorCode: 'BOOKING_CREATE_ERROR', errorMessage: 'second sample' },
      { errorCode: 'BOOKING_CREATE_ERROR', errorMessage: 'third sample' },
      { errorCode: 'DB_SAVE_FAILED', errorMessage: 'pg timeout' },
    ]);

    const setMock = vi.fn().mockResolvedValue('OK');
    const quitMock = vi.fn().mockResolvedValue('OK');
    mockRedisCtor.mockImplementation(() => ({ set: setMock, quit: quitMock }));

    const result = await handleBookingErrorAlert(emptyJob());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ totalErrors: 4, alertsFired: 1 });

    // Only BOOKING_CREATE_ERROR (count 3, threshold met) gets a dedup write —
    // DB_SAVE_FAILED has count 1 which is below the threshold and is skipped
    // before reaching Redis.
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      'booking-health:alert-dedup:BOOKING_CREATE_ERROR',
      '1',
      'EX',
      3600,
      'NX'
    );

    expect(mockSendAlert).toHaveBeenCalledTimes(1);
    const [alertArg] = mockSendAlert.mock.calls[0]!;
    expect(alertArg.level).toBe('critical');
    expect(alertArg.title).toBe('Booking funnel errors detected');
    expect(alertArg.context.totalErrors).toBe(4);
    expect(alertArg.context.breakdown).toEqual([
      {
        errorCode: 'BOOKING_CREATE_ERROR',
        count: 3,
        sampleMessage: 'first sample',
      },
    ]);
  });

  it('suppresses the alert when SET NX returns null (already alerted recently)', async () => {
    mockPrisma.bookingFunnelEvent.findMany.mockResolvedValue([
      { errorCode: 'BOOKING_CREATE_ERROR', errorMessage: 'a' },
      { errorCode: 'BOOKING_CREATE_ERROR', errorMessage: 'b' },
      { errorCode: 'BOOKING_CREATE_ERROR', errorMessage: 'c' },
    ]);

    const setMock = vi.fn().mockResolvedValue(null); // dedup hit
    mockRedisCtor.mockImplementation(() => ({
      set: setMock,
      quit: vi.fn().mockResolvedValue('OK'),
    }));

    const result = await handleBookingErrorAlert(emptyJob());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ alertsFired: 0 });
    expect(mockSendAlert).not.toHaveBeenCalled();
  });
});

describe('handleBookingHealthCanary', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      HOLIBOB_API_URL: 'https://api.example.com',
      HOLIBOB_PARTNER_ID: 'partner-1',
      HOLIBOB_API_KEY: 'key-1',
    };
    delete process.env.DYNO;
    delete process.env.BOOKING_CANARY_ENABLED;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('skips entirely when not on Heroku/production and not explicitly enabled', async () => {
    process.env.NODE_ENV = 'development';

    const result = await handleBookingHealthCanary(emptyJob());

    expect(result.success).toBe(true);
    expect(mockHolibobClient.createBooking).not.toHaveBeenCalled();
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it('runs on Heroku (DYNO env var present) even with NODE_ENV unset', async () => {
    delete process.env.NODE_ENV;
    process.env.DYNO = 'worker-heavy.1';
    mockHolibobClient.discoverProducts.mockResolvedValue({
      products: [{ id: 'p1' }, { id: 'p2' }],
    });
    mockHolibobClient.createBooking.mockResolvedValue({ id: 'basket-heroku' });

    const result = await handleBookingHealthCanary(emptyJob());

    expect(result.success).toBe(true);
    expect(mockHolibobClient.createBooking).toHaveBeenCalledWith({ autoFillQuestions: true });
  });

  it('runs in non-prod when BOOKING_CANARY_ENABLED=true', async () => {
    process.env.NODE_ENV = 'development';
    process.env.BOOKING_CANARY_ENABLED = 'true';
    mockHolibobClient.discoverProducts.mockResolvedValue({
      products: [{ id: 'p1' }, { id: 'p2' }],
    });
    mockHolibobClient.createBooking.mockResolvedValue({ id: 'basket-123' });

    const result = await handleBookingHealthCanary(emptyJob());

    expect(result.success).toBe(true);
    expect(mockHolibobClient.createBooking).toHaveBeenCalledWith({ autoFillQuestions: true });
  });

  it('skips on Heroku when BOOKING_CANARY_ENABLED=false (kill switch)', async () => {
    process.env.DYNO = 'worker-heavy.1';
    process.env.BOOKING_CANARY_ENABLED = 'false';

    const result = await handleBookingHealthCanary(emptyJob());

    expect(result.success).toBe(true);
    expect(mockHolibobClient.createBooking).not.toHaveBeenCalled();
  });

  it('returns success and does not alert when both probes succeed', async () => {
    mockHolibobClient.discoverProducts.mockResolvedValue({
      products: [{ id: 'p1' }, { id: 'p2' }],
    });
    mockHolibobClient.createBooking.mockResolvedValue({ id: 'basket-xyz' });

    const result = await handleBookingHealthCanary(emptyJob());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ productCount: 2, bookingId: 'basket-xyz' });
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it('alerts when createBooking throws (the exact failure mode of the P0 incident)', async () => {
    mockHolibobClient.discoverProducts.mockResolvedValue({ products: [{ id: 'p1' }] });
    mockHolibobClient.createBooking.mockRejectedValue(
      new Error(
        'Variable "$input" got invalid value ...; Field "partnerExternalReference" is not defined by type "BookingCreateInput".'
      )
    );

    const result = await handleBookingHealthCanary(emptyJob());

    expect(result.success).toBe(false);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
    const [alertArg] = mockSendAlert.mock.calls[0]!;
    expect(alertArg.level).toBe('critical');
    expect(alertArg.title).toBe('Booking health canary FAILED');
    expect(alertArg.context.failures).toHaveLength(1);
    expect(alertArg.context.failures[0].step).toBe('createBooking');
    expect(alertArg.context.failures[0].error).toContain('partnerExternalReference');
  });

  it('alerts when discoverProducts returns an empty list', async () => {
    mockHolibobClient.discoverProducts.mockResolvedValue({ products: [] });
    mockHolibobClient.createBooking.mockResolvedValue({ id: 'basket-1' });

    const result = await handleBookingHealthCanary(emptyJob());

    expect(result.success).toBe(false);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
    const [alertArg] = mockSendAlert.mock.calls[0]!;
    expect(alertArg.context.failures[0].step).toBe('discoverProducts');
  });

  it('alerts and returns failure when env vars are missing', async () => {
    delete process.env.HOLIBOB_API_KEY;

    const result = await handleBookingHealthCanary(emptyJob());

    expect(result.success).toBe(false);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
    const [alertArg] = mockSendAlert.mock.calls[0]!;
    expect(alertArg.title).toContain('errored before probe');
  });
});
