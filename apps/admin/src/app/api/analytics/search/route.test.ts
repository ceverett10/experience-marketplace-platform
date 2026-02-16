import { describe, it, expect, vi } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { GET } from './route';

function createRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost'));
}

const mockSite = {
  id: 'site-1',
  name: 'London Tours',
  primaryDomain: 'london-tours.com',
  domains: [{ domain: 'london-tours.com' }],
};

const mockMicrosite = {
  id: 'micro-1',
  siteName: 'Adventure Co',
  fullDomain: 'adventure-co.experiencess.com',
};

function setupEmptyMocks() {
  mockPrisma.site.findMany.mockResolvedValue([]);
  mockPrisma.micrositeConfig.findMany.mockResolvedValue([]);
}

function setupSiteAndMicrositeMocks() {
  mockPrisma.site.findMany.mockResolvedValue([mockSite]);
  mockPrisma.micrositeConfig.findMany.mockResolvedValue([mockMicrosite]);
}

function setupAggregates(
  siteTotals = { clicks: 100, impressions: 1000 },
  micrositeTotals = { clicks: 50, impressions: 500 }
) {
  mockPrisma.performanceMetric.aggregate.mockResolvedValue({
    _sum: siteTotals,
  });
  mockPrisma.micrositePerformanceMetric.aggregate.mockResolvedValue({
    _sum: micrositeTotals,
  });
}

function setupPositionData(
  siteData: Array<{ position: number; impressions: number }> = [],
  micrositeData: Array<{ position: number; impressions: number }> = []
) {
  mockPrisma.performanceMetric.findMany.mockResolvedValue(siteData);
  mockPrisma.micrositePerformanceMetric.findMany.mockResolvedValue(micrositeData);
}

function setupGroupByMocks(
  siteByEntity: unknown[] = [],
  micrositeByEntity: unknown[] = [],
  siteQueries: unknown[] = [],
  micrositeQueries: unknown[] = [],
  sitePages: unknown[] = [],
  micrositePages: unknown[] = []
) {
  // groupBy is called 3 times per table: by entity, by query, by page
  mockPrisma.performanceMetric.groupBy
    .mockResolvedValueOnce(siteByEntity)
    .mockResolvedValueOnce(siteQueries)
    .mockResolvedValueOnce(sitePages);
  mockPrisma.micrositePerformanceMetric.groupBy
    .mockResolvedValueOnce(micrositeByEntity)
    .mockResolvedValueOnce(micrositeQueries)
    .mockResolvedValueOnce(micrositePages);
}

describe('GET /api/analytics/search', () => {
  it('returns combined totals from sites and microsites', async () => {
    setupSiteAndMicrositeMocks();
    setupAggregates({ clicks: 100, impressions: 1000 }, { clicks: 50, impressions: 500 });
    setupPositionData([{ position: 5, impressions: 1000 }], [{ position: 10, impressions: 500 }]);
    setupGroupByMocks();

    const response = await GET(createRequest('http://localhost/api/analytics/search'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totals.clicks).toBe(150);
    expect(data.totals.impressions).toBe(1500);
    expect(data.totals.ctr).toBeCloseTo(10, 1);
    // Weighted avg: (5*1000 + 10*500) / (1000+500) = 10000/1500 = 6.67
    expect(data.totals.avgPosition).toBeCloseTo(6.67, 1);
  });

  it('includes microsites in bySite list', async () => {
    setupSiteAndMicrositeMocks();
    setupAggregates();
    setupPositionData();
    setupGroupByMocks(
      [{ siteId: 'site-1', _sum: { clicks: 100, impressions: 1000 }, _avg: { position: 5 } }],
      [
        {
          micrositeId: 'micro-1',
          _sum: { clicks: 50, impressions: 500 },
          _avg: { position: 10 },
        },
      ]
    );

    const response = await GET(createRequest('http://localhost/api/analytics/search'));
    const data = await response.json();

    expect(data.bySite).toHaveLength(2);
    // Sorted by clicks desc
    expect(data.bySite[0].siteId).toBe('site-1');
    expect(data.bySite[0].siteName).toBe('London Tours');
    expect(data.bySite[0].domain).toBe('london-tours.com');
    expect(data.bySite[0].clicks).toBe(100);

    expect(data.bySite[1].siteId).toBe('micro-1');
    expect(data.bySite[1].siteName).toBe('Adventure Co');
    expect(data.bySite[1].domain).toBe('adventure-co.experiencess.com');
    expect(data.bySite[1].clicks).toBe(50);
  });

  it('merges queries from sites and microsites', async () => {
    setupSiteAndMicrositeMocks();
    setupAggregates();
    setupPositionData();
    setupGroupByMocks(
      [], // bySite
      [], // byMicrosite
      // site queries
      [
        {
          query: 'london tours',
          siteId: 'site-1',
          _sum: { clicks: 30, impressions: 200 },
          _avg: { position: 4 },
        },
      ],
      // microsite queries — same query, should merge
      [
        {
          query: 'london tours',
          micrositeId: 'micro-1',
          _sum: { clicks: 10, impressions: 100 },
          _avg: { position: 8 },
        },
      ]
    );

    const response = await GET(createRequest('http://localhost/api/analytics/search'));
    const data = await response.json();

    expect(data.topQueries).toHaveLength(1);
    expect(data.topQueries[0].query).toBe('london tours');
    expect(data.topQueries[0].clicks).toBe(40);
    expect(data.topQueries[0].impressions).toBe(300);
    expect(data.topQueries[0].siteCount).toBe(2);
  });

  it('merges pages from sites and microsites into topPages', async () => {
    setupSiteAndMicrositeMocks();
    setupAggregates();
    setupPositionData();
    setupGroupByMocks(
      [],
      [],
      [],
      [],
      // site pages
      [
        {
          pageUrl: 'https://london-tours.com/',
          siteId: 'site-1',
          _sum: { clicks: 80, impressions: 900 },
          _avg: { position: 3 },
        },
      ],
      // microsite pages
      [
        {
          pageUrl: 'https://adventure-co.experiencess.com/',
          micrositeId: 'micro-1',
          _sum: { clicks: 20, impressions: 400 },
          _avg: { position: 12 },
        },
      ]
    );

    const response = await GET(createRequest('http://localhost/api/analytics/search'));
    const data = await response.json();

    expect(data.topPages).toHaveLength(2);
    // Sorted by impressions desc
    expect(data.topPages[0].pageUrl).toBe('https://london-tours.com/');
    expect(data.topPages[0].site).toBe('London Tours');
    expect(data.topPages[1].pageUrl).toBe('https://adventure-co.experiencess.com/');
    expect(data.topPages[1].site).toBe('Adventure Co');
  });

  it('calculates position distribution from both tables', async () => {
    setupSiteAndMicrositeMocks();
    setupAggregates();
    setupPositionData();
    setupGroupByMocks(
      [],
      [],
      [],
      [],
      // site pages — positions 2 and 7
      [
        {
          pageUrl: '/a',
          siteId: 'site-1',
          _sum: { clicks: 10, impressions: 100 },
          _avg: { position: 2 },
        },
        {
          pageUrl: '/b',
          siteId: 'site-1',
          _sum: { clicks: 5, impressions: 50 },
          _avg: { position: 7 },
        },
      ],
      // microsite pages — positions 15 and 25
      [
        {
          pageUrl: '/c',
          micrositeId: 'micro-1',
          _sum: { clicks: 3, impressions: 30 },
          _avg: { position: 15 },
        },
        {
          pageUrl: '/d',
          micrositeId: 'micro-1',
          _sum: { clicks: 1, impressions: 10 },
          _avg: { position: 25 },
        },
      ]
    );

    const response = await GET(createRequest('http://localhost/api/analytics/search'));
    const data = await response.json();

    expect(data.positionDistribution).toEqual({
      top3: 1, // position 2
      top10: 1, // position 7
      top20: 1, // position 15
      beyond20: 1, // position 25
    });
  });

  it('works with only sites (no microsites)', async () => {
    mockPrisma.site.findMany.mockResolvedValue([mockSite]);
    mockPrisma.micrositeConfig.findMany.mockResolvedValue([]);
    mockPrisma.performanceMetric.aggregate.mockResolvedValue({
      _sum: { clicks: 100, impressions: 1000 },
    });
    mockPrisma.performanceMetric.findMany.mockResolvedValue([]);
    mockPrisma.performanceMetric.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET(createRequest('http://localhost/api/analytics/search'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totals.clicks).toBe(100);
    expect(data.totals.impressions).toBe(1000);
    // Microsite queries should not have been called
    expect(mockPrisma.micrositePerformanceMetric.aggregate).not.toHaveBeenCalled();
  });

  it('works with only microsites (no sites)', async () => {
    mockPrisma.site.findMany.mockResolvedValue([]);
    mockPrisma.micrositeConfig.findMany.mockResolvedValue([mockMicrosite]);
    mockPrisma.micrositePerformanceMetric.aggregate.mockResolvedValue({
      _sum: { clicks: 50, impressions: 500 },
    });
    mockPrisma.micrositePerformanceMetric.findMany.mockResolvedValue([]);
    mockPrisma.micrositePerformanceMetric.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET(createRequest('http://localhost/api/analytics/search'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totals.clicks).toBe(50);
    expect(data.totals.impressions).toBe(500);
    expect(mockPrisma.performanceMetric.aggregate).not.toHaveBeenCalled();
  });

  it('returns empty results when no sites or microsites', async () => {
    setupEmptyMocks();

    const response = await GET(createRequest('http://localhost/api/analytics/search'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totals).toEqual({ clicks: 0, impressions: 0, ctr: 0, avgPosition: 0 });
    expect(data.bySite).toEqual([]);
    expect(data.topQueries).toEqual([]);
    expect(data.topPages).toEqual([]);
  });

  it('passes date range from query params', async () => {
    setupEmptyMocks();

    await GET(
      createRequest('http://localhost/api/analytics/search?startDate=2026-01-01&endDate=2026-01-31')
    );

    // No DB queries should be made when there are no sites/microsites
    // Just verify it returned successfully (dates are parsed correctly)
    expect(mockPrisma.site.findMany).toHaveBeenCalled();
    expect(mockPrisma.micrositeConfig.findMany).toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockPrisma.site.findMany.mockRejectedValue(new Error('DB connection failed'));

    const response = await GET(createRequest('http://localhost/api/analytics/search'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch search analytics');
  });
});
