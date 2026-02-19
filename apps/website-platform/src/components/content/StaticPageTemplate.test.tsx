import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StaticPageTemplate } from './StaticPageTemplate';

// Mock ContentRenderer
vi.mock('./ContentRenderer', () => ({
  ContentRenderer: ({ content, format }: any) => (
    <div data-testid="content-renderer" data-format={format}>
      {content.substring(0, 100)}
    </div>
  ),
}));

function makePage(overrides: Record<string, any> = {}) {
  return {
    id: 'page-1',
    title: 'About Us',
    metaDescription: 'Learn more about our company',
    content: {
      id: 'content-1',
      body: '# About\n\nWe are a travel company.',
      bodyFormat: 'MARKDOWN',
      isAiGenerated: false,
      qualityScore: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-06-15'),
    },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-15'),
    ...overrides,
  } as any;
}

describe('StaticPageTemplate', () => {
  it('renders page title', () => {
    render(<StaticPageTemplate page={makePage()} siteName="London Tours" />);
    expect(screen.getByText('About Us')).toBeDefined();
  });

  it('renders meta description', () => {
    render(<StaticPageTemplate page={makePage()} siteName="London Tours" />);
    expect(screen.getByText('Learn more about our company')).toBeDefined();
  });

  it('hides meta description when not provided', () => {
    render(
      <StaticPageTemplate page={makePage({ metaDescription: null })} siteName="London Tours" />
    );
    expect(screen.queryByText('Learn more about our company')).toBeNull();
  });

  it('renders last updated date', () => {
    render(<StaticPageTemplate page={makePage()} siteName="London Tours" />);
    expect(document.body.textContent).toContain('Last updated');
  });

  it('renders content through ContentRenderer', () => {
    render(<StaticPageTemplate page={makePage()} siteName="London Tours" />);
    const renderer = document.querySelector('[data-testid="content-renderer"]');
    expect(renderer).toBeTruthy();
    expect(renderer!.getAttribute('data-format')).toBe('markdown');
  });

  it('renders default about content when page has no content', () => {
    render(
      <StaticPageTemplate
        page={makePage({ content: null })}
        siteName="London Tours"
        pageType="about"
      />
    );
    const renderer = document.querySelector('[data-testid="content-renderer"]');
    expect(renderer).toBeTruthy();
    expect(renderer!.textContent).toContain('Welcome to London Tours');
  });

  it('renders default contact content for contact page type', () => {
    render(
      <StaticPageTemplate
        page={makePage({ content: null })}
        siteName="London Tours"
        pageType="contact"
      />
    );
    const renderer = document.querySelector('[data-testid="content-renderer"]');
    expect(renderer!.textContent).toContain('Get in Touch');
  });

  it('renders default legal content for legal page type', () => {
    render(
      <StaticPageTemplate
        page={makePage({ content: null })}
        siteName="London Tours"
        pageType="legal"
      />
    );
    const renderer = document.querySelector('[data-testid="content-renderer"]');
    expect(renderer!.textContent).toContain('legal information');
  });

  it('renders HTML format when bodyFormat is HTML', () => {
    render(
      <StaticPageTemplate
        page={makePage({
          content: { ...makePage().content, bodyFormat: 'HTML', body: '<p>HTML content</p>' },
        })}
        siteName="London Tours"
      />
    );
    const renderer = document.querySelector('[data-testid="content-renderer"]');
    expect(renderer!.getAttribute('data-format')).toBe('html');
  });

  it('renders footer with copyright', () => {
    render(<StaticPageTemplate page={makePage()} siteName="London Tours" />);
    expect(document.body.textContent).toContain('Holibob');
    expect(document.body.textContent).toContain('All rights reserved');
  });
});
