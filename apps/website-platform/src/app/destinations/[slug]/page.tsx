import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';
import { prisma } from '@experience-marketplace/database';
import { DestinationPageTemplate } from '@/components/content/DestinationPageTemplate';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Fetch destination page from database
 */
async function getDestinationPage(siteId: string, slug: string) {
  return await prisma.page.findUnique({
    where: {
      siteId_slug: {
        siteId,
        slug,
      },
      type: 'LANDING',
      status: 'PUBLISHED',
    },
    include: {
      content: true,
    },
  });
}

/**
 * Fetch top experiences from Holibob API for location
 */
async function getTopExperiences(
  site: Awaited<ReturnType<typeof getSiteFromHostname>>,
  locationId?: string | null
) {
  if (!locationId) return [];

  try {
    const client = getHolibobClient(site);
    const products = await client.searchProducts({
      locationId,
      limit: 9,
      sortBy: 'popularity',
    });

    return products.map((product) => ({
      id: product.id,
      slug: product.slug,
      title: product.title,
      shortDescription: product.shortDescription,
      imageUrl: product.imageUrl,
      price: product.price,
      rating: product.rating,
      categories: product.categories || [],
    }));
  } catch (error) {
    console.error('Error fetching top experiences:', error);
    return [];
  }
}

/**
 * Generate SEO metadata for destination page
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const destination = await getDestinationPage(site.id, slug);

  if (!destination) {
    return {
      title: 'Destination Not Found',
    };
  }

  const title = destination.metaTitle || destination.title;
  const description = destination.metaDescription || destination.content?.body.substring(0, 160);

  return {
    title: `${title} | ${site.name}`,
    description,
    openGraph: {
      title,
      description: description || undefined,
      type: 'website',
    },
    alternates: destination.canonicalUrl
      ? {
          canonical: destination.canonicalUrl,
        }
      : undefined,
    robots: {
      index: !destination.noIndex,
      follow: !destination.noIndex,
    },
  };
}

/**
 * Destination guide page
 */
export default async function DestinationPage({ params }: Props) {
  const { slug } = await params;
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const destination = await getDestinationPage(site.id, slug);

  if (!destination) {
    notFound();
  }

  // Fetch top experiences from Holibob API
  const topExperiences = await getTopExperiences(site, destination.holibobLocationId);

  // Generate JSON-LD structured data for destination
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: destination.title,
    description: destination.metaDescription || undefined,
    ...(destination.content?.structuredData || {}),
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3">
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
            <a href="/destinations" className="hover:text-gray-700">
              Destinations
            </a>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900">{destination.title}</span>
          </nav>
        </div>
      </div>

      {/* Destination Page Content */}
      <DestinationPageTemplate
        destination={destination}
        topExperiences={topExperiences}
        siteName={site.name}
      />
    </>
  );
}

/**
 * Generate static params for all published destination pages
 */
export async function generateStaticParams() {
  const destinations = await prisma.page.findMany({
    where: {
      type: 'LANDING',
      status: 'PUBLISHED',
    },
    select: {
      slug: true,
    },
    take: 100,
  });

  return destinations.map((destination) => ({
    slug: destination.slug,
  }));
}
