import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient, mapProductToExperience, type Experience } from '@/lib/holibob';
import { ExperienceGallery } from '@/components/experiences/ExperienceGallery';
import { BookingForm } from '@/components/booking';
import { ExperienceCard } from '@/components/experiences/ExperienceCard';

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
      // Product not found in Holibob - try mock data
      const mockExperience = getMockExperience(slug);
      return {
        experience: mockExperience,
        isUsingMockData: mockExperience !== null,
      };
    }

    return {
      experience: mapProductToExperience(product),
      isUsingMockData: false,
    };
  } catch (error) {
    console.error('Error fetching experience:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Return mock data as fallback
    const mockExperience = getMockExperience(slug);
    return {
      experience: mockExperience,
      isUsingMockData: mockExperience !== null,
      apiError: errorMessage,
    };
  }
}

function getMockExperience(slug: string): Experience | null {
  const experiences: Record<string, Experience> = {
    'london-eye-experience': {
      id: '1',
      title: 'London Eye Experience',
      slug: 'london-eye-experience',
      shortDescription: 'Take in breathtaking views of London from the iconic London Eye.',
      description: `Experience London from a whole new perspective aboard the iconic London Eye. Standing 135 meters tall on the South Bank of the River Thames, the London Eye offers unparalleled 360-degree views of the capital's most famous landmarks.

As you slowly rotate in one of 32 sealed and air-conditioned capsules, you'll enjoy spectacular views of Big Ben, the Houses of Parliament, Westminster Abbey, St Paul's Cathedral, Buckingham Palace, and beyond. On a clear day, you can see up to 40 kilometers in every direction.

The complete rotation takes approximately 30 minutes, giving you plenty of time to spot famous landmarks, take photos, and simply soak in the magnificent cityscape. Each capsule can hold up to 25 people, but you'll never feel crowded as you drift above the city.

The London Eye has become one of the most popular paid tourist attractions in the United Kingdom, and for good reason. It's a quintessential London experience that offers a unique vantage point of this historic city.`,
      imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1200',
      images: [
        'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1200',
        'https://images.unsplash.com/photo-1486299267070-83823f5448dd?w=1200',
        'https://images.unsplash.com/photo-1520986606214-8b456906c813?w=1200',
        'https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=1200',
      ],
      price: { amount: 3500, currency: 'GBP', formatted: '£35.00' },
      duration: { value: 30, unit: 'minutes', formatted: '30 minutes' },
      rating: { average: 4.7, count: 2453 },
      location: {
        name: 'London, UK',
        address: 'Riverside Building, County Hall, Westminster Bridge Rd, London SE1 7PB',
        lat: 51.5033,
        lng: -0.1196,
      },
      categories: [
        { id: 'attractions', name: 'Attractions', slug: 'attractions' },
        { id: 'sightseeing', name: 'Sightseeing', slug: 'sightseeing' },
      ],
      highlights: [
        '360-degree panoramic views of London',
        'See 55+ famous landmarks',
        'Air-conditioned capsules',
        'Skip-the-line ticket option available',
        'Accessible for wheelchair users',
      ],
      inclusions: [
        'Standard London Eye ticket',
        'Access to 4D cinema experience',
        'Interactive guides in multiple languages',
      ],
      exclusions: [
        'Hotel pickup and drop-off',
        'Food and drinks',
        'Champagne Experience (available as upgrade)',
      ],
      cancellationPolicy:
        'Free cancellation up to 24 hours before the experience starts. Full refund if cancelled within this period.',
    },
    'tower-of-london-tour': {
      id: '2',
      title: 'Tower of London Tour',
      slug: 'tower-of-london-tour',
      shortDescription: 'Explore centuries of royal history at the Tower of London.',
      description: `Discover almost 1,000 years of history at the Tower of London, one of the world's most famous and spectacular fortresses. This UNESCO World Heritage Site has served as a royal palace, prison, armory, and even a zoo throughout its long history.

Join a Yeoman Warder (Beefeater) tour and hear tales of intrigue, imprisonment, and execution. These iconic guardians have protected the Tower since Tudor times and their tours are legendary for their entertaining and informative storytelling.

Marvel at the Crown Jewels, the world's most famous collection of royal regalia, including the Imperial State Crown worn by Queen Elizabeth II at every State Opening of Parliament. The collection contains some 23,578 gemstones and includes the famous Cullinan I diamond.

Walk along the medieval walls, explore the White Tower (the oldest part of the fortress, built by William the Conqueror in the 1080s), and discover the stories of famous prisoners including Anne Boleyn, Lady Jane Grey, and Guy Fawkes.

Don't miss the ravens – legend has it that if the ravens ever leave the Tower, the kingdom will fall.`,
      imageUrl: 'https://images.unsplash.com/photo-1529655683826-aba9b3e77383?w=1200',
      images: [
        'https://images.unsplash.com/photo-1529655683826-aba9b3e77383?w=1200',
        'https://images.unsplash.com/photo-1590937286984-0eb6c40c6a7c?w=1200',
        'https://images.unsplash.com/photo-1577043956968-61c2f3d6a3ea?w=1200',
      ],
      price: { amount: 2900, currency: 'GBP', formatted: '£29.00' },
      duration: { value: 3, unit: 'hours', formatted: '3 hours' },
      rating: { average: 4.8, count: 1876 },
      location: {
        name: 'London, UK',
        address: 'Tower of London, London EC3N 4AB',
        lat: 51.5081,
        lng: -0.0759,
      },
      categories: [
        { id: 'culture', name: 'Culture & History', slug: 'culture' },
        { id: 'tours', name: 'Tours', slug: 'tours' },
      ],
      highlights: [
        'See the Crown Jewels',
        'Join a Yeoman Warder tour',
        'Explore 1,000 years of history',
        'Walk the medieval walls',
        'Meet the famous ravens',
      ],
      inclusions: [
        'Tower of London entry ticket',
        'Yeoman Warder guided tour',
        'Access to Crown Jewels exhibition',
        'Audio guide in 11 languages',
      ],
      exclusions: ['Hotel pickup and drop-off', 'Food and drinks', 'Personal expenses'],
      cancellationPolicy: 'Free cancellation up to 24 hours before the experience starts.',
    },
  };

  return experiences[slug] ?? null;
}

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
    title: experience.title,
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

  const { experience, isUsingMockData } = await getExperience(site, slug);

  if (!experience) {
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

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Demo Mode Warning Banner */}
      {isUsingMockData && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span><strong>Demo Mode:</strong> This is sample content. Booking is only available with real Holibob products.</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white">
        {/* Gallery */}
        <ExperienceGallery
          images={experience.images.length > 0 ? experience.images : [experience.imageUrl]}
          title={experience.title}
        />

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-3 lg:gap-12">
            {/* Main Content */}
            <div className="lg:col-span-2">
              {/* Breadcrumb */}
              <nav className="mb-4 text-sm text-gray-500">
                <a href="/experiences" className="hover:underline">
                  Experiences
                </a>
                {experience.categories[0] && (
                  <>
                    <span className="mx-2">/</span>
                    <a
                      href={`/experiences?category=${experience.categories[0].slug}`}
                      className="hover:underline"
                    >
                      {experience.categories[0].name}
                    </a>
                  </>
                )}
              </nav>

              {/* Title & Rating */}
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {experience.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                {experience.rating && (
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-5 w-5 text-yellow-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="font-semibold">{experience.rating.average.toFixed(1)}</span>
                    <span className="text-gray-500">({experience.rating.count} reviews)</span>
                  </div>
                )}

                <span className="text-gray-500">•</span>

                <div className="flex items-center gap-1 text-gray-600">
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

                <span className="text-gray-500">•</span>

                <div className="flex items-center gap-1 text-gray-600">
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
              </div>

              {/* Description */}
              <div className="mt-8">
                <h2 className="text-xl font-semibold text-gray-900">About this experience</h2>
                <div className="prose prose-gray mt-4 max-w-none">
                  {experience.description.split('\n\n').map((paragraph, idx) => (
                    <p key={idx} className="mb-4 text-gray-600 leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              {/* Highlights */}
              {experience.highlights.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-xl font-semibold text-gray-900">Highlights</h2>
                  <ul className="mt-4 space-y-2">
                    {experience.highlights.map((highlight, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <svg
                          className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-gray-600">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What's Included / Excluded */}
              <div className="mt-8 grid gap-8 sm:grid-cols-2">
                {experience.inclusions.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">What&apos;s included</h3>
                    <ul className="mt-3 space-y-2">
                      {experience.inclusions.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                          <svg
                            className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500"
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
                    <h3 className="text-lg font-semibold text-gray-900">
                      What&apos;s not included
                    </h3>
                    <ul className="mt-3 space-y-2">
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

              {/* Cancellation Policy */}
              {experience.cancellationPolicy && (
                <div className="mt-8 rounded-lg bg-gray-50 p-6">
                  <h3 className="text-lg font-semibold text-gray-900">Cancellation policy</h3>
                  <p className="mt-2 text-sm text-gray-600">{experience.cancellationPolicy}</p>
                </div>
              )}

              {/* Location */}
              <div className="mt-8">
                <h2 className="text-xl font-semibold text-gray-900">Meeting point</h2>
                <p className="mt-2 text-gray-600">{experience.location.address}</p>
                {/* Map placeholder - would integrate with Google Maps or Mapbox */}
                <div className="mt-4 h-64 rounded-lg bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-500">Map loading...</span>
                </div>
              </div>
            </div>

            {/* Booking Form Sidebar */}
            <div className="mt-8 lg:mt-0">
              <div className="sticky top-24">
                <BookingForm experience={experience} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
