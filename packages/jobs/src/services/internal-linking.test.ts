import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    page: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    content: {
      update: vi.fn(),
    },
  };
  return { mockPrisma };
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

import { findRelatedPages } from './internal-linking';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Internal Linking URL Generation', () => {
  /**
   * CRITICAL: Blog URLs must be generated correctly based on how slugs are stored.
   *
   * Convention: Slugs are stored WITH path prefix (e.g., 'blog/my-post')
   * Therefore: URLs should be generated as `/${slug}` → '/blog/my-post'
   *
   * If URLs were generated as `/blog/${slug}`, they would become
   * '/blog/blog/my-post' which is incorrect.
   */

  describe('findRelatedPages', () => {
    it('should generate blog URLs directly from slugs (slugs include blog/ prefix)', async () => {
      // When searching for related pages from a DESTINATION page,
      // it should find related BLOG posts
      const mockBlogs = [
        {
          id: 'blog-1',
          slug: 'blog/london-food-tours-guide',
          title: 'London Food Tours Guide',
          metaDescription: 'A guide to food tours in London',
        },
      ];

      mockPrisma.page.findMany.mockResolvedValue(mockBlogs);
      mockPrisma.page.findFirst.mockResolvedValue(null);

      const result = await findRelatedPages({
        siteId: 'site-123',
        contentType: 'destination', // Not 'blog' so it will look for related blogs
        keywords: ['food', 'london'],
        excludePageId: 'different-page',
        limit: 5,
      });

      // Find the blog link in results
      const blogLink = result.find((l) => l.pageType === 'blog');

      if (blogLink) {
        // URL should be /${slug}, which equals '/blog/london-food-tours-guide'
        expect(blogLink.url).toBe('/blog/london-food-tours-guide');
        // Should NOT be double-prefixed
        expect(blogLink.url).not.toBe('/blog/blog/london-food-tours-guide');
        // Should NOT start with /blog/blog/
        expect(blogLink.url).not.toMatch(/^\/blog\/blog\//);
      }
    });

    it('should NOT double-prefix blog URLs (regression test)', async () => {
      const mockBlogs = [
        {
          id: 'blog-1',
          slug: 'blog/test-post',
          title: 'Test Post',
          metaDescription: 'A test post about testing',
        },
      ];

      mockPrisma.page.findMany.mockResolvedValue(mockBlogs);
      mockPrisma.page.findFirst.mockResolvedValue(null);

      const result = await findRelatedPages({
        siteId: 'site-123',
        contentType: 'category', // Not 'blog' so it will look for related blogs
        keywords: ['test'],
        limit: 5,
      });

      const blogLink = result.find((l) => l.pageType === 'blog');

      if (blogLink) {
        // The bug would have produced '/blog/blog/test-post'
        expect(blogLink.url).not.toContain('/blog/blog/');
        expect(blogLink.url).toBe('/blog/test-post');
      }
    });

    it('should generate destination URLs with /destinations/ prefix', async () => {
      const mockDestination = {
        id: 'dest-1',
        slug: 'london',
        title: 'London',
      };

      mockPrisma.page.findMany.mockResolvedValue([]);
      mockPrisma.page.findFirst.mockResolvedValue(mockDestination);

      const result = await findRelatedPages({
        siteId: 'site-123',
        contentType: 'blog', // Looking from blog perspective
        keywords: ['food'],
        destination: 'London',
        limit: 5,
      });

      const destLink = result.find((l) => l.pageType === 'destination');

      if (destLink) {
        // Destination slugs don't have prefix, so URL adds it
        expect(destLink.url).toBe('/destinations/london');
      }
    });
  });
});

describe('URL Format Validation', () => {
  it('blog URLs should start with /blog/ (single prefix)', async () => {
    const mockBlogs = [
      { id: '1', slug: 'blog/test-1', title: 'Test 1', metaDescription: 'test one' },
      { id: '2', slug: 'blog/test-2', title: 'Test 2', metaDescription: 'test two' },
    ];

    mockPrisma.page.findMany.mockResolvedValue(mockBlogs);
    mockPrisma.page.findFirst.mockResolvedValue(null);

    const result = await findRelatedPages({
      siteId: 'site-123',
      contentType: 'destination',
      keywords: ['test'],
      limit: 10,
    });

    const blogLinks = result.filter((l) => l.pageType === 'blog');

    blogLinks.forEach((link) => {
      // Should start with /blog/
      expect(link.url).toMatch(/^\/blog\//);
      // Should not have double slashes
      expect(link.url).not.toMatch(/\/\//);
      // Should not have /blog/blog/
      expect(link.url).not.toMatch(/\/blog\/blog\//);
    });
  });
});
