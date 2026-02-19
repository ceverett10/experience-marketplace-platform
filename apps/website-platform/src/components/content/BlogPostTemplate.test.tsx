import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlogPostTemplate } from './BlogPostTemplate';

// Mock ContentRenderer
vi.mock('./ContentRenderer', () => ({
  ContentRenderer: ({ content, format }: any) => (
    <div data-testid="content-renderer" data-format={format}>
      {content}
    </div>
  ),
}));

function makePost(overrides: Record<string, any> = {}) {
  return {
    id: 'post-1',
    slug: 'blog/test-post',
    title: 'Best Walking Tours in London',
    metaTitle: null,
    metaDescription: 'Discover the top walking tours in London',
    status: 'PUBLISHED',
    createdAt: new Date('2025-06-15'),
    updatedAt: new Date('2025-06-15'),
    content: {
      id: 'content-1',
      body: '# Walking Tours\n\nLondon has many great walking tours.',
      bodyFormat: 'MARKDOWN',
      qualityScore: 85,
      readabilityScore: 70,
      isAiGenerated: true,
      aiModel: 'claude-3',
    },
    ...overrides,
  } as any;
}

describe('BlogPostTemplate', () => {
  it('renders post title', () => {
    render(<BlogPostTemplate post={makePost()} />);
    expect(screen.getByText('Best Walking Tours in London')).toBeDefined();
  });

  it('renders meta description', () => {
    render(<BlogPostTemplate post={makePost()} />);
    expect(screen.getByText('Discover the top walking tours in London')).toBeDefined();
  });

  it('hides meta description when not provided', () => {
    render(<BlogPostTemplate post={makePost({ metaDescription: null })} />);
    expect(screen.queryByText('Discover the top walking tours in London')).toBeNull();
  });

  it('renders formatted date', () => {
    render(<BlogPostTemplate post={makePost()} />);
    expect(screen.getByText('June 15, 2025')).toBeDefined();
  });

  it('renders High Quality badge when quality score >= 80', () => {
    render(<BlogPostTemplate post={makePost()} />);
    expect(screen.getByText('High Quality')).toBeDefined();
  });

  it('hides High Quality badge when quality score < 80', () => {
    render(
      <BlogPostTemplate
        post={makePost({
          content: { ...makePost().content, qualityScore: 50 },
        })}
      />
    );
    expect(screen.queryByText('High Quality')).toBeNull();
  });

  it('renders Updated date when updatedAt differs from createdAt', () => {
    render(
      <BlogPostTemplate
        post={makePost({ updatedAt: new Date('2025-07-01') })}
      />
    );
    expect(screen.getByText(/Updated:/)).toBeDefined();
  });

  it('hides Updated date when dates are equal', () => {
    render(<BlogPostTemplate post={makePost()} />);
    expect(screen.queryByText(/Updated:/)).toBeNull();
  });

  it('renders content through ContentRenderer', () => {
    render(<BlogPostTemplate post={makePost()} />);
    const renderer = document.querySelector('[data-testid="content-renderer"]');
    expect(renderer).toBeTruthy();
    expect(renderer!.getAttribute('data-format')).toBe('markdown');
  });

  it('renders placeholder when no content', () => {
    render(<BlogPostTemplate post={makePost({ content: null })} />);
    expect(screen.getByText(/being generated/)).toBeDefined();
  });

  it('renders About section with site name', () => {
    render(<BlogPostTemplate post={makePost()} siteName="London Tours" />);
    expect(screen.getByText('About London Tours')).toBeDefined();
  });

  it('renders About section with fallback when no site name', () => {
    render(<BlogPostTemplate post={makePost()} />);
    expect(screen.getByText('About Us')).toBeDefined();
  });
});
