import type { RelatedMicrosite } from '@/lib/microsite-experiences';

interface RelatedMicrositesProps {
  microsites: RelatedMicrosite[];
  title?: string;
  subtitle?: string;
}

/**
 * Related Microsites Component
 * Displays a grid of related tour operators for cross-linking SEO
 */
export function RelatedMicrosites({
  microsites,
  title = 'Discover More Tour Operators',
  subtitle = 'Explore similar experiences from trusted providers',
}: RelatedMicrositesProps) {
  if (microsites.length === 0) return null;

  return (
    <section className="border-t border-gray-200 bg-gray-50 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{title}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">{subtitle}</p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {microsites.map((microsite) => (
            <a
              key={microsite.fullDomain}
              href={`https://${microsite.fullDomain}`}
              className="group flex flex-col rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md"
              rel="noopener"
            >
              {/* Logo and Name */}
              <div className="flex items-start gap-4">
                {microsite.logoUrl ? (
                  <img
                    src={microsite.logoUrl}
                    alt={`${microsite.siteName} logo`}
                    className="h-12 w-12 flex-shrink-0 rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-lg font-bold text-indigo-600">
                    {microsite.siteName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-semibold text-gray-900 group-hover:text-indigo-600">
                    {microsite.siteName}
                  </h3>
                  {microsite.tagline && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">{microsite.tagline}</p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                {microsite.rating && (
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4 text-yellow-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span>{microsite.rating.toFixed(1)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <svg
                    className="h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                    />
                  </svg>
                  <span>
                    {microsite.productCount} experience{microsite.productCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Categories/Cities tags */}
              <div className="mt-4 flex flex-wrap gap-2">
                {microsite.cities.slice(0, 2).map((city) => (
                  <span
                    key={city}
                    className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                  >
                    {city}
                  </span>
                ))}
                {microsite.categories.slice(0, 2).map((category) => (
                  <span
                    key={category}
                    className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
                  >
                    {category}
                  </span>
                ))}
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
