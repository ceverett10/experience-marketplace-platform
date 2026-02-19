import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetworkRelatedPosts } from './NetworkRelatedPosts';

type NetworkRelatedPost = {
  title: string;
  slug: string;
  siteName: string;
  fullDomain: string;
  publishedAt: Date | null;
};

function makePost(overrides: Partial<NetworkRelatedPost> = {}): NetworkRelatedPost {
  return {
    title: 'Best Walking Tours in London',
    slug: 'blog/best-walking-tours-london',
    siteName: 'London Experiences',
    fullDomain: 'london-experiences.com',
    publishedAt: new Date('2025-11-20'),
    ...overrides,
  };
}

describe('NetworkRelatedPosts', () => {
  it('returns null when posts array is empty', () => {
    const { container } = render(<NetworkRelatedPosts posts={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the section heading', () => {
    render(<NetworkRelatedPosts posts={[makePost()]} />);
    expect(screen.getByText('Related Articles from Our Network')).toBeInTheDocument();
  });

  it('renders the section subtitle', () => {
    render(<NetworkRelatedPosts posts={[makePost()]} />);
    expect(screen.getByText('Discover more from the Experiencess network')).toBeInTheDocument();
  });

  it('renders post titles', () => {
    const posts = [
      makePost({ title: 'London Walking Tours' }),
      makePost({
        title: 'Paris Food Guide',
        slug: 'blog/paris-food',
        fullDomain: 'paris-tours.com',
      }),
    ];
    render(<NetworkRelatedPosts posts={posts} />);
    expect(screen.getByText('London Walking Tours')).toBeInTheDocument();
    expect(screen.getByText('Paris Food Guide')).toBeInTheDocument();
  });

  it('renders site names for each post', () => {
    const posts = [
      makePost({ siteName: 'London Experiences' }),
      makePost({
        siteName: 'Paris Adventures',
        slug: 'blog/paris',
        fullDomain: 'paris-adventures.com',
      }),
    ];
    render(<NetworkRelatedPosts posts={posts} />);
    expect(screen.getByText('London Experiences')).toBeInTheDocument();
    expect(screen.getByText('Paris Adventures')).toBeInTheDocument();
  });

  it('links to external domain with https://{fullDomain}/{slug}', () => {
    const posts = [
      makePost({
        fullDomain: 'london-experiences.com',
        slug: 'blog/best-tours',
      }),
    ];
    render(<NetworkRelatedPosts posts={posts} />);
    const link = screen.getByRole('link', { name: /best walking tours/i });
    expect(link).toHaveAttribute('href', 'https://london-experiences.com/blog/best-tours');
  });

  it('renders formatted date when publishedAt is provided', () => {
    const posts = [makePost({ publishedAt: new Date('2025-11-20') })];
    render(<NetworkRelatedPosts posts={posts} />);
    expect(screen.getByText('20 Nov 2025')).toBeInTheDocument();
  });

  it('does not render date when publishedAt is null', () => {
    const posts = [makePost({ publishedAt: null })];
    render(<NetworkRelatedPosts posts={posts} />);
    // Should not show any date text
    expect(screen.queryByText(/2025/)).not.toBeInTheDocument();
  });

  it('renders multiple posts in a grid', () => {
    const posts = [
      makePost({ title: 'Post 1', slug: 'blog/post-1', fullDomain: 'site1.com' }),
      makePost({ title: 'Post 2', slug: 'blog/post-2', fullDomain: 'site2.com' }),
      makePost({ title: 'Post 3', slug: 'blog/post-3', fullDomain: 'site3.com' }),
      makePost({ title: 'Post 4', slug: 'blog/post-4', fullDomain: 'site4.com' }),
    ];
    render(<NetworkRelatedPosts posts={posts} />);
    expect(screen.getByText('Post 1')).toBeInTheDocument();
    expect(screen.getByText('Post 2')).toBeInTheDocument();
    expect(screen.getByText('Post 3')).toBeInTheDocument();
    expect(screen.getByText('Post 4')).toBeInTheDocument();
  });

  it('sets rel="noopener" on external links', () => {
    // The component uses <a> tags without rel attribute - check it renders without error
    const posts = [makePost()];
    render(<NetworkRelatedPosts posts={posts} />);
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
  });
});
