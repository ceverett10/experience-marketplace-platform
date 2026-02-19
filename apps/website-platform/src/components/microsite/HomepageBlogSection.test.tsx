import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomepageBlogSection } from './HomepageBlogSection';

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

const defaultProps = {
  primaryColor: '#0d9488',
  siteName: 'Test Site',
};

describe('HomepageBlogSection', () => {
  it('returns null when posts array is empty', () => {
    const { container } = render(<HomepageBlogSection posts={[]} {...defaultProps} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders "Latest Articles" heading', () => {
    render(<HomepageBlogSection posts={[makePost('1')]} {...defaultProps} />);
    expect(screen.getByText('Latest Articles')).toBeInTheDocument();
  });

  it('renders section subtitle text', () => {
    render(<HomepageBlogSection posts={[makePost('1')]} {...defaultProps} />);
    expect(
      screen.getByText('Travel tips, insider guides, and inspiration for your next adventure')
    ).toBeInTheDocument();
  });

  it('renders post titles', () => {
    const posts = [makePost('1'), makePost('2')];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    expect(screen.getByText('Blog Post 1')).toBeInTheDocument();
    expect(screen.getByText('Blog Post 2')).toBeInTheDocument();
  });

  it('renders post dates in en-US short format', () => {
    const posts = [makePost('1', { createdAt: new Date('2025-06-15') })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    expect(screen.getByText('Jun 15, 2025')).toBeInTheDocument();
  });

  it('shows "Expert Guide" badge for high quality posts (qualityScore >= 80)', () => {
    const posts = [makePost('1', { content: { body: 'text', qualityScore: 90 } })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    expect(screen.getByText('Expert Guide')).toBeInTheDocument();
  });

  it('does not show "Expert Guide" badge for low quality posts (qualityScore < 80)', () => {
    const posts = [makePost('1', { content: { body: 'text', qualityScore: 50 } })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    expect(screen.queryByText('Expert Guide')).not.toBeInTheDocument();
  });

  it('does not show "Expert Guide" badge when qualityScore is null', () => {
    const posts = [makePost('1', { content: { body: 'text', qualityScore: null } })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    expect(screen.queryByText('Expert Guide')).not.toBeInTheDocument();
  });

  it('does not show "Expert Guide" badge when content is null', () => {
    const posts = [makePost('1', { content: null })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    expect(screen.queryByText('Expert Guide')).not.toBeInTheDocument();
  });

  it('shows metaDescription as excerpt when available', () => {
    const posts = [makePost('1', { metaDescription: 'My custom description' })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
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
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    // After stripping markdown: "Title Some bold content with link"
    expect(screen.getByText(/Title.*Some bold content with link/)).toBeInTheDocument();
  });

  it('shows "Read article" link for each post', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3')];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    const readLinks = screen.getAllByText('Read article');
    expect(readLinks).toHaveLength(3);
  });

  it('links post titles to /{slug}', () => {
    const posts = [makePost('1', { slug: 'blog/my-great-post' })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    const titleLink = screen.getByText('Blog Post 1').closest('a');
    expect(titleLink).toHaveAttribute('href', '/blog/my-great-post');
  });

  it('links "Read article" to /{slug}', () => {
    const posts = [makePost('1', { slug: 'blog/my-great-post' })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    const readLink = screen.getByText('Read article');
    expect(readLink.closest('a')).toHaveAttribute('href', '/blog/my-great-post');
  });

  it('shows "View All Articles" link to /blog', () => {
    render(<HomepageBlogSection posts={[makePost('1')]} {...defaultProps} />);
    const viewAll = screen.getByText('View All Articles');
    expect(viewAll.closest('a')).toHaveAttribute('href', '/blog');
  });

  it('limits to 3 posts maximum', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3'), makePost('4')];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    expect(screen.getByText('Blog Post 1')).toBeInTheDocument();
    expect(screen.getByText('Blog Post 2')).toBeInTheDocument();
    expect(screen.getByText('Blog Post 3')).toBeInTheDocument();
    expect(screen.queryByText('Blog Post 4')).not.toBeInTheDocument();
  });

  it('applies primaryColor to "Expert Guide" badge', () => {
    const posts = [makePost('1', { content: { body: 'text', qualityScore: 90 } })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    const badge = screen.getByText('Expert Guide');
    expect(badge).toHaveStyle({ color: '#0d9488' });
  });

  it('applies primaryColor to "Read article" links', () => {
    const posts = [makePost('1')];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    const readLink = screen.getByText('Read article').closest('a');
    expect(readLink).toHaveStyle({ color: '#0d9488' });
  });

  it('renders datetime attribute on time element', () => {
    const posts = [makePost('1', { createdAt: new Date('2025-06-15') })];
    render(<HomepageBlogSection posts={posts} {...defaultProps} />);
    const timeEl = screen.getByText('Jun 15, 2025');
    expect(timeEl.tagName.toLowerCase()).toBe('time');
    expect(timeEl).toHaveAttribute('dateTime');
  });
});
