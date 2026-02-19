import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FAQPageTemplate } from './FAQPageTemplate';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock ContentRenderer
vi.mock('./ContentRenderer', () => ({
  ContentRenderer: ({ content, format }: { content: string; format: string }) => (
    <div data-testid="content-renderer" data-format={format}>
      {content}
    </div>
  ),
}));

function makePage(overrides: Partial<Parameters<typeof FAQPageTemplate>[0]['page']> = {}) {
  return {
    id: 'page-1',
    slug: 'faq/booking',
    title: 'Booking FAQ',
    metaTitle: 'Booking FAQ | Test Site',
    metaDescription: 'Common questions about booking',
    status: 'PUBLISHED' as const,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-02-10'),
    content: {
      id: 'content-1',
      body: 'FAQ content here',
      bodyFormat: 'MARKDOWN' as const,
      qualityScore: 85,
      readabilityScore: 90,
      isAiGenerated: true,
      aiModel: 'gpt-4',
    },
    ...overrides,
  };
}

const sampleFaqs = [
  { question: 'How do I book?', answer: 'Click the book button.' },
  { question: 'Can I cancel?', answer: 'Yes, free cancellation within 24h.' },
  { question: 'What payment methods?', answer: 'We accept all major cards.' },
];

describe('FAQPageTemplate', () => {
  it('renders page title', () => {
    render(<FAQPageTemplate page={makePage()} />);
    expect(screen.getByText('Booking FAQ')).toBeDefined();
  });

  it('renders meta description when provided', () => {
    render(<FAQPageTemplate page={makePage()} />);
    expect(screen.getByText('Common questions about booking')).toBeDefined();
  });

  it('renders "being generated" message when no content', () => {
    render(<FAQPageTemplate page={makePage({ content: null })} />);
    expect(screen.getByText(/being generated/)).toBeDefined();
  });

  it('renders formatted creation date', () => {
    render(<FAQPageTemplate page={makePage()} />);
    // en-US format: January 15, 2025
    expect(screen.getByText('January 15, 2025')).toBeDefined();
  });

  it('renders FAQ count badge', () => {
    render(<FAQPageTemplate page={makePage()} faqs={sampleFaqs} />);
    expect(screen.getByText('3 Questions')).toBeDefined();
  });

  it('renders singular "Question" for single FAQ', () => {
    render(<FAQPageTemplate page={makePage()} faqs={[sampleFaqs[0]]} />);
    expect(screen.getByText('1 Question')).toBeDefined();
  });

  it('renders quick navigation links for FAQs', () => {
    render(<FAQPageTemplate page={makePage()} faqs={sampleFaqs} />);

    expect(screen.getByText('Jump to Question')).toBeDefined();
    // Questions appear in both nav and accordion — use getAllByText
    expect(screen.getAllByText('How do I book?').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Can I cancel?').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('What payment methods?').length).toBeGreaterThanOrEqual(2);
  });

  it('renders FAQ accordion with first item open', () => {
    const { container } = render(<FAQPageTemplate page={makePage()} faqs={sampleFaqs} />);

    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(3);
    // First item should be open by default
    expect(details[0].hasAttribute('open')).toBe(true);
    expect(details[1].hasAttribute('open')).toBe(false);
  });

  it('renders FAQ answers via ContentRenderer', () => {
    const { container } = render(<FAQPageTemplate page={makePage()} faqs={sampleFaqs} />);

    const renderers = container.querySelectorAll('[data-testid="content-renderer"]');
    expect(renderers).toHaveLength(3);
    expect(renderers[0].getAttribute('data-format')).toBe('markdown');
  });

  it('shows full content body when no FAQs provided', () => {
    render(<FAQPageTemplate page={makePage()} faqs={[]} />);

    const renderer = screen.getByTestId('content-renderer');
    expect(renderer.textContent).toBe('FAQ content here');
    expect(renderer.getAttribute('data-format')).toBe('markdown');
  });

  it('renders action links (Browse All FAQs, Browse Experiences, Contact Us)', () => {
    render(<FAQPageTemplate page={makePage()} />);

    expect(screen.getByText('Browse All FAQs')).toBeDefined();
    expect(screen.getByText('Browse Experiences')).toBeDefined();
    expect(screen.getByText('Contact Us')).toBeDefined();
  });

  it('renders last updated date in footer', () => {
    render(<FAQPageTemplate page={makePage()} />);
    // updatedAt: 2025-02-10
    expect(screen.getByText(/February 10, 2025/)).toBeDefined();
  });

  it('renders site name in footer when provided', () => {
    render(<FAQPageTemplate page={makePage()} siteName="Test Platform" />);
    expect(screen.getByText('Published by Test Platform')).toBeDefined();
  });

  it('does not render site name when not provided', () => {
    render(<FAQPageTemplate page={makePage()} />);
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('Published by');
  });
});
