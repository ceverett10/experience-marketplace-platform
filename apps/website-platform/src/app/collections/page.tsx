import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

// Revalidate every 5 minutes
export const revalidate = 300;

/**
 * Generate SEO metadata for collections listing page
 */
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const baseUrl = `https://${site.primaryDomain || hostname}/collections`;

  return {
    title: `Experience Collections | ${site.name}`,
    description: `Browse curated collections of experiences from ${site.name}. Find the perfect adventure for couples, families, thrill-seekers, and more.`,
    openGraph: {
      title: `Experience Collections | ${site.name}`,
      description: `Browse curated collections of experiences from ${site.name}.`,
      type: 'website',
    },
    alternates: {
      canonical: baseUrl,
    },
  };
}

/**
 * Fetch all active collections for the microsite
 */
async function getCollections(micrositeId: string) {
  const currentMonth = new Date().getMonth() + 1; // 1-12

  return prisma.curatedCollection.findMany({
    where: {
      micrositeId,
      isActive: true,
      OR: [
        // Non-seasonal collections (empty seasonalMonths array)
        { seasonalMonths: { isEmpty: true } },
        // Seasonal collections matching current month
        { seasonalMonths: { has: currentMonth } },
      ],
    },
    include: {
      products: {
        orderBy: { sortOrder: 'asc' },
        include: {
          product: {
            select: {
              id: true,
              primaryImageUrl: true,
              title: true,
            },
          },
        },
        take: 4, // For preview images
      },
      _count: {
        select: { products: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
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
 * Collections listing page
 */
export default async function CollectionsPage() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  const collections = await getCollections(site.micrositeContext?.micrositeId || site.id);
  const primaryColor = site.brand?.primaryColor || '#4F46E5';

  // Group collections by type
  const groupedCollections = collections.reduce(
    (acc, collection) => {
      const type = collection.collectionType;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(collection);
      return acc;
    },
    {} as Record<string, typeof collections>
  );

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Experience Collections | ${site.name}`,
    description: `Curated collections of experiences from ${site.name}`,
    url: `https://${site.primaryDomain || hostname}/collections`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: collections.length,
      itemListElement: collections.map((collection, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: collection.name,
        url: `https://${site.primaryDomain || hostname}/collections/${collection.slug}`,
      })),
    },
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
        className="py-16 sm:py-24"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${adjustColor(primaryColor, -40)} 100%)`,
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Experience Collections
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
              Discover curated experiences for every type of adventure. From romantic getaways to
              family fun, find your perfect experience.
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
            <span className="text-gray-900">Collections</span>
          </nav>
        </div>
      </div>

      {/* Collections Grid */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {collections.length === 0 ? (
            <div className="text-center py-16">
              <div
                className="mx-auto h-24 w-24 rounded-full flex items-center justify-center mb-6"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <svg
                  className="h-12 w-12"
                  style={{ color: primaryColor }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No Collections Yet</h2>
              <p className="text-gray-600 max-w-md mx-auto">
                We&apos;re curating amazing collections of experiences. Check back soon!
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex items-center px-6 py-3 text-white rounded-lg font-medium transition-colors"
                style={{ backgroundColor: primaryColor }}
              >
                Browse All Experiences
              </Link>
            </div>
          ) : (
            <div className="space-y-12">
              {/* All collections in one grid */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((collection) => {
                  const typeInfo = getCollectionTypeInfo(collection.collectionType);
                  const productCount = collection._count.products;
                  const previewImages = collection.products
                    .slice(0, 4)
                    .map((p) => p.product.primaryImageUrl);

                  return (
                    <Link
                      key={collection.id}
                      href={`/collections/${collection.slug}`}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-lg"
                    >
                      {/* Image Header */}
                      <div className="relative h-44 overflow-hidden">
                        {collection.imageUrl ? (
                          <img
                            src={collection.imageUrl}
                            alt={collection.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : previewImages.some(Boolean) ? (
                          <div className="grid h-full grid-cols-2 grid-rows-2">
                            {previewImages.map((url, i) => (
                              <div key={i} className="overflow-hidden">
                                {url ? (
                                  <img
                                    src={url}
                                    alt=""
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  />
                                ) : (
                                  <div
                                    className="h-full w-full"
                                    style={{
                                      background: `linear-gradient(135deg, ${primaryColor}20 0%, ${primaryColor}40 100%)`,
                                    }}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            className="flex h-full items-center justify-center"
                            style={{
                              background: `linear-gradient(135deg, ${primaryColor}20 0%, ${primaryColor}50 100%)`,
                            }}
                          >
                            <span className="text-5xl">{collection.iconEmoji || '📦'}</span>
                          </div>
                        )}
                        {/* Type Badge */}
                        <span
                          className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}
                        >
                          {typeInfo.label}
                        </span>
                        {/* Emoji Badge */}
                        <div className="absolute -bottom-4 left-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md text-2xl">
                          {collection.iconEmoji || '📦'}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex flex-1 flex-col p-5 pt-6">
                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-gray-700 transition-colors">
                          {collection.name}
                        </h3>
                        {collection.description && (
                          <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                            {collection.description}
                          </p>
                        )}
                        <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-100">
                          <span className="text-sm text-gray-500">
                            {productCount} {productCount === 1 ? 'experience' : 'experiences'}
                          </span>
                          <span
                            className="text-sm font-medium flex items-center gap-1 transition-colors"
                            style={{ color: primaryColor }}
                          >
                            Explore
                            <svg
                              className="h-4 w-4 transition-transform group-hover:translate-x-1"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div
            className="overflow-hidden rounded-3xl px-6 py-12 sm:px-12 sm:py-16"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${adjustColor(primaryColor, -30)} 100%)`,
            }}
          >
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Can&apos;t Find What You&apos;re Looking For?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
                Browse all our experiences or get in touch for personalized recommendations.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-medium shadow-md transition-all hover:bg-gray-50"
                  style={{ color: primaryColor }}
                >
                  Browse All Experiences
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20"
                >
                  Contact Us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Adjust color brightness (simple hex manipulation)
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
