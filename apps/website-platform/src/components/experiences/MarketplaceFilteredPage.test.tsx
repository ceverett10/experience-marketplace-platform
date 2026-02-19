import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketplaceFilteredPage } from './MarketplaceFilteredPage';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/experiences',
}));

// Mock hooks
vi.mock('@/hooks/useUrlFilterState', () => ({
  useUrlFilterState: () => ({
    filters: { categories: [], cities: [], priceRanges: [], durations: [], ratings: [], sort: '' },
    setFilter: vi.fn(),
    toggleFilter: vi.fn(),
    removeFilter: vi.fn(),
    clearFilters: vi.fn(),
    activeFilterCount: 0,
    filterKey: '',
  }),
}));

vi.mock('@/hooks/useMarketplaceExperiences', () => ({
  useMarketplaceExperiences: ({ initialExperiences, initialTotalCount, initialFilteredCount, initialHasMore, initialFilterCounts }: any) => ({
    experiences: initialExperiences,
    filterCounts: initialFilterCounts,
    filteredCount: initialFilteredCount,
    totalCount: initialTotalCount,
    hasMore: initialHasMore,
    isLoading: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
    error: null,
  }),
}));

// Mock child components
vi.mock('./FilterBar', () => ({
  FilterBar: () => <div data-testid="filter-bar">Filters</div>,
}));

vi.mock('./FilterOverlay', () => ({
  FilterOverlay: () => null,
}));

vi.mock('./ResultsHeader', () => ({
  ResultsHeader: ({ filteredCount, totalCount }: any) => (
    <div data-testid="results-header">{filteredCount} of {totalCount}</div>
  ),
}));

vi.mock('./ExperienceCardSkeleton', () => ({
  ExperienceGridSkeleton: () => <div data-testid="skeleton">Loading...</div>,
}));

vi.mock('./PremiumExperienceCard', () => ({
  PremiumExperienceCard: ({ experience }: any) => (
    <div data-testid="experience-card">{experience.title}</div>
  ),
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
    title: `Tour ${id}`,
    slug: `tour-${id}`,
    shortDescription: `Desc ${id}`,
    imageUrl: `/img/${id}.jpg`,
    price: { amount: 3500, currency: 'GBP', formatted: '£35.00' },
    duration: { formatted: '2h', minutes: 120 },
    rating: { average: 4.5, count: 50 },
    location: { name: 'London' },
    categories: ['Tours'],
  };
}

const defaultProps = {
  siteName: 'London Tours',
  primaryColor: '#0d9488',
  hostname: 'london-tours.example.com',
  pageTitle: 'All Experiences',
  pageSubtitle: 'Browse our collection',
  initialExperiences: [makeExperience('1'), makeExperience('2')],
  initialTotalCount: 10,
  initialFilteredCount: 2,
  initialHasMore: true,
  initialFilterCounts: {
    categories: [],
    priceRanges: [],
    durations: [],
    ratings: [],
    cities: [],
  },
  extraApiParams: {},
};

describe('MarketplaceFilteredPage', () => {
  it('renders page title', () => {
    render(<MarketplaceFilteredPage {...defaultProps} />);
    // Dynamic title defaults to "All Experiences & Tours"
    expect(screen.getByText('All Experiences & Tours')).toBeDefined();
  });

  it('renders experience cards', () => {
    render(<MarketplaceFilteredPage {...defaultProps} />);
    const cards = screen.getAllByTestId('experience-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toBe('Tour 1');
  });

  it('renders filter bar', () => {
    render(<MarketplaceFilteredPage {...defaultProps} />);
    expect(document.querySelector('[data-testid="filter-bar"]')).toBeTruthy();
  });

  it('renders results header', () => {
    render(<MarketplaceFilteredPage {...defaultProps} />);
    expect(document.querySelector('[data-testid="results-header"]')).toBeTruthy();
  });

  it('renders trust badges', () => {
    render(<MarketplaceFilteredPage {...defaultProps} />);
    expect(document.querySelector('[data-testid="trust-badges"]')).toBeTruthy();
  });

  it('renders breadcrumb', () => {
    render(<MarketplaceFilteredPage {...defaultProps} />);
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Experiences')).toBeDefined();
  });

  it('renders error banner when apiError provided', () => {
    render(
      <MarketplaceFilteredPage {...defaultProps} apiError="Something went wrong" />
    );
    expect(screen.getByText(/trouble loading experiences/)).toBeDefined();
  });

  it('renders Load More button when hasMore', () => {
    render(<MarketplaceFilteredPage {...defaultProps} />);
    expect(screen.getByText('Load More Experiences')).toBeDefined();
  });

  it('shows empty state when no experiences', () => {
    render(
      <MarketplaceFilteredPage
        {...defaultProps}
        initialExperiences={[]}
        initialFilteredCount={0}
        initialTotalCount={0}
        initialHasMore={false}
      />
    );
    expect(screen.getByText('No experiences found')).toBeDefined();
  });
});
