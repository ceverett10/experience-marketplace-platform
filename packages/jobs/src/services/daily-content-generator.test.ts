import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma and other dependencies
const { mockPrisma, mockAddJob } = vi.hoisted(() => {
  const mockPrisma = {
    site: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    page: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  const mockAddJob = vi.fn().mockResolvedValue('mock-job-id');
  return { mockPrisma, mockAddJob };
});

vi.mock('@experience-marketplace/database', () => ({
  prisma: mockPrisma,
  PageType: {
    BLOG: 'BLOG',
    LANDING: 'LANDING',
    CATEGORY: 'CATEGORY',
    DESTINATION: 'DESTINATION',
  },
  PageStatus: {
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
  },
}));

vi.mock('../queues/index.js', () => ({
  addJob: mockAddJob,
}));

import {
  generateComparisonPageForSite,
  generateLocalGuideForSite,
  generateSeasonalContentForSite,
} from './daily-content-generator';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Blog Slug Convention', () => {
  /**
   * CRITICAL: Blog slugs MUST include the 'blog/' prefix.
   *
   * The frontend route /blog/[slug] expects slugs to be stored WITH the prefix:
   * - Stored slug: 'blog/my-post'
   * - URL accessed: /blog/my-post
   * - Frontend lookup: prepends 'blog/' to URL param → 'blog/my-post'
   *
   * If slugs are stored WITHOUT the prefix, the frontend will look for
   * 'blog/my-post' but find nothing, resulting in 404 errors.
   */

  describe('generateComparisonPageForSite', () => {
    it('should create blog slugs with blog/ prefix', async () => {
      const mockSite = {
        id: 'site-123',
        name: 'Test Food Tours',
        niche: 'food tours',
        location: 'London',
        destinations: ['London', 'Paris'],
        seoConfig: {
          comparisons: {
            pairs: [['Walking Tours', 'Bus Tours']],
          },
        },
        brandIdentity: {},
        pages: [],
      };

      mockPrisma.site.findUnique.mockResolvedValue(mockSite);
      mockPrisma.page.findMany.mockResolvedValue([]);
      mockPrisma.page.findFirst.mockResolvedValue(null);
      mockPrisma.page.create.mockImplementation(async ({ data }) => ({
        id: 'page-123',
        ...data,
      }));

      const result = await generateComparisonPageForSite('site-123');

      // Verify the slug has the blog/ prefix
      if (result.queued) {
        const createCall = mockPrisma.page.create.mock.calls[0]?.[0];
        expect(createCall?.data?.slug).toMatch(/^blog\//);
        expect(createCall?.data?.slug).toBe('blog/walking-tours-vs-bus-tours-london');
      }
    });

    it('should NOT create slugs without blog/ prefix (regression test)', async () => {
      const mockSite = {
        id: 'site-123',
        name: 'Test Food Tours',
        niche: 'food tours',
        location: 'London',
        destinations: ['London'],
        seoConfig: {
          comparisons: {
            pairs: [['Option A', 'Option B']],
          },
        },
        brandIdentity: {},
        pages: [],
      };

      mockPrisma.site.findUnique.mockResolvedValue(mockSite);
      mockPrisma.page.findMany.mockResolvedValue([]);
      mockPrisma.page.findFirst.mockResolvedValue(null);
      mockPrisma.page.create.mockImplementation(async ({ data }) => ({
        id: 'page-123',
        ...data,
      }));

      await generateComparisonPageForSite('site-123');

      const createCall = mockPrisma.page.create.mock.calls[0]?.[0];
      if (createCall) {
        // This would have been 'option-a-vs-option-b-london' without the fix
        // Now it should be 'blog/option-a-vs-option-b-london'
        expect(createCall.data.slug).not.toBe('option-a-vs-option-b-london');
        expect(createCall.data.slug).toMatch(/^blog\//);
      }
    });
  });

  describe('generateLocalGuideForSite', () => {
    it('should create guide slugs with blog/ prefix', async () => {
      const mockSite = {
        id: 'site-123',
        name: 'Test Food Tours',
        niche: 'food tours',
        location: 'London',
        destinations: ['London', 'Paris'],
        seoConfig: {},
        brandIdentity: {},
      };

      mockPrisma.site.findUnique.mockResolvedValue(mockSite);
      mockPrisma.page.findMany.mockResolvedValue([]); // No existing guides
      mockPrisma.page.create.mockImplementation(async ({ data }) => ({
        id: 'page-123',
        ...data,
      }));

      const result = await generateLocalGuideForSite('site-123');

      if (result.queued) {
        const createCall = mockPrisma.page.create.mock.calls[0]?.[0];
        expect(createCall?.data?.slug).toMatch(/^blog\/first-timers-guide-/);
      }
    });

    it('should check for existing guides using blog/ prefixed slugs', async () => {
      const mockSite = {
        id: 'site-123',
        name: 'Test Food Tours',
        niche: 'food tours',
        location: 'London',
        destinations: ['London', 'Paris'],
        seoConfig: {},
        brandIdentity: {},
      };

      // Simulate existing guide WITH correct prefix
      const existingGuides = [{ slug: 'blog/first-timers-guide-london' }];

      mockPrisma.site.findUnique.mockResolvedValue(mockSite);
      mockPrisma.page.findMany.mockResolvedValue(existingGuides);
      mockPrisma.page.create.mockImplementation(async ({ data }) => ({
        id: 'page-123',
        ...data,
      }));

      const result = await generateLocalGuideForSite('site-123');

      // Should skip London (exists) and create Paris guide
      if (result.queued) {
        const createCall = mockPrisma.page.create.mock.calls[0]?.[0];
        expect(createCall?.data?.slug).toBe('blog/first-timers-guide-paris');
      }
    });
  });

  describe('generateSeasonalContentForSite', () => {
    it('should create seasonal slugs with blog/ prefix', async () => {
      const mockSite = {
        id: 'site-123',
        name: 'Test Food Tours',
        niche: 'food tours',
        location: 'London',
        destinations: ['London'],
        seoConfig: {},
        brandIdentity: {},
      };

      mockPrisma.site.findUnique.mockResolvedValue(mockSite);
      mockPrisma.page.findMany.mockResolvedValue([]); // No existing seasonal content
      mockPrisma.page.create.mockImplementation(async ({ data }) => ({
        id: 'page-123',
        ...data,
      }));

      const result = await generateSeasonalContentForSite('site-123');

      if (result.queued) {
        const createCall = mockPrisma.page.create.mock.calls[0]?.[0];
        expect(createCall?.data?.slug).toMatch(/^blog\/seasonal-/);
      }
    });

    it('should query existing seasonal content using blog/ prefixed pattern', async () => {
      const mockSite = {
        id: 'site-123',
        name: 'Test Food Tours',
        niche: 'food tours',
        location: 'London',
        destinations: ['London'],
        seoConfig: {},
        brandIdentity: {},
      };

      mockPrisma.site.findUnique.mockResolvedValue(mockSite);
      mockPrisma.page.findMany.mockResolvedValue([]);
      mockPrisma.page.create.mockImplementation(async ({ data }) => ({
        id: 'page-123',
        ...data,
      }));

      await generateSeasonalContentForSite('site-123');

      // Verify the query looks for blog/seasonal- prefixed slugs
      const findManyCall = mockPrisma.page.findMany.mock.calls[0]?.[0];
      expect(findManyCall?.where?.slug?.startsWith).toBe('blog/seasonal-');
    });
  });
});

describe('Slug Format Validation', () => {
  /**
   * These tests ensure the slug format is consistent across all blog generation.
   */

  it('slugs should be lowercase with hyphens', async () => {
    const mockSite = {
      id: 'site-123',
      name: 'Test Site',
      niche: 'food tours',
      location: 'New York',
      destinations: ['New York'],
      seoConfig: {
        comparisons: {
          pairs: [['Pizza Tours', 'Pasta Tours']],
        },
      },
      brandIdentity: {},
      pages: [],
    };

    mockPrisma.site.findUnique.mockResolvedValue(mockSite);
    mockPrisma.page.findMany.mockResolvedValue([]);
    mockPrisma.page.findFirst.mockResolvedValue(null);
    mockPrisma.page.create.mockImplementation(async ({ data }) => ({
      id: 'page-123',
      ...data,
    }));

    await generateComparisonPageForSite('site-123');

    const createCall = mockPrisma.page.create.mock.calls[0]?.[0];
    if (createCall) {
      const slug = createCall.data.slug;
      // Should be lowercase
      expect(slug).toBe(slug.toLowerCase());
      // Should not contain spaces
      expect(slug).not.toContain(' ');
      // Should start with blog/
      expect(slug).toMatch(/^blog\//);
    }
  });
});
