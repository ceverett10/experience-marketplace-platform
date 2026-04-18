import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { UnsplashAttribution } from '@/components/common/UnsplashAttribution';

// Revalidate every 5 minutes
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const ogImage = site.brand?.ogImageUrl || site.homepageConfig?.hero?.backgroundImage;

  return {
    title: 'Destinations',
    description: `Explore amazing destinations and discover unique experiences with ${site.name}. Browse our curated destination guides.`,
    openGraph: {
      title: `Destinations | ${site.name}`,
      description: `Explore amazing destinations and discover unique experiences with ${site.name}.`,
      type: 'website',
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: {
      canonical: `https://${site.primaryDomain || hostname}/destinations`,
    },
  };
}

// Default destinations fallback (when no guide pages exist in DB)
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
    imageUrl:
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80&fit=crop&auto=format',
    imageAttribution: {
      photographerName: 'Benjamin Davies',
      photographerUrl:
        'https://unsplash.com/@bendavisual?utm_source=experience_marketplace&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=experience_marketplace&utm_medium=referral',
    },
  },
  {
    name: 'Paris',
    slug: 'paris',
    icon: '🇫🇷',
    description: 'Discover romance, art, and culinary excellence in the City of Light.',
    imageUrl:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80&fit=crop&auto=format',
    imageAttribution: {
      photographerName: 'Chris Karidis',
      photographerUrl:
        'https://unsplash.com/@chriskaridis?utm_source=experience_marketplace&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=experience_marketplace&utm_medium=referral',
    },
  },
  {
    name: 'Barcelona',
    slug: 'barcelona',
    icon: '🇪🇸',
    description: 'Enjoy stunning architecture, beaches, and vibrant Catalan culture.',
    imageUrl:
      'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&q=80&fit=crop&auto=format',
    imageAttribution: {
      photographerName: 'Enes',
      photographerUrl:
        'https://unsplash.com/@royalee13?utm_source=experience_marketplace&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=experience_marketplace&utm_medium=referral',
    },
  },
  {
    name: 'Rome',
    slug: 'rome',
    icon: '🇮🇹',
    description: 'Walk through ancient history and savor authentic Italian experiences.',
    imageUrl:
      'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&q=80&fit=crop&auto=format',
    imageAttribution: {
      photographerName: 'David Köhler',
      photographerUrl:
        'https://unsplash.com/@davidkhlr?utm_source=experience_marketplace&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=experience_marketplace&utm_medium=referral',
    },
  },
  {
    name: 'Amsterdam',
    slug: 'amsterdam',
    icon: '🇳🇱',
    description: 'Explore charming canals, world-class museums, and Dutch hospitality.',
    imageUrl:
      'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&q=80&fit=crop&auto=format',
    imageAttribution: {
      photographerName: 'Gaurav Jain',
      photographerUrl:
        'https://unsplash.com/@gauravjain?utm_source=experience_marketplace&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=experience_marketplace&utm_medium=referral',
    },
  },
  {
    name: 'Edinburgh',
    slug: 'edinburgh',
    icon: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    description: 'Discover medieval charm and Scottish heritage in this historic capital.',
    imageUrl:
      'https://images.unsplash.com/photo-1506377585622-bedcbb027afc?w=800&q=80&fit=crop&auto=format',
    imageAttribution: {
      photographerName: 'Adam Wilson',
      photographerUrl:
        'https://unsplash.com/@fourcolourblack?utm_source=experience_marketplace&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=experience_marketplace&utm_medium=referral',
    },
  },
  {
    name: 'Lisbon',
    slug: 'lisbon',
    icon: '🇵🇹',
    description: 'Experience colorful neighborhoods, delicious cuisine, and coastal beauty.',
    imageUrl:
      'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=800&q=80&fit=crop&auto=format',
    imageAttribution: {
      photographerName: 'Daniel Adventures',
      photographerUrl:
        'https://unsplash.com/@danieladventures?utm_source=experience_marketplace&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=experience_marketplace&utm_medium=referral',
    },
  },
  {
    name: 'Berlin',
    slug: 'berlin',
    icon: '🇩🇪',
    description: 'Explore modern culture, fascinating history, and creative energy.',
    imageUrl:
      'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800&q=80&fit=crop&auto=format',
    imageAttribution: {
      photographerName: 'Stefan Widua',
      photographerUrl:
        'https://unsplash.com/@stefanwidua?utm_source=experience_marketplace&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=experience_marketplace&utm_medium=referral',
    },
  },
];

/**
 * Extract just the location from a destination page title.
 * e.g., "Cultural Tours in Bangkok" on a site called "Cultural Tours" → "Bangkok"
 * Falls back to the full title if no " in " pattern is found.
 */
function extractLocationFromTitle(title: string): string {
  const inMatch = title.match(/\bin\s+(.+)$/i);
  if (inMatch?.[1]) {
    return inMatch[1].trim();
  }
  return title;
}

export default async function DestinationsPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  // Fetch published destination guide pages from DB
  const destinationPages = await prisma.page.findMany({
    where: {
      siteId: site.id,
      type: 'LANDING',
      status: 'PUBLISHED',
      slug: { startsWith: 'destinations/' },
      noIndex: false,
    },
    select: {
      slug: true,
      title: true,
      metaDescription: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  const configDestinations = site.homepageConfig?.destinations ?? DEFAULT_DESTINATIONS;

  // Get the site's default category/search term
  const siteCategory =
    site.homepageConfig?.popularExperiences?.searchTerms?.[0] ??
    site.homepageConfig?.categories?.[0]?.name;

  // Build a lookup of destination pages — match full slug suffix first, then city-only
  const pageBySlug = new Map<string, (typeof destinationPages)[0]>();
  for (const page of destinationPages) {
    const suffix = page.slug.replace('destinations/', '');
    // Full suffix match: "barcelona-spain" → page
    pageBySlug.set(suffix.toLowerCase(), page);
    // City-only fallback: "barcelona" → page (only if not already taken)
    const cityPart = suffix.split('-')[0];
    if (cityPart && !pageBySlug.has(cityPart.toLowerCase())) {
      pageBySlug.set(cityPart.toLowerCase(), page);
    }
  }

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Destinations - ${site.name}`,
    description: `Explore destinations with ${site.name}`,
    itemListElement: [
      // Published guide pages first
      ...destinationPages.map((page, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'TouristDestination',
          name: extractLocationFromTitle(page.title),
          description: page.metaDescription ?? '',
          url: `https://${site.primaryDomain || hostname}/${page.slug}`,
        },
      })),
    ],
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Section — uses site hero image when available, compact header when not */}
      {site.homepageConfig?.hero?.backgroundImage ? (
        <section className="relative overflow-hidden py-16 sm:py-24">
          <Image
            src={site.homepageConfig.hero.backgroundImage}
            alt="Explore Destinations"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
                Explore Destinations
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
                Discover amazing places and find unforgettable experiences in each destination
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="border-b border-gray-200 bg-white py-8 sm:py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="font-display text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Explore Destinations
            </h1>
            <p className="mt-2 max-w-2xl text-base text-gray-600">
              Discover amazing places and find unforgettable experiences in each destination
            </p>
          </div>
        </section>
      )}

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

      {/* Destination Guide Pages (from DB) */}
      {destinationPages.length > 0 && (
        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Destination Guides
            </h2>
            <p className="mt-2 text-base text-gray-600">
              In-depth guides with curated experiences, local tips, and travel inspiration
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {destinationPages.map((page) => (
                <Link
                  key={page.slug}
                  href={`/${page.slug}`}
                  className="group overflow-hidden rounded-2xl bg-white shadow-md transition-all hover:shadow-xl"
                >
                  {/* Image */}
                  <div className="relative h-48 w-full overflow-hidden">
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
                      <svg
                        className="h-12 w-12 text-white/80"
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    {/* Guide badge */}
                    <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-indigo-700 backdrop-blur-sm">
                      Destination Guide
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600">
                      {extractLocationFromTitle(page.title)}
                    </h3>
                    {page.metaDescription && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                        {page.metaDescription}
                      </p>
                    )}
                    <div className="mt-4 flex items-center text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                      <span>Read guide</span>
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
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Browse by Destination (config-based, links to experience search) */}
      <section
        className={destinationPages.length > 0 ? 'bg-gray-50 py-12 sm:py-16' : 'py-12 sm:py-16'}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {destinationPages.length > 0 ? 'Browse All Destinations' : 'Browse by Destination'}
          </h2>
          <p className="mt-2 text-base text-gray-600">
            Find experiences in popular destinations worldwide
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {configDestinations.map((destination) => {
              // Check if there's a published guide page for this destination
              const guidePage = pageBySlug.get(destination.slug.toLowerCase());
              const href = guidePage
                ? `/${guidePage.slug}`
                : `/experiences?${new URLSearchParams({
                    destination: destination.name,
                    ...(siteCategory ? { q: siteCategory } : {}),
                  }).toString()}`;

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

                    {/* Guide available badge */}
                    {guidePage && (
                      <div className="absolute left-3 top-3 rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white">
                        Guide available
                      </div>
                    )}

                    {/* Unsplash Attribution */}
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
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600">
                      {destination.name}
                    </h3>
                    {destination.description && (
                      <p className="mt-2 line-clamp-3 text-sm text-gray-600">
                        {destination.description}
                      </p>
                    )}
                    <div className="mt-4 flex items-center text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                      <span>{guidePage ? 'Read guide' : 'Explore experiences'}</span>
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
