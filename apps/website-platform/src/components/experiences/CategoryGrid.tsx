import Link from 'next/link';
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

        {/* Categories Grid */}
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:gap-6">
          {displayCategories.map((category) => (
            <Link
              key={category.id}
              href={`/experiences?category=${category.slug}`}
              className="group relative flex flex-col items-center justify-center overflow-hidden rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md"
            >
              {category.imageUrl ? (
                <>
                  <img
                    src={category.imageUrl}
                    alt={category.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 transition-colors group-hover:bg-black/50" />
                  <span className="relative text-lg font-semibold text-white">{category.name}</span>
                  {category.count !== undefined && (
                    <span className="relative mt-1 text-sm text-white/80">
                      {category.count} experiences
                    </span>
                  )}
                  {category.imageAttribution && (
                    <UnsplashAttribution
                      photographerName={category.imageAttribution.photographerName}
                      photographerUrl={category.imageAttribution.photographerUrl}
                      unsplashUrl={category.imageAttribution.unsplashUrl}
                      variant="overlay"
                    />
                  )}
                </>
              ) : (
                <>
                  <span className="text-4xl">
                    {category.icon ?? categoryIcons[category.slug] ?? '✨'}
                  </span>
                  <span className="mt-3 text-center text-sm font-medium text-gray-900">
                    {category.name}
                  </span>
                  {category.count !== undefined && (
                    <span className="mt-1 text-xs text-gray-500">{category.count} experiences</span>
                  )}
                </>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
