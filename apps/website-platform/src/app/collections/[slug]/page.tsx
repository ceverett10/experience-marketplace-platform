import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

interface Props {
  params: Promise<{ slug: string }>;
}

// Revalidate every 5 minutes
export const revalidate = 300;

/**
 * Fetch collection with products
 */
async function getCollection(micrositeId: string, slug: string) {
  return prisma.curatedCollection.findUnique({
    where: {
      micrositeId_slug: {
        micrositeId,
        slug,
      },
    },
    include: {
      products: {
        orderBy: { sortOrder: 'asc' },
        include: {
          product: {
            select: {
              id: true,
              holibobProductId: true,
              slug: true,
              title: true,
              shortDescription: true,
              primaryImageUrl: true,
              priceFrom: true,
              currency: true,
              rating: true,
              reviewCount: true,
              duration: true,
              city: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Generate SEO metadata for collection page
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const collection = await getCollection(
    site.micrositeContext?.micrositeId || site.id,
    resolvedParams.slug
  );

  if (!collection) {
    return {
      title: 'Collection Not Found',
    };
  }

  const baseUrl = `https://${site.primaryDomain || hostname}/collections/${collection.slug}`;
  const productCount = collection.products.length;

  return {
    title: collection.name,
    description:
      collection.description ||
      `Explore ${productCount} curated experiences in our ${collection.name} collection from ${site.name}.`,
    openGraph: {
      title: `${collection.name} | ${site.name}`,
      description: collection.description || `Explore curated experiences from ${site.name}`,
      type: 'website',
      images: collection.imageUrl
        ? [{ url: collection.imageUrl }]
        : collection.products[0]?.product.primaryImageUrl
          ? [{ url: collection.products[0].product.primaryImageUrl }]
          : undefined,
    },
    alternates: {
      canonical: baseUrl,
    },
  };
}

/**
 * Format price for display
 */
function formatPrice(amount: number | null, currency: string): string {
  if (!amount) return 'Price varies';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency || 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get collection type display info
 */
function getCollectionTypeInfo(type: string): { label: string; color: string } {
  switch (type) {
    case 'AUDIENCE':
      return { label: 'For You', color: 'bg-blue-100 text-blue-700' };
    case 'SEASONAL':
      return { label: 'Seasonal', color: 'bg-amber-100 text-amber-700' };
    case 'THEMATIC':
      return { label: 'Themed', color: 'bg-purple-100 text-purple-700' };
    case 'CURATED':
      return { label: 'Curated', color: 'bg-green-100 text-green-700' };
    default:
      return { label: 'Collection', color: 'bg-gray-100 text-gray-700' };
  }
}

/**
 * Collection detail page
 */
export default async function CollectionPage({ params }: Props) {
  const resolvedParams = await params;
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const collection = await getCollection(
    site.micrositeContext?.micrositeId || site.id,
    resolvedParams.slug
  );

  if (!collection || !collection.isActive) {
    notFound();
  }

  const primaryColor = site.brand?.primaryColor || '#4F46E5';
  const typeInfo = getCollectionTypeInfo(collection.collectionType);

  // JSON-LD structured data for ItemList
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: collection.name,
    description: collection.description,
    url: `https://${site.primaryDomain || hostname}/collections/${collection.slug}`,
    numberOfItems: collection.products.length,
    itemListElement: collection.products.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: item.product.title,
        description: item.product.shortDescription,
        image: item.product.primaryImageUrl,
        url: `https://${site.primaryDomain || hostname}/experiences/${item.product.slug || item.product.holibobProductId}`,
        ...(item.product.priceFrom && {
          offers: {
            '@type': 'Offer',
            price: Number(item.product.priceFrom),
            priceCurrency: item.product.currency || 'GBP',
          },
        }),
        ...(item.product.rating && {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: item.product.rating,
            reviewCount: item.product.reviewCount || 0,
          },
        }),
      },
    })),
  };

  // Breadcrumb structured data
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `https://${site.primaryDomain || hostname}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Collections',
        item: `https://${site.primaryDomain || hostname}/collections`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: collection.name,
      },
    ],
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* Hero Section */}
      <section
        className="relative py-16 sm:py-20"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${adjustColor(primaryColor, -40)} 100%)`,
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            {/* Icon */}
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-4xl backdrop-blur-sm">
              {collection.iconEmoji || '📦'}
            </div>

            {/* Type Badge */}
            <span
              className={`mb-4 px-3 py-1 rounded-full text-sm font-medium bg-white/20 text-white`}
            >
              {typeInfo.label}
            </span>

            {/* Title */}
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              {collection.name}
            </h1>

            {/* Description */}
            {collection.description && (
              <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
                {collection.description}
              </p>
            )}

            {/* Count */}
            <p className="mt-4 text-white/60">
              {collection.products.length}{' '}
              {collection.products.length === 1 ? 'experience' : 'experiences'}
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
            <Link href="/collections" className="hover:text-gray-700">
              Collections
            </Link>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900">{collection.name}</span>
          </nav>
        </div>
      </div>

      {/* Products Grid */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {collection.products.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-600">No experiences in this collection yet.</p>
              <Link
                href="/collections"
                className="mt-4 inline-flex items-center text-sm font-medium"
                style={{ color: primaryColor }}
              >
                Browse all collections
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {collection.products.map((item) => {
                const product = item.product;
                const experienceUrl = `/experiences/${product.slug || product.holibobProductId}`;

                return (
                  <Link
                    key={product.id}
                    href={experienceUrl}
                    className="group flex flex-col overflow-hidden rounded-xl bg-white border border-gray-200 shadow-sm transition-all hover:shadow-lg hover:border-gray-300"
                  >
                    {/* Image */}
                    <div className="relative h-48 overflow-hidden bg-gray-100">
                      {product.primaryImageUrl ? (
                        <img
                          src={product.primaryImageUrl}
                          alt={product.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div
                          className="flex h-full items-center justify-center"
                          style={{
                            background: `linear-gradient(135deg, ${primaryColor}20 0%, ${primaryColor}40 100%)`,
                          }}
                        >
                          <svg
                            className="h-12 w-12 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                            />
                          </svg>
                        </div>
                      )}
                      {/* Featured Reason Badge */}
                      {item.featuredReason && (
                        <span
                          className="absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-medium bg-white/90 shadow-sm"
                          style={{ color: primaryColor }}
                        >
                          {item.featuredReason}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-4">
                      {/* Location */}
                      {product.city && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <svg
                            className="h-3.5 w-3.5"
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
                          {product.city}
                        </div>
                      )}

                      {/* Title */}
                      <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-gray-700 transition-colors">
                        {product.title}
                      </h3>

                      {/* Rating */}
                      {product.rating && product.rating > 0 && (
                        <div className="mt-2 flex items-center gap-1">
                          <svg
                            className="h-4 w-4 text-amber-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-900">
                            {product.rating.toFixed(1)}
                          </span>
                          {product.reviewCount && product.reviewCount > 0 && (
                            <span className="text-sm text-gray-500">({product.reviewCount})</span>
                          )}
                        </div>
                      )}

                      {/* Duration & Price */}
                      <div className="mt-auto pt-3 flex items-center justify-between border-t border-gray-100">
                        {product.duration && (
                          <span className="text-xs text-gray-500">{product.duration}</span>
                        )}
                        <span className="font-semibold" style={{ color: primaryColor }}>
                          {formatPrice(
                            product.priceFrom ? Number(product.priceFrom) : null,
                            product.currency || 'GBP'
                          )}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* More Collections CTA */}
      <section className="bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900">Explore More Collections</h2>
            <p className="mt-2 text-gray-600">
              Discover more curated experiences perfect for your next adventure.
            </p>
            <Link
              href="/collections"
              className="mt-6 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-white font-medium transition-colors"
              style={{ backgroundColor: primaryColor }}
            >
              View All Collections
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Adjust color brightness
 */
function adjustColor(hex: string, amount: number): string {
  hex = hex.replace('#', '');

  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
