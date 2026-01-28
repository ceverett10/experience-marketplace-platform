import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient, type ExperienceListItem } from '@/lib/holibob';
import { ExperienceCard } from '@/components/experiences/ExperienceCard';
import { ExperienceFilters } from '@/components/experiences/ExperienceFilters';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBar } from '@/components/search/SearchBar';

interface SearchParams {
  [key: string]: string | undefined;
  category?: string;
  location?: string;
  date?: string;
  guests?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  return {
    title: 'Experiences',
    description: `Browse and book unique experiences, tours, and activities. ${site.seoConfig?.defaultDescription ?? ''}`,
    openGraph: {
      title: `Experiences | ${site.name}`,
      description: `Discover amazing experiences, tours, and activities with ${site.name}`,
    },
  };
}

// Revalidate every 5 minutes
export const revalidate = 300;

const ITEMS_PER_PAGE = 12;

async function getExperiences(
  site: Awaited<ReturnType<typeof getSiteFromHostname>>,
  searchParams: SearchParams
): Promise<{
  experiences: ExperienceListItem[];
  totalCount: number;
  hasMore: boolean;
}> {
  const page = parseInt(searchParams.page ?? '1', 10);

  try {
    const client = getHolibobClient(site);

    const response = await client.discoverProducts(
      {
        currency: 'GBP',
        categoryIds: searchParams.category ? [searchParams.category] : undefined,
        priceMin: searchParams.minPrice ? parseInt(searchParams.minPrice, 10) * 100 : undefined,
        priceMax: searchParams.maxPrice ? parseInt(searchParams.maxPrice, 10) * 100 : undefined,
        adults: searchParams.guests ? parseInt(searchParams.guests, 10) : 2,
        dateFrom: searchParams.date,
      },
      { first: ITEMS_PER_PAGE }
    );

    const experiences = response.products.map((product) => {
      return {
        id: product.id,
        title: product.name ?? 'Experience',
        slug: product.id,
        shortDescription: product.shortDescription ?? '',
        imageUrl: product.imageUrl ?? '/placeholder-experience.jpg',
        price: {
          amount: product.priceFrom ?? 0,
          currency: product.currency ?? 'GBP',
          formatted: formatPrice(product.priceFrom ?? 0, product.currency ?? 'GBP'),
        },
        duration: {
          formatted: formatDuration(product.duration ?? 0, 'minutes'),
        },
        rating: product.rating
          ? {
              average: product.rating,
              count: product.reviewCount ?? 0,
            }
          : null,
        location: {
          name: product.location?.name ?? '',
        },
      };
    });

    return {
      experiences,
      totalCount: response.totalCount ?? experiences.length,
      hasMore: response.pageInfo?.hasNextPage ?? false,
    };
  } catch (error) {
    console.error('Error fetching experiences:', error);
    const mockData = getMockExperiences();
    return {
      experiences: mockData.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
      totalCount: mockData.length,
      hasMore: page * ITEMS_PER_PAGE < mockData.length,
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
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${value}m`;
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

  const { experiences, totalCount, hasMore } = await getExperiences(site, resolvedSearchParams);
  const currentPage = parseInt(resolvedSearchParams.page ?? '1', 10);
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Build title based on filters
  let pageTitle = 'All Experiences';
  if (resolvedSearchParams.category) {
    pageTitle = `${resolvedSearchParams.category.charAt(0).toUpperCase()}${resolvedSearchParams.category.slice(1)} Experiences`;
  }
  if (resolvedSearchParams.location) {
    pageTitle = `Experiences in ${resolvedSearchParams.location}`;
  }

  return (
    <div className="bg-gray-50">
      {/* Header */}
      <div className="bg-white py-8 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">{pageTitle}</h1>
          <p className="mt-2 text-gray-600">
            {totalCount} {totalCount === 1 ? 'experience' : 'experiences'} available
          </p>

          {/* Quick Search */}
          <div className="mt-6">
            <SearchBar
              variant="compact"
              defaultLocation={resolvedSearchParams.location}
              defaultDate={resolvedSearchParams.date}
              defaultGuests={
                resolvedSearchParams.guests ? parseInt(resolvedSearchParams.guests, 10) : 2
              }
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-4 lg:gap-8">
          {/* Filters Sidebar */}
          <aside className="hidden lg:block">
            <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-gray-200" />}>
              <ExperienceFilters
                currentFilters={{
                  category: resolvedSearchParams.category,
                  minPrice: resolvedSearchParams.minPrice,
                  maxPrice: resolvedSearchParams.maxPrice,
                  sort: resolvedSearchParams.sort,
                }}
              />
            </Suspense>
          </aside>

          {/* Experiences Grid */}
          <main className="lg:col-span-3">
            {/* Mobile Filters Toggle */}
            <div className="mb-6 flex items-center justify-between lg:hidden">
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                  />
                </svg>
                Filters
              </button>

              <select
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
                defaultValue={resolvedSearchParams.sort ?? 'recommended'}
              >
                <option value="recommended">Recommended</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>

            {/* Results */}
            {experiences.length > 0 ? (
              <>
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {experiences.map((experience) => (
                    <ExperienceCard key={experience.id} experience={experience} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8">
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
              <div className="flex flex-col items-center justify-center rounded-lg bg-white py-16">
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
                <h3 className="mt-4 text-lg font-semibold text-gray-900">No experiences found</h3>
                <p className="mt-2 text-gray-600">Try adjusting your filters or search criteria</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
