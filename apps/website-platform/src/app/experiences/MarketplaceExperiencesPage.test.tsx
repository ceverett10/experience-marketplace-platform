import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketplaceExperiencesPage } from './MarketplaceExperiencesPage';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Mock child components
vi.mock('@/components/experiences/PremiumExperienceCard', () => ({
  PremiumExperienceCard: ({ title }: any) => (
    <div data-testid="experience-card">{title}</div>
  ),
}));

vi.mock('@/components/experiences/FilterSidebar', () => ({
  FilterSidebar: () => <div data-testid="filter-sidebar">Filters</div>,
  MobileFilterButton: ({ activeFilterCount }: any) => (
    <button data-testid="mobile-filter-btn">{activeFilterCount} filters</button>
  ),
  MobileFilterDrawer: () => null,
}));

vi.mock('@/components/ui/TrustSignals', () => ({
  TrustBadges: () => <div data-testid="trust-badges">Trust</div>,
}));

vi.mock('@/components/seo/StructuredData', () => ({
  ExperienceListSchema: () => null,
  BreadcrumbSchema: () => null,
}));

function makeExperience(id: string) {
  return {
    id,
    title: `Experience ${id}`,
    slug: `exp-${id}`,
    shortDescription: `Desc ${id}`,
    imageUrl: `/img/${id}.jpg`,
    price: { amount: 3500, currency: 'GBP', formatted: '£35.00' },
    duration: { formatted: '2h' },
    rating: { average: 4.5, count: 100 },
    location: { name: 'London' },
    categories: ['Tours'],
  };
}

const makeSite = () =>
  ({
    id: 'site-1',
    name: 'Test Site',
    brand: { primaryColor: '#0d9488' },
  }) as any;

const defaultProps = {
  site: makeSite(),
  experiences: [makeExperience('1'), makeExperience('2')],
  totalCount: 2,
  filteredCount: 2,
  hasMore: false,
  searchParams: {},
  filterOptions: {
    categories: [{ name: 'Tours', count: 2 }],
    priceRanges: [],
    durations: [],
    ratings: [],
    cities: [],
  },
  hostname: 'test.example.com',
};

describe('MarketplaceExperiencesPage', () => {
  it('renders experience cards', () => {
    render(<MarketplaceExperiencesPage {...defaultProps} />);

    const cards = screen.getAllByTestId('experience-card');
    expect(cards).toHaveLength(2);
  });

  it('renders filter sidebar', () => {
    render(<MarketplaceExperiencesPage {...defaultProps} />);
    expect(screen.getByTestId('filter-sidebar')).toBeDefined();
  });

  it('renders trust badges', () => {
    render(<MarketplaceExperiencesPage {...defaultProps} />);
    expect(screen.getByTestId('trust-badges')).toBeDefined();
  });

  it('renders total count', () => {
    render(<MarketplaceExperiencesPage {...defaultProps} />);
    expect(document.body.textContent).toContain('2');
  });

  it('shows API error when provided', () => {
    render(
      <MarketplaceExperiencesPage {...defaultProps} apiError="Something went wrong" />
    );
    expect(screen.getByText(/trouble loading experiences/)).toBeDefined();
  });

  it('renders no experiences message when empty', () => {
    render(
      <MarketplaceExperiencesPage
        {...defaultProps}
        experiences={[]}
        totalCount={0}
        filteredCount={0}
      />
    );
    expect(document.body.textContent).toContain('No experiences');
  });

  it('renders mobile filter button', () => {
    render(<MarketplaceExperiencesPage {...defaultProps} />);
    expect(screen.getByTestId('mobile-filter-btn')).toBeDefined();
  });
});
