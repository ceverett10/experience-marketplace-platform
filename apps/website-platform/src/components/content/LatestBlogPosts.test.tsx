import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LatestBlogPosts } from './LatestBlogPosts';

// ── helpers ─────────────────────────────────────────────────────────────────

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  metaDescription?: string | null;
  createdAt: Date;
  content?: {
    body: string;
    qualityScore?: number | null;
  } | null;
}

function createPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'post-1',
    slug: 'blog/sample-post',
    title: 'Sample Blog Post',
    metaDescription: 'A description of the sample post.',
    createdAt: new Date('2026-01-20T10:00:00Z'),
    content: {
      body: '## Introduction\n\nThis is the body of the blog post with **bold** text.',
      qualityScore: 75,
    },
    ...overrides,
  };
}

describe('LatestBlogPosts', () => {
  // ── Empty state ─────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders nothing when posts array is empty', () => {
      const { container } = render(<LatestBlogPosts posts={[]} />);
      expect(container.innerHTML).toBe('');
    });
  });

  // ── Section heading ─────────────────────────────────────────────────────

  describe('section heading', () => {
    it('renders the section title', () => {
      render(<LatestBlogPosts posts={[createPost()]} />);
      expect(screen.getByRole('heading', { name: /Travel Guides & Tips/i })).toBeInTheDocument();
    });

    it('renders the subtitle', () => {
      render(<LatestBlogPosts posts={[createPost()]} />);
      expect(
        screen.getByText('Expert advice to help you plan your perfect experience')
      ).toBeInTheDocument();
    });

    it('renders the "View all articles" link', () => {
      render(<LatestBlogPosts posts={[createPost()]} />);
      const links = screen.getAllByRole('link', { name: /View all articles/i });
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(links[0]).toHaveAttribute('href', '/blog');
    });
  });

  // ── Post cards ──────────────────────────────────────────────────────────

  describe('post card rendering', () => {
    it('renders the post title', () => {
      render(<LatestBlogPosts posts={[createPost({ title: 'Best Places in Rome' })]} />);
      expect(screen.getByText('Best Places in Rome')).toBeInTheDocument();
    });

    it('links the title to the post slug', () => {
      render(<LatestBlogPosts posts={[createPost({ slug: 'blog/rome-guide' })]} />);
      const links = screen.getAllByRole('link', { name: /Best|Sample|Rome/i });
      // The title link should point to /blog/rome-guide
      const titleLink = links.find((l) => l.getAttribute('href') === '/blog/rome-guide');
      expect(titleLink).toBeTruthy();
    });

    it('renders the meta description as excerpt', () => {
      render(
        <LatestBlogPosts posts={[createPost({ metaDescription: 'A wonderful travel guide' })]} />
      );
      expect(screen.getByText('A wonderful travel guide')).toBeInTheDocument();
    });

    it('generates excerpt from body when metaDescription is null', () => {
      render(
        <LatestBlogPosts
          posts={[
            createPost({
              metaDescription: null,
              content: {
                body: 'This is the raw body text for excerpt generation.',
                qualityScore: 50,
              },
            }),
          ]}
        />
      );
      expect(
        screen.getByText('This is the raw body text for excerpt generation.')
      ).toBeInTheDocument();
    });

    it('renders formatted date', () => {
      render(
        <LatestBlogPosts posts={[createPost({ createdAt: new Date('2026-02-15T00:00:00Z') })]} />
      );
      // en-US short format: "Feb 15, 2026"
      expect(screen.getByText('Feb 15, 2026')).toBeInTheDocument();
    });

    it('renders "Read more" link for each post', () => {
      render(<LatestBlogPosts posts={[createPost()]} />);
      expect(screen.getByText('Read more')).toBeInTheDocument();
    });
  });

  // ── Quality score badge ─────────────────────────────────────────────────

  describe('quality score badge', () => {
    it('shows "Expert" badge when qualityScore >= 80', () => {
      render(
        <LatestBlogPosts posts={[createPost({ content: { body: 'Test', qualityScore: 90 } })]} />
      );
      expect(screen.getByText('Expert')).toBeInTheDocument();
    });

    it('does not show "Expert" badge when qualityScore < 80', () => {
      render(
        <LatestBlogPosts posts={[createPost({ content: { body: 'Test', qualityScore: 70 } })]} />
      );
      expect(screen.queryByText('Expert')).not.toBeInTheDocument();
    });

    it('does not show "Expert" badge when qualityScore is null', () => {
      render(
        <LatestBlogPosts posts={[createPost({ content: { body: 'Test', qualityScore: null } })]} />
      );
      expect(screen.queryByText('Expert')).not.toBeInTheDocument();
    });

    it('does not show "Expert" badge when content is null', () => {
      render(<LatestBlogPosts posts={[createPost({ content: null })]} />);
      expect(screen.queryByText('Expert')).not.toBeInTheDocument();
    });
  });

  // ── Maximum 3 posts ─────────────────────────────────────────────────────

  describe('post limit', () => {
    it('renders at most 3 posts', () => {
      const posts = [
        createPost({ id: '1', title: 'Post 1' }),
        createPost({ id: '2', title: 'Post 2' }),
        createPost({ id: '3', title: 'Post 3' }),
        createPost({ id: '4', title: 'Post 4' }),
        createPost({ id: '5', title: 'Post 5' }),
      ];

      render(<LatestBlogPosts posts={posts} />);
      expect(screen.getByText('Post 1')).toBeInTheDocument();
      expect(screen.getByText('Post 2')).toBeInTheDocument();
      expect(screen.getByText('Post 3')).toBeInTheDocument();
      expect(screen.queryByText('Post 4')).not.toBeInTheDocument();
      expect(screen.queryByText('Post 5')).not.toBeInTheDocument();
    });
  });

  // ── Excerpt generation (markdown stripping) ─────────────────────────────

  describe('excerpt generation from markdown', () => {
    it('strips markdown bold and headers from the excerpt', () => {
      render(
        <LatestBlogPosts
          posts={[
            createPost({
              metaDescription: null,
              content: {
                body: '## My Header\n\nThis is **bold** and *italic* text.',
                qualityScore: null,
              },
            }),
          ]}
        />
      );
      expect(screen.getByText('My Header This is bold and italic text.')).toBeInTheDocument();
    });

    it('strips markdown links from the excerpt', () => {
      render(
        <LatestBlogPosts
          posts={[
            createPost({
              metaDescription: null,
              content: {
                body: 'Check out [this link](https://example.com) for details.',
                qualityScore: null,
              },
            }),
          ]}
        />
      );
      expect(screen.getByText('Check out this link for details.')).toBeInTheDocument();
    });
  });
});
