import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => {
        if (key === 'host') return 'test.example.com';
        return null;
      }),
    })
  ),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockResolvedValue({
    id: 'site-1',
    name: 'Test Tours',
    description: 'Best tours in the world',
    primaryDomain: 'test.example.com',
    brand: { logoUrl: '/logo.png' },
  }),
}));

const { mockPageFindMany } = vi.hoisted(() => ({
  mockPageFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    page: { findMany: mockPageFindMany },
  },
}));

import { GET } from './route';

describe('RSS Feed Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid RSS XML', async () => {
    mockPageFindMany.mockResolvedValue([]);

    const response = await GET();
    const text = await response.text();

    expect(response.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');
    expect(text).toContain('<?xml version="1.0"');
    expect(text).toContain('<rss version="2.0"');
    expect(text).toContain('<title>Test Tours - Travel Blog</title>');
    expect(text).toContain('<link>https://test.example.com/blog</link>');
  });

  it('includes blog posts as items', async () => {
    mockPageFindMany.mockResolvedValue([
      {
        title: 'Top 10 London Tours',
        slug: 'top-10-london-tours',
        metaDescription: 'Discover the best London tours',
        createdAt: new Date('2025-06-01'),
        content: { body: '## Best tours\n\nHere are the top tours.' },
      },
    ]);

    const response = await GET();
    const text = await response.text();

    expect(text).toContain('<title>Top 10 London Tours</title>');
    expect(text).toContain('<link>https://test.example.com/blog/top-10-london-tours</link>');
    expect(text).toContain('<description>Discover the best London tours</description>');
    expect(text).toContain('<content:encoded>');
  });

  it('escapes XML special characters in title', async () => {
    mockPageFindMany.mockResolvedValue([
      {
        title: 'Tours & Attractions <London>',
        slug: 'tours-attractions',
        metaDescription: null,
        createdAt: new Date('2025-06-01'),
        content: null,
      },
    ]);

    const response = await GET();
    const text = await response.text();

    expect(text).toContain('Tours &amp; Attractions &lt;London&gt;');
    expect(text).not.toContain('Tours & Attractions <London>');
  });

  it('generates excerpt when no metaDescription', async () => {
    mockPageFindMany.mockResolvedValue([
      {
        title: 'Test Post',
        slug: 'test-post',
        metaDescription: null,
        createdAt: new Date('2025-06-01'),
        content: {
          body:
            '## Heading\n\n**Bold text** and *italic text* with [a link](https://example.com). ' +
            'A'.repeat(300),
        },
      },
    ]);

    const response = await GET();
    const text = await response.text();

    // The excerpt should strip markdown and truncate
    expect(text).toContain('Bold text');
    expect(text).toContain('...');
    expect(text).not.toContain('##');
    expect(text).not.toContain('**');
  });

  it('converts markdown to HTML in content:encoded', async () => {
    mockPageFindMany.mockResolvedValue([
      {
        title: 'Test',
        slug: 'test',
        metaDescription: 'desc',
        createdAt: new Date('2025-06-01'),
        content: { body: '# Heading\n\n**Bold** and *italic*\n\n[Link](https://example.com)' },
      },
    ]);

    const response = await GET();
    const text = await response.text();

    expect(text).toContain('<h1>Heading</h1>');
    expect(text).toContain('<strong>Bold</strong>');
    expect(text).toContain('<em>italic</em>');
    expect(text).toContain('<a href="https://example.com">Link</a>');
  });

  it('includes site logo in channel image', async () => {
    mockPageFindMany.mockResolvedValue([]);

    const response = await GET();
    const text = await response.text();

    expect(text).toContain('<url>https://test.example.com/logo.png</url>');
  });

  it('sets caching headers', async () => {
    mockPageFindMany.mockResolvedValue([]);

    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=3600');
  });
});
