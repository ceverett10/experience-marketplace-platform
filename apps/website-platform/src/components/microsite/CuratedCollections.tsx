/**
 * CuratedCollections Component
 *
 * Displays curated collections as a horizontal carousel on the homepage.
 * Each collection card shows the icon, name, description, and product count.
 * Clicking a card navigates to the collection detail page.
 */

import Link from 'next/link';

interface CollectionProduct {
  id: string;
  product: {
    id: string;
    primaryImageUrl: string | null;
    title: string;
  };
}

interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  collectionType: string;
  products: CollectionProduct[];
}

interface CuratedCollectionsProps {
  collections: Collection[];
  primaryColor: string;
  siteName: string;
}

export function CuratedCollections({
  collections,
  primaryColor,
  siteName,
}: CuratedCollectionsProps) {
  if (collections.length === 0) {
    return null;
  }

  return (
    <section className="py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
              Explore Collections
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Curated experiences for every type of adventure
            </p>
          </div>
          <Link
            href="/collections"
            className="hidden items-center gap-1 text-sm font-medium transition-colors hover:opacity-80 sm:flex"
            style={{ color: primaryColor }}
          >
            View all
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Collections Carousel */}
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:pb-0">
            {collections.slice(0, 4).map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                primaryColor={primaryColor}
              />
            ))}
          </div>
        </div>

        {/* Mobile View All Link */}
        <div className="mt-6 text-center sm:hidden">
          <Link
            href="/collections"
            className="inline-flex items-center gap-1 text-sm font-medium"
            style={{ color: primaryColor }}
          >
            View all collections
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

interface CollectionCardProps {
  collection: Collection;
  primaryColor: string;
}

function CollectionCard({ collection, primaryColor }: CollectionCardProps) {
  const productCount = collection.products.length;
  const previewImages = collection.products.slice(0, 3).map((p) => p.product.primaryImageUrl);

  return (
    <Link
      href={`/collections/${collection.slug}`}
      className="group flex min-w-[260px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md snap-start sm:min-w-0"
    >
      {/* Image Header */}
      <div className="relative h-32 overflow-hidden">
        {collection.imageUrl ? (
          <img
            src={collection.imageUrl}
            alt={collection.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : previewImages.some(Boolean) ? (
          <div className="grid h-full grid-cols-3">
            {previewImages.map((url, i) => (
              <div key={i} className="h-full overflow-hidden">
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
              background: `linear-gradient(135deg, ${primaryColor}20 0%, ${primaryColor}40 100%)`,
            }}
          >
            <span className="text-4xl">{collection.iconEmoji || '📦'}</span>
          </div>
        )}
        {/* Emoji Badge */}
        <div
          className="absolute -bottom-3 left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md text-xl"
        >
          {collection.iconEmoji || '📦'}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4 pt-5">
        <h3 className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
          {collection.name}
        </h3>
        {collection.description && (
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">{collection.description}</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {productCount} {productCount === 1 ? 'experience' : 'experiences'}
          </span>
          <span
            className="text-xs font-medium transition-colors"
            style={{ color: primaryColor }}
          >
            Explore &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
