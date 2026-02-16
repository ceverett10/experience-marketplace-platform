import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '@/test/mocks/prisma';
import { mockAddJob } from '@/test/mocks/jobs';
import { createMockPage, createMockContent, createMockPageWithSite } from '@/test/factories';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@experience-marketplace/jobs', () => ({
  addJob: mockAddJob,
}));

vi.mock('@prisma/client', () => ({
  PageStatus: {
    DRAFT: 'DRAFT',
    REVIEW: 'REVIEW',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
  },
  PageType: {
    HOMEPAGE: 'HOMEPAGE',
    LANDING: 'LANDING',
    CATEGORY: 'CATEGORY',
    PRODUCT: 'PRODUCT',
    BLOG: 'BLOG',
    FAQ: 'FAQ',
    ABOUT: 'ABOUT',
    CONTACT: 'CONTACT',
    LEGAL: 'LEGAL',
  },
}));

import { GET, PATCH, PUT, POST } from './route';

function createRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

function createGetRequest(params?: Record<string, string>) {
  const url = new URL('http://localhost/api/content');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new Request(url.toString());
}

/** Helper: set up count + groupBy mocks so GET doesn't throw on parallel queries */
function mockCountAndStats(pages: any[]) {
  mockPrisma.page.count.mockResolvedValue(pages.length);
  mockPrisma.page.groupBy.mockResolvedValue(
    Object.entries(
      pages.reduce(
        (acc: Record<string, number>, p: any) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    ).map(([status, count]) => ({ status, _count: { id: count } }))
  );
}

describe('GET /api/content', () => {
  it('returns all pages with content info', async () => {
    const content = createMockContent({ qualityScore: 85 });
    const pages = [
      {
        ...createMockPage({
          type: 'PRODUCT',
          status: 'PUBLISHED',
          contentId: content.id,
          content,
        }),
        site: { id: 'site-1', name: 'Test Site' },
      },
      {
        ...createMockPage({
          type: 'BLOG',
          status: 'DRAFT',
          contentId: null,
          content: null,
        }),
        site: { id: 'site-1', name: 'Test Site' },
      },
    ];
    mockPrisma.page.findMany.mockResolvedValue(pages);
    mockCountAndStats(pages);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(2);

    // First page — has content, is PRODUCT type
    expect(data.items[0].type).toBe('experience'); // PRODUCT → experience
    expect(data.items[0].status).toBe('published'); // PUBLISHED → published
    expect(data.items[0].hasContent).toBe(true);
    expect(data.items[0].qualityScore).toBe(85);
    expect(data.items[0].siteName).toBe('Test Site');

    // Second page — no content, is BLOG type
    expect(data.items[1].type).toBe('blog');
    expect(data.items[1].status).toBe('pending'); // DRAFT → pending
    expect(data.items[1].hasContent).toBe(false);
    expect(data.items[1].content).toBe('');
    expect(data.items[1].qualityScore).toBe(0);
  });

  it('uses page createdAt when content createdAt is null', async () => {
    const pageDate = new Date('2024-01-15T00:00:00Z');
    const pages = [
      {
        ...createMockPage({
          content: null,
          contentId: null,
          createdAt: pageDate,
        }),
        site: { id: 'site-1', name: 'Test Site' },
      },
    ];
    mockPrisma.page.findMany.mockResolvedValue(pages);
    mockCountAndStats(pages);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(data.items[0].generatedAt).toBe(pageDate.toISOString());
  });

  it('returns 500 when database fails', async () => {
    mockPrisma.page.count.mockRejectedValue(new Error('DB error'));
    mockPrisma.page.findMany.mockRejectedValue(new Error('DB error'));
    mockPrisma.page.groupBy.mockRejectedValue(new Error('DB error'));

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch content');
  });

  it('maps all page types correctly', async () => {
    const typeMap = [
      { type: 'PRODUCT', expected: 'experience' },
      { type: 'CATEGORY', expected: 'collection' },
      { type: 'BLOG', expected: 'blog' },
      { type: 'LANDING', expected: 'seo' },
      { type: 'HOMEPAGE', expected: 'seo' },
      { type: 'FAQ', expected: 'blog' },
      { type: 'ABOUT', expected: 'blog' },
    ];

    const pages = typeMap.map(({ type }) => ({
      ...createMockPage({ type, content: null, contentId: null }),
      site: { id: 'site-1', name: 'Test Site' },
    }));
    mockPrisma.page.findMany.mockResolvedValue(pages);
    mockCountAndStats(pages);

    const response = await GET(createGetRequest());
    const data = await response.json();

    typeMap.forEach(({ expected }, i) => {
      expect(data.items[i].type).toBe(expected);
    });
  });
});

describe('PATCH /api/content (status update)', () => {
  it('updates page status successfully', async () => {
    const updatedPage = createMockPage({ id: 'page-1', status: 'REVIEW' });
    mockPrisma.page.update.mockResolvedValue(updatedPage);

    const response = await PATCH(
      createRequest('http://localhost/api/content', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'page-1', status: 'approved' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('approved'); // REVIEW → approved

    expect(mockPrisma.page.update).toHaveBeenCalledWith({
      where: { id: 'page-1' },
      data: { status: 'REVIEW' }, // approved → REVIEW in DB
    });
  });

  it('returns 400 when id is missing', async () => {
    const response = await PATCH(
      createRequest('http://localhost/api/content', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required fields');
  });

  it('returns 400 when status is missing', async () => {
    const response = await PATCH(
      createRequest('http://localhost/api/content', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'page-1' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required fields');
  });
});

describe('PUT /api/content (update content)', () => {
  it('updates existing content body', async () => {
    const content = createMockContent({ id: 'content-1' });
    const page = createMockPage({
      id: 'page-1',
      contentId: 'content-1',
      content,
    });

    mockPrisma.page.findUnique
      .mockResolvedValueOnce(page) // first lookup
      .mockResolvedValueOnce({
        // after update lookup
        ...page,
        content: { body: 'Updated body', qualityScore: 75, createdAt: new Date() },
        site: { name: 'Test Site' },
      });
    mockPrisma.content.update.mockResolvedValue({ ...content, body: 'Updated body' });

    const response = await PUT(
      createRequest('http://localhost/api/content', {
        method: 'PUT',
        body: JSON.stringify({ id: 'page-1', content: 'Updated body' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.content.update).toHaveBeenCalledWith({
      where: { id: 'content-1' },
      data: { body: 'Updated body', isAiGenerated: false },
    });
  });

  it('creates new content when page has no content', async () => {
    const page = createMockPage({ id: 'page-1', contentId: null, content: null, siteId: 'site-1' });

    mockPrisma.page.findUnique.mockResolvedValueOnce(page).mockResolvedValueOnce({
      ...page,
      content: { body: 'New content', qualityScore: 0, createdAt: new Date() },
      site: { name: 'Test Site' },
    });
    mockPrisma.content.create.mockResolvedValue({ id: 'new-content-1' });
    mockPrisma.page.update.mockResolvedValue({ ...page, contentId: 'new-content-1' });

    const response = await PUT(
      createRequest('http://localhost/api/content', {
        method: 'PUT',
        body: JSON.stringify({ id: 'page-1', content: 'New content' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.content.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        siteId: 'site-1',
        body: 'New content',
        bodyFormat: 'MARKDOWN',
        isAiGenerated: false,
      }),
    });
  });

  it('returns 400 when page id is missing', async () => {
    const response = await PUT(
      createRequest('http://localhost/api/content', {
        method: 'PUT',
        body: JSON.stringify({ content: 'some text' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing page ID');
  });

  it('returns 404 when page does not exist', async () => {
    mockPrisma.page.findUnique.mockResolvedValue(null);

    const response = await PUT(
      createRequest('http://localhost/api/content', {
        method: 'PUT',
        body: JSON.stringify({ id: 'nonexistent', content: 'text' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Page not found');
  });

  it('updates title without touching content', async () => {
    const page = createMockPage({ id: 'page-1', contentId: null, content: null });

    mockPrisma.page.findUnique.mockResolvedValueOnce(page).mockResolvedValueOnce({
      ...page,
      title: 'New Title',
      content: null,
      site: { name: 'Test Site' },
    });
    mockPrisma.page.update.mockResolvedValue({ ...page, title: 'New Title' });

    const response = await PUT(
      createRequest('http://localhost/api/content', {
        method: 'PUT',
        body: JSON.stringify({ id: 'page-1', title: 'New Title' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // content.create should NOT have been called
    expect(mockPrisma.content.create).not.toHaveBeenCalled();
    expect(mockPrisma.content.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/content (generate)', () => {
  it('queues content generation for pages without content', async () => {
    const pages = [
      {
        ...createMockPage({
          id: 'page-1',
          title: 'London Tours',
          type: 'PRODUCT',
          siteId: 'site-1',
          contentId: null,
        }),
        site: { id: 'site-1', name: 'Tourism Site' },
      },
      {
        ...createMockPage({
          id: 'page-2',
          title: 'Adventure Blog',
          type: 'BLOG',
          siteId: 'site-1',
          contentId: null,
        }),
        site: { id: 'site-1', name: 'Tourism Site' },
      },
    ];
    mockPrisma.page.findMany.mockResolvedValue(pages);
    mockAddJob.mockResolvedValue({ id: 'queued-job' });

    const response = await POST(
      createRequest('http://localhost/api/content', {
        method: 'POST',
        body: JSON.stringify({ action: 'generate' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.jobsQueued).toBe(2);

    // Verify addJob called for each page
    expect(mockAddJob).toHaveBeenCalledTimes(2);
    expect(mockAddJob).toHaveBeenCalledWith(
      'CONTENT_GENERATE',
      expect.objectContaining({
        siteId: 'site-1',
        pageId: 'page-1',
        contentType: 'experience', // PRODUCT → experience
        targetKeyword: 'London Tours',
      })
    );
    expect(mockAddJob).toHaveBeenCalledWith(
      'CONTENT_GENERATE',
      expect.objectContaining({
        pageId: 'page-2',
        contentType: 'blog',
        targetKeyword: 'Adventure Blog',
      })
    );
  });

  it('generates content for specific page IDs', async () => {
    const pages = [
      {
        ...createMockPage({ id: 'page-1', title: 'Specific Page', type: 'LANDING' }),
        site: { id: 'site-1', name: 'Tourism Site' },
      },
    ];
    mockPrisma.page.findMany.mockResolvedValue(pages);

    const response = await POST(
      createRequest('http://localhost/api/content', {
        method: 'POST',
        body: JSON.stringify({ action: 'generate', pageIds: ['page-1'] }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.jobsQueued).toBe(1);

    // Verify the query filtered by IDs
    expect(mockPrisma.page.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['page-1'] } },
      })
    );
  });

  it('returns success with 0 jobs when no pages need generation', async () => {
    mockPrisma.page.findMany.mockResolvedValue([]);

    const response = await POST(
      createRequest('http://localhost/api/content', {
        method: 'POST',
        body: JSON.stringify({ action: 'generate' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.jobsQueued).toBe(0);
    expect(data.message).toBe('No pages need content generation');
  });

  it('returns 400 for invalid action', async () => {
    const response = await POST(
      createRequest('http://localhost/api/content', {
        method: 'POST',
        body: JSON.stringify({ action: 'invalid' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid action');
  });

  it('continues queuing when individual addJob fails', async () => {
    const pages = [
      {
        ...createMockPage({ id: 'page-1', title: 'Page 1', type: 'BLOG' }),
        site: { id: 'site-1', name: 'Site' },
      },
      {
        ...createMockPage({ id: 'page-2', title: 'Page 2', type: 'BLOG' }),
        site: { id: 'site-1', name: 'Site' },
      },
      {
        ...createMockPage({ id: 'page-3', title: 'Page 3', type: 'BLOG' }),
        site: { id: 'site-1', name: 'Site' },
      },
    ];
    mockPrisma.page.findMany.mockResolvedValue(pages);

    // Second job fails
    mockAddJob
      .mockResolvedValueOnce({ id: 'job-1' })
      .mockRejectedValueOnce(new Error('Queue full'))
      .mockResolvedValueOnce({ id: 'job-3' });

    const response = await POST(
      createRequest('http://localhost/api/content', {
        method: 'POST',
        body: JSON.stringify({ action: 'generate' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const data = await response.json();

    // Should still succeed, with 2 out of 3 queued
    expect(data.success).toBe(true);
    expect(data.jobsQueued).toBe(2);
  });
});
