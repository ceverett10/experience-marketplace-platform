import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

const { mockPrisma, mockAddJob } = vi.hoisted(() => {
  const mockPrisma = {
    micrositeConfig: {
      findUnique: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const mockAddJob = vi.fn();

  return { mockPrisma, mockAddJob };
});

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
  MicrositeEntityType: { SUPPLIER: 'SUPPLIER' },
}));

vi.mock('../queues/index.js', () => ({ addJob: mockAddJob }));

// ── Import under test ─────────────────────────────────────────────────────────

import {
  generateBlogPostForMicrosite,
  generateDailyBlogPostsForMicrosites,
} from './microsite-blog-generator';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MICROSITE_ID = 'ms-test-001';

const mockMicrosite = {
  id: MICROSITE_ID,
  siteName: 'Test Tours',
  supplierId: 'sup-001',
};

const mockMicrositeNoSupplier = {
  id: MICROSITE_ID,
  siteName: 'Test Tours',
  supplierId: null,
};

// ── generateBlogPostForMicrosite ──────────────────────────────────────────────

describe('generateBlogPostForMicrosite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddJob.mockResolvedValue('job-id-123');
  });

  it('queues CONTENT_GENERATE with micrositeId and contentType only — no topic in payload', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);

    const result = await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(result.postQueued).toBe(true);
    expect(result.error).toBeUndefined();

    const [jobType, payload] = mockAddJob.mock.calls[0]!;
    expect(jobType).toBe('CONTENT_GENERATE');
    expect(payload.micrositeId).toBe(MICROSITE_ID);
    expect(payload.contentType).toBe('blog');
    // targetKeyword must NOT be in the payload — worker generates it
    expect(payload.targetKeyword).toBeUndefined();
    // pageId must NOT be in the payload — worker creates the page
    expect(payload.pageId).toBeUndefined();
  });

  it('applies stagger delay when provided', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);

    await generateBlogPostForMicrosite(MICROSITE_ID, 30_000);

    const [, , options] = mockAddJob.mock.calls[0]!;
    expect(options).toEqual({ delay: 30_000 });
  });

  it('omits delay options when no stagger provided', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);

    await generateBlogPostForMicrosite(MICROSITE_ID);

    const [, , options] = mockAddJob.mock.calls[0]!;
    expect(options).toBeUndefined();
  });

  it('skips microsite with no linked supplier', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrositeNoSupplier);

    const result = await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(result.postQueued).toBe(false);
    expect(result.skippedReason).toBe('No linked supplier');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('skips when microsite not found', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(null);

    const result = await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(result.postQueued).toBe(false);
    expect(result.error).toBe('Microsite not found');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('returns error when addJob throws', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    mockAddJob.mockRejectedValue(new Error('Redis unavailable'));

    const result = await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(result.postQueued).toBe(false);
    expect(result.error).toBe('Redis unavailable');
  });

  it('returns error when addJob times out (8s)', async () => {
    vi.useFakeTimers();
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    // addJob never resolves — simulates Redis hang
    mockAddJob.mockReturnValue(new Promise(() => {}));

    const resultPromise = generateBlogPostForMicrosite(MICROSITE_ID);
    // Advance past 8s timeout and flush promise microtasks
    await vi.advanceTimersByTimeAsync(9_000);
    const result = await resultPromise;

    expect(result.postQueued).toBe(false);
    expect(result.error).toMatch(/timed out/);
    vi.useRealTimers();
  }, 30_000);

  it("does NOT update lastContentUpdate — that is the worker's responsibility", async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    mockAddJob.mockResolvedValue('job-id-123');

    await generateBlogPostForMicrosite(MICROSITE_ID);

    // No update call on the fanout side
    expect(mockPrisma.micrositeConfig.count).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastContentUpdate: expect.anything() }),
      })
    );
  });
});

// ── generateDailyBlogPostsForMicrosites ──────────────────────────────────────

describe('generateDailyBlogPostsForMicrosites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddJob.mockResolvedValue('job-id-123');
  });

  it('returns zero summary when no eligible microsites', async () => {
    mockPrisma.micrositeConfig.count.mockResolvedValue(0);

    const summary = await generateDailyBlogPostsForMicrosites();

    expect(summary.totalMicrosites).toBe(0);
    expect(summary.postsQueued).toBe(0);
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('queues up to MAX_DAILY_MICROSITES (500) from the eligible pool', async () => {
    // 2 eligible (pool smaller than cap) → queues all 2
    mockPrisma.micrositeConfig.count.mockResolvedValue(2);
    mockPrisma.micrositeConfig.findMany.mockResolvedValue([
      { id: 'ms-1', siteName: 'Site 1' },
      { id: 'ms-2', siteName: 'Site 2' },
    ]);
    mockPrisma.micrositeConfig.findUnique
      .mockResolvedValueOnce({ id: 'ms-1', siteName: 'Site 1', supplierId: 'sup-1' })
      .mockResolvedValueOnce({ id: 'ms-2', siteName: 'Site 2', supplierId: 'sup-2' });

    const summary = await generateDailyBlogPostsForMicrosites();

    expect(summary.postsQueued).toBe(2);
    expect(mockAddJob).toHaveBeenCalledTimes(2);
  });

  it('applies staggered 30s delays so jobs spread across the day', async () => {
    mockPrisma.micrositeConfig.count.mockResolvedValue(2);
    mockPrisma.micrositeConfig.findMany.mockResolvedValue([
      { id: 'ms-1', siteName: 'Site 1' },
      { id: 'ms-2', siteName: 'Site 2' },
    ]);
    mockPrisma.micrositeConfig.findUnique
      .mockResolvedValueOnce({ id: 'ms-1', siteName: 'Site 1', supplierId: 'sup-1' })
      .mockResolvedValueOnce({ id: 'ms-2', siteName: 'Site 2', supplierId: 'sup-2' });

    await generateDailyBlogPostsForMicrosites();

    const firstDelay = mockAddJob.mock.calls[0]![2]?.delay;
    const secondDelay = mockAddJob.mock.calls[1]![2]?.delay;
    // First job: 0ms stagger → no delay option passed (queued immediately)
    expect(firstDelay).toBeUndefined();
    expect(secondDelay).toBe(30_000);
  });

  it('counts skipped and errored microsites in summary', async () => {
    mockPrisma.micrositeConfig.count.mockResolvedValue(2);
    mockPrisma.micrositeConfig.findMany.mockResolvedValue([
      { id: 'ms-no-supplier', siteName: 'No Supplier' },
      { id: 'ms-good', siteName: 'Good Site' },
    ]);
    // First has no supplier (skip), second is good
    mockPrisma.micrositeConfig.findUnique
      .mockResolvedValueOnce({ id: 'ms-no-supplier', siteName: 'No Supplier', supplierId: null })
      .mockResolvedValueOnce({ id: 'ms-good', siteName: 'Good Site', supplierId: 'sup-1' });

    const summary = await generateDailyBlogPostsForMicrosites();

    expect(summary.skipped).toBe(1);
    expect(summary.postsQueued).toBe(1);
  });
});
