import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteFromHostname, type HomepageConfig } from '@/lib/tenant';
import { cleanPlainText } from '@/lib/seo';
import { getHolibobClient } from '@/lib/holibob';
import { prisma } from '@/lib/prisma';
import { DestinationPageTemplate } from '@/components/content/DestinationPageTemplate';

/** Detect paid traffic from URL search params */
function isPaidTraffic(searchParams: Record<string, string | string[] | undefined>): boolean {
  return !!(
    searchParams['gclid'] ||
    searchParams['fbclid'] ||
    searchParams['utm_medium'] === 'cpc'
  );
}

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

/**
 * Extract clean location name from destination page title.
 * Handles patterns like "Travel Experiences in London" → "London",
 * "Discover London, England" → "London, England", etc.
 */
function extractLocationName(title: string): string {
  // Try "... in/near/around {location}" pattern first
  const inMatch = title.match(/\b(?:in|near|around)\s+(.+)$/i);
  if (inMatch?.[1]) return inMatch[1].trim();

  // Strip common prefixes: "Discover X", "Visit X", "Explore X", "Travel Experiences X"
  return title.replace(/^(?:Discover|Visit|Explore|Travel Experiences?)\s+/i, '').trim() || title;
}

/**
 * Mapping of city slugs to their country/region for standardized slug redirects.
 * When a user visits /destinations/london, we 301 redirect to /destinations/london-england.
 */
const CITY_COUNTRY_REDIRECTS: Record<string, string> = {
  london: 'england',
  edinburgh: 'scotland',
  glasgow: 'scotland',
  manchester: 'england',
  liverpool: 'england',
  bristol: 'england',
  oxford: 'england',
  cambridge: 'england',
  york: 'england',
  bath: 'england',
  brighton: 'england',
  cardiff: 'wales',
  belfast: 'northern-ireland',
  paris: 'france',
  barcelona: 'spain',
  madrid: 'spain',
  rome: 'italy',
  florence: 'italy',
  venice: 'italy',
  milan: 'italy',
  amsterdam: 'netherlands',
  berlin: 'germany',
  munich: 'germany',
  prague: 'czech-republic',
  vienna: 'austria',
  lisbon: 'portugal',
  dublin: 'ireland',
  athens: 'greece',
  budapest: 'hungary',
  copenhagen: 'denmark',
  stockholm: 'sweden',
  tokyo: 'japan',
  bangkok: 'thailand',
  singapore: 'singapore',
  sydney: 'australia',
  dubai: 'uae',
  istanbul: 'turkey',
  'new-york': 'usa',
  'los-angeles': 'usa',
  'san-francisco': 'usa',
  chicago: 'usa',
  miami: 'usa',
  'las-vegas': 'usa',
  toronto: 'canada',
  vancouver: 'canada',
};

/**
 * Known country/region suffixes used in standardized destination slugs.
 * Built from CITY_COUNTRY_REDIRECTS values to strip country from "london-england" → "London".
 */
const KNOWN_COUNTRY_SUFFIXES = [...new Set(Object.values(CITY_COUNTRY_REDIRECTS))].sort(
  (a, b) => b.length - a.length
); // Longest first for greedy match

/**
 * Extract a clean city name from a standardized destination slug.
 * Used for the Holibob Discovery API freeText parameter — passing just the city
 * (not "city, country") gets better results from the API.
 *
 * Examples:
 *   "london-england"        → "London"
 *   "new-york-usa"          → "New York"
 *   "prague-czech-republic" → "Prague"
 *   "borough-market"        → "Borough Market" (no known country suffix)
 */
function extractCityFromSlug(slug: string): string {
  for (const country of KNOWN_COUNTRY_SUFFIXES) {
    if (slug.endsWith(`-${country}`)) {
      const citySlug = slug.slice(0, -(country.length + 1));
      return citySlug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }
  // No known suffix — title-case the full slug
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
 * Fetch top experiences from Holibob Product Discovery API.
 * Uses the same pattern as the /experiences page: freeText for WHERE (city name)
 * and searchTerm for WHAT (site theme). No placeIds or categoryIds.
 */
async function getTopExperiences(
  site: Awaited<ReturnType<typeof getSiteFromHostname>>,
  slug: string,
  options?: {
    pageSize?: number;
    searchTerm?: string;
  }
) {
  // Extract clean city name from slug for the API's "where" parameter
  // e.g. "london-england" → "London", "new-york-usa" → "New York"
  const cityName = extractCityFromSlug(slug);
  const pageSize = options?.pageSize ?? 9;

  const filter = {
    freeText: cityName,
    currency: site.primaryCurrency ?? 'GBP',
    ...(options?.searchTerm ? { searchTerm: options.searchTerm } : {}),
  };

  console.info(
    '[Destination] getTopExperiences:',
    JSON.stringify({ slug, cityName, searchTerm: options?.searchTerm ?? null, filter, pageSize })
  );

  try {
    const client = getHolibobClient(site);
    let response = await client.discoverProducts(filter, { pageSize });

    console.info(
      '[Destination] discoverProducts returned',
      response.products.length,
      'products for',
      cityName
    );

    // Fallback: if 0 results with searchTerm, retry location-only
    if (response.products.length === 0 && options?.searchTerm) {
      console.info('[Destination] 0 products with searchTerm, retrying without');
      const fallbackFilter = { freeText: cityName, currency: site.primaryCurrency ?? 'GBP' };
      response = await client.discoverProducts(fallbackFilter, { pageSize });
      console.info(
        '[Destination] fallback returned',
        response.products.length,
        'products for',
        cityName
      );
    }

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
    console.error('[Destination] Error fetching top experiences:', error);
    return [];
  }
}

/**
 * Generate SEO metadata for destination page.
 * PPC visitors get conversion-focused titles; organic visitors get SEO-optimised titles.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const fullSlug = `destinations/${slug}`;
  const sp = await searchParams;
  const isPpc = isPaidTraffic(sp);
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const destination = await getDestinationPage(site.id, fullSlug);

  if (!destination) {
    // Check if this is an old-format slug that should redirect to city-country format
    const country = CITY_COUNTRY_REDIRECTS[slug];
    if (country) {
      const standardSlug = `destinations/${slug}-${country}`;
      const standardPage = await getDestinationPage(site.id, standardSlug);
      if (standardPage) {
        permanentRedirect(`/destinations/${slug}-${country}`);
      }
    }

    return {
      title: 'Destination Not Found',
    };
  }

  const destinationName = extractLocationName(destination.title);

  // PPC: conversion-focused metadata
  if (isPpc) {
    const ppcTitle = `${destinationName} Experiences — Compare & Book`;
    const ppcDescription = `Compare experiences in ${destinationName}. Free cancellation. Best price guarantee.`;

    return {
      title: ppcTitle,
      description: ppcDescription,
      robots: { index: false, follow: false }, // Don't index PPC variants
    };
  }

  // Organic: SEO-optimised metadata
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
export default async function DestinationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const fullSlug = `destinations/${slug}`;
  const sp = await searchParams;
  const isPpc = isPaidTraffic(sp);
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const destination = await getDestinationPage(site.id, fullSlug);

  if (!destination) {
    // 301 redirect old slugs (e.g. /destinations/london → /destinations/london-england)
    const country = CITY_COUNTRY_REDIRECTS[slug];
    if (country) {
      const standardSlug = `destinations/${slug}-${country}`;
      const standardPage = await getDestinationPage(site.id, standardSlug);
      if (standardPage) {
        permanentRedirect(`/destinations/${slug}-${country}`);
      }
    }
    notFound();
  }

  // PPC: show more products (24 vs 9) for more conversion opportunities
  // Search term: use site's configured search terms for themed sites (e.g. food-tour-guide.com)
  const searchTerm = site.homepageConfig?.popularExperiences?.searchTerms?.[0];
  const topExperiences = await getTopExperiences(site, slug, {
    pageSize: isPpc ? 24 : 9,
    searchTerm,
  });

  // Compute price range from fetched experiences
  const priceRange =
    topExperiences.length > 0
      ? {
          min: topExperiences.reduce<string>((cheapest, e) => {
            const current = e.price.formatted;
            // Keep first one as default, rough comparison by length then lexicographic
            return cheapest === '' ? current : cheapest;
          }, topExperiences[0]?.price.formatted ?? ''),
          max: topExperiences[topExperiences.length - 1]?.price.formatted ?? '',
        }
      : null;

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

  // ItemList structured data for product cards
  const itemListLd =
    topExperiences.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          numberOfItems: topExperiences.length,
          itemListElement: topExperiences.map((exp, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${baseUrl}/experiences/${exp.slug}`,
            name: exp.title,
          })),
        }
      : null;

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
      {itemListLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
        />
      )}

      {/* Breadcrumb — hidden for PPC (reduces distraction) */}
      {!isPpc && (
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
      )}

      {/* Destination Page Content */}
      <DestinationPageTemplate
        destination={destination}
        topExperiences={topExperiences}
        siteName={site.name}
        isPpc={isPpc}
        experienceCount={topExperiences.length}
        priceRange={priceRange}
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
