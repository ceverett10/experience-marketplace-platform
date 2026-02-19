import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LatestBlogPosts } from './LatestBlogPosts';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makePost(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    slug: `blog/post-${id}`,
    title: `Blog Post ${id}`,
    metaDescription: `Description for post ${id}`,
    createdAt: new Date('2025-06-15'),
    content: {
      body: '# Title\n\nSome **bold** content with [link](https://example.com)',
      qualityScore: 85,
    },
    ...overrides,
  };
}

describe('LatestBlogPosts', () => {
  it('returns null when posts array is empty', () => {
    const { container } = render(<LatestBlogPosts posts={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders "Travel Guides & Tips" heading', () => {
    render(<LatestBlogPosts posts={[makePost('1')]} />);
    expect(screen.getByText('Travel Guides & Tips')).toBeInTheDocument();
  });

  it('renders section subtitle', () => {
    render(<LatestBlogPosts posts={[makePost('1')]} />);
    expect(
      screen.getByText('Expert advice to help you plan your perfect experience')
    ).toBeInTheDocument();
  });

  it('renders post titles', () => {
    const posts = [makePost('1'), makePost('2')];
    render(<LatestBlogPosts posts={posts} />);
    expect(screen.getByText('Blog Post 1')).toBeInTheDocument();
    expect(screen.getByText('Blog Post 2')).toBeInTheDocument();
  });

  it('renders post dates in en-US short format', () => {
    const posts = [makePost('1', { createdAt: new Date('2025-06-15') })];
    render(<LatestBlogPosts posts={posts} />);
    expect(screen.getByText('Jun 15, 2025')).toBeInTheDocument();
  });

  it('shows "Expert" badge for high quality posts (qualityScore >= 80)', () => {
    const posts = [makePost('1', { content: { body: 'text', qualityScore: 90 } })];
    render(<LatestBlogPosts posts={posts} />);
    expect(screen.getByText('Expert')).toBeInTheDocument();
  });

  it('does not show "Expert" badge for low quality posts (qualityScore < 80)', () => {
    const posts = [makePost('1', { content: { body: 'text', qualityScore: 50 } })];
    render(<LatestBlogPosts posts={posts} />);
    expect(screen.queryByText('Expert')).not.toBeInTheDocument();
  });

  it('does not show "Expert" badge when qualityScore is null', () => {
    const posts = [makePost('1', { content: { body: 'text', qualityScore: null } })];
    render(<LatestBlogPosts posts={posts} />);
    expect(screen.queryByText('Expert')).not.toBeInTheDocument();
  });

  it('does not show "Expert" badge when content is null', () => {
    const posts = [makePost('1', { content: null })];
    render(<LatestBlogPosts posts={posts} />);
    expect(screen.queryByText('Expert')).not.toBeInTheDocument();
  });

  it('shows metaDescription as excerpt when available', () => {
    const posts = [makePost('1', { metaDescription: 'My custom description' })];
    render(<LatestBlogPosts posts={posts} />);
    expect(screen.getByText('My custom description')).toBeInTheDocument();
  });

  it('generates excerpt from content body when no metaDescription', () => {
    const posts = [
      makePost('1', {
        metaDescription: null,
        content: {
          body: '# Title\n\nSome **bold** content with [link](https://example.com)',
          qualityScore: 85,
        },
      }),
    ];
    render(<LatestBlogPosts posts={posts} />);
    expect(screen.getByText(/Title.*Some bold content with link/)).toBeInTheDocument();
  });

  it('links post titles to /{slug}', () => {
    const posts = [makePost('1', { slug: 'blog/my-great-post' })];
    render(<LatestBlogPosts posts={posts} />);
    const titleLink = screen.getByText('Blog Post 1').closest('a');
    expect(titleLink).toHaveAttribute('href', '/blog/my-great-post');
  });

  it('shows "Read more" link for each post', () => {
    const posts = [makePost('1'), makePost('2')];
    render(<LatestBlogPosts posts={posts} />);
    const readLinks = screen.getAllByText('Read more');
    expect(readLinks).toHaveLength(2);
  });

  it('links "Read more" to /{slug}', () => {
    const posts = [makePost('1', { slug: 'blog/my-great-post' })];
    render(<LatestBlogPosts posts={posts} />);
    const readLink = screen.getByText('Read more');
    expect(readLink.closest('a')).toHaveAttribute('href', '/blog/my-great-post');
  });

  it('shows "View all articles" desktop link to /blog', () => {
    render(<LatestBlogPosts posts={[makePost('1')]} />);
    const viewAllLinks = screen.getAllByText('View all articles');
    const desktopLink = viewAllLinks.find(
      (el) => el.closest('a')?.getAttribute('href') === '/blog'
    );
    expect(desktopLink).toBeTruthy();
  });

  it('limits to 3 posts maximum', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3'), makePost('4')];
    render(<LatestBlogPosts posts={posts} />);
    expect(screen.getByText('Blog Post 1')).toBeInTheDocument();
    expect(screen.getByText('Blog Post 2')).toBeInTheDocument();
    expect(screen.getByText('Blog Post 3')).toBeInTheDocument();
    expect(screen.queryByText('Blog Post 4')).not.toBeInTheDocument();
  });

  it('renders datetime attribute on time element', () => {
    const posts = [makePost('1', { createdAt: new Date('2025-06-15') })];
    render(<LatestBlogPosts posts={posts} />);
    const timeEl = screen.getByText('Jun 15, 2025');
    expect(timeEl.tagName.toLowerCase()).toBe('time');
    expect(timeEl).toHaveAttribute('dateTime');
  });

  it('renders mobile "View all articles" button', () => {
    render(<LatestBlogPosts posts={[makePost('1')]} />);
    const viewAllLinks = screen.getAllByText('View all articles');
    expect(viewAllLinks.length).toBeGreaterThanOrEqual(2); // desktop + mobile
  });
});
