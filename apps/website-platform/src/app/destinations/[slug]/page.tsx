import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname, type HomepageConfig } from '@/lib/tenant';
import { cleanPlainText } from '@/lib/seo';
import { getHolibobClient } from '@/lib/holibob';
import { prisma } from '@/lib/prisma';
import { DestinationPageTemplate } from '@/components/content/DestinationPageTemplate';

/**
 * Get a default image for structured data from site configuration
 */
function getDefaultImage(
  site: {
    brand?: { ogImageUrl?: string | null; logoUrl?: string | null } | null;
    homepageConfig?: HomepageConfig | null;
  },
  hostname: string
): string {
  if (site.brand?.ogImageUrl) return site.brand.ogImageUrl;
  if (site.homepageConfig?.hero?.backgroundImage) return site.homepageConfig.hero.backgroundImage;
  if (site.brand?.logoUrl) return site.brand.logoUrl;
  return `https://${hostname}/og-image.png`;
}

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
    const response = await client.discoverProducts(
      {
        placeIds: [locationId],
        currency: 'GBP',
      },
      { pageSize: 9 }
    );

    return response.products.map((product) => ({
      id: product.id,
      slug: product.id, // Product type doesn't have slug, use id
      title: product.name,
      shortDescription: product.shortDescription || '',
      imageUrl: product.primaryImageUrl || product.imageUrl || product.imageList?.[0]?.url || '',
      price: {
        formatted: product.priceFromFormatted || product.guidePriceFormattedText || 'From £0',
      },
      rating:
        product.reviewRating && product.reviewCount
          ? {
              average: product.reviewRating,
              count: product.reviewCount,
            }
          : null,
      categories:
        product.categoryList?.nodes.map((cat) => ({
          name: cat.name,
        })) || [],
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
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const destination = await getDestinationPage(site.id, slug);

  if (!destination) {
    return {
      title: 'Destination Not Found',
    };
  }

  const title = destination.metaTitle || destination.title;
  const rawDescription = destination.metaDescription || destination.content?.body.substring(0, 160);
  const description = rawDescription ? cleanPlainText(rawDescription) : undefined;

  // Generate canonical URL - use custom if set, otherwise default to page URL
  const canonicalUrl =
    destination.canonicalUrl || `https://${site.primaryDomain || hostname}/destinations/${slug}`;

  // OG image fallback chain
  const ogImage = site.brand?.ogImageUrl || site.homepageConfig?.hero?.backgroundImage;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${site.name}`,
      description: description || undefined,
      type: 'website',
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: {
      canonical: canonicalUrl,
    },
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
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const destination = await getDestinationPage(site.id, slug);

  if (!destination) {
    notFound();
  }

  // Fetch top experiences from Holibob API
  const topExperiences = await getTopExperiences(site, destination.holibobLocationId);

  // Get URLs and image for structured data
  const baseUrl = `https://${site.primaryDomain || hostname}`;
  const pageUrl = `${baseUrl}/destinations/${slug}`;
  const defaultImage = getDefaultImage(site, site.primaryDomain || hostname);

  // Generate JSON-LD structured data for destination
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: destination.title,
    description: cleanPlainText(
      destination.metaDescription || destination.content?.body?.substring(0, 200) || ''
    ),
    url: pageUrl,
    image: defaultImage,
    // Include tourist attraction type for better categorization
    touristType: 'Leisure',
    ...((destination.content?.structuredData as Record<string, unknown>) || {}),
  };

  // BreadcrumbList structured data
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: baseUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Destinations',
        item: `${baseUrl}/destinations`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: destination.title,
      },
    ],
  };

  // Extract FAQ structured data from content if FAQ section exists
  const faqJsonLd = extractFaqSchema(destination.content?.body);

  return (
    <>
      {/* JSON-LD Structured Data - TouristDestination */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* JSON-LD Structured Data - BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

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
 * Extract FAQ pairs from markdown content and return FAQPage JSON-LD schema.
 * Looks for H3 headings ending with '?' followed by paragraph text.
 */
function extractFaqSchema(body?: string | null) {
  if (!body) return null;

  const faqRegex = /###\s+(.+\?)\s*\n+([\s\S]*?)(?=\n###|\n##|\n#|$)/g;
  const items: { question: string; answer: string }[] = [];
  let match;

  while ((match = faqRegex.exec(body)) !== null) {
    const question = match[1]?.trim();
    const answer = match[2]
      ?.trim()
      .replace(/\n+/g, ' ')
      .replace(/[#*_`]/g, '');
    if (question && answer) {
      items.push({ question, answer });
    }
  }

  if (items.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

// Dynamic rendering - pages generated on-demand
// Static generation removed as it requires database access at build time
export const dynamic = 'force-dynamic';
