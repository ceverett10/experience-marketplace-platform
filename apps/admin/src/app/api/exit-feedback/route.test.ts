import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma, resetMockPrisma } from '@/test/mocks/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { GET } from './route';

function createRequest(url: string) {
  return new Request(url);
}

const mockEvent = {
  id: 'evt-1',
  createdAt: new Date('2026-03-17T10:00:00Z'),
  step: 'EXIT_FEEDBACK',
  siteId: 'site-1',
  sessionId: 'sess-1',
  productId: null,
  bookingId: null,
  errorCode: 'TOO_EXPENSIVE',
  errorMessage: 'Prices seem high compared to other sites',
  durationMs: null,
  utmSource: 'google',
  utmMedium: 'cpc',
  utmCampaign: 'london-tours',
  landingPage: '/experiences/abc123',
};

describe('GET /api/exit-feedback', () => {
  beforeEach(() => {
    resetMockPrisma();
  });

  it('returns exit feedback events with stats and pagination', async () => {
    mockPrisma.bookingFunnelEvent.findMany.mockResolvedValue([mockEvent]);
    mockPrisma.bookingFunnelEvent.count
      .mockResolvedValueOnce(1) // filtered count
      .mockResolvedValueOnce(5) // total all
      .mockResolvedValueOnce(2) // this week
      .mockResolvedValueOnce(4); // this month
    mockPrisma.bookingFunnelEvent.groupBy.mockResolvedValue([
      { errorCode: 'TOO_EXPENSIVE', _count: { id: 3 } },
      { errorCode: 'JUST_BROWSING', _count: { id: 2 } },
    ]);
    mockPrisma.site.findMany
      .mockResolvedValueOnce([{ id: 'site-1', name: 'London Tours' }]) // sites for filter
      .mockResolvedValueOnce([{ id: 'site-1', name: 'London Tours' }]); // site name resolution

    const response = await GET(createRequest('http://localhost/api/exit-feedback') as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toHaveLength(1);
    expect(data.events[0]).toMatchObject({
      id: 'evt-1',
      reason: 'TOO_EXPENSIVE',
      reasonLabel: 'Too expensive',
      comment: 'Prices seem high compared to other sites',
      siteName: 'London Tours',
      landingPage: '/experiences/abc123',
      utmSource: 'google',
      utmMedium: 'cpc',
    });
    expect(data.stats).toMatchObject({
      total: 5,
      thisWeek: 2,
      thisMonth: 4,
    });
    expect(data.stats.reasons).toHaveLength(2);
    expect(data.pagination).toMatchObject({
      page: 1,
      total: 1,
    });
    expect(data.filters.reasons).toContain('TOO_EXPENSIVE');
    expect(data.filters.sites).toHaveLength(1);
  });

  it('filters by reason when provided', async () => {
    mockPrisma.bookingFunnelEvent.findMany.mockResolvedValue([]);
    mockPrisma.bookingFunnelEvent.count.mockResolvedValue(0);
    mockPrisma.bookingFunnelEvent.groupBy.mockResolvedValue([]);
    mockPrisma.site.findMany.mockResolvedValue([]);

    await GET(createRequest('http://localhost/api/exit-feedback?reason=DONT_TRUST_SITE') as never);

    expect(mockPrisma.bookingFunnelEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          step: 'EXIT_FEEDBACK',
          errorCode: 'DONT_TRUST_SITE',
        }),
      })
    );
  });

  it('filters by site when provided', async () => {
    mockPrisma.bookingFunnelEvent.findMany.mockResolvedValue([]);
    mockPrisma.bookingFunnelEvent.count.mockResolvedValue(0);
    mockPrisma.bookingFunnelEvent.groupBy.mockResolvedValue([]);
    mockPrisma.site.findMany.mockResolvedValue([]);

    await GET(createRequest('http://localhost/api/exit-feedback?siteId=site-1') as never);

    expect(mockPrisma.bookingFunnelEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          step: 'EXIT_FEEDBACK',
          siteId: 'site-1',
        }),
      })
    );
  });

  it('returns empty state gracefully', async () => {
    mockPrisma.bookingFunnelEvent.findMany.mockResolvedValue([]);
    mockPrisma.bookingFunnelEvent.count.mockResolvedValue(0);
    mockPrisma.bookingFunnelEvent.groupBy.mockResolvedValue([]);
    mockPrisma.site.findMany.mockResolvedValue([]);

    const response = await GET(createRequest('http://localhost/api/exit-feedback') as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toHaveLength(0);
    expect(data.stats.total).toBe(0);
    expect(data.stats.reasons).toHaveLength(0);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.bookingFunnelEvent.findMany.mockRejectedValue(new Error('DB connection failed'));

    const response = await GET(createRequest('http://localhost/api/exit-feedback') as never);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch exit feedback');
  });
});
