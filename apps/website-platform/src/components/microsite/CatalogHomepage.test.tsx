import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CatalogHomepage } from './CatalogHomepage';

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} />,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock image-utils
vi.mock('@/lib/image-utils', () => ({
  BLUR_PLACEHOLDER: 'data:image/png;base64,placeholder',
  isHolibobImage: vi.fn(() => false),
}));

// Mock pricing
vi.mock('@/lib/pricing', () => ({
  getProductPricingConfig: vi.fn(() => ({
    markupPercentage: 0,
    showDiscountBadge: false,
  })),
}));

// Mock child components
vi.mock('@/components/microsites/RelatedMicrosites', () => ({
  RelatedMicrosites: ({ microsites }: any) => (
    <div data-testid="related-microsites">{microsites.length} related</div>
  ),
}));

vi.mock('./HomepageBlogSection', () => ({
  HomepageBlogSection: ({ posts }: any) => (
    <div data-testid="blog-section">{posts.length} posts</div>
  ),
}));

vi.mock('./CuratedCollections', () => ({
  CuratedCollections: ({ collections }: any) => (
    <div data-testid="curated-collections">{collections.length} collections</div>
  ),
}));

vi.mock('@/components/ui/PriceDisplay', () => ({
  PriceDisplay: ({ priceFormatted }: any) => <span data-testid="price">{priceFormatted}</span>,
  DiscountBadge: () => <span data-testid="discount-badge">Sale</span>,
}));

function makeSite(overrides: Record<string, any> = {}) {
  return {
    id: 'site-1',
    name: 'London Tours',
    description: 'Best tours in London',
    brand: {
      primaryColor: '#0d9488',
      secondaryColor: '#14b8a6',
      logoUrl: '/logo.png',
      logoDarkUrl: '/logo-dark.png',
      tagline: 'Explore London with us',
    },
    ...overrides,
  } as any;
}

function makeLayoutConfig(overrides: Record<string, any> = {}) {
  return {
    gridColumns: 3,
    ...overrides,
  } as any;
}

function makeExperience(id: string) {
  return {
    id,
    title: `Tour ${id}`,
    slug: `tour-${id}`,
    shortDescription: `Description for tour ${id}`,
    imageUrl: `/images/${id}.jpg`,
    price: { amount: 3500, currency: 'GBP', formatted: '£35.00' },
    duration: { formatted: '2h', minutes: 120 },
    rating: { average: 4.5, count: 50 },
    location: { name: 'London' },
    categories: ['Tours'],
    cityId: 'city-1',
  };
}

describe('CatalogHomepage', () => {
  const defaultProps = {
    site: makeSite(),
    layoutConfig: makeLayoutConfig(),
    experiences: [makeExperience('1'), makeExperience('2'), makeExperience('3')],
  };

  it('renders site name in About section', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.getByText('About London Tours')).toBeDefined();
  });

  it('renders site description', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.getByText('Best tours in London')).toBeDefined();
  });

  it('renders experiences grid', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.getByText('Tour 1')).toBeDefined();
    expect(screen.getByText('Tour 2')).toBeDefined();
    expect(screen.getByText('Tour 3')).toBeDefined();
  });

  it('renders experience count in hero', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('Experiences')).toBeDefined();
  });

  it('uses totalExperienceCount when provided', () => {
    render(<CatalogHomepage {...defaultProps} totalExperienceCount={100} />);
    expect(screen.getByText('100')).toBeDefined();
  });

  it('renders Our Experiences section heading', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.getByText('Our Experiences')).toBeDefined();
  });

  it('shows View All button when total > displayed', () => {
    render(<CatalogHomepage {...defaultProps} totalExperienceCount={50} />);
    expect(screen.getByText(/View All 50 Experiences/)).toBeDefined();
  });

  it('does not show View All button when all displayed', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.queryByText(/View All/)).toBeNull();
  });

  it('renders logo when provided', () => {
    render(<CatalogHomepage {...defaultProps} />);
    const logos = document.querySelectorAll('img[alt="London Tours"]');
    expect(logos.length).toBeGreaterThanOrEqual(1);
  });

  it('renders tagline when provided', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.getByText('Explore London with us')).toBeDefined();
  });

  it('renders trust badges', () => {
    render(<CatalogHomepage {...defaultProps} />);
    // Appears in both hero and about sections
    expect(screen.getAllByText('Verified Operator').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Instant Confirmation').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Secure Booking').length).toBeGreaterThanOrEqual(2);
  });

  it('renders testimonials section', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.getByText('What Travelers Say')).toBeDefined();
  });

  it('renders custom testimonials', () => {
    const testimonials = [{ name: 'Alice', location: 'UK', text: 'Fantastic!', rating: 5 }];
    render(<CatalogHomepage {...defaultProps} testimonials={testimonials} />);
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText(/Fantastic!/)).toBeDefined();
  });

  it('renders compact trust strip instead of Browse CTA when isPpc is true', () => {
    render(<CatalogHomepage {...defaultProps} isPpc />);
    // PPC: no Browse Experiences button
    expect(screen.queryByText(/Browse.*Experiences/)).toBeNull();
    // PPC: compact trust strip with experience count + free cancellation
    const trustStrip = screen.getByText(/experiences available/i);
    expect(trustStrip).toBeDefined();
    expect(trustStrip.textContent).toMatch(/free cancellation/i);
  });

  it('does not render hero trust badges when isPpc is true', () => {
    render(<CatalogHomepage {...defaultProps} isPpc />);
    // Trust badges are in the About section but not duplicated in hero for PPC
    const verifiedBadges = screen.getAllByText('Verified Operator');
    // Only 1 instance (About section), not 2+ (hero + about)
    expect(verifiedBadges.length).toBe(1);
  });

  it('renders Free Cancellation badge on cards when isPpc is true', () => {
    render(<CatalogHomepage {...defaultProps} isPpc />);
    const badges = screen.getAllByText('Free Cancellation');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Book Now button on cards when isPpc is true', () => {
    render(<CatalogHomepage {...defaultProps} isPpc />);
    const bookNowButtons = screen.getAllByText('Book Now');
    expect(bookNowButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders blog section when posts provided', () => {
    const blogPosts = [
      {
        id: 'b1',
        slug: 'blog/test',
        title: 'Test Post',
        metaDescription: null,
        createdAt: new Date(),
      },
    ];
    render(<CatalogHomepage {...defaultProps} blogPosts={blogPosts} />);
    expect(document.querySelector('[data-testid="blog-section"]')).toBeTruthy();
  });

  it('renders related microsites when provided', () => {
    const relatedMicrosites = [
      { id: 'ms-1', name: 'Paris Tours', slug: 'paris-tours', primaryColor: '#f00' },
    ];
    render(<CatalogHomepage {...defaultProps} relatedMicrosites={relatedMicrosites as any} />);
    expect(document.querySelector('[data-testid="related-microsites"]')).toBeTruthy();
  });

  it('renders collections when provided', () => {
    const collections = [
      {
        id: 'c1',
        slug: 'food',
        name: 'Food Tours',
        description: null,
        iconEmoji: null,
        imageUrl: null,
        collectionType: 'MANUAL',
        products: [],
      },
    ];
    render(<CatalogHomepage {...defaultProps} collections={collections} />);
    expect(document.querySelector('[data-testid="curated-collections"]')).toBeTruthy();
  });

  it('renders experience locations', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.getAllByText('London').length).toBeGreaterThanOrEqual(1);
  });

  it('renders experience durations', () => {
    render(<CatalogHomepage {...defaultProps} />);
    expect(screen.getAllByText('2h').length).toBeGreaterThanOrEqual(1);
  });
});
