import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma, resetMockPrisma } from '@/test/mocks/prisma';

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { GET } from './route';

function makeRequest(query = ''): import('next/server').NextRequest {
  const url = `http://localhost/api/contact-messages${query ? `?${query}` : ''}`;
  return new Request(url) as unknown as import('next/server').NextRequest;
}

const SAMPLE_MESSAGE = {
  id: 'cm_1',
  name: 'Jane',
  email: 'jane@example.com',
  phone: '+44 7700 900000',
  subject: 'Booking enquiry',
  message: 'Hello',
  domain: 'example.com',
  status: 'NEW' as const,
  createdAt: new Date('2026-04-30T00:00:00Z'),
  updatedAt: new Date('2026-04-30T00:00:00Z'),
  site: { id: 's1', name: 'Site 1', primaryDomain: 'site1.com' },
  microsite: null,
};

function setupMocks() {
  // contactMessage.findMany is called twice (messages, distinctSubjects).
  // Returning a record with `subject` field works for both since the second
  // call just maps `.subject` from each result.
  mockPrisma.contactMessage.findMany.mockResolvedValue([SAMPLE_MESSAGE]);
  // count is called twice (filtered total, newThisWeek)
  mockPrisma.contactMessage.count.mockResolvedValue(1);
  mockPrisma.site.findMany.mockResolvedValue([{ id: 's1', name: 'Site 1' }]);
  mockPrisma.contactMessage.groupBy.mockResolvedValue([
    { status: 'NEW', _count: { _all: 5 } },
    { status: 'READ', _count: { _all: 2 } },
    { status: 'REPLIED', _count: { _all: 1 } },
    { status: 'ARCHIVED', _count: { _all: 0 } },
  ]);
}

describe('GET /api/contact-messages', () => {
  beforeEach(() => {
    resetMockPrisma();
    setupMocks();
  });

  it('returns 200 with messages, pagination, stats, and filters', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].id).toBe('cm_1');
    expect(data.messages[0].site.domain).toBe('site1.com');
    expect(data.pagination).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });
    expect(data.stats.total).toBe(8);
    expect(data.stats.new).toBe(5);
    expect(data.stats.replied).toBe(1);
    expect(data.filters.statuses).toContain('NEW');
    expect(data.filters.subjects).toContain('Booking enquiry');
  });

  it('builds where clause from status, siteId, subject, and search', async () => {
    await GET(makeRequest('status=READ&siteId=s1&subject=Other&search=jane'));

    const call = mockPrisma.contactMessage.findMany.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call.where.status).toBe('READ');
    expect(call.where.siteId).toBe('s1');
    expect(call.where.subject).toBe('Other');
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR.length).toBeGreaterThan(0);
  });

  it('treats status=ALL as no filter', async () => {
    await GET(makeRequest('status=ALL'));
    const call = mockPrisma.contactMessage.findMany.mock.calls[0]?.[0];
    expect(call.where.status).toBeUndefined();
  });

  it('rejects an invalid status string (does not pass it through)', async () => {
    await GET(makeRequest('status=INVALID_STATUS'));
    const call = mockPrisma.contactMessage.findMany.mock.calls[0]?.[0];
    expect(call.where.status).toBeUndefined();
  });

  it('renders microsite source when message is from a microsite', async () => {
    mockPrisma.contactMessage.findMany.mockResolvedValue([
      {
        ...SAMPLE_MESSAGE,
        site: null,
        microsite: { id: 'ms1', subdomain: 'foo', parentDomain: 'experiencess.com' },
      },
    ]);

    const response = await GET(makeRequest());
    const data = await response.json();
    expect(data.messages[0].microsite.domain).toBe('foo.experiencess.com');
    expect(data.messages[0].site).toBeNull();
  });

  it('caps limit at 200', async () => {
    await GET(makeRequest('limit=999'));
    const call = mockPrisma.contactMessage.findMany.mock.calls[0]?.[0];
    expect(call.take).toBe(200);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.contactMessage.findMany.mockRejectedValue(new Error('boom'));
    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to fetch contact messages');
  });
});
