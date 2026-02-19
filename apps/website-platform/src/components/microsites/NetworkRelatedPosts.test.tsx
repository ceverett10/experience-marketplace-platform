import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetworkRelatedPosts } from './NetworkRelatedPosts';
import type { NetworkRelatedPost } from '@/lib/microsite-experiences';

// ── helpers ─────────────────────────────────────────────────────────────────

function createPost(overrides: Partial<NetworkRelatedPost> = {}): NetworkRelatedPost {
  return {
    title: 'Best Walking Tours in Rome',
    slug: 'blog/best-walking-tours-rome',
    siteName: 'Rome Adventures',
    fullDomain: 'rome-adventures.example.com',
    publishedAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

describe('NetworkRelatedPosts', () => {
  // ── Empty state ─────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders nothing when posts array is empty', () => {
      const { container } = render(<NetworkRelatedPosts posts={[]} />);
      expect(container.innerHTML).toBe('');
    });
  });

  // ── Rendering ───────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the section heading', () => {
      render(<NetworkRelatedPosts posts={[createPost()]} />);
      expect(
        screen.getByRole('heading', { name: /Related Articles from Our Network/i })
      ).toBeInTheDocument();
    });

    it('renders the subtitle', () => {
      render(<NetworkRelatedPosts posts={[createPost()]} />);
      expect(screen.getByText('Discover more from the Experiencess network')).toBeInTheDocument();
    });

    it('renders post titles', () => {
      const posts = [
        createPost({ title: 'Guide to Florence' }),
        createPost({
          title: 'Top 10 Gelato Spots',
          fullDomain: 'gelato.example.com',
          slug: 'blog/gelato-spots',
        }),
      ];

      render(<NetworkRelatedPosts posts={posts} />);
      expect(screen.getByText('Guide to Florence')).toBeInTheDocument();
      expect(screen.getByText('Top 10 Gelato Spots')).toBeInTheDocument();
    });

    it('renders the site name for each post', () => {
      render(<NetworkRelatedPosts posts={[createPost({ siteName: 'Venice Explorer' })]} />);
      expect(screen.getByText('Venice Explorer')).toBeInTheDocument();
    });

    it('renders links to full external URLs', () => {
      const post = createPost({
        fullDomain: 'tours.example.com',
        slug: 'blog/my-article',
      });

      render(<NetworkRelatedPosts posts={[post]} />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://tours.example.com/blog/my-article');
    });

    it('renders formatted published date', () => {
      const post = createPost({ publishedAt: new Date('2026-02-10T12:00:00Z') });

      render(<NetworkRelatedPosts posts={[post]} />);
      // en-GB format: "10 Feb 2026"
      expect(screen.getByText('10 Feb 2026')).toBeInTheDocument();
    });

    it('does not render date when publishedAt is null', () => {
      const post = createPost({ publishedAt: null });

      render(<NetworkRelatedPosts posts={[post]} />);
      // Should not contain any date text — just site name and title
      expect(screen.queryByText(/\d{4}/)).not.toBeInTheDocument();
    });
  });

  // ── Multiple posts ──────────────────────────────────────────────────────

  describe('multiple posts', () => {
    it('renders all provided posts', () => {
      const posts = [
        createPost({ title: 'Post A', fullDomain: 'a.example.com', slug: 'blog/a' }),
        createPost({ title: 'Post B', fullDomain: 'b.example.com', slug: 'blog/b' }),
        createPost({ title: 'Post C', fullDomain: 'c.example.com', slug: 'blog/c' }),
        createPost({ title: 'Post D', fullDomain: 'd.example.com', slug: 'blog/d' }),
      ];

      render(<NetworkRelatedPosts posts={posts} />);
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(4);
    });
  });
});
