import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient, type ExperienceListItem } from '@/lib/holibob';
import { PremiumExperienceCard } from '@/components/experiences/PremiumExperienceCard';
import { Pagination } from '@/components/ui/Pagination';
import { ProductDiscoverySearch } from '@/components/search/ProductDiscoverySearch';
import { TrustBadges } from '@/components/ui/TrustSignals';
import { ExperienceListSchema, BreadcrumbSchema } from '@/components/seo/StructuredData';

interface SearchParams {
  [key: string]: string | undefined;
  location?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  adults?: string;
  children?: string;
  q?: string;
  page?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);
  const resolvedParams = await searchParams;

  const destination = resolvedParams.destination || resolvedParams.location;
  const searchQuery = resolvedParams.q;

  let title = 'Experiences & Tours';
  let description = `Browse and book unique experiences, tours, and activities.`;

  if (destination) {
    title = `Things to Do in ${destination}`;
    description = `Discover the best tours, activities, and experiences in ${destination}. Book online with instant confirmation and free cancellation.`;
  }

  if (searchQuery) {
    title = `${searchQuery} - ${destination || 'Experiences'}`;
    description = `Find the best ${searchQuery.toLowerCase()} experiences. ${destination ? `Tours and activities in ${destination}.` : ''} Book online with instant confirmation.`;
  }

  return {
    title: `${title} | ${site.name}`,
    description: description + ` ${site.seoConfig?.defaultDescription ?? ''}`,
    openGraph: {
      title: `${title} | ${site.name}`,
      description: description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${site.name}`,
      description: description,
    },
    alternates: {
      canonical: `https://${hostname}/experiences`,
    },
  };
}

// Revalidate every 5 minutes for fresh content
export const revalidate = 300;

const ITEMS_PER_PAGE = 12;

// Badge types that can come from real API data
type ApiBadgeType = 'freeCancellation';

// Badge assignment logic based on REAL API data only
function assignBadges(experience: ExperienceListItem): ApiBadgeType[] {
  const badges: ApiBadgeType[] = [];

  // Free Cancellation - from cancellationPolicy.type in Product Detail API
  if (
    experience.cancellationPolicy?.type === 'FREE' ||
    experience.cancellationPolicy?.type?.toLowerCase().includes('free')
  ) {
    badges.push('freeCancellation');
  }

  return badges;
}

async function getExperiences(
  site: Awaited<ReturnType<typeof getSiteFromHostname>>,
  searchParams: SearchParams
): Promise<{
  experiences: ExperienceListItem[];
  totalCount: number;
  hasMore: boolean;
  isUsingMockData: boolean;
  apiError?: string;
  recommendedTags?: { id: string; name: string }[];
  recommendedSearchTerms?: string[];
}> {
  const page = parseInt(searchParams.page ?? '1', 10);

  try {
    const client = getHolibobClient(site);

    // Product Discovery API filters: where (freeText), when (dates), who (travelers), what (searchTerm)
    // Note: Category/price filters are not supported by Product Discovery
    const response = await client.discoverProducts(
      {
        currency: 'GBP',
        freeText: searchParams.destination || searchParams.location,
        searchTerm: searchParams.q,
        adults: searchParams.adults ? parseInt(searchParams.adults, 10) : 2,
        children: searchParams.children ? parseInt(searchParams.children, 10) : undefined,
        dateFrom: searchParams.startDate,
        dateTo: searchParams.endDate,
      },
      { pageSize: ITEMS_PER_PAGE }
    );

    const experiences = response.products.map((product) => {
      // Get primary image from imageList (Product Detail API format - direct array)
      const primaryImage =
        product.imageList?.[0]?.url ?? product.imageUrl ?? '/placeholder-experience.jpg';

      // Get price - Product Detail API uses guidePrice, Product Discovery uses priceFrom
      const priceAmount = product.guidePrice ?? product.priceFrom ?? 0;
      const priceCurrency =
        product.guidePriceCurrency ?? product.priceCurrency ?? product.currency ?? 'GBP';
      const priceFormatted =
        product.guidePriceFormattedText ??
        product.priceFromFormatted ??
        formatPrice(priceAmount, priceCurrency);

      // Get duration - Product Detail API returns durationText as a string
      const durationFormatted =
        product.durationText ??
        (product.duration ? formatDuration(product.duration, 'minutes') : 'Duration varies');

      return {
        id: product.id,
        title: product.name ?? 'Experience',
        slug: product.id,
        shortDescription: product.shortDescription ?? '',
        imageUrl: primaryImage,
        price: {
          amount: priceAmount,
          currency: priceCurrency,
          formatted: priceFormatted,
        },
        duration: {
          formatted: durationFormatted,
        },
        // Rating - may not be available from API
        rating: product.rating
          ? {
              average: product.rating,
              count: 0,
            }
          : null,
        location: {
          name: product.location?.name ?? '',
        },
        // Cancellation policy from Holibob API
        cancellationPolicy: product.cancellationPolicy
          ? {
              type: product.cancellationPolicy.type,
            }
          : undefined,
      };
    });

    return {
      experiences,
      totalCount: response.totalCount ?? experiences.length,
      hasMore: response.pageInfo?.hasNextPage ?? false,
      isUsingMockData: false,
      // These will be populated when the API returns recommended data
      recommendedTags: undefined,
      recommendedSearchTerms: undefined,
    };
  } catch (error) {
    // Log detailed error info for debugging (no mock data fallback)
    console.error('Error fetching experiences:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      partnerId: site.holibobPartnerId,
      apiUrl: process.env['HOLIBOB_API_URL'] ?? 'not set',
      hasApiKey: !!process.env['HOLIBOB_API_KEY'],
      hasApiSecret: !!process.env['HOLIBOB_API_SECRET'],
    });
    // Return empty results with error - no mock data
    return {
      experiences: [],
      totalCount: 0,
      hasMore: false,
      isUsingMockData: false,
      apiError: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

function formatDuration(value: number, unit: string): string {
  if (unit === 'minutes') {
    if (value >= 60) {
      const hours = Math.floor(value / 60);
      const mins = value % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `${value} min`;
  }
  if (unit === 'hours') {
    return value === 1 ? '1 hour' : `${value} hours`;
  }
  if (unit === 'days') {
    return value === 1 ? '1 day' : `${value} days`;
  }
  return `${value} ${unit}`;
}

// No mock data - all data comes from Holibob API

export default async function ExperiencesPage({ searchParams }: Props) {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);
  const resolvedSearchParams = await searchParams;

  const { experiences, totalCount, apiError, recommendedTags, recommendedSearchTerms } =
    await getExperiences(site, resolvedSearchParams);

  const currentPage = parseInt(resolvedSearchParams.page ?? '1', 10);
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const destination = resolvedSearchParams.destination || resolvedSearchParams.location;

  // Build page title based on search context
  let pageTitle = 'Discover Experiences';
  let pageSubtitle = `${totalCount} unique experiences waiting to be explored`;

  if (destination) {
    pageTitle = `Things to Do in ${destination}`;
    pageSubtitle = `${totalCount} experiences in ${destination}`;
  }

  if (resolvedSearchParams.q) {
    pageTitle = `${resolvedSearchParams.q}`;
    pageSubtitle = `${totalCount} results found`;
  }

  // Build breadcrumbs for SEO
  const breadcrumbs = [
    { name: 'Home', url: `https://${hostname}` },
    { name: 'Experiences', url: `https://${hostname}/experiences` },
  ];

  if (destination) {
    breadcrumbs.push({
      name: destination,
      url: `https://${hostname}/experiences?destination=${encodeURIComponent(destination)}`,
    });
  }

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
        {/* API Error Banner - only shown in development */}
        {apiError && process.env.NODE_ENV !== 'production' && (
          <div className="border-b border-red-200 bg-red-50">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2 text-sm text-red-800">
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  <strong>API Error:</strong> {apiError}
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
                {destination && (
                  <>
                    <li>
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </li>
                    <li className="font-medium text-gray-900">{destination}</li>
                  </>
                )}
              </ol>
            </nav>

            {/* Title */}
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {pageTitle}
            </h1>
            <p className="mt-2 text-lg text-gray-600">{pageSubtitle}</p>

            {/* Search Bar */}
            <div className="mt-6">
              <ProductDiscoverySearch
                variant="sidebar"
                defaultDestination={destination}
                defaultDates={{
                  startDate: resolvedSearchParams.startDate,
                  endDate: resolvedSearchParams.endDate,
                }}
                recommendedTags={recommendedTags}
                popularSearchTerms={recommendedSearchTerms}
              />
            </div>

            {/* Trust Badges */}
            <div className="mt-6">
              <TrustBadges />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div>
            {/* Experiences Grid */}
            <div>
              {/* Results */}
              {experiences.length > 0 ? (
                <>
                  {/* Featured Experience (first item, larger) */}
                  {currentPage === 1 && experiences.length > 0 && experiences[0] && (
                    <div className="mb-8">
                      <PremiumExperienceCard
                        experience={experiences[0]}
                        variant="featured"
                        badges={assignBadges(experiences[0])}
                      />
                    </div>
                  )}

                  {/* Grid of remaining experiences */}
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {experiences.slice(currentPage === 1 ? 1 : 0).map((experience) => (
                      <PremiumExperienceCard
                        key={experience.id}
                        experience={experience}
                        badges={assignBadges(experience)}
                      />
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-12">
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        baseUrl="/experiences"
                        searchParams={resolvedSearchParams}
                      />
                    </div>
                  )}
                </>
              ) : (
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
                  <button
                    type="button"
                    onClick={() => (window.location.href = '/experiences')}
                    className="mt-6 rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-700"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
