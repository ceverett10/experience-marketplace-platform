import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DestinationPageTemplate } from './DestinationPageTemplate';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} />,
}));

// Mock ContentRenderer
vi.mock('./ContentRenderer', () => ({
  ContentRenderer: ({ content, format }: { content: string; format: string }) => (
    <div data-testid="content-renderer" data-format={format}>
      {content}
    </div>
  ),
}));

// Mock image-utils
vi.mock('@/lib/image-utils', () => ({
  BLUR_PLACEHOLDER: 'data:image/png;base64,placeholder',
  isHolibobImage: vi.fn(() => false),
}));

function makeDestination(overrides: Record<string, any> = {}) {
  return {
    id: 'dest-1',
    slug: 'destinations/london',
    title: 'Discover London',
    metaTitle: 'London Guide',
    metaDescription: 'Your complete guide to London',
    status: 'PUBLISHED',
    holibobLocationId: 'loc-1',
    content: {
      id: 'content-1',
      body: 'London is a vibrant city.',
      bodyFormat: 'MARKDOWN',
      structuredData: null,
    },
    ...overrides,
  } as any;
}

function makeExperience(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    slug: `tour-${id}`,
    title: `Tour ${id}`,
    shortDescription: `A great tour ${id}`,
    imageUrl: `/images/${id}.jpg`,
    price: { formatted: '£35.00' },
    rating: { average: 4.5, count: 100 },
    categories: [{ name: 'Tours' }],
    ...overrides,
  };
}

describe('DestinationPageTemplate', () => {
  it('renders destination title', () => {
    render(<DestinationPageTemplate destination={makeDestination()} />);
    expect(screen.getByText('Discover London')).toBeDefined();
  });

  it('renders meta description', () => {
    render(<DestinationPageTemplate destination={makeDestination()} />);
    expect(screen.getByText('Your complete guide to London')).toBeDefined();
  });

  it('renders "being generated" message when no content', () => {
    render(<DestinationPageTemplate destination={makeDestination({ content: null })} />);
    expect(screen.getByText(/being generated/)).toBeDefined();
  });

  it('renders content via ContentRenderer', () => {
    render(<DestinationPageTemplate destination={makeDestination()} />);
    const renderer = screen.getByTestId('content-renderer');
    expect(renderer.textContent).toBe('London is a vibrant city.');
    expect(renderer.getAttribute('data-format')).toBe('markdown');
  });

  it('renders sidebar with quick navigation', () => {
    render(<DestinationPageTemplate destination={makeDestination()} />);
    expect(screen.getByText('Quick Navigation')).toBeDefined();
    expect(screen.getByText('Things to Do')).toBeDefined();
    expect(screen.getByText('Best Time to Visit')).toBeDefined();
  });

  it('renders travel tips', () => {
    render(<DestinationPageTemplate destination={makeDestination()} />);
    expect(screen.getByText('Book activities in advance')).toBeDefined();
    expect(screen.getByText('Check local weather')).toBeDefined();
  });

  it('does not render experiences section when none provided', () => {
    render(<DestinationPageTemplate destination={makeDestination()} />);
    expect(screen.queryByText('Hand-picked experiences')).toBeNull();
  });

  it('renders top experiences when provided', () => {
    const experiences = [makeExperience('1'), makeExperience('2')];
    render(
      <DestinationPageTemplate destination={makeDestination()} topExperiences={experiences} />
    );

    expect(screen.getByText('Tour 1')).toBeDefined();
    expect(screen.getByText('Tour 2')).toBeDefined();
    // Price appears for both experiences
    expect(screen.getAllByText('£35.00')).toHaveLength(2);
  });

  it('strips prefix from title for CTA section', () => {
    render(<DestinationPageTemplate destination={makeDestination()} />);
    // "Discover London" → strips "Discover " → "London"
    expect(screen.getByText(/Ready to Explore London/)).toBeDefined();
  });

  it('renders experience ratings', () => {
    const experiences = [makeExperience('1')];
    render(
      <DestinationPageTemplate destination={makeDestination()} topExperiences={experiences} />
    );

    expect(screen.getByText('4.5')).toBeDefined();
    expect(screen.getByText('(100 reviews)')).toBeDefined();
  });

  it('renders experience category badges', () => {
    const experiences = [makeExperience('1')];
    render(
      <DestinationPageTemplate destination={makeDestination()} topExperiences={experiences} />
    );

    expect(screen.getByText('Tours')).toBeDefined();
  });

  it('renders CTA link to experiences', () => {
    render(<DestinationPageTemplate destination={makeDestination()} />);

    const link = screen.getByText('View All Experiences');
    expect(link.closest('a')?.getAttribute('href')).toBe('/experiences');
  });

  it('handles experience without rating', () => {
    const experiences = [makeExperience('1', { rating: null })];
    render(
      <DestinationPageTemplate destination={makeDestination()} topExperiences={experiences} />
    );

    expect(screen.getByText('Tour 1')).toBeDefined();
    // Should not crash
    expect(screen.queryByText('reviews')).toBeNull();
  });
});
