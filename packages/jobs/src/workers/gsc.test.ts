import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { GscSetupPayload } from '../types';

// Use vi.hoisted so mock objects are available when vi.mock factories run
const { mockPrisma, mockGscClient, mockIsGSCConfigured } = vi.hoisted(() => {
  const mockPrisma = {
    site: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const mockGscClient = {
    isVerified: vi.fn(),
    verifySite: vi.fn(),
    addSite: vi.fn(),
    submitSitemap: vi.fn(),
    registerSite: vi.fn(),
  };
  const mockIsGSCConfigured = vi.fn().mockReturnValue(true);
  return { mockPrisma, mockGscClient, mockIsGSCConfigured };
});

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('../services/gsc-client', () => ({
  getGSCClient: () => mockGscClient,
  isGSCConfigured: mockIsGSCConfigured,
}));

vi.mock('../services/cloudflare-dns', () => ({
  CloudflareDNSService: vi.fn().mockImplementation(() => ({
    addGoogleVerificationRecord: vi.fn(),
  })),
}));

vi.mock('../queues', () => ({
  addJob: vi.fn(),
}));

vi.mock('../services/pause-control', () => ({
  canExecuteAutonomousOperation: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { handleGscVerify, handleGscSetup } from './gsc';

function createMockJob(data: GscSetupPayload): Job<GscSetupPayload> {
  return {
    id: 'test-job-1',
    data,
    attemptsMade: 0,
  } as unknown as Job<GscSetupPayload>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsGSCConfigured.mockReturnValue(true);
});

describe('handleGscVerify', () => {
  const jobData: GscSetupPayload = {
    siteId: 'site-1',
    domain: 'example.com',
    cloudflareZoneId: 'zone-123',
  };

  it('should return success when site is already verified in database', async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: 'site-1',
      gscVerified: true,
      gscPropertyUrl: 'sc-domain:example.com',
    });

    const result = await handleGscVerify(createMockJob(jobData));

    expect(result.success).toBe(true);
    expect(result.data?.alreadyVerified).toBe(true);
    expect(mockGscClient.isVerified).not.toHaveBeenCalled();
  });

  it('should verify via GSC API when not verified in DB but verified externally', async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: 'site-1',
      gscVerified: false,
    });
    mockPrisma.site.update.mockResolvedValue({});
    mockGscClient.isVerified.mockResolvedValue(true);

    const result = await handleGscVerify(createMockJob(jobData));

    expect(result.success).toBe(true);
    expect(result.data?.verifiedExternally).toBe(true);
    expect(mockGscClient.isVerified).toHaveBeenCalledWith('example.com');
    expect(mockPrisma.site.update).toHaveBeenCalledWith({
      where: { id: 'site-1' },
      data: expect.objectContaining({
        gscVerified: true,
        gscPropertyUrl: 'sc-domain:example.com',
      }),
    });
  });

  it('should attempt verification when not verified anywhere', async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: 'site-1',
      gscVerified: false,
    });
    mockPrisma.site.update.mockResolvedValue({});
    mockGscClient.isVerified.mockResolvedValue(false);
    mockGscClient.verifySite.mockResolvedValue({ verified: true, owners: ['owner@test.com'] });
    mockGscClient.addSite.mockResolvedValue(undefined);
    mockGscClient.submitSitemap.mockResolvedValue(undefined);

    const result = await handleGscVerify(createMockJob(jobData));

    expect(result.success).toBe(true);
    expect(mockGscClient.verifySite).toHaveBeenCalledWith('example.com');
    expect(mockGscClient.addSite).toHaveBeenCalledWith('sc-domain:example.com');
    expect(mockGscClient.submitSitemap).toHaveBeenCalledWith(
      'sc-domain:example.com',
      'https://example.com/sitemap.xml'
    );
    expect(mockPrisma.site.update).toHaveBeenCalledWith({
      where: { id: 'site-1' },
      data: expect.objectContaining({
        gscVerified: true,
        gscPropertyUrl: 'sc-domain:example.com',
      }),
    });
  });

  it('should return retryable error when verification fails', async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: 'site-1',
      gscVerified: false,
    });
    mockGscClient.isVerified.mockResolvedValue(false);
    mockGscClient.verifySite.mockResolvedValue({ verified: false, owners: [] });

    const result = await handleGscVerify(createMockJob(jobData));

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toContain('verification failed');
  });

  it('should return error when GSC is not configured', async () => {
    mockIsGSCConfigured.mockReturnValue(false);

    const result = await handleGscVerify(createMockJob(jobData));

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
    expect(result.errorCategory).toBe('configuration');
  });

  it('should return error when site not found', async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);

    const result = await handleGscVerify(createMockJob(jobData));

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should handle GSC API errors gracefully', async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: 'site-1',
      gscVerified: false,
    });
    mockGscClient.isVerified.mockRejectedValue(new Error('API rate limit exceeded'));

    const result = await handleGscVerify(createMockJob(jobData));

    expect(result.success).toBe(false);
    expect(result.error).toBe('API rate limit exceeded');
  });
});

describe('handleGscSetup', () => {
  it('should return error when GSC is not configured', async () => {
    mockIsGSCConfigured.mockReturnValue(false);

    const result = await handleGscSetup(
      createMockJob({
        siteId: 'site-1',
        domain: 'example.com',
        cloudflareZoneId: 'zone-123',
      })
    );

    expect(result.success).toBe(false);
    expect(result.errorCategory).toBe('configuration');
  });

  it('should return error when site not found', async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);

    const result = await handleGscSetup(
      createMockJob({
        siteId: 'site-1',
        domain: 'example.com',
        cloudflareZoneId: 'zone-123',
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
