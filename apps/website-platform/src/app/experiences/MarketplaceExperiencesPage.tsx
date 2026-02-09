'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PremiumExperienceCard } from '@/components/experiences/PremiumExperienceCard';
import {
  FilterSidebar,
  MobileFilterButton,
  MobileFilterDrawer,
  type FilterOptions,
} from '@/components/experiences/FilterSidebar';
import { TrustBadges } from '@/components/ui/TrustSignals';
import { ExperienceListSchema, BreadcrumbSchema } from '@/components/seo/StructuredData';
import type { SiteConfig } from '@/lib/tenant';

interface Experience {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  imageUrl: string;
  price: {
    amount: number;
    currency: string;
    formatted: string;
  };
  duration: {
    formatted: string;
  };
  rating: {
    average: number;
    count: number;
  } | null;
  location: {
    name: string;
  };
  categories?: string[];
  cancellationPolicy?: {
    type?: string;
  };
}

interface MarketplaceExperiencesPageProps {
  site: SiteConfig;
  experiences: Experience[];
  totalCount: number;
  filteredCount: number;
  hasMore: boolean;
  searchParams: Record<string, string | undefined>;
  filterOptions: FilterOptions;
  apiError?: string;
  hostname: string;
  holibobSupplierId?: string;
}

export function MarketplaceExperiencesPage({
  site,
  experiences: initialExperiences,
  totalCount: initialTotalCount,
  filteredCount: initialFilteredCount,
  hasMore: initialHasMore,
  searchParams: initialSearchParams,
  filterOptions,
  apiError,
  hostname,
  holibobSupplierId,
}: MarketplaceExperiencesPageProps) {
  const searchParams = useSearchParams();
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const primaryColor = site.brand?.primaryColor ?? '#6366f1';

  // Client-side state for experiences accumulation
  const [experiences, setExperiences] = useState<Experience[]>(initialExperiences);
  const [page, setPage] = useState(parseInt(initialSearchParams['page'] ?? '1', 10));
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [filteredCount, setFilteredCount] = useState(initialFilteredCount);

  // Track if this is the initial render or a filter change
  const [isInitialRender, setIsInitialRender] = useState(true);

  // Get current filter values from URL
  const currentFilters = {
    categories: searchParams.get('categories') ?? '',
    priceMin: searchParams.get('priceMin') ?? '',
    priceMax: searchParams.get('priceMax') ?? '',
    duration: searchParams.get('duration') ?? '',
    minRating: searchParams.get('minRating') ?? '',
    cities: searchParams.get('cities') ?? '',
  };

  // Count active filters
  const activeFilterCount = Object.values(currentFilters).filter(Boolean).length;

  // Build filter key for detecting changes
  const filterKey = JSON.stringify(currentFilters);

  // Reset experiences when filters change (detected by URL params changing)
  useEffect(() => {
    if (isInitialRender) {
      setIsInitialRender(false);
      return;
    }

    // Filters changed - reset and fetch first page with new filters
    const fetchFilteredExperiences = async () => {
      if (!holibobSupplierId) return;

      setIsLoading(true);
      setExperiences([]);
      setPage(1);

      try {
        const params = new URLSearchParams();
        params.set('holibobSupplierId', holibobSupplierId);
        params.set('page', '1');
        params.set('pageSize', '20');

        // Add filter params
        if (currentFilters.categories) {
          params.set('categories', currentFilters.categories);
        }
        // Note: search, city filters would go here when supported by UI

        const res = await fetch(`/api/microsite-experiences?${params.toString()}`);
        const data = await res.json();

        if (data.experiences) {
          setExperiences(data.experiences);
          setTotalCount(data.totalCount);
          setFilteredCount(data.filteredCount);
          setHasMore(data.hasMore);
          setPage(1);
        }
      } catch (error) {
        console.error('Error fetching filtered experiences:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFilteredExperiences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Load more experiences (append to list)
  const loadMore = useCallback(async () => {
    if (!holibobSupplierId || isLoading || !hasMore) return;

    setIsLoading(true);
    const nextPage = page + 1;

    try {
      const params = new URLSearchParams();
      params.set('holibobSupplierId', holibobSupplierId);
      params.set('page', String(nextPage));
      params.set('pageSize', '20');

      // Preserve current filters
      if (currentFilters.categories) {
        params.set('categories', currentFilters.categories);
      }

      const res = await fetch(`/api/microsite-experiences?${params.toString()}`);
      const data = await res.json();

      if (data.experiences && data.experiences.length > 0) {
        // APPEND to existing experiences (not replace!)
        setExperiences((prev) => [...prev, ...data.experiences]);
        setPage(nextPage);
        setHasMore(data.hasMore);
        setTotalCount(data.totalCount);
        setFilteredCount(data.filteredCount);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more experiences:', error);
    } finally {
      setIsLoading(false);
    }
  }, [holibobSupplierId, isLoading, hasMore, page, currentFilters.categories]);

  const pageTitle = 'Our Experiences';
  const pageSubtitle = `Explore our curated collection of ${totalCount.toLocaleString()} tours and activities`;

  // Build breadcrumbs for SEO
  const breadcrumbs = [
    { name: 'Home', url: `https://${hostname}` },
    { name: 'Experiences', url: `https://${hostname}/experiences` },
  ];

  return (
    <>
      {/* SEO Structured Data */}
      <ExperienceListSchema
        experiences={experiences}
        listName={pageTitle}
        url={`https://${hostname}/experiences`}
        siteName={site.name}
        description={pageSubtitle}
      />
      <BreadcrumbSchema items={breadcrumbs} />

      <div className="min-h-screen bg-gray-50">
        {/* API Error Banner */}
        {apiError && (
          <div className="border-b border-amber-200 bg-amber-50">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  We&apos;re having trouble loading experiences right now. Please try refreshing the
                  page.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Page Header */}
        <header className="bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Breadcrumb */}
            <nav className="mb-4" aria-label="Breadcrumb">
              <ol className="flex items-center gap-2 text-sm text-gray-500">
                <li>
                  <a href="/" className="hover:text-gray-700">
                    Home
                  </a>
                </li>
                <li>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </li>
                <li className="font-medium text-gray-900">Experiences</li>
              </ol>
            </nav>

            {/* Title */}
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {pageTitle}
            </h1>
            <p className="mt-2 text-lg text-gray-600">{pageSubtitle}</p>

            {/* Trust Badges & Mobile Filter Button */}
            <div className="mt-6 flex items-center justify-between">
              <TrustBadges />
              <MobileFilterButton
                filterCount={activeFilterCount}
                onClick={() => setIsMobileFilterOpen(true)}
                primaryColor={primaryColor}
              />
            </div>
          </div>
        </header>

        {/* Main Content with Sidebar */}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 lg:flex-row">
            {/* Desktop Filter Sidebar */}
            <div className="hidden lg:block">
              <FilterSidebar
                filterOptions={filterOptions}
                primaryColor={primaryColor}
                totalCount={totalCount}
                filteredCount={filteredCount}
              />
            </div>

            {/* Experiences Grid */}
            <div className="flex-1">
              {experiences.length === 0 && !isLoading ? (
                <EmptyState primaryColor={primaryColor} />
              ) : (
                <>
                  {/* Results count */}
                  <div className="mb-6 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      {filteredCount !== totalCount
                        ? `Showing ${experiences.length.toLocaleString()} of ${filteredCount.toLocaleString()} filtered (${totalCount.toLocaleString()} total)`
                        : `Showing ${experiences.length.toLocaleString()} of ${totalCount.toLocaleString()} experiences`}
                    </p>
                    {/* Sort dropdown could go here */}
                  </div>

                  {/* Grid */}
                  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {experiences.map((experience, index) => (
                      <PremiumExperienceCard
                        key={experience.id}
                        experience={experience}
                        badges={[]}
                        priority={index < 6}
                      />
                    ))}
                  </div>

                  {/* Load More Button */}
                  {hasMore && (
                    <LoadMoreButton
                      isLoading={isLoading}
                      onClick={loadMore}
                      primaryColor={primaryColor}
                    />
                  )}

                  {/* End of results */}
                  {!hasMore && experiences.length > 0 && !isLoading && (
                    <div className="mt-12 text-center">
                      <p className="text-gray-500">
                        You&apos;ve seen all {experiences.length.toLocaleString()} experiences
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>

        {/* Mobile Filter Drawer */}
        <MobileFilterDrawer
          isOpen={isMobileFilterOpen}
          onClose={() => setIsMobileFilterOpen(false)}
          filterOptions={filterOptions}
          primaryColor={primaryColor}
          totalCount={totalCount}
          filteredCount={filteredCount}
        />
      </div>
    </>
  );
}

function EmptyState({ primaryColor }: { primaryColor: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-20 shadow-sm">
      <div className="rounded-full bg-gray-100 p-4">
        <svg
          className="h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
      </div>
      <h3 className="mt-6 text-xl font-semibold text-gray-900">No experiences found</h3>
      <p className="mt-2 text-gray-600">
        Try adjusting your filters or search for a different destination
      </p>
      <a
        href="/experiences"
        className="mt-6 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: primaryColor }}
      >
        Clear all filters
      </a>
    </div>
  );
}

function LoadMoreButton({
  isLoading,
  onClick,
  primaryColor,
}: {
  isLoading: boolean;
  onClick: () => void;
  primaryColor: string;
}) {
  return (
    <div className="mt-12 flex justify-center">
      <button
        onClick={onClick}
        disabled={isLoading}
        className="group flex items-center gap-3 rounded-full px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl disabled:opacity-70 disabled:hover:scale-100"
        style={{ backgroundColor: primaryColor }}
      >
        {isLoading ? (
          <>
            <svg
              className="h-5 w-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          <>
            <span>Load More Experiences</span>
            <svg
              className="h-5 w-5 transition-transform group-hover:translate-y-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
