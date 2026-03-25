import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

const { mockPrisma, mockAddJob, mockGenerateDailyBlogTopic } = vi.hoisted(() => {
  const mockPrisma = {
    micrositeConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    page: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  const mockAddJob = vi.fn();
  const mockGenerateDailyBlogTopic = vi.fn();

  return { mockPrisma, mockAddJob, mockGenerateDailyBlogTopic };
});

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
  PageType: { BLOG: 'BLOG' },
  PageStatus: { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' },
  MicrositeEntityType: { SUPPLIER: 'SUPPLIER' },
}));

vi.mock('../queues/index.js', () => ({ addJob: mockAddJob }));

vi.mock('./blog-topics.js', () => ({ generateDailyBlogTopic: mockGenerateDailyBlogTopic }));

// ── Import under test ─────────────────────────────────────────────────────────

import { generateBlogPostForMicrosite } from './microsite-blog-generator';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MICROSITE_ID = 'ms-test-001';

const mockMicrosite = {
  id: MICROSITE_ID,
  siteName: 'Test Tours',
  fullDomain: 'test-tours.experiencess.com',
  supplier: {
    id: 'sup-001',
    name: 'Test Supplier',
    description: 'A test supplier',
    cities: ['London'],
    categories: ['Food Tours'],
  },
};

const mockProducts = [
  {
    title: 'London Food Tour',
    shortDescription: 'A delicious tour',
    city: 'London',
    categories: ['Food Tours'],
  },
];

const mockTopic = {
  title: 'Best Food Tours in London 2025',
  slug: 'best-food-tours-london-2025',
  targetKeyword: 'food tours london',
  secondaryKeywords: ['london food experiences', 'guided food tours'],
  contentType: 'guide' as const,
  estimatedSearchVolume: 'high' as const,
  intent: 'commercial' as const,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAddJob.mockResolvedValue('job-id-123');
  mockPrisma.micrositeConfig.update.mockResolvedValue({});
});

describe('generateBlogPostForMicrosite — new fanout flow', () => {
  it('queues CONTENT_GENERATE without a pageId', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);
    mockPrisma.page.findMany.mockResolvedValue([]);
    mockGenerateDailyBlogTopic.mockResolvedValue(mockTopic);

    const result = await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(result.postQueued).toBe(true);
    expect(result.topicGenerated).toBe(true);

    // CRITICAL: no pageId in the job payload
    const [jobType, payload] = mockAddJob.mock.calls[0]!;
    expect(jobType).toBe('CONTENT_GENERATE');
    expect(payload.pageId).toBeUndefined();
    expect(payload.micrositeId).toBe(MICROSITE_ID);
    expect(payload.contentType).toBe('blog');
    expect(payload.targetKeyword).toBe('food tours london');
  });

  it('does NOT create a page stub in the DB', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);
    mockPrisma.page.findMany.mockResolvedValue([]);
    mockGenerateDailyBlogTopic.mockResolvedValue(mockTopic);

    await generateBlogPostForMicrosite(MICROSITE_ID);

    // page.create must never be called — stubs are gone
    expect(mockPrisma.page.create).not.toHaveBeenCalled();
    expect(mockPrisma.page.findFirst).not.toHaveBeenCalled();
  });

  it('updates lastContentUpdate after queuing', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);
    mockPrisma.page.findMany.mockResolvedValue([]);
    mockGenerateDailyBlogTopic.mockResolvedValue(mockTopic);

    await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(mockPrisma.micrositeConfig.update).toHaveBeenCalledWith({
      where: { id: MICROSITE_ID },
      data: { lastContentUpdate: expect.any(Date) },
    });
  });

  it('applies stagger delay to the queued job', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);
    mockPrisma.page.findMany.mockResolvedValue([]);
    mockGenerateDailyBlogTopic.mockResolvedValue(mockTopic);

    await generateBlogPostForMicrosite(MICROSITE_ID, 30_000);

    const [, , options] = mockAddJob.mock.calls[0]!;
    expect(options).toEqual({ delay: 30_000 });
  });

  it('skips microsite with no supplier', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue({
      ...mockMicrosite,
      supplier: null,
    });

    const result = await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(result.postQueued).toBe(false);
    expect(result.skippedReason).toBe('No linked supplier');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('skips microsite with no products', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    mockPrisma.product.findMany.mockResolvedValue([]);

    const result = await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(result.postQueued).toBe(false);
    expect(result.skippedReason).toBe('Supplier has no products');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('skips when topic generation returns null', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);
    mockPrisma.page.findMany.mockResolvedValue([]);
    mockGenerateDailyBlogTopic.mockResolvedValue(null);

    const result = await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(result.postQueued).toBe(false);
    expect(result.skippedReason).toBe('No topic generated');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('only reads PUBLISHED pages for existing topics (ignores old DRAFTs)', async () => {
    mockPrisma.micrositeConfig.findUnique.mockResolvedValue(mockMicrosite);
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);
    mockPrisma.page.findMany.mockResolvedValue([]);
    mockGenerateDailyBlogTopic.mockResolvedValue(mockTopic);

    await generateBlogPostForMicrosite(MICROSITE_ID);

    expect(mockPrisma.page.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PUBLISHED' }),
      })
    );
  });
});
