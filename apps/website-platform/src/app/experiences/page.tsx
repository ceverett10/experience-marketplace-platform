import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient, type ExperienceListItem } from '@/lib/holibob';
import { ExperiencesGrid } from '@/components/experiences/ExperiencesGrid';
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
  when?: string;
  who?: string;
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

    // hasMore is true if we got a full page (likely more available)
    // Holibob doesn't return accurate pagination info, so we always show "See More"
    // if we have a reasonable number of products (the API will return empty when exhausted)
    const hasMore = experiences.length >= ITEMS_PER_PAGE;

    return {
      experiences,
      totalCount: response.totalCount ?? experiences.length,
      hasMore,
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

  const { experiences, totalCount, hasMore, apiError } = await getExperiences(
    site,
    resolvedSearchParams
  );

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

            {/* Search Bar - Same hero variant as homepage */}
            <div className="mt-6">
              <ProductDiscoverySearch
                variant="hero"
                defaultDestination={destination}
                defaultDates={{
                  startDate: resolvedSearchParams.startDate,
                  endDate: resolvedSearchParams.endDate,
                }}
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
          <ExperiencesGrid
            initialExperiences={experiences}
            hasMore={hasMore}
            searchParams={resolvedSearchParams}
          />
        </main>
      </div>
    </>
  );
}
