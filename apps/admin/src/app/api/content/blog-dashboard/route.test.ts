import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockFindMany = vi.fn();
const mockPageCount = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    page: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockPageCount(...args),
    },
    micrositeConfig: { findMany: vi.fn().mockResolvedValue([]) },
    site: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryRaw.mockResolvedValue([]);
  mockFindMany.mockResolvedValue([]);
  mockPageCount.mockResolvedValue(0);
});

describe('GET /api/content/blog-dashboard', () => {
  it('returns pipeline counts, active jobs, published posts, and failures', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { status: 'COMPLETED', count: BigInt(42) },
        { status: 'RUNNING', count: BigInt(1) },
      ])
      .mockResolvedValueOnce([]) // active jobs
      .mockResolvedValueOnce([]); // failures

    mockPageCount.mockResolvedValueOnce(100); // publishedToday (from Page table)
    mockFindMany.mockResolvedValueOnce([]); // recently published pages

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // COMPLETED should use the higher of Job count (42) vs Page count (100)
    expect(data.pipeline.COMPLETED).toBe(100);
    expect(data.pipeline.RUNNING).toBe(1);
    expect(data.pipeline.PENDING).toBe(0);
    expect(data.activeJobs).toEqual([]);
    expect(data.recentlyPublished).toEqual([]);
    expect(data.recentFailures).toEqual([]);
  });

  it('resolves microsite names for active jobs', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ status: 'RUNNING', count: BigInt(1) }])
      .mockResolvedValueOnce([
        {
          id: 'job-1',
          status: 'RUNNING',
          payload: { micrositeId: 'ms-1', contentType: 'blog' },
          attempts: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]); // failures

    mockPageCount.mockResolvedValueOnce(0); // publishedToday
    mockFindMany.mockResolvedValueOnce([]); // recently published

    // Mock micrositeConfig findMany (accessed via the prisma mock)
    const { prisma } = await import('@/lib/prisma');
    (prisma.micrositeConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'ms-1', siteName: 'Test Microsite' },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.activeJobs).toHaveLength(1);
    expect(data.activeJobs[0].micrositeName).toBe('Test Microsite');
    expect(data.activeJobs[0].status).toBe('RUNNING');
  });

  it('returns 500 on database error', async () => {
    mockQueryRaw.mockRejectedValue(new Error('DB connection failed'));

    const response = await GET();

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to fetch blog dashboard');
  });
});
