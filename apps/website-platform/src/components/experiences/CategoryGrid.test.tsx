import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryGrid } from './CategoryGrid';

vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/common/UnsplashAttribution', () => ({
  UnsplashAttribution: () => <span data-testid="unsplash-attr" />,
}));

vi.mock('@/lib/image-utils', () => ({
  BLUR_PLACEHOLDER: 'data:image/png;base64,placeholder',
  shouldSkipOptimization: vi.fn(() => false),
}));

function makeCategory(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    name: `Category ${id}`,
    slug: `cat-${id}`,
    ...overrides,
  };
}

describe('CategoryGrid', () => {
  it('renders default title "Browse by Category"', () => {
    render(<CategoryGrid categories={[makeCategory('1')]} />);
    expect(screen.getByText('Browse by Category')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<CategoryGrid categories={[makeCategory('1')]} title="Custom Title" />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.queryByText('Browse by Category')).not.toBeInTheDocument();
  });

  it('shows subtitle when provided', () => {
    render(<CategoryGrid categories={[makeCategory('1')]} subtitle="A helpful subtitle" />);
    expect(screen.getByText('A helpful subtitle')).toBeInTheDocument();
  });

  it('shows default categories when empty array provided', () => {
    render(<CategoryGrid categories={[]} />);
    expect(screen.getByText('Tours & Sightseeing')).toBeInTheDocument();
    expect(screen.getByText('Day Trips')).toBeInTheDocument();
    expect(screen.getByText('Attractions')).toBeInTheDocument();
    expect(screen.getByText('Food & Drink')).toBeInTheDocument();
  });

  it('shows provided categories', () => {
    const categories = [
      makeCategory('1', { name: 'Boat Tours' }),
      makeCategory('2', { name: 'Walking' }),
    ];
    render(<CategoryGrid categories={categories} />);
    expect(screen.getByText('Boat Tours')).toBeInTheDocument();
    expect(screen.getByText('Walking')).toBeInTheDocument();
  });

  it('shows category images when imageUrl exists', () => {
    const categories = [makeCategory('1', { name: 'Boat Tours', imageUrl: '/img/boats.jpg' })];
    render(<CategoryGrid categories={categories} />);
    const img = screen.getByAltText('Boat Tours');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/img/boats.jpg');
  });

  it('shows fallback (icon) when no imageUrl', () => {
    const categories = [makeCategory('1', { name: 'Custom', slug: 'tours' })];
    render(<CategoryGrid categories={categories} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows experience count when provided', () => {
    const categories = [makeCategory('1', { count: 42 })];
    render(<CategoryGrid categories={categories} />);
    expect(screen.getByText('42 experiences')).toBeInTheDocument();
  });

  it('links include category name as search param q', () => {
    const categories = [makeCategory('1', { name: 'Boat Tours' })];
    render(<CategoryGrid categories={categories} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', expect.stringContaining('q=Boat+Tours'));
  });

  it('links include destination param when provided', () => {
    const categories = [makeCategory('1', { name: 'Tours' })];
    render(<CategoryGrid categories={categories} destination="London" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', expect.stringContaining('destination=London'));
  });

  it('shows Explore text for each category with image', () => {
    const categories = [
      makeCategory('1', { imageUrl: '/img/a.jpg' }),
      makeCategory('2', { imageUrl: '/img/b.jpg' }),
    ];
    render(<CategoryGrid categories={categories} />);
    const explores = screen.getAllByText('Explore');
    expect(explores.length).toBeGreaterThanOrEqual(2);
  });
});
