'use client';

import { Suspense, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ExperienceListItem } from '@/lib/holibob';
import type { FilterCounts } from '@/hooks/useMarketplaceExperiences';
import { useUrlFilterState } from '@/hooks/useUrlFilterState';
import { useMarketplaceExperiences } from '@/hooks/useMarketplaceExperiences';
import { FilterBar } from './FilterBar';
import { FilterOverlay } from './FilterOverlay';
import { ResultsHeader } from './ResultsHeader';
import { ExperienceGridSkeleton } from './ExperienceCardSkeleton';
import { PremiumExperienceCard } from './PremiumExperienceCard';
import { TrustBadges } from '@/components/ui/TrustSignals';
import { ExperienceListSchema, BreadcrumbSchema } from '@/components/seo/StructuredData';

export interface MarketplaceFilteredPageProps {
  siteName: string;
  primaryColor: string;
  hostname: string;
  pageTitle: string;
  pageSubtitle: string;
  /** Initial server-rendered experiences for SEO */
  initialExperiences: ExperienceListItem[];
  initialTotalCount: number;
  initialFilteredCount: number;
  initialHasMore: boolean;
  initialFilterCounts: FilterCounts;
  /** Always-included API params like holibobSupplierId */
  extraApiParams: Record<string, string>;
  apiError?: string;
}

/**
 * Marketplace Microsite experiences page with horizontal filter bar.
 *
 * Replaces the old MarketplaceExperiencesPage with:
 * - Horizontal filter chips (GetYourGuide-style)
 * - Client-side fetching via /api/microsite-experiences
 * - Loading skeletons on filter change
 * - AbortController for race condition prevention
 * - Mobile full-screen filter overlay
 */
function MarketplaceFilteredPageInner({
  siteName,
  primaryColor,
  hostname,
  pageTitle,
  pageSubtitle,
  initialExperiences,
  initialTotalCount,
  initialFilteredCount,
  initialHasMore,
  initialFilterCounts,
  extraApiParams,
  apiError: serverApiError,
}: MarketplaceFilteredPageProps) {
  const {
    filters,
    setFilter,
    toggleFilter,
    removeFilter,
    clearFilters,
    activeFilterCount,
    filterKey,
  } = useUrlFilterState();

  // Map initial experiences to the hook's expected format (add defaults for extra fields)
  const mappedInitial = initialExperiences.map((exp) => ({
    ...exp,
    duration: { ...exp.duration, minutes: 0 },
    categories: [] as string[],
    cityId: null as string | null,
  }));

  const {
    experiences,
    filterCounts,
    filteredCount,
    totalCount,
    hasMore,
    isLoading,
    isLoadingMore,
    loadMore,
    error: fetchError,
  } = useMarketplaceExperiences({
    initialExperiences: mappedInitial,
    initialTotalCount,
    initialFilteredCount,
    initialHasMore,
    initialFilterCounts,
    filters,
    filterKey,
    extraApiParams,
  });

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const openMobileFilters = useCallback(() => setMobileFiltersOpen(true), []);
  const closeMobileFilters = useCallback(() => setMobileFiltersOpen(false), []);

  const error = fetchError || serverApiError;

  // Breadcrumbs
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
        siteName={siteName}
        description={pageSubtitle}
      />
      <BreadcrumbSchema items={breadcrumbs} />

      <div className="min-h-screen bg-gray-50">
        {/* Error Banner */}
        {error && (
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

            {/* Trust Badges */}
            <div className="mt-6">
              <TrustBadges />
            </div>
          </div>
        </header>

        {/* Filter Bar (sticky) */}
        <FilterBar
          filters={filters}
          filterCounts={filterCounts}
          activeFilterCount={activeFilterCount}
          primaryColor={primaryColor}
          onSetFilter={setFilter}
          onToggleFilter={toggleFilter}
          onClearFilters={clearFilters}
          onOpenMobileFilters={openMobileFilters}
        />

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Results Header */}
          <ResultsHeader
            filteredCount={filteredCount}
            totalCount={totalCount}
            isLoading={isLoading}
            filters={filters}
            onRemoveFilter={removeFilter}
            onClearFilters={clearFilters}
            primaryColor={primaryColor}
          />

          {/* Experience Grid */}
          {isLoading ? (
            <ExperienceGridSkeleton count={12} />
          ) : experiences.length === 0 ? (
            <EmptyState onClearFilters={clearFilters} hasFilters={activeFilterCount > 0} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {experiences.map((experience) => (
                  <PremiumExperienceCard
                    key={experience.id}
                    experience={experience}
                  />
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:opacity-60"
                  >
                    {isLoadingMore ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Loading...
                      </>
                    ) : (
                      'Load More Experiences'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        {/* Mobile Filter Overlay */}
        <FilterOverlay
          isOpen={mobileFiltersOpen}
          onClose={closeMobileFilters}
          filters={filters}
          filterCounts={filterCounts}
          filteredCount={filteredCount}
          primaryColor={primaryColor}
          onSetFilter={setFilter}
          onToggleFilter={toggleFilter}
          onClearFilters={clearFilters}
        />
      </div>
    </>
  );
}

/** Empty state when no experiences match filters */
function EmptyState({
  onClearFilters,
  hasFilters,
}: {
  onClearFilters: () => void;
  hasFilters: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg
        className="mb-4 h-16 w-16 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <h3 className="text-lg font-semibold text-gray-900">No experiences found</h3>
      <p className="mt-1 text-sm text-gray-500">
        {hasFilters
          ? 'Try adjusting your filters to see more results.'
          : 'No experiences are available at the moment.'}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

/**
 * Wrapper with Suspense boundary for useSearchParams.
 * Next.js requires useSearchParams to be wrapped in Suspense
 * to avoid deoptimizing the entire page from static rendering.
 */
export function MarketplaceFilteredPage(props: MarketplaceFilteredPageProps) {
  return (
    <Suspense fallback={<MarketplaceFilteredPageFallback {...props} />}>
      <MarketplaceFilteredPageInner {...props} />
    </Suspense>
  );
}

/** Static fallback while Suspense resolves useSearchParams */
function MarketplaceFilteredPageFallback({
  pageTitle,
  pageSubtitle,
  initialExperiences,
  hostname,
  siteName,
}: MarketplaceFilteredPageProps) {
  const breadcrumbs = [
    { name: 'Home', url: `https://${hostname}` },
    { name: 'Experiences', url: `https://${hostname}/experiences` },
  ];

  return (
    <>
      <ExperienceListSchema
        experiences={initialExperiences}
        listName={pageTitle}
        url={`https://${hostname}/experiences`}
        siteName={siteName}
        description={pageSubtitle}
      />
      <BreadcrumbSchema items={breadcrumbs} />
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {pageTitle}
            </h1>
            <p className="mt-2 text-lg text-gray-600">{pageSubtitle}</p>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <ExperienceGridSkeleton count={12} />
        </main>
      </div>
    </>
  );
}
