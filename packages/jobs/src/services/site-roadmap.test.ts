import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mock objects are available when vi.mock factories run (hoisted to top)
const { mockPrisma, mockAddJob } = vi.hoisted(() => {
  const mockPrisma = {
    domain: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    site: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    job: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    content: {
      count: vi.fn(),
    },
  };
  const mockAddJob = vi.fn().mockResolvedValue('mock-job-id');
  return { mockPrisma, mockAddJob };
});

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
  DomainStatus: {
    REGISTERING: 'REGISTERING',
    DNS_PENDING: 'DNS_PENDING',
    SSL_PENDING: 'SSL_PENDING',
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    SUSPENDED: 'SUSPENDED',
  },
  SiteStatus: {
    CREATING: 'CREATING',
    ACTIVE: 'ACTIVE',
    PAUSED: 'PAUSED',
  },
  JobType: {},
}));

vi.mock('../queues/index.js', () => ({
  addJob: mockAddJob,
}));

import { executeNextTasks } from './site-roadmap';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeNextTasks payload generation', () => {
  // Helper to set up a site where only specific jobs are completed
  function setupSiteWithCompletedJobs(completedTypes: string[]) {
    const jobs = completedTypes.map((type) => ({
      id: `job-${type}`,
      type,
      status: 'COMPLETED',
      queue: 'default',
      siteId: 'site-1',
    }));

    mockPrisma.job.findMany.mockResolvedValue(jobs);

    // All completed jobs have valid artifacts
    mockPrisma.content.count.mockResolvedValue(completedTypes.includes('CONTENT_GENERATE') ? 5 : 0);
    mockPrisma.site.findUnique.mockResolvedValue({
      id: 'site-1',
      primaryDomain: completedTypes.includes('SITE_DEPLOY') ? 'example.com' : null,
      gscVerified: completedTypes.includes('GSC_VERIFY'),
      gscPropertyUrl: completedTypes.includes('GSC_SETUP') ? 'sc-domain:example.com' : null,
      gscLastSyncedAt: null,
      seoConfig: null,
      domains: [
        {
          id: 'dom-1',
          domain: 'example.com',
          status: 'ACTIVE',
          cloudflareZoneId: 'zone-abc-123',
          registrar: 'cloudflare',
          registeredAt: new Date('2024-01-01'),
          verifiedAt: completedTypes.includes('DOMAIN_VERIFY') ? new Date('2024-01-02') : null,
          sslEnabled: completedTypes.includes('SSL_PROVISION'),
        },
      ],
    });

    mockPrisma.domain.findMany.mockResolvedValue([
      {
        id: 'dom-1',
        domain: 'example.com',
        status: 'ACTIVE',
        cloudflareZoneId: 'zone-abc-123',
        registrar: 'cloudflare',
        registeredAt: new Date('2024-01-01'),
        verifiedAt: completedTypes.includes('DOMAIN_VERIFY') ? new Date('2024-01-02') : null,
        sslEnabled: completedTypes.includes('SSL_PROVISION'),
      },
    ]);
  }

  describe('DOMAIN_VERIFY payload', () => {
    it('should provide domainId and verificationMethod from database', async () => {
      setupSiteWithCompletedJobs(['CONTENT_GENERATE', 'DOMAIN_REGISTER']);

      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'dom-1',
        domain: 'example.com',
        registrar: 'cloudflare',
        registeredAt: new Date('2024-01-01'),
      });

      await executeNextTasks('site-1');

      const domainVerifyCall = mockAddJob.mock.calls.find(
        (call: unknown[]) => call[0] === 'DOMAIN_VERIFY'
      );
      expect(domainVerifyCall).toBeDefined();
      expect(domainVerifyCall![1]).toEqual({
        domainId: 'dom-1',
        verificationMethod: 'dns',
      });
    });

    it('should block DOMAIN_VERIFY when no domain exists', async () => {
      setupSiteWithCompletedJobs(['CONTENT_GENERATE', 'DOMAIN_REGISTER']);
      mockPrisma.domain.findFirst.mockResolvedValue(null);

      const result = await executeNextTasks('site-1');

      const domainVerifyCall = mockAddJob.mock.calls.find(
        (call: unknown[]) => call[0] === 'DOMAIN_VERIFY'
      );
      expect(domainVerifyCall).toBeUndefined();

      const blockedDomainVerify = result.blocked.find((b) => b.includes('DOMAIN_VERIFY'));
      expect(blockedDomainVerify).toBeDefined();
      expect(blockedDomainVerify).toContain('no domain found');
    });
  });

  describe('SSL_PROVISION payload', () => {
    it('should provide domainId and provider from database', async () => {
      setupSiteWithCompletedJobs(['CONTENT_GENERATE', 'DOMAIN_REGISTER', 'DOMAIN_VERIFY']);

      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'dom-1',
        domain: 'example.com',
        registrar: 'cloudflare',
        verifiedAt: new Date('2024-01-02'),
      });

      await executeNextTasks('site-1');

      const sslCall = mockAddJob.mock.calls.find((call: unknown[]) => call[0] === 'SSL_PROVISION');
      expect(sslCall).toBeDefined();
      expect(sslCall![1]).toEqual({
        domainId: 'dom-1',
        provider: 'cloudflare',
      });
    });

    it('should use letsencrypt provider for non-cloudflare domains', async () => {
      setupSiteWithCompletedJobs(['CONTENT_GENERATE', 'DOMAIN_REGISTER', 'DOMAIN_VERIFY']);

      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'dom-1',
        domain: 'example.com',
        registrar: 'namecheap',
        verifiedAt: new Date('2024-01-02'),
      });

      await executeNextTasks('site-1');

      const sslCall = mockAddJob.mock.calls.find((call: unknown[]) => call[0] === 'SSL_PROVISION');
      expect(sslCall).toBeDefined();
      expect(sslCall![1]).toEqual({
        domainId: 'dom-1',
        provider: 'letsencrypt',
      });
    });

    it('should block SSL_PROVISION when no verified domain exists', async () => {
      setupSiteWithCompletedJobs(['CONTENT_GENERATE', 'DOMAIN_REGISTER', 'DOMAIN_VERIFY']);
      mockPrisma.domain.findFirst.mockResolvedValue(null);

      const result = await executeNextTasks('site-1');

      const sslCall = mockAddJob.mock.calls.find((call: unknown[]) => call[0] === 'SSL_PROVISION');
      expect(sslCall).toBeUndefined();

      const blockedSsl = result.blocked.find((b) => b.includes('SSL_PROVISION'));
      expect(blockedSsl).toBeDefined();
      expect(blockedSsl).toContain('no verified domain');
    });
  });

  describe('GSC_SETUP payload', () => {
    it('should provide siteId, domain, and cloudflareZoneId from database', async () => {
      setupSiteWithCompletedJobs([
        'CONTENT_GENERATE',
        'CONTENT_OPTIMIZE',
        'CONTENT_REVIEW',
        'DOMAIN_REGISTER',
        'DOMAIN_VERIFY',
        'SSL_PROVISION',
      ]);

      await executeNextTasks('site-1');

      const gscSetupCall = mockAddJob.mock.calls.find((call: unknown[]) => call[0] === 'GSC_SETUP');
      expect(gscSetupCall).toBeDefined();
      expect(gscSetupCall![1]).toEqual({
        siteId: 'site-1',
        domain: 'example.com',
        cloudflareZoneId: 'zone-abc-123',
      });
    });

    it('should block GSC_SETUP when no active domain exists', async () => {
      setupSiteWithCompletedJobs([
        'CONTENT_GENERATE',
        'CONTENT_OPTIMIZE',
        'CONTENT_REVIEW',
        'DOMAIN_REGISTER',
        'DOMAIN_VERIFY',
        'SSL_PROVISION',
      ]);

      // Override the site to have no active domains
      mockPrisma.site.findUnique.mockResolvedValue({
        id: 'site-1',
        primaryDomain: null,
        gscVerified: false,
        gscPropertyUrl: null,
        gscLastSyncedAt: null,
        seoConfig: null,
        domains: [],
      });

      const result = await executeNextTasks('site-1');

      const gscSetupCall = mockAddJob.mock.calls.find((call: unknown[]) => call[0] === 'GSC_SETUP');
      expect(gscSetupCall).toBeUndefined();

      const blockedGsc = result.blocked.find((b) => b.includes('GSC_SETUP'));
      expect(blockedGsc).toBeDefined();
      expect(blockedGsc).toContain('no active domain');
    });
  });

  describe('GSC_VERIFY payload', () => {
    it('should provide siteId, domain, and cloudflareZoneId from database', async () => {
      setupSiteWithCompletedJobs([
        'CONTENT_GENERATE',
        'CONTENT_OPTIMIZE',
        'CONTENT_REVIEW',
        'DOMAIN_REGISTER',
        'DOMAIN_VERIFY',
        'SSL_PROVISION',
        'GSC_SETUP',
      ]);

      await executeNextTasks('site-1');

      const gscVerifyCall = mockAddJob.mock.calls.find(
        (call: unknown[]) => call[0] === 'GSC_VERIFY'
      );
      expect(gscVerifyCall).toBeDefined();
      expect(gscVerifyCall![1]).toEqual({
        siteId: 'site-1',
        domain: 'example.com',
        cloudflareZoneId: 'zone-abc-123',
      });
    });
  });

  describe('standard payloads (unchanged)', () => {
    it('should provide correct CONTENT_GENERATE payload', async () => {
      setupSiteWithCompletedJobs([]);

      await executeNextTasks('site-1');

      const contentCall = mockAddJob.mock.calls.find(
        (call: unknown[]) => call[0] === 'CONTENT_GENERATE'
      );
      expect(contentCall).toBeDefined();
      expect(contentCall![1]).toEqual({
        siteId: 'site-1',
        contentType: 'destination',
      });
    });

    it('should provide correct DOMAIN_REGISTER payload', async () => {
      setupSiteWithCompletedJobs([]);

      await executeNextTasks('site-1');

      const domainCall = mockAddJob.mock.calls.find(
        (call: unknown[]) => call[0] === 'DOMAIN_REGISTER'
      );
      expect(domainCall).toBeDefined();
      expect(domainCall![1]).toEqual({
        siteId: 'site-1',
        registrar: 'cloudflare',
        autoRenew: true,
      });
    });
  });
});
