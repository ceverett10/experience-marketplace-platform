/**
 * RelatedCategories Component
 *
 * Displays category page cards on destination pages.
 * Links to /categories/{slug} for each category.
 */

import Link from 'next/link';
import { getPageUrl } from '@/lib/related-content';

interface CategoryItem {
  slug: string;
  title: string;
  metaDescription: string | null;
}

interface RelatedCategoriesProps {
  categories: CategoryItem[];
  heading?: string;
  primaryColor?: string;
}

export function RelatedCategories({
  categories,
  heading = 'Browse by Category',
  primaryColor = '#6366f1',
}: RelatedCategoriesProps) {
  if (categories.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">{heading}</h2>
          <p className="mt-1 text-sm text-gray-500">Explore experiences by activity type</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.slice(0, 4).map((category) => (
            <Link
              key={category.slug}
              href={getPageUrl(category.slug, 'CATEGORY')}
              className="group flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 transition-all hover:border-gray-200 hover:bg-white hover:shadow-sm"
            >
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: primaryColor }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-gray-900 group-hover:text-gray-700">
                  {category.title}
                </h3>
                {category.metaDescription && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                    {category.metaDescription}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
