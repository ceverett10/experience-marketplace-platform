import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';
import { createMockSite, createMockBrand } from '@/test/factories';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { GET, POST } from './route';

function createRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe('GET /api/sites', () => {
  it('returns all sites with stats', async () => {
    const brand = createMockBrand({ primaryColor: '#ff0000' });
    const sites = [
      createMockSite({
        id: 'site-1',
        name: 'Active Site',
        slug: 'active-site',
        status: 'ACTIVE',
        primaryDomain: 'active.com',
        brand,
        domains: [{ domain: 'active.com', status: 'ACTIVE' }],
        _count: { pages: 5, domains: 1 },
        createdAt: new Date('2024-01-15'),
      }),
      createMockSite({
        id: 'site-2',
        name: 'Draft Site',
        slug: 'draft-site',
        status: 'DRAFT',
        primaryDomain: null,
        brand: null,
        domains: [],
        _count: { pages: 0, domains: 0 },
        createdAt: new Date('2024-02-01'),
      }),
    ];

    mockPrisma.site.findMany
      .mockResolvedValueOnce(sites)     // filtered query
      .mockResolvedValueOnce([           // stats query (all sites)
        { status: 'ACTIVE' },
        { status: 'DRAFT' },
      ]);

    const response = await GET(createRequest('http://localhost/api/sites'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sites).toHaveLength(2);
    expect(data.sites[0].name).toBe('Active Site');
    expect(data.sites[0].domain).toBe('active.com');
    expect(data.sites[0].brandColor).toBe('#ff0000');
    expect(data.sites[0].pageCount).toBe(5);
    expect(data.sites[1].brand).toBeNull();
    expect(data.sites[1].brandColor).toBe('#6366f1'); // default

    expect(data.stats).toEqual({
      totalSites: 2,
      activeSites: 1,
      draftSites: 1,
      totalRevenue: 0,
      totalVisitors: 0,
    });
  });

  it('filters sites by status', async () => {
    mockPrisma.site.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await GET(createRequest('http://localhost/api/sites?status=ACTIVE'));

    expect(mockPrisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE' },
      })
    );
  });

  it('does not filter when status is "all"', async () => {
    mockPrisma.site.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await GET(createRequest('http://localhost/api/sites?status=all'));

    expect(mockPrisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      })
    );
  });

  it('uses domain from domains array when no primaryDomain', async () => {
    const site = createMockSite({
      primaryDomain: null,
      slug: 'my-site',
      brand: null,
      domains: [{ domain: 'found-domain.com', status: 'ACTIVE' }],
      _count: { pages: 0, domains: 1 },
      createdAt: new Date(),
    });

    mockPrisma.site.findMany
      .mockResolvedValueOnce([site])
      .mockResolvedValueOnce([]);

    const response = await GET(createRequest('http://localhost/api/sites'));
    const data = await response.json();

    expect(data.sites[0].domain).toBe('found-domain.com');
  });

  it('suggests domain from slug when no domain exists', async () => {
    const site = createMockSite({
      primaryDomain: null,
      slug: 'london-tours',
      brand: null,
      domains: [],
      _count: { pages: 0, domains: 0 },
      createdAt: new Date(),
    });

    mockPrisma.site.findMany
      .mockResolvedValueOnce([site])
      .mockResolvedValueOnce([]);

    const response = await GET(createRequest('http://localhost/api/sites'));
    const data = await response.json();

    expect(data.sites[0].domain).toBeNull();
    expect(data.sites[0].suggestedDomain).toBe('london-tours.com');
  });

  it('returns 500 when database fails', async () => {
    mockPrisma.site.findMany.mockRejectedValue(new Error('DB error'));

    const response = await GET(createRequest('http://localhost/api/sites'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch sites');
  });
});

describe('POST /api/sites', () => {
  it('creates a new site with slug from name', async () => {
    const createdSite = createMockSite({
      name: 'London Food Tours',
      slug: 'london-food-tours',
      status: 'DRAFT',
    });
    mockPrisma.site.create.mockResolvedValue(createdSite);

    const response = await POST(
      createRequest('http://localhost/api/sites', {
        method: 'POST',
        body: JSON.stringify({ name: 'London Food Tours' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.site).toBeDefined();
    expect(mockPrisma.site.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'London Food Tours',
        slug: 'london-food-tours',
        status: 'DRAFT',
      }),
    });
  });

  it('returns 500 when creation fails', async () => {
    mockPrisma.site.create.mockRejectedValue(new Error('Unique constraint violation'));

    const response = await POST(
      createRequest('http://localhost/api/sites', {
        method: 'POST',
        body: JSON.stringify({ name: 'Duplicate Site' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create site');
  });
});
