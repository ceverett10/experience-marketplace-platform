import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedArticles } from './RelatedArticles';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const createMockPost = (overrides = {}) => ({
  id: 'post-1',
  slug: 'blog/test-post',
  title: 'Test Blog Post Title',
  metaDescription: 'A great blog post about testing.',
  createdAt: new Date('2026-01-15'),
  content: {
    body: '## Hello World\nThis is a **test** post with some content.',
    qualityScore: 85,
  },
  ...overrides,
});

describe('RelatedArticles', () => {
  const defaultProps = {
    posts: [createMockPost()],
    experienceTitle: 'Amazing City Tour',
  };

  describe('rendering', () => {
    it('renders nothing when posts array is empty', () => {
      const { container } = render(
        <RelatedArticles posts={[]} experienceTitle="Amazing City Tour" />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders the component when posts are provided', () => {
      render(<RelatedArticles {...defaultProps} />);
      expect(screen.getByText('Test Blog Post Title')).toBeInTheDocument();
    });

    it('renders "View all articles" link pointing to /blog', () => {
      render(<RelatedArticles {...defaultProps} />);
      const links = screen.getAllByText('View all articles');
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(links[0].closest('a')).toHaveAttribute('href', '/blog');
    });

    it('renders "Read more" text for each post', () => {
      render(<RelatedArticles {...defaultProps} />);
      expect(screen.getByText('Read more')).toBeInTheDocument();
    });

    it('renders subtitle text', () => {
      render(<RelatedArticles {...defaultProps} />);
      expect(
        screen.getByText('Helpful articles to make the most of your experience')
      ).toBeInTheDocument();
    });
  });

  describe('heading generation', () => {
    it('shows location-based heading when locationName is provided', () => {
      render(<RelatedArticles {...defaultProps} locationName="London" />);
      expect(screen.getByText('Guides for London')).toBeInTheDocument();
    });

    it('shows category-based heading when categoryName is provided (no location)', () => {
      render(<RelatedArticles {...defaultProps} categoryName="Food Tours" />);
      expect(screen.getByText('Tips for Food Tours')).toBeInTheDocument();
    });

    it('prefers locationName over categoryName for heading', () => {
      render(<RelatedArticles {...defaultProps} locationName="Paris" categoryName="Museums" />);
      expect(screen.getByText('Guides for Paris')).toBeInTheDocument();
      expect(screen.queryByText('Tips for Museums')).not.toBeInTheDocument();
    });

    it('shows generic heading when neither location nor category is provided', () => {
      render(<RelatedArticles {...defaultProps} />);
      expect(screen.getByText('Travel Tips & Guides')).toBeInTheDocument();
    });
  });

  describe('post content', () => {
    it('renders metaDescription as excerpt when available', () => {
      render(<RelatedArticles {...defaultProps} />);
      expect(screen.getByText('A great blog post about testing.')).toBeInTheDocument();
    });

    it('generates excerpt from content body when metaDescription is null', () => {
      const post = createMockPost({
        metaDescription: null,
        content: {
          body: 'This is a simple paragraph without any markdown formatting that should be used as the excerpt.',
          qualityScore: 70,
        },
      });
      render(<RelatedArticles posts={[post]} experienceTitle="Tour" />);
      expect(
        screen.getByText(
          'This is a simple paragraph without any markdown formatting that should be used as the excerpt.'
        )
      ).toBeInTheDocument();
    });

    it('strips markdown formatting from excerpt', () => {
      const post = createMockPost({
        metaDescription: null,
        content: {
          body: '## Header\n**Bold text** and *italic text* with a [link](http://example.com)',
          qualityScore: 70,
        },
      });
      render(<RelatedArticles posts={[post]} experienceTitle="Tour" />);
      // Should not contain markdown characters
      expect(screen.queryByText(/##/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    });

    it('truncates long excerpts with ellipsis', () => {
      const longBody = 'A'.repeat(200);
      const post = createMockPost({
        metaDescription: null,
        content: { body: longBody, qualityScore: 70 },
      });
      render(<RelatedArticles posts={[post]} experienceTitle="Tour" />);
      const excerptEl = screen.getByText(/\.\.\.$/);
      expect(excerptEl.textContent!.length).toBeLessThanOrEqual(104); // 100 chars + "..."
    });

    it('shows "Expert Guide" badge when qualityScore >= 80', () => {
      render(<RelatedArticles {...defaultProps} />);
      expect(screen.getByText('Expert Guide')).toBeInTheDocument();
    });

    it('does not show "Expert Guide" badge when qualityScore < 80', () => {
      const post = createMockPost({
        content: { body: 'Some content', qualityScore: 60 },
      });
      render(<RelatedArticles posts={[post]} experienceTitle="Tour" />);
      expect(screen.queryByText('Expert Guide')).not.toBeInTheDocument();
    });

    it('does not show "Expert Guide" badge when qualityScore is null', () => {
      const post = createMockPost({
        content: { body: 'Some content', qualityScore: null },
      });
      render(<RelatedArticles posts={[post]} experienceTitle="Tour" />);
      expect(screen.queryByText('Expert Guide')).not.toBeInTheDocument();
    });

    it('does not show "Expert Guide" badge when content is null', () => {
      const post = createMockPost({ content: null });
      render(<RelatedArticles posts={[post]} experienceTitle="Tour" />);
      expect(screen.queryByText('Expert Guide')).not.toBeInTheDocument();
    });
  });

  describe('post links', () => {
    it('links to the correct post URL using slug', () => {
      render(<RelatedArticles {...defaultProps} />);
      const postLink = screen.getByText('Test Blog Post Title').closest('a');
      expect(postLink).toHaveAttribute('href', '/blog/test-post');
    });
  });

  describe('multiple posts', () => {
    it('renders up to 3 posts', () => {
      const posts = [
        createMockPost({ id: '1', title: 'Post One' }),
        createMockPost({ id: '2', title: 'Post Two' }),
        createMockPost({ id: '3', title: 'Post Three' }),
      ];
      render(<RelatedArticles posts={posts} experienceTitle="Tour" />);
      expect(screen.getByText('Post One')).toBeInTheDocument();
      expect(screen.getByText('Post Two')).toBeInTheDocument();
      expect(screen.getByText('Post Three')).toBeInTheDocument();
    });

    it('limits display to 3 posts even when more are provided', () => {
      const posts = [
        createMockPost({ id: '1', title: 'Post One' }),
        createMockPost({ id: '2', title: 'Post Two' }),
        createMockPost({ id: '3', title: 'Post Three' }),
        createMockPost({ id: '4', title: 'Post Four' }),
      ];
      render(<RelatedArticles posts={posts} experienceTitle="Tour" />);
      expect(screen.getByText('Post One')).toBeInTheDocument();
      expect(screen.getByText('Post Three')).toBeInTheDocument();
      expect(screen.queryByText('Post Four')).not.toBeInTheDocument();
    });
  });

  describe('primaryColor styling', () => {
    it('uses default primary color when not provided', () => {
      render(<RelatedArticles {...defaultProps} />);
      const readMore = screen.getByText('Read more');
      expect(readMore).toHaveStyle({ color: '#6366f1' });
    });

    it('uses custom primary color when provided', () => {
      render(<RelatedArticles {...defaultProps} primaryColor="#ff0000" />);
      const readMore = screen.getByText('Read more');
      expect(readMore).toHaveStyle({ color: '#ff0000' });
    });

    it('applies primary color to "View all articles" links', () => {
      render(<RelatedArticles {...defaultProps} primaryColor="#00ff00" />);
      const links = screen.getAllByText('View all articles');
      expect(links[0]).toHaveStyle({ color: '#00ff00' });
    });
  });
});
