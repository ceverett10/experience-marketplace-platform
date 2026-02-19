import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pagination } from './Pagination';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock site-context
vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0d9488' }),
}));

describe('Pagination', () => {
  it('renders page info', () => {
    render(<Pagination currentPage={1} totalPages={5} baseUrl="/blog" />);
    expect(document.body.textContent).toContain('Page');
    expect(document.body.textContent).toContain('of');
  });

  it('renders Previous as disabled on first page', () => {
    render(<Pagination currentPage={1} totalPages={5} baseUrl="/blog" />);
    const prevButtons = screen.getAllByText('Previous');
    // At least one should be a span (disabled), not a link
    const disabledPrev = prevButtons.find((el) => el.tagName === 'SPAN');
    expect(disabledPrev).toBeDefined();
  });

  it('renders Previous as link on page > 1', () => {
    render(<Pagination currentPage={3} totalPages={5} baseUrl="/blog" />);
    const links = document.querySelectorAll('a[href="/blog?page=2"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Next as disabled on last page', () => {
    render(<Pagination currentPage={5} totalPages={5} baseUrl="/blog" />);
    const nextButtons = screen.getAllByText('Next');
    const disabledNext = nextButtons.find((el) => el.tagName === 'SPAN');
    expect(disabledNext).toBeDefined();
  });

  it('renders Next as link when not on last page', () => {
    render(<Pagination currentPage={2} totalPages={5} baseUrl="/blog" />);
    const links = document.querySelectorAll('a[href="/blog?page=3"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renders page 1 without page param in URL', () => {
    render(<Pagination currentPage={2} totalPages={5} baseUrl="/blog" />);
    // Page 1 link should have no page param
    const links = document.querySelectorAll('a[href="/blog"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('highlights current page', () => {
    render(<Pagination currentPage={3} totalPages={5} baseUrl="/blog" />);
    const currentPageEl = document.querySelector('[aria-current="page"]');
    expect(currentPageEl).toBeTruthy();
    expect(currentPageEl!.textContent).toBe('3');
  });

  it('shows all pages when total <= 7', () => {
    render(<Pagination currentPage={3} totalPages={5} baseUrl="/blog" />);
    // Should show pages 1-5 without ellipsis
    expect(screen.queryByText('...')).toBeNull();
  });

  it('shows ellipsis for many pages', () => {
    render(<Pagination currentPage={5} totalPages={20} baseUrl="/blog" />);
    const ellipses = screen.getAllByText('...');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it('always shows first and last page for many pages', () => {
    render(<Pagination currentPage={10} totalPages={20} baseUrl="/blog" />);
    // Page 1 should be a link
    const page1Links = document.querySelectorAll('a[href="/blog"]');
    expect(page1Links.length).toBeGreaterThanOrEqual(1);
    // Page 20 should be a link
    const page20Links = document.querySelectorAll('a[href="/blog?page=20"]');
    expect(page20Links.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves search params in page URLs', () => {
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        baseUrl="/blog"
        searchParams={{ category: 'tours' }}
      />
    );
    const links = document.querySelectorAll('a[href*="category=tours"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renders mobile Previous/Next buttons', () => {
    render(<Pagination currentPage={2} totalPages={5} baseUrl="/blog" />);
    // Mobile view has simple Previous/Next text
    const prevs = screen.getAllByText('Previous');
    const nexts = screen.getAllByText('Next');
    expect(prevs.length).toBeGreaterThanOrEqual(1);
    expect(nexts.length).toBeGreaterThanOrEqual(1);
  });
});
