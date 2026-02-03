import { vi, beforeEach } from 'vitest';

/**
 * Mock Prisma Client for testing admin API routes.
 *
 * Usage in tests:
 *   import { mockPrisma, resetMockPrisma } from '@/test/mocks/prisma';
 *   vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
 *
 * Then in each test:
 *   mockPrisma.site.findUnique.mockResolvedValue({ ... });
 */

function createMockModel() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

export const mockPrisma = {
  site: createMockModel(),
  brand: createMockModel(),
  domain: createMockModel(),
  page: createMockModel(),
  content: createMockModel(),
  job: createMockModel(),
  booking: createMockModel(),
  seoOpportunity: createMockModel(),
  performanceMetric: createMockModel(),
  aBTest: createMockModel(),
  aBTestVariant: createMockModel(),
  manualTask: createMockModel(),
  platformSettings: createMockModel(),
  errorLog: createMockModel(),
  backlink: createMockModel(),
  linkOpportunity: createMockModel(),
  linkableAsset: createMockModel(),
  $transaction: vi.fn(),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
};

/**
 * Reset all mocks on the prisma object. Call in beforeEach().
 */
export function resetMockPrisma() {
  for (const [key, value] of Object.entries(mockPrisma)) {
    if (key.startsWith('$') && typeof value === 'function' && 'mockReset' in value) {
      (value as ReturnType<typeof vi.fn>).mockReset();
    } else if (typeof value === 'object' && value !== null) {
      for (const fn of Object.values(value)) {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
  }
}
