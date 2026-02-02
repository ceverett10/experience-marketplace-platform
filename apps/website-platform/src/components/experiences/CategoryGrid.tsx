import Link from 'next/link';
import Image from 'next/image';
import { UnsplashAttribution } from '@/components/common/UnsplashAttribution';

interface ImageAttribution {
  photographerName: string;
  photographerUrl: string;
  unsplashUrl: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  imageAttribution?: ImageAttribution;
  icon?: string;
  count?: number;
}

interface CategoryGridProps {
  title?: string;
  subtitle?: string;
  categories: Category[];
  /** Destination to include in navigation (for "Where" search param) */
  destination?: string;
}

// Default category icons
const categoryIcons: Record<string, string> = {
  tours: '🚌',
  'day-trips': '🌅',
  attractions: '🎢',
  'food-drink': '🍷',
  adventure: '🏔️',
  culture: '🏛️',
  nature: '🌿',
  water: '🚤',
  nightlife: '🌙',
  shopping: '🛍️',
  wellness: '💆',
  sports: '⚽',
};

export function CategoryGrid({
  title = 'Browse by Category',
  subtitle,
  categories,
  destination,
}: CategoryGridProps) {
  // Use default categories if none provided
  const displayCategories: Category[] =
    categories.length > 0
      ? categories
      : [
          { id: '1', name: 'Tours & Sightseeing', slug: 'tours' },
          { id: '2', name: 'Day Trips', slug: 'day-trips' },
          { id: '3', name: 'Attractions', slug: 'attractions' },
          { id: '4', name: 'Food & Drink', slug: 'food-drink' },
          { id: '5', name: 'Adventure', slug: 'adventure' },
          { id: '6', name: 'Culture & History', slug: 'culture' },
          { id: '7', name: 'Nature & Wildlife', slug: 'nature' },
          { id: '8', name: 'Water Activities', slug: 'water' },
        ];

  return (
    <section className="bg-gray-50 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{title}</h2>
          {subtitle && <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">{subtitle}</p>}
        </div>

        {/* Categories Grid - Larger cards with more image visibility */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayCategories.map((category) => {
            // Build URL with destination (if known) and category name
            const searchParams = new URLSearchParams();
            if (destination) {
              searchParams.set('destination', destination);
            }
            searchParams.set('q', category.name);
            const href = `/experiences?${searchParams.toString()}`;

            return (
              <Link
                key={category.id}
                href={href}
                className="group relative overflow-hidden rounded-2xl bg-white shadow-md transition-all hover:shadow-xl"
              >
                {category.imageUrl ? (
                  <>
                    {/* Image Container - Taller for better visibility */}
                    <div className="relative h-44 w-full overflow-hidden">
                      <Image
                        src={category.imageUrl}
                        alt={category.name}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      />
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                      {/* Icon badge */}
                      <div className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-xl backdrop-blur-sm">
                        {category.icon ?? categoryIcons[category.slug] ?? '✨'}
                      </div>

                      {/* Compact attribution */}
                      {category.imageAttribution && (
                        <UnsplashAttribution
                          photographerName={category.imageAttribution.photographerName}
                          photographerUrl={category.imageAttribution.photographerUrl}
                          unsplashUrl={category.imageAttribution.unsplashUrl}
                          variant="overlay-compact"
                        />
                      )}
                    </div>

                    {/* Content below image */}
                    <div className="p-4">
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600">
                        {category.name}
                      </h3>
                      {category.count !== undefined && (
                        <p className="mt-1 text-sm text-gray-500">
                          {category.count} experiences
                        </p>
                      )}
                      <div className="mt-2 flex items-center text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                        <span>Explore</span>
                        <svg
                          className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Fallback for categories without images */
                  <div className="flex flex-col items-center justify-center p-8">
                    <span className="text-5xl">
                      {category.icon ?? categoryIcons[category.slug] ?? '✨'}
                    </span>
                    <span className="mt-4 text-center text-base font-semibold text-gray-900 group-hover:text-indigo-600">
                      {category.name}
                    </span>
                    {category.count !== undefined && (
                      <span className="mt-1 text-sm text-gray-500">{category.count} experiences</span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
