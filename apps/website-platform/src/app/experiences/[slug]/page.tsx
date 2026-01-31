import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient, mapProductToExperience, type Experience } from '@/lib/holibob';
import { ExperienceGallery } from '@/components/experiences/ExperienceGallery';
import { BookingWidget } from '@/components/experiences/BookingWidget';
import { ReviewsCarousel } from '@/components/experiences/ReviewsCarousel';
import { AboutActivity } from '@/components/experiences/AboutActivity';

interface Props {
  params: Promise<{ slug: string }>;
}

interface ExperienceResult {
  experience: Experience | null;
  isUsingMockData: boolean;
  apiError?: string;
}

async function getExperience(
  site: Awaited<ReturnType<typeof getSiteFromHostname>>,
  slug: string
): Promise<ExperienceResult> {
  try {
    const client = getHolibobClient(site);
    const product = await client.getProduct(slug);

    if (!product) {
      // Product not found in Holibob - return null (no mock data)
      console.error('Product not found:', slug);
      return {
        experience: null,
        isUsingMockData: false,
      };
    }

    return {
      experience: mapProductToExperience(product),
      isUsingMockData: false,
    };
  } catch (error) {
    // Log the error but don't fall back to mock data
    console.error('Error fetching experience:', {
      slug,
      error: error instanceof Error ? error.message : error,
      partnerId: site.holibobPartnerId,
    });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      experience: null,
      isUsingMockData: false,
      apiError: errorMessage,
    };
  }
}

// No mock data - all data comes from Holibob API

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const { experience } = await getExperience(site, slug);

  if (!experience) {
    return {
      title: 'Experience Not Found',
    };
  }

  return {
    title: `${experience.title} | ${site.name}`,
    description: experience.shortDescription,
    openGraph: {
      title: experience.title,
      description: experience.shortDescription,
      images: [experience.imageUrl],
      type: 'website',
    },
  };
}

export default async function ExperienceDetailPage({ params }: Props) {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const { experience, apiError } = await getExperience(site, slug);

  if (!experience) {
    // Return 404 if product not found or API error
    notFound();
  }

  // Generate JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: experience.title,
    description: experience.description,
    image: experience.images,
    address: {
      '@type': 'PostalAddress',
      streetAddress: experience.location.address,
      addressLocality: experience.location.name,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: experience.location.lat,
      longitude: experience.location.lng,
    },
    aggregateRating: experience.rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: experience.rating.average,
          reviewCount: experience.rating.count,
        }
      : undefined,
    offers: {
      '@type': 'Offer',
      price: experience.price.amount / 100,
      priceCurrency: experience.price.currency,
      availability: 'https://schema.org/InStock',
    },
  };

  // Check for free cancellation
  const hasFreeCancellation =
    experience.cancellationPolicy?.toLowerCase().includes('free') ||
    experience.cancellationPolicy?.toLowerCase().includes('full refund');

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-gray-50">
        {/* Breadcrumb Bar */}
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-sm text-gray-500">
              <a href="/" className="hover:text-gray-700">
                Home
              </a>
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
              <a href="/experiences" className="hover:text-gray-700">
                Experiences
              </a>
              {experience.categories[0] && (
                <>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-gray-900">{experience.categories[0].name}</span>
                </>
              )}
            </nav>
          </div>
        </div>

        {/* Image Gallery */}
        <div className="bg-white">
          <ExperienceGallery
            images={experience.images.length > 0 ? experience.images : [experience.imageUrl]}
            title={experience.title}
          />
        </div>

        {/* Main Content */}
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-3 lg:gap-12">
            {/* Left Column - Content */}
            <div className="lg:col-span-2">
              {/* Title & Quick Info */}
              <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl lg:text-4xl">
                  {experience.title}
                </h1>

                {/* Quick Stats Row */}
                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                  {/* Rating */}
                  {experience.rating && (
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-0.5 rounded-md bg-teal-600 px-2 py-1 text-white">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="font-semibold">
                          {experience.rating.average.toFixed(1)}
                        </span>
                      </div>
                      <span className="text-gray-600">
                        ({experience.rating.count.toLocaleString()} reviews)
                      </span>
                    </div>
                  )}

                  {/* Duration */}
                  <div className="flex items-center gap-1.5 text-gray-600">
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
                        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>{experience.duration.formatted}</span>
                  </div>

                  {/* Location */}
                  <div className="flex items-center gap-1.5 text-gray-600">
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
                        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                      />
                    </svg>
                    <span>{experience.location.name}</span>
                  </div>

                  {/* Free Cancellation Badge */}
                  {hasFreeCancellation && (
                    <div className="flex items-center gap-1.5 text-emerald-600">
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="font-medium">Free cancellation</span>
                    </div>
                  )}
                </div>
              </div>

              {/* What Travelers Are Saying - Reviews Carousel */}
              {experience.reviews && experience.reviews.length > 0 && (
                <ReviewsCarousel reviews={experience.reviews} rating={experience.rating} />
              )}

              {/* About This Activity - Quick Info Cards */}
              <AboutActivity
                duration={experience.duration.formatted}
                hasFreeCancellation={hasFreeCancellation}
                languages={experience.languages}
                cancellationPolicy={experience.cancellationPolicy}
              />

              {/* Full Description */}
              <section className="mb-8">
                <h2 className="mb-4 text-xl font-semibold text-gray-900">Full description</h2>
                <div className="prose prose-gray max-w-none">
                  {experience.description.split('\n\n').map((paragraph, idx) => (
                    <p key={idx} className="mb-4 leading-relaxed text-gray-600">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>

              {/* Highlights */}
              {experience.highlights.length > 0 && (
                <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900">Highlights</h2>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {experience.highlights.map((highlight, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <svg
                          className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-gray-700">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* What's Included / Excluded */}
              {(experience.inclusions.length > 0 || experience.exclusions.length > 0) && (
                <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
                  <div className="grid gap-8 sm:grid-cols-2">
                    {experience.inclusions.length > 0 && (
                      <div>
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                          <svg
                            className="h-5 w-5 text-emerald-500"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                              clipRule="evenodd"
                            />
                          </svg>
                          What&apos;s included
                        </h3>
                        <ul className="space-y-2">
                          {experience.inclusions.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                              <svg
                                className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {experience.exclusions.length > 0 && (
                      <div>
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                          <svg
                            className="h-5 w-5 text-red-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                              clipRule="evenodd"
                            />
                          </svg>
                          What&apos;s not included
                        </h3>
                        <ul className="space-y-2">
                          {experience.exclusions.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                              <svg
                                className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Itinerary */}
              {experience.itinerary && experience.itinerary.length > 0 && (
                <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900">Itinerary</h2>
                  <div className="space-y-4">
                    {experience.itinerary.map((stop, idx) => (
                      <div key={idx} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
                            {idx + 1}
                          </div>
                          {idx < experience.itinerary.length - 1 && (
                            <div className="mt-2 h-full w-0.5 bg-gray-200" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          {stop.name && <h3 className="font-medium text-gray-900">{stop.name}</h3>}
                          {stop.description && (
                            <p className="mt-1 text-sm text-gray-600">{stop.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Guide Languages */}
              {experience.languages && experience.languages.length > 0 && (
                <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900">Guide languages</h2>
                  <div className="flex flex-wrap gap-2">
                    {experience.languages.map((lang, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"
                          />
                        </svg>
                        {lang}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Additional Information */}
              {experience.additionalInfo && experience.additionalInfo.length > 0 && (
                <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900">
                    Additional information
                  </h2>
                  <ul className="space-y-3">
                    {experience.additionalInfo.map((info, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <svg
                          className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                          />
                        </svg>
                        <span className="text-sm text-gray-600">{info}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Meeting Point */}
              <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="mb-4 text-xl font-semibold text-gray-900">Meeting point</h2>
                <div className="flex items-start gap-3">
                  <svg
                    className="mt-1 h-5 w-5 flex-shrink-0 text-gray-400"
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
                  <div>
                    <p className="font-medium text-gray-900">{experience.location.name}</p>
                    {experience.location.address && (
                      <p className="mt-1 text-sm text-gray-600">{experience.location.address}</p>
                    )}
                  </div>
                </div>
                {/* Map */}
                <div className="mt-4 h-48 overflow-hidden rounded-lg bg-gray-100">
                  {experience.location.mapImageUrl ? (
                    <img
                      src={experience.location.mapImageUrl}
                      alt={`Map showing ${experience.location.name}`}
                      className="h-full w-full object-cover"
                    />
                  ) : experience.location.lat && experience.location.lng ? (
                    <img
                      src={`https://maps.googleapis.com/maps/api/staticmap?center=${experience.location.lat},${experience.location.lng}&zoom=15&size=640x400&markers=color:red|${experience.location.lat},${experience.location.lng}&maptype=roadmap&key=${process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'] || ''}`}
                      alt={`Map showing ${experience.location.name}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-400">
                      <svg
                        className="h-12 w-12"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </section>

              {/* Cancellation Policy */}
              {experience.cancellationPolicy && (
                <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900">Cancellation policy</h2>
                  <div
                    className={`rounded-lg p-4 ${hasFreeCancellation ? 'bg-emerald-50' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <svg
                        className={`mt-0.5 h-5 w-5 flex-shrink-0 ${hasFreeCancellation ? 'text-emerald-600' : 'text-gray-400'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p
                        className={`text-sm ${hasFreeCancellation ? 'text-emerald-800' : 'text-gray-600'}`}
                      >
                        {experience.cancellationPolicy}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Customer Reviews Section */}
              {experience.reviews && experience.reviews.length > 0 && (
                <section
                  id="reviews"
                  className="mb-8 rounded-xl border border-gray-200 bg-white p-6"
                >
                  <h2 className="mb-6 text-xl font-semibold text-gray-900">Customer reviews</h2>

                  {/* Overall Rating */}
                  {experience.rating && (
                    <div className="mb-8 flex items-center gap-8 border-b border-gray-100 pb-6">
                      <div className="text-center">
                        <div className="text-5xl font-bold text-gray-900">
                          {experience.rating.average.toFixed(1)}
                          <span className="text-2xl font-normal text-gray-400">/5</span>
                        </div>
                        <div className="mt-2 flex items-center justify-center gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <svg
                              key={i}
                              className={`h-5 w-5 ${i < Math.round(experience.rating!.average) ? 'text-gray-900' : 'text-gray-200'}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          based on {experience.rating.count.toLocaleString()} reviews
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Individual Reviews */}
                  <div className="space-y-6">
                    {experience.reviews.slice(0, 5).map((review) => (
                      <div
                        key={review.id}
                        className="border-b border-gray-100 pb-6 last:border-0 last:pb-0"
                      >
                        <div className="mb-3 flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white">
                              {review.authorName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{review.authorName}</p>
                              <p className="flex items-center gap-2 text-xs text-gray-500">
                                {new Date(review.publishedDate).toLocaleDateString('en-GB', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                                <span className="inline-flex items-center gap-1 text-emerald-600">
                                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                      fillRule="evenodd"
                                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  Verified booking
                                </span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <svg
                                key={i}
                                className={`h-4 w-4 ${i < review.rating ? 'text-gray-900' : 'text-gray-200'}`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            ))}
                            <span className="ml-1 text-sm font-medium">{review.rating}</span>
                          </div>
                        </div>
                        {review.title && (
                          <p className="mb-2 font-medium text-gray-900">{review.title}</p>
                        )}
                        <p className="text-sm leading-relaxed text-gray-600">{review.content}</p>
                        {review.images.length > 0 && (
                          <div className="mt-4 flex gap-2 overflow-x-auto">
                            {review.images.slice(0, 4).map((img, idx) => (
                              <img
                                key={idx}
                                src={img}
                                alt={`Review photo ${idx + 1}`}
                                className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {experience.reviews.length > 5 && (
                    <button className="mt-6 w-full rounded-xl border border-gray-300 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                      Show all {experience.reviews.length} reviews
                    </button>
                  )}
                </section>
              )}
            </div>

            {/* Right Column - Booking Widget (Sticky) */}
            <div className="mt-8 lg:mt-0">
              <div className="sticky top-24">
                <BookingWidget experience={experience} />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Sticky CTA */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-4 lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">From</p>
              <p className="text-xl font-bold text-gray-900">{experience.price.formatted}</p>
            </div>
            <a
              href="#booking"
              className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              Check availability
            </a>
          </div>
        </div>

        {/* Spacer for mobile sticky CTA */}
        <div className="h-20 lg:hidden" />
      </div>
    </>
  );
}
