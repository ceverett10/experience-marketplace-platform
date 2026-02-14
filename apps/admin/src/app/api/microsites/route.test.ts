import { describe, it, expect, vi } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { GET } from './route';

function createRequest(url: string) {
  return new Request(url);
}

const mockSupplierMicrosite = {
  id: 'ms-supplier-1',
  siteName: 'Adventure Tours',
  subdomain: 'adventure-tours',
  parentDomain: 'experiencess.com',
  fullDomain: 'adventure-tours.experiencess.com',
  entityType: 'SUPPLIER',
  status: 'ACTIVE',
  layoutType: 'CATALOG',
  cachedProductCount: 25,
  pageViews: 100,
  createdAt: new Date('2026-01-15'),
  supplier: {
    name: 'Adventure Co',
    productCount: 25,
    cities: ['London', 'Paris'],
    categories: ['Tours'],
    rating: 4.5,
  },
  opportunity: null,
  product: null,
};

const mockOpportunityMicrosite = {
  id: 'ms-opp-1',
  siteName: 'Luxury Yoga Retreats',
  subdomain: 'luxury-yoga-retreats',
  parentDomain: 'experiencess.com',
  fullDomain: 'luxury-yoga-retreats.experiencess.com',
  entityType: 'OPPORTUNITY',
  status: 'ACTIVE',
  layoutType: 'MARKETPLACE',
  cachedProductCount: 100,
  pageViews: 50,
  createdAt: new Date('2026-02-01'),
  supplier: null,
  opportunity: {
    keyword: 'luxury yoga retreats bali',
    priorityScore: 62,
    searchVolume: 1200,
    location: 'Bali, Indonesia',
    niche: 'wellness',
  },
  product: null,
};

const mockProductMicrosite = {
  id: 'ms-prod-1',
  siteName: 'Thames River Cruise',
  subdomain: 'thames-river-cruise',
  parentDomain: 'experiencess.com',
  fullDomain: 'thames-river-cruise.experiencess.com',
  entityType: 'PRODUCT',
  status: 'GENERATING',
  layoutType: 'PRODUCT_SPOTLIGHT',
  cachedProductCount: 1,
  pageViews: 0,
  createdAt: new Date('2026-02-10'),
  supplier: null,
  opportunity: null,
  product: {
    title: 'Thames River Evening Cruise',
    priceFrom: 29.99,
    city: 'London',
    rating: 4.8,
  },
};

function setupDefaultMocks(microsites = [mockSupplierMicrosite, mockOpportunityMicrosite, mockProductMicrosite]) {
  mockPrisma.micrositeConfig.count.mockResolvedValue(microsites.length);
  mockPrisma.micrositeConfig.findMany.mockResolvedValue(microsites);
  mockPrisma.micrositeConfig.groupBy
    .mockResolvedValueOnce([
      { entityType: 'SUPPLIER', _count: { id: 10 } },
      { entityType: 'OPPORTUNITY', _count: { id: 5 } },
      { entityType: 'PRODUCT', _count: { id: 3 } },
    ])
    .mockResolvedValueOnce([
      { entityType: 'SUPPLIER', _count: { id: 8 } },
      { entityType: 'OPPORTUNITY', _count: { id: 3 } },
      { entityType: 'PRODUCT', _count: { id: 1 } },
    ]);
}

describe('GET /api/microsites', () => {
  it('returns all microsites with all entity types', async () => {
    setupDefaultMocks();

    const response = await GET(createRequest('http://localhost/api/microsites'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.microsites).toHaveLength(3);

    // Verify supplier microsite
    const supplier = data.microsites.find((m: Record<string, unknown>) => m['entityType'] ==='SUPPLIER');
    expect(supplier.sourceName).toBe('Adventure Co');
    expect(supplier.keyMetric).toEqual({ label: 'Products', value: 25 });
    expect(supplier.location).toBe('London, Paris');

    // Verify opportunity microsite
    const opp = data.microsites.find((m: Record<string, unknown>) => m['entityType'] ==='OPPORTUNITY');
    expect(opp.sourceName).toBe('luxury yoga retreats bali');
    expect(opp.keyMetric).toEqual({ label: 'Score', value: 62 });
    expect(opp.location).toBe('Bali, Indonesia');

    // Verify product microsite
    const prod = data.microsites.find((m: Record<string, unknown>) => m['entityType'] ==='PRODUCT');
    expect(prod.sourceName).toBe('Thames River Evening Cruise');
    expect(prod.keyMetric).toEqual({ label: 'Price', value: '£29.99' });
    expect(prod.location).toBe('London');
  });

  it('returns summary counts by entity type', async () => {
    setupDefaultMocks();

    const response = await GET(createRequest('http://localhost/api/microsites'));
    const data = await response.json();

    expect(data.summary).toEqual({
      SUPPLIER: { total: 10, active: 8 },
      OPPORTUNITY: { total: 5, active: 3 },
      PRODUCT: { total: 3, active: 1 },
    });
  });

  it('filters by entityType', async () => {
    setupDefaultMocks([mockOpportunityMicrosite]);

    await GET(createRequest('http://localhost/api/microsites?entityType=OPPORTUNITY'));

    expect(mockPrisma.micrositeConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entityType: 'OPPORTUNITY' }),
      })
    );
  });

  it('filters by status', async () => {
    setupDefaultMocks([mockSupplierMicrosite]);

    await GET(createRequest('http://localhost/api/microsites?status=ACTIVE'));

    expect(mockPrisma.micrositeConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      })
    );
  });

  it('searches across siteName, supplier name, keyword, and product title', async () => {
    setupDefaultMocks([]);

    await GET(createRequest('http://localhost/api/microsites?search=yoga'));

    expect(mockPrisma.micrositeConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { siteName: { contains: 'yoga', mode: 'insensitive' } },
            { supplier: { name: { contains: 'yoga', mode: 'insensitive' } } },
            { opportunity: { keyword: { contains: 'yoga', mode: 'insensitive' } } },
            { product: { title: { contains: 'yoga', mode: 'insensitive' } } },
          ],
        }),
      })
    );
  });

  it('returns correct pagination', async () => {
    setupDefaultMocks();

    const response = await GET(createRequest('http://localhost/api/microsites?page=2&pageSize=10'));
    const data = await response.json();

    expect(data.pagination).toEqual({
      page: 2,
      pageSize: 10,
      totalCount: 3,
      totalPages: 1,
    });

    expect(mockPrisma.micrositeConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      })
    );
  });

  it('returns empty results gracefully', async () => {
    mockPrisma.micrositeConfig.count.mockResolvedValue(0);
    mockPrisma.micrositeConfig.findMany.mockResolvedValue([]);
    mockPrisma.micrositeConfig.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET(createRequest('http://localhost/api/microsites'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.microsites).toEqual([]);
    expect(data.summary).toEqual({
      SUPPLIER: { total: 0, active: 0 },
      OPPORTUNITY: { total: 0, active: 0 },
      PRODUCT: { total: 0, active: 0 },
    });
  });

  it('returns 500 on database error', async () => {
    mockPrisma.micrositeConfig.count.mockRejectedValue(new Error('DB connection failed'));

    const response = await GET(createRequest('http://localhost/api/microsites'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('DB connection failed');
  });

  it('falls back to siteName when no related entity', async () => {
    const orphanMicrosite = {
      ...mockSupplierMicrosite,
      id: 'ms-orphan',
      supplier: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setupDefaultMocks([orphanMicrosite as any]);

    const response = await GET(createRequest('http://localhost/api/microsites'));
    const data = await response.json();

    expect(data.microsites[0].sourceName).toBe('Adventure Tours');
  });
});
