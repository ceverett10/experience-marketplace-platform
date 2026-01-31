import { headers } from 'next/headers';
import { Hero } from '@/components/layout/Hero';
import { FeaturedExperiences } from '@/components/experiences/FeaturedExperiences';
import { CategoryGrid } from '@/components/experiences/CategoryGrid';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient, type ExperienceListItem } from '@/lib/holibob';

// Revalidate every 5 minutes for fresh content
export const revalidate = 300;

async function getFeaturedExperiences(
  siteConfig: Awaited<ReturnType<typeof getSiteFromHostname>>
): Promise<ExperienceListItem[]> {
  try {
    const client = getHolibobClient(siteConfig);

    // Get featured/popular experiences from Holibob Product Discovery API
    const response = await client.discoverProducts(
      {
        currency: 'GBP',
        // In production, filter by partner's configured locations/categories
      },
      { pageSize: 8 }
    );

    // Map to our experience format
    return response.products.map((product) => {
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
        rating: product.rating
          ? {
              average: product.rating,
              count: 0,
            }
          : null,
        location: {
          name: product.location?.name ?? '',
        },
      };
    });
  } catch (error) {
    console.error('Error fetching featured experiences:', error);
    // Return empty array - no mock data
    return [];
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

export default async function HomePage() {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const experiences = await getFeaturedExperiences(site);

  return (
    <>
      {/* Hero Section */}
      <Hero />

      {/* Featured Experiences */}
      <FeaturedExperiences
        title="Popular Experiences"
        subtitle="Discover the most loved experiences in your destination"
        experiences={experiences}
        variant="grid"
      />

      {/* Categories */}
      <CategoryGrid
        title="Explore by Category"
        subtitle="Find the perfect experience for your interests"
        categories={[]}
      />

      {/* Trust Section */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
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
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Secure Booking</h3>
              <p className="mt-2 text-sm text-gray-600">
                Your payment information is always protected
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
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
                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Verified Reviews</h3>
              <p className="mt-2 text-sm text-gray-600">Real reviews from real travelers</p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
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
                    d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.746 3.746 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.746 3.746 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Best Price Guarantee</h3>
              <p className="mt-2 text-sm text-gray-600">Find a lower price? We&apos;ll match it</p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
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
                    d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">24/7 Support</h3>
              <p className="mt-2 text-sm text-gray-600">We&apos;re here to help anytime</p>
            </div>
          </div>
        </div>
      </section>

      {/* More Featured (different variant) */}
      <FeaturedExperiences
        title="Must-Do Experiences"
        subtitle="Don't miss these incredible adventures"
        experiences={experiences.slice(0, 6)}
        variant="featured"
      />
    </>
  );
}
