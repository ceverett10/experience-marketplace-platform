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
    title: `Experience Categories | ${site.name}`,
    description: `Browse experience categories and find the perfect activity for you with ${site.name}. From tours to adventures, find what you love.`,
    openGraph: {
      title: `Experience Categories | ${site.name}`,
      description: `Browse experience categories and find the perfect activity with ${site.name}.`,
      type: 'website',
    },
  };
}

// Default categories fallback
const DEFAULT_CATEGORIES: Array<{
  name: string;
  slug: string;
  icon: string;
  description: string;
  imageUrl?: string;
  imageAttribution?: { photographerName: string; photographerUrl: string; unsplashUrl: string };
}> = [
  {
    name: 'Tours',
    slug: 'tours',
    icon: '🗺️',
    description: 'Guided tours to discover the best of the destination.',
  },
  {
    name: 'Activities',
    slug: 'activities',
    icon: '🎯',
    description: 'Exciting activities for all interests and skill levels.',
  },
  {
    name: 'Experiences',
    slug: 'experiences',
    icon: '✨',
    description: "Unique and memorable experiences you won't forget.",
  },
  {
    name: 'Classes',
    slug: 'classes',
    icon: '📚',
    description: 'Learn new skills from expert local instructors.',
  },
  {
    name: 'Day Trips',
    slug: 'day-trips',
    icon: '🚗',
    description: 'Explore beyond the city on exciting day excursions.',
  },
  {
    name: 'Private',
    slug: 'private',
    icon: '🌟',
    description: 'Exclusive private experiences tailored just for you.',
  },
];

export default async function CategoriesPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const categories = site.homepageConfig?.categories ?? DEFAULT_CATEGORIES;

  // Get the site's default destination for category links (e.g., "London" for london-food-tours.com)
  const siteDestination = site.homepageConfig?.popularExperiences?.destination;

  // JSON-LD structured data for categories list
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Experience Categories - ${site.name}`,
    description: `Browse experience categories with ${site.name}`,
    itemListElement: categories.map((cat, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Thing',
        name: cat.name,
        description: cat.description,
        url: `https://${site.primaryDomain || hostname}/experiences?${siteDestination ? `destination=${encodeURIComponent(siteDestination)}&` : ''}q=${encodeURIComponent(cat.name)}`,
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
      <section className="bg-gradient-to-br from-purple-900 via-indigo-800 to-indigo-900 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Experience Categories
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-purple-200 sm:text-xl">
              Find the perfect experience for your interests. Browse our curated categories and
              discover something amazing.
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
            <span className="text-gray-900">Categories</span>
          </nav>
        </div>
      </div>

      {/* Categories Grid */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              // Build URL with destination (if known) and category
              const searchParams = new URLSearchParams();
              if (siteDestination) {
                searchParams.set('destination', siteDestination);
              }
              searchParams.set('q', category.name);
              const href = `/experiences?${searchParams.toString()}`;

              return (
                <Link
                  key={category.slug}
                  href={href}
                  className="group relative overflow-hidden rounded-2xl bg-white shadow-md transition-all hover:shadow-xl"
                >
                  {/* Image Container */}
                  <div className="relative h-56 w-full overflow-hidden">
                    {category.imageUrl ? (
                      <Image
                        src={category.imageUrl}
                        alt={category.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600">
                        <span className="text-7xl">{category.icon}</span>
                      </div>
                    )}
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

                    {/* Category Title on Image */}
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-white/90 p-2 text-2xl backdrop-blur-sm">
                          {category.icon}
                        </span>
                        <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                          {category.name}
                        </h2>
                      </div>
                    </div>

                    {/* Unsplash Attribution - REQUIRED by Unsplash API Guidelines */}
                    {category.imageUrl && category.imageAttribution && (
                      <UnsplashAttribution
                        photographerName={category.imageAttribution.photographerName}
                        photographerUrl={category.imageAttribution.photographerUrl}
                        unsplashUrl={category.imageAttribution.unsplashUrl}
                        variant="overlay-compact"
                        className="bottom-16 left-auto right-2" // Positioned above the title, bottom-right
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    {category.description && (
                      <p className="line-clamp-2 text-sm text-gray-600">{category.description}</p>
                    )}
                    <div className="mt-4 flex items-center text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                      <span>View all {category.name.toLowerCase()}</span>
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

      {/* Featured Benefits */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              What Makes Our Experiences Special
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              Every experience is carefully selected to ensure quality and memorable moments
            </p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
                <svg
                  className="h-6 w-6 text-purple-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.746 3.746 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.746 3.746 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Verified Quality</h3>
              <p className="mt-2 text-sm text-gray-600">
                Every provider is vetted and verified before joining our platform
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
                <svg
                  className="h-6 w-6 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Expert Guides</h3>
              <p className="mt-2 text-sm text-gray-600">
                Passionate locals who bring destinations to life with their knowledge
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Best Prices</h3>
              <p className="mt-2 text-sm text-gray-600">
                Competitive pricing with our best price guarantee on all bookings
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
                <svg
                  className="h-6 w-6 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Flexible Booking</h3>
              <p className="mt-2 text-sm text-gray-600">
                Free cancellation on many experiences for peace of mind
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Experiences Teaser */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-12 sm:px-12 sm:py-16">
            <div className="flex flex-col items-center justify-between gap-6 lg:flex-row">
              <div className="text-center lg:text-left">
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Not Sure Where to Start?
                </h2>
                <p className="mt-2 max-w-xl text-lg text-purple-100">
                  Browse all our experiences and discover something new today
                </p>
              </div>
              <Link
                href="/experiences"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-white px-8 py-4 text-base font-medium text-indigo-600 shadow-lg transition-all hover:bg-indigo-50"
              >
                <span>View All Experiences</span>
                <svg
                  className="ml-2 h-5 w-5"
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
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
