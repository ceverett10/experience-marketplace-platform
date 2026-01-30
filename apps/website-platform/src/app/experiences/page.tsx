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
type ApiBadgeType = 'bestseller' | 'recommended' | 'freeCancellation' | 'topPick' | 'skipTheLine';

// Badge assignment logic based on REAL API data only - no fake/arbitrary logic
function assignBadges(experience: ExperienceListItem): ApiBadgeType[] {
  const badges: ApiBadgeType[] = [];

  // Free Cancellation - from cancellationPolicy.type in Product Detail API
  if (
    experience.cancellationPolicy?.type === 'FREE' ||
    experience.cancellationPolicy?.type?.toLowerCase().includes('free')
  ) {
    badges.push('freeCancellation');
  }

  // Best Seller - from isBestSeller field in Product API (if available)
  if (experience.isBestSeller) {
    badges.push('bestseller');
  }

  // Note: Additional badges would require corresponding fields from Holibob API
  // We only show badges when we have real data to support them

  return badges.slice(0, 2); // Max 2 badges per card
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
      // Get primary image from imageList (Product Detail API format)
      const primaryImage =
        product.imageList?.nodes?.[0]?.url ?? product.imageUrl ?? '/placeholder-experience.jpg';

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
        // Use reviewRating from Product Discovery API, fallback to rating
        rating:
          (product.reviewRating ?? product.rating)
            ? {
                average: product.reviewRating ?? product.rating ?? 0,
                count: product.reviewCount ?? 0,
              }
            : null,
        location: {
          name: product.location?.name ?? '',
        },
        // Badge-related fields from Holibob API
        cancellationPolicy: product.cancellationPolicy
          ? {
              type: product.cancellationPolicy.type,
              cutoffHours: product.cancellationPolicy.cutoffHours,
            }
          : undefined,
        isBestSeller: product.isBestSeller,
        hasInstantConfirmation: product.hasInstantConfirmation,
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
    // Log detailed error info for debugging
    console.error('Error fetching experiences:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      partnerId: site.holibobPartnerId,
      apiUrl: process.env['HOLIBOB_API_URL'] ?? 'not set',
      hasApiKey: !!process.env['HOLIBOB_API_KEY'],
      hasApiSecret: !!process.env['HOLIBOB_API_SECRET'],
    });
    const mockData = getMockExperiences();
    return {
      experiences: mockData.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
      totalCount: mockData.length,
      hasMore: page * ITEMS_PER_PAGE < mockData.length,
      isUsingMockData: true,
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

function getMockExperiences(): ExperienceListItem[] {
  return [
    {
      id: '1',
      title: 'London Eye Experience',
      slug: 'london-eye-experience',
      shortDescription: 'Take in breathtaking views of London from the iconic London Eye.',
      imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800',
      price: { amount: 3500, currency: 'GBP', formatted: '£35.00' },
      duration: { formatted: '30 minutes' },
      rating: { average: 4.7, count: 2453 },
      location: { name: 'London, UK' },
    },
    {
      id: '2',
      title: 'Tower of London Tour',
      slug: 'tower-of-london-tour',
      shortDescription: 'Explore centuries of royal history at the Tower of London.',
      imageUrl: 'https://images.unsplash.com/photo-1529655683826-aba9b3e77383?w=800',
      price: { amount: 2900, currency: 'GBP', formatted: '£29.00' },
      duration: { formatted: '3 hours' },
      rating: { average: 4.8, count: 1876 },
      location: { name: 'London, UK' },
    },
    {
      id: '3',
      title: 'Thames River Cruise',
      slug: 'thames-river-cruise',
      shortDescription: 'Glide along the Thames and see London landmarks from the water.',
      imageUrl: 'https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=800',
      price: { amount: 1800, currency: 'GBP', formatted: '£18.00' },
      duration: { formatted: '1 hour' },
      rating: { average: 4.5, count: 984 },
      location: { name: 'London, UK' },
    },
    {
      id: '4',
      title: 'Stonehenge Day Trip',
      slug: 'stonehenge-day-trip',
      shortDescription: 'Visit the mysterious prehistoric monument of Stonehenge.',
      imageUrl: 'https://images.unsplash.com/photo-1599833975787-5c143f373c30?w=800',
      price: { amount: 6500, currency: 'GBP', formatted: '£65.00' },
      duration: { formatted: '10 hours' },
      rating: { average: 4.6, count: 756 },
      location: { name: 'Wiltshire, UK' },
    },
    {
      id: '5',
      title: 'Harry Potter Studio Tour',
      slug: 'harry-potter-studio-tour',
      shortDescription: 'Step into the magical world of Harry Potter at Warner Bros. Studios.',
      imageUrl: 'https://images.unsplash.com/photo-1551269901-5c5e14c25df7?w=800',
      price: { amount: 5200, currency: 'GBP', formatted: '£52.00' },
      duration: { formatted: '4 hours' },
      rating: { average: 4.9, count: 3241 },
      location: { name: 'Watford, UK' },
    },
    {
      id: '6',
      title: 'Westminster Walking Tour',
      slug: 'westminster-walking-tour',
      shortDescription: 'Discover the political heart of Britain on this guided walking tour.',
      imageUrl: 'https://images.unsplash.com/photo-1486299267070-83823f5448dd?w=800',
      price: { amount: 2200, currency: 'GBP', formatted: '£22.00' },
      duration: { formatted: '2.5 hours' },
      rating: { average: 4.7, count: 654 },
      location: { name: 'London, UK' },
    },
    {
      id: '7',
      title: 'British Museum Guided Tour',
      slug: 'british-museum-guided-tour',
      shortDescription: 'Explore world history with an expert guide at the British Museum.',
      imageUrl: 'https://images.unsplash.com/photo-1590937286984-0eb6c40c6a7c?w=800',
      price: { amount: 2800, currency: 'GBP', formatted: '£28.00' },
      duration: { formatted: '2 hours' },
      rating: { average: 4.8, count: 1123 },
      location: { name: 'London, UK' },
    },
    {
      id: '8',
      title: 'Cotswolds Village Tour',
      slug: 'cotswolds-village-tour',
      shortDescription: 'Experience the charm of English countryside villages.',
      imageUrl: 'https://images.unsplash.com/photo-1590523277543-a94d2e4eb00b?w=800',
      price: { amount: 7500, currency: 'GBP', formatted: '£75.00' },
      duration: { formatted: '9 hours' },
      rating: { average: 4.7, count: 542 },
      location: { name: 'Cotswolds, UK' },
    },
    {
      id: '9',
      title: 'Camden Market Food Tour',
      slug: 'camden-market-food-tour',
      shortDescription: "Taste your way through London's most eclectic market.",
      imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
      price: { amount: 4500, currency: 'GBP', formatted: '£45.00' },
      duration: { formatted: '3 hours' },
      rating: { average: 4.8, count: 892 },
      location: { name: 'London, UK' },
    },
    {
      id: '10',
      title: 'Windsor Castle Day Trip',
      slug: 'windsor-castle-day-trip',
      shortDescription: 'Visit the oldest and largest occupied castle in the world.',
      imageUrl: 'https://images.unsplash.com/photo-1577043956968-61c2f3d6a3ea?w=800',
      price: { amount: 5500, currency: 'GBP', formatted: '£55.00' },
      duration: { formatted: '6 hours' },
      rating: { average: 4.6, count: 1243 },
      location: { name: 'Windsor, UK' },
    },
    {
      id: '11',
      title: 'Jack the Ripper Walking Tour',
      slug: 'jack-the-ripper-walking-tour',
      shortDescription: "Explore the dark history of Victorian London's most infamous murders.",
      imageUrl: 'https://images.unsplash.com/photo-1491897554428-130a60dd4757?w=800',
      price: { amount: 1500, currency: 'GBP', formatted: '£15.00' },
      duration: { formatted: '2 hours' },
      rating: { average: 4.5, count: 2156 },
      location: { name: 'London, UK' },
    },
    {
      id: '12',
      title: 'Bath & Stonehenge Day Trip',
      slug: 'bath-stonehenge-day-trip',
      shortDescription: 'Visit two UNESCO World Heritage Sites in one unforgettable day.',
      imageUrl: 'https://images.unsplash.com/photo-1580902394724-b08ff9ba7e8a?w=800',
      price: { amount: 8900, currency: 'GBP', formatted: '£89.00' },
      duration: { formatted: '11 hours' },
      rating: { average: 4.7, count: 1567 },
      location: { name: 'Bath, UK' },
    },
  ];
}

export default async function ExperiencesPage({ searchParams }: Props) {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);
  const resolvedSearchParams = await searchParams;

  const {
    experiences,
    totalCount,
    isUsingMockData,
    apiError,
    recommendedTags,
    recommendedSearchTerms,
  } = await getExperiences(site, resolvedSearchParams);

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
        {/* Demo Mode Warning Banner */}
        {isUsingMockData && (
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
                  <strong>Demo Mode:</strong> Showing sample experiences. Connect to Holibob API for
                  live inventory.
                  {apiError && process.env.NODE_ENV !== 'production' && (
                    <span className="ml-2 text-amber-600">Error: {apiError}</span>
                  )}
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
