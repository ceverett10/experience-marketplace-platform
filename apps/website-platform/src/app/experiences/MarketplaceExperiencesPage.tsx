'use client';

import { useState } from 'react';
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
}

export function MarketplaceExperiencesPage({
  site,
  experiences,
  totalCount,
  filteredCount,
  hasMore,
  searchParams,
  filterOptions,
  apiError,
  hostname,
}: MarketplaceExperiencesPageProps) {
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const primaryColor = site.brand?.primaryColor ?? '#6366f1';

  // Count active filters
  const activeFilterCount = [
    searchParams['categories'],
    searchParams['priceMin'],
    searchParams['priceMax'],
    searchParams['duration'],
    searchParams['minRating'],
    searchParams['cities'],
  ].filter(Boolean).length;

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
              {experiences.length === 0 ? (
                <EmptyState primaryColor={primaryColor} />
              ) : (
                <>
                  {/* Results count */}
                  <div className="mb-6 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      {filteredCount !== totalCount
                        ? `Showing ${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()} experiences`
                        : `${totalCount.toLocaleString()} experiences`}
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

                  {/* Pagination / Load More */}
                  {hasMore && <LoadMoreSection searchParams={searchParams} primaryColor={primaryColor} />}

                  {/* End of results */}
                  {!hasMore && experiences.length > 0 && (
                    <div className="mt-12 text-center">
                      <p className="text-gray-500">
                        You&apos;ve seen all {filteredCount.toLocaleString()} experiences
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

function LoadMoreSection({
  searchParams,
  primaryColor,
}: {
  searchParams: Record<string, string | undefined>;
  primaryColor: string;
}) {
  const currentPage = parseInt(searchParams['page'] ?? '1', 10);
  const nextPage = currentPage + 1;

  // Build next page URL preserving current filters
  const nextPageParams = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value && key !== 'page') {
      nextPageParams.set(key, value);
    }
  });
  nextPageParams.set('page', String(nextPage));

  return (
    <div className="mt-12 flex justify-center">
      <a
        href={`?${nextPageParams.toString()}`}
        className="group flex items-center gap-3 rounded-full px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
        style={{ backgroundColor: primaryColor }}
      >
        <span>Load More Experiences</span>
        <svg
          className="h-5 w-5 transition-transform group-hover:translate-y-1"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </a>
    </div>
  );
}
