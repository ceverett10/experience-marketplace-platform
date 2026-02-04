import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getSiteFromHostname } from '@/lib/tenant';
import { UnsplashAttribution } from '@/components/common/UnsplashAttribution';

// Revalidate every 5 minutes
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  return {
    title: `Destinations | ${site.name}`,
    description: `Explore amazing destinations and discover unique experiences with ${site.name}. Browse our curated collection of destinations.`,
    openGraph: {
      title: `Destinations | ${site.name}`,
      description: `Explore amazing destinations and discover unique experiences with ${site.name}.`,
      type: 'website',
    },
    alternates: {
      canonical: `https://${site.primaryDomain || hostname}/destinations`,
    },
  };
}

// Default destinations fallback
const DEFAULT_DESTINATIONS: Array<{
  name: string;
  slug: string;
  icon: string;
  description: string;
  imageUrl?: string;
  imageAttribution?: { photographerName: string; photographerUrl: string; unsplashUrl: string };
}> = [
  {
    name: 'London',
    slug: 'london',
    icon: '🇬🇧',
    description: 'Experience world-class culture, history, and entertainment in the UK capital.',
  },
  {
    name: 'Paris',
    slug: 'paris',
    icon: '🇫🇷',
    description: 'Discover romance, art, and culinary excellence in the City of Light.',
  },
  {
    name: 'Barcelona',
    slug: 'barcelona',
    icon: '🇪🇸',
    description: 'Enjoy stunning architecture, beaches, and vibrant Catalan culture.',
  },
  {
    name: 'Rome',
    slug: 'rome',
    icon: '🇮🇹',
    description: 'Walk through ancient history and savor authentic Italian experiences.',
  },
  {
    name: 'Amsterdam',
    slug: 'amsterdam',
    icon: '🇳🇱',
    description: 'Explore charming canals, world-class museums, and Dutch hospitality.',
  },
  {
    name: 'Edinburgh',
    slug: 'edinburgh',
    icon: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    description: 'Discover medieval charm and Scottish heritage in this historic capital.',
  },
  {
    name: 'Lisbon',
    slug: 'lisbon',
    icon: '🇵🇹',
    description: 'Experience colorful neighborhoods, delicious cuisine, and coastal beauty.',
  },
  {
    name: 'Berlin',
    slug: 'berlin',
    icon: '🇩🇪',
    description: 'Explore modern culture, fascinating history, and creative energy.',
  },
];

export default async function DestinationsPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const destinations = site.homepageConfig?.destinations ?? DEFAULT_DESTINATIONS;

  // Get the site's default category/search term (e.g., "Food Tours" for london-food-tours.com)
  const siteCategory =
    site.homepageConfig?.popularExperiences?.searchTerms?.[0] ??
    site.homepageConfig?.categories?.[0]?.name;

  // JSON-LD structured data for destinations list
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Destinations - ${site.name}`,
    description: `Explore destinations with ${site.name}`,
    itemListElement: destinations.map((dest, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'TouristDestination',
        name: dest.name,
        description: dest.description,
        url: `https://${site.primaryDomain || hostname}/experiences?destination=${encodeURIComponent(dest.name)}${siteCategory ? `&q=${encodeURIComponent(siteCategory)}` : ''}`,
      },
    })),
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Explore Destinations
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-indigo-200 sm:text-xl">
              Discover amazing places and find unforgettable experiences in each destination
            </p>
          </div>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-700">
              Home
            </Link>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900">Destinations</span>
          </nav>
        </div>
      </div>

      {/* Destinations Grid */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {destinations.map((destination) => {
              // Build URL with destination name and site's default category (if known)
              const searchParams = new URLSearchParams();
              searchParams.set('destination', destination.name);
              if (siteCategory) {
                searchParams.set('q', siteCategory);
              }
              const href = `/experiences?${searchParams.toString()}`;

              return (
                <Link
                  key={destination.slug}
                  href={href}
                  className="group relative overflow-hidden rounded-2xl bg-white shadow-md transition-all hover:shadow-xl"
                >
                  {/* Image Container */}
                  <div className="relative h-48 w-full overflow-hidden">
                    {destination.imageUrl ? (
                      <Image
                        src={destination.imageUrl}
                        alt={destination.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
                        <span className="text-6xl">{destination.icon}</span>
                      </div>
                    )}
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                    {/* Icon Badge */}
                    <div className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-lg backdrop-blur-sm">
                      {destination.icon}
                    </div>

                    {/* Unsplash Attribution - REQUIRED by Unsplash API Guidelines */}
                    {destination.imageUrl && destination.imageAttribution && (
                      <UnsplashAttribution
                        photographerName={destination.imageAttribution.photographerName}
                        photographerUrl={destination.imageAttribution.photographerUrl}
                        unsplashUrl={destination.imageAttribution.unsplashUrl}
                        variant="overlay-compact"
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <h2 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600">
                      {destination.name}
                    </h2>
                    {destination.description && (
                      <p className="mt-2 line-clamp-3 text-sm text-gray-600">
                        {destination.description}
                      </p>
                    )}
                    <div className="mt-4 flex items-center text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                      <span>Explore experiences</span>
                      <svg
                        className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                        />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Why Explore With Us
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              We make discovering new destinations easy and enjoyable
            </p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100">
                <svg
                  className="h-7 w-7 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Local Expertise</h3>
              <p className="mt-2 text-sm text-gray-600">
                Our experiences are curated by locals who know each destination inside out
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100">
                <svg
                  className="h-7 w-7 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Hand-Picked Quality</h3>
              <p className="mt-2 text-sm text-gray-600">
                Every experience is vetted and verified for quality and authenticity
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100">
                <svg
                  className="h-7 w-7 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Secure Booking</h3>
              <p className="mt-2 text-sm text-gray-600">
                Book with confidence knowing your payment and data are protected
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-12 sm:px-12 sm:py-16">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Ready to Start Exploring?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-100">
                Browse all our experiences or search for something specific
              </p>
              <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
                <Link
                  href="/experiences"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-medium text-indigo-600 shadow-md transition-all hover:bg-indigo-50"
                >
                  Browse All Experiences
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
