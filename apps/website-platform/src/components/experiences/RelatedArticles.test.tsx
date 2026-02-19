import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedArticles } from './RelatedArticles';

function makeBlogPost(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    slug: `blog/test-post-${id}`,
    title: `Test Post ${id}`,
    metaDescription: `Description for post ${id}`,
    createdAt: new Date('2026-01-15'),
    content: {
      body: `This is the body of post ${id} with some **bold** text and [links](http://example.com).`,
      qualityScore: 75,
    },
    ...overrides,
  };
}

describe('RelatedArticles', () => {
  const defaultProps = {
    posts: [makeBlogPost('1'), makeBlogPost('2'), makeBlogPost('3')],
    experienceTitle: 'London Walking Tour',
  };

  it('returns null when posts array is empty', () => {
    const { container } = render(<RelatedArticles {...defaultProps} posts={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders heading with locationName when provided', () => {
    render(<RelatedArticles {...defaultProps} locationName="London" />);
    expect(screen.getByText('Guides for London')).toBeInTheDocument();
  });

  it('renders heading with categoryName when locationName is not provided', () => {
    render(<RelatedArticles {...defaultProps} categoryName="Walking Tours" />);
    expect(screen.getByText('Tips for Walking Tours')).toBeInTheDocument();
  });

  it('renders default heading when no location or category provided', () => {
    render(<RelatedArticles {...defaultProps} />);
    expect(screen.getByText('Travel Tips & Guides')).toBeInTheDocument();
  });

  it('prioritizes locationName over categoryName for heading', () => {
    render(<RelatedArticles {...defaultProps} locationName="Paris" categoryName="Food Tours" />);
    expect(screen.getByText('Guides for Paris')).toBeInTheDocument();
    expect(screen.queryByText('Tips for Food Tours')).not.toBeInTheDocument();
  });

  it('renders subtitle text', () => {
    render(<RelatedArticles {...defaultProps} />);
    expect(
      screen.getByText('Helpful articles to make the most of your experience')
    ).toBeInTheDocument();
  });

  it('renders post titles', () => {
    render(<RelatedArticles {...defaultProps} />);
    expect(screen.getByText('Test Post 1')).toBeInTheDocument();
    expect(screen.getByText('Test Post 2')).toBeInTheDocument();
    expect(screen.getByText('Test Post 3')).toBeInTheDocument();
  });

  it('renders post meta descriptions as excerpts', () => {
    render(<RelatedArticles {...defaultProps} />);
    expect(screen.getByText('Description for post 1')).toBeInTheDocument();
    expect(screen.getByText('Description for post 2')).toBeInTheDocument();
  });

  it('generates excerpt from body when metaDescription is null', () => {
    const posts = [
      makeBlogPost('1', {
        metaDescription: null,
        content: {
          body: '## Introduction\nThis is the **body** of the post with [link](http://x.com). It has lots of content that should get truncated.',
          qualityScore: 75,
        },
      }),
    ];
    render(<RelatedArticles {...defaultProps} posts={posts} />);
    // Markdown should be stripped: no ##, **, or [link]()
    const excerpt = screen.getByText(/This is the body of the post/);
    expect(excerpt).toBeInTheDocument();
    expect(excerpt.textContent).not.toContain('##');
    expect(excerpt.textContent).not.toContain('**');
  });

  it('limits displayed posts to 3', () => {
    const posts = [makeBlogPost('1'), makeBlogPost('2'), makeBlogPost('3'), makeBlogPost('4')];
    render(<RelatedArticles {...defaultProps} posts={posts} />);
    expect(screen.getByText('Test Post 1')).toBeInTheDocument();
    expect(screen.getByText('Test Post 2')).toBeInTheDocument();
    expect(screen.getByText('Test Post 3')).toBeInTheDocument();
    expect(screen.queryByText('Test Post 4')).not.toBeInTheDocument();
  });

  it('links posts to their slug URL', () => {
    render(<RelatedArticles {...defaultProps} />);
    const links = screen.getAllByRole('link');
    const postLinks = links.filter((l) => l.getAttribute('href')?.startsWith('/blog/'));
    expect(postLinks).toHaveLength(3);
    expect(postLinks[0]).toHaveAttribute('href', '/blog/test-post-1');
  });

  it('shows "Expert Guide" badge when qualityScore >= 80', () => {
    const posts = [
      makeBlogPost('1', {
        content: { body: 'Great content', qualityScore: 85 },
      }),
    ];
    render(<RelatedArticles {...defaultProps} posts={posts} />);
    expect(screen.getByText('Expert Guide')).toBeInTheDocument();
  });

  it('does not show "Expert Guide" badge when qualityScore < 80', () => {
    const posts = [
      makeBlogPost('1', {
        content: { body: 'Good content', qualityScore: 75 },
      }),
    ];
    render(<RelatedArticles {...defaultProps} posts={posts} />);
    expect(screen.queryByText('Expert Guide')).not.toBeInTheDocument();
  });

  it('does not show "Expert Guide" badge when qualityScore is null', () => {
    const posts = [
      makeBlogPost('1', {
        content: { body: 'Content', qualityScore: null },
      }),
    ];
    render(<RelatedArticles {...defaultProps} posts={posts} />);
    expect(screen.queryByText('Expert Guide')).not.toBeInTheDocument();
  });

  it('shows "Read more" for each post', () => {
    render(<RelatedArticles {...defaultProps} />);
    const readMoreLinks = screen.getAllByText('Read more');
    expect(readMoreLinks).toHaveLength(3);
  });

  it('shows "View all articles" link pointing to /blog', () => {
    render(<RelatedArticles {...defaultProps} />);
    const viewAllLinks = screen.getAllByText('View all articles');
    expect(viewAllLinks.length).toBeGreaterThanOrEqual(1);
    const link = viewAllLinks[0]!.closest('a');
    expect(link).toHaveAttribute('href', '/blog');
  });

  it('applies custom primaryColor to "View all articles" link', () => {
    render(<RelatedArticles {...defaultProps} primaryColor="#ff0000" />);
    const viewAllLinks = screen.getAllByText('View all articles');
    expect(viewAllLinks[0]).toHaveStyle({ color: '#ff0000' });
  });

  it('applies custom primaryColor to "Expert Guide" badge', () => {
    const posts = [
      makeBlogPost('1', {
        content: { body: 'Great content', qualityScore: 90 },
      }),
    ];
    render(<RelatedArticles {...defaultProps} posts={posts} primaryColor="#ff0000" />);
    const badge = screen.getByText('Expert Guide');
    expect(badge).toHaveStyle({ color: '#ff0000' });
  });
});
