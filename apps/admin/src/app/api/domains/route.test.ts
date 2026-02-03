import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';
import { mockAddJob } from '@/test/mocks/jobs';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@experience-marketplace/jobs', () => ({
  addJob: mockAddJob,
}));

import { GET, POST } from './route';

function createGetRequest(params?: Record<string, string>) {
  const url = new URL('http://localhost/api/domains');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new Request(url.toString());
}

function createPostRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/domains', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const mockDomain = {
  id: 'dom-1',
  domain: 'london-tours.com',
  status: 'ACTIVE',
  registrar: 'cloudflare',
  registeredAt: new Date('2024-01-01'),
  expiresAt: new Date('2025-01-01'),
  sslEnabled: true,
  sslExpiresAt: null,
  dnsConfigured: true,
  cloudflareZoneId: 'zone-123',
  autoRenew: true,
  registrationCost: { toNumber: () => 9.77 },
  site: { id: 'site-1', name: 'London Tours', slug: 'london-tours' },
};

describe('GET /api/domains', () => {
  it('returns registered domains and suggested domains', async () => {
    mockPrisma.domain.findMany
      .mockResolvedValueOnce([mockDomain]) // registered domains
      .mockResolvedValueOnce([mockDomain]); // all domains for stats

    mockPrisma.site.findMany.mockResolvedValue([
      {
        id: 'site-2',
        name: 'Paris Adventures',
        slug: 'paris-adventures',
        createdAt: new Date(),
        jobs: [],
      },
    ]);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.domains.length).toBe(2); // 1 registered + 1 suggested
    expect(data.domains[0].domain).toBe('london-tours.com');
    expect(data.domains[0].isSuggested).toBe(false);
    expect(data.domains[1].domain).toBe('paris-adventures.com');
    expect(data.domains[1].isSuggested).toBe(true);
  });

  it('returns stats with correct counts', async () => {
    mockPrisma.domain.findMany
      .mockResolvedValueOnce([mockDomain]) // registered domains
      .mockResolvedValueOnce([
        { ...mockDomain, status: 'ACTIVE', sslEnabled: true },
        { ...mockDomain, id: 'dom-2', status: 'DNS_PENDING', sslEnabled: false },
      ]); // all domains for stats

    mockPrisma.site.findMany.mockResolvedValue([]);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(data.stats.active).toBe(1);
    expect(data.stats.pending).toBe(1);
    expect(data.stats.sslEnabled).toBe(1);
  });

  it('filters by status', async () => {
    mockPrisma.domain.findMany
      .mockResolvedValueOnce([mockDomain]) // registered with filter
      .mockResolvedValueOnce([mockDomain]); // all for stats

    mockPrisma.site.findMany.mockResolvedValue([]);

    const response = await GET(createGetRequest({ status: 'ACTIVE' }));
    const data = await response.json();

    expect(mockPrisma.domain.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE' },
      })
    );
    expect(response.status).toBe(200);
  });

  it('uses domain from job payload when available', async () => {
    mockPrisma.domain.findMany
      .mockResolvedValueOnce([])  // no registered domains
      .mockResolvedValueOnce([]); // all domains for stats

    mockPrisma.site.findMany.mockResolvedValue([
      {
        id: 'site-3',
        name: 'Custom Domain Site',
        slug: 'custom-domain',
        createdAt: new Date(),
        jobs: [
          {
            id: 'job-1',
            status: 'COMPLETED',
            payload: { domain: 'my-custom-domain.com' },
            createdAt: new Date(),
          },
        ],
      },
    ]);

    const response = await GET(createGetRequest());
    const data = await response.json();

    const suggested = data.domains.find((d: { isSuggested: boolean }) => d.isSuggested);
    expect(suggested.domain).toBe('my-custom-domain.com');
  });

  it('returns 500 when database query fails', async () => {
    mockPrisma.domain.findMany.mockRejectedValue(new Error('DB error'));

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch domains');
  });
});

describe('POST /api/domains', () => {
  it('queues a single domain registration', async () => {
    const response = await POST(
      createPostRequest({
        domain: 'new-site.com',
        siteId: 'site-1',
        registrar: 'cloudflare',
        autoRenew: true,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Domain registration queued for new-site.com');
    expect(mockAddJob).toHaveBeenCalledWith('DOMAIN_REGISTER', {
      siteId: 'site-1',
      domain: 'new-site.com',
      registrar: 'cloudflare',
      autoRenew: true,
    });
  });

  it('queues missing domain registrations for all sites without domains', async () => {
    mockPrisma.site.findMany.mockResolvedValue([
      { id: 'site-1', name: 'Site A', slug: 'site-a' },
      { id: 'site-2', name: 'Site B', slug: 'site-b' },
    ]);

    const response = await POST(createPostRequest({ action: 'queueMissing' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.queued.length).toBe(2);
    expect(mockAddJob).toHaveBeenCalledTimes(2);
    expect(mockAddJob).toHaveBeenCalledWith('DOMAIN_REGISTER', expect.objectContaining({
      siteId: 'site-1',
      domain: 'site-a.com',
    }));
  });

  it('returns 400 when domain and siteId missing for default action', async () => {
    const response = await POST(createPostRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('domain and siteId are required');
  });

  it('returns 500 when registration fails', async () => {
    mockAddJob.mockRejectedValue(new Error('Queue error'));

    const response = await POST(
      createPostRequest({ domain: 'test.com', siteId: 'site-1' })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to register domain');
  });
});
