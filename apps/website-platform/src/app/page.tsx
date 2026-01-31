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
        (product.duration ? formatDuration(product.duration, 'minutes') : 'Flexible duration');

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

      {/* Highest Rated Experiences - differentiated by sorting */}
      {experiences.filter((e) => e.rating && e.rating.average > 0).length > 0 && (
        <FeaturedExperiences
          title="Highest Rated"
          subtitle="Top-rated experiences chosen by travelers like you"
          experiences={[...experiences]
            .filter((e) => e.rating && e.rating.average > 0)
            .sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0))
            .slice(0, 4)}
          variant="grid"
        />
      )}

      {/* Popular Destinations */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Popular Destinations
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              Browse experiences by location
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {[
              { name: 'London', slug: 'london', icon: '🇬🇧' },
              { name: 'Paris', slug: 'paris', icon: '🇫🇷' },
              { name: 'Barcelona', slug: 'barcelona', icon: '🇪🇸' },
              { name: 'Rome', slug: 'rome', icon: '🇮🇹' },
              { name: 'Amsterdam', slug: 'amsterdam', icon: '🇳🇱' },
              { name: 'Edinburgh', slug: 'edinburgh', icon: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
              { name: 'Lisbon', slug: 'lisbon', icon: '🇵🇹' },
              { name: 'Berlin', slug: 'berlin', icon: '🇩🇪' },
            ].map((dest) => (
              <a
                key={dest.slug}
                href={`/experiences?destination=${dest.slug}`}
                className="group flex flex-col items-center justify-center rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md"
              >
                <span className="text-4xl">{dest.icon}</span>
                <span className="mt-3 text-center text-sm font-medium text-gray-900 group-hover:text-indigo-600">
                  {dest.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Customer Testimonials */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              What Our Travelers Say
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              Real experiences from real travelers
            </p>
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: 'Sarah M.',
                location: 'London, UK',
                text: 'Absolutely fantastic experience! The booking process was seamless and the tour exceeded all expectations. Would highly recommend to anyone visiting.',
                rating: 5,
              },
              {
                name: 'James T.',
                location: 'New York, US',
                text: 'Great selection of experiences and very competitive prices. The free cancellation policy gave us peace of mind when planning our trip.',
                rating: 5,
              },
              {
                name: 'Maria L.',
                location: 'Barcelona, Spain',
                text: 'We booked a family tour and it was perfectly organized. The kids loved every minute. Easy to book and excellent customer support.',
                rating: 4,
              },
            ].map((testimonial, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-3 flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className={`h-4 w-4 ${i < testimonial.rating ? 'text-yellow-400' : 'text-gray-200'}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-gray-600">
                  &ldquo;{testimonial.text}&rdquo;
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{testimonial.name}</p>
                    <p className="text-xs text-gray-500">{testimonial.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
