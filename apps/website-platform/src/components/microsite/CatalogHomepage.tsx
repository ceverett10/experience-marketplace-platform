/**
 * Catalog Homepage
 *
 * A clean, focused homepage for supplier microsites with 2-50 products.
 * Optimized for smaller catalogs - no empty sections or misleading pagination.
 *
 * Features:
 * - Compact hero with supplier branding
 * - Adaptive product grid (2-3 columns based on product count)
 * - All products displayed (no pagination)
 * - About the operator section
 * - Testimonials
 */

import Image from 'next/image';
import Link from 'next/link';
import { BLUR_PLACEHOLDER, isHolibobImage } from '@/lib/image-utils';
import type { SiteConfig, HomepageConfig } from '@/lib/tenant';
import type { MicrositeLayoutConfig } from '@/lib/microsite-layout';
import type { ExperienceListItem } from '@/lib/holibob';
import type { RelatedMicrosite } from '@/lib/microsite-experiences';
import { RelatedMicrosites } from '@/components/microsites/RelatedMicrosites';
import { HomepageBlogSection } from './HomepageBlogSection';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  metaDescription: string | null;
  createdAt: Date;
  content?: {
    body: string;
    qualityScore: number | null;
  } | null;
}

interface CatalogHomepageProps {
  site: SiteConfig;
  layoutConfig: MicrositeLayoutConfig;
  experiences: ExperienceListItem[];
  /** Total number of experiences available (may differ from experiences.length if homepage is capped) */
  totalExperienceCount?: number;
  heroConfig?: HomepageConfig['hero'];
  testimonials?: HomepageConfig['testimonials'];
  relatedMicrosites?: RelatedMicrosite[];
  blogPosts?: BlogPost[];
}

export function CatalogHomepage({
  site,
  layoutConfig,
  experiences,
  totalExperienceCount,
  heroConfig,
  testimonials,
  relatedMicrosites,
  blogPosts,
}: CatalogHomepageProps) {
  const primaryColor = site.brand?.primaryColor ?? '#6366f1';
  const gridColumns = layoutConfig.gridColumns;
  // Use actual total count if provided, otherwise fall back to displayed experiences length
  const displayCount = totalExperienceCount ?? experiences.length;

  // Default testimonials if none provided
  const displayTestimonials = testimonials ?? [
    {
      name: 'Happy Customer',
      location: 'Verified Booking',
      text: 'Great experience! The booking was easy and the activity exceeded our expectations.',
      rating: 5,
    },
  ];

  return (
    <>
      {/* Compact Hero Section */}
      <section className="relative">
        {/* Background */}
        <div className="absolute inset-0 h-[300px] overflow-hidden sm:h-[350px]">
          {heroConfig?.backgroundImage ? (
            <Image
              src={heroConfig.backgroundImage}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
              placeholder="blur"
              blurDataURL={BLUR_PLACEHOLDER}
              unoptimized={isHolibobImage(heroConfig.backgroundImage)}
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background: `linear-gradient(135deg, ${primaryColor} 0%, ${site.brand?.secondaryColor ?? primaryColor} 100%)`,
              }}
            />
          )}
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Content */}
        <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-24 sm:px-6 sm:pt-32 lg:px-8">
          <div className="text-center">
            {/* Logo or Site Name */}
            {site.brand?.logoUrl ? (
              <Image
                src={site.brand.logoDarkUrl ?? site.brand.logoUrl}
                alt={site.name}
                width={200}
                height={60}
                className="mx-auto h-16 w-auto"
              />
            ) : (
              <h1 className="text-3xl font-bold text-white sm:text-4xl">{site.name}</h1>
            )}

            {/* Tagline */}
            {site.brand?.tagline && (
              <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90">{site.brand.tagline}</p>
            )}

            {/* Stats */}
            <div className="mt-6 flex justify-center gap-8 text-white/80">
              <div>
                <span className="text-2xl font-bold text-white">{displayCount.toLocaleString()}</span>
                <span className="ml-2">Experiences</span>
              </div>
              {experiences.some((e) => e.rating) && (
                <div>
                  <span className="text-2xl font-bold text-white">
                    {(
                      experiences.reduce((sum, e) => sum + (e.rating?.average ?? 0), 0) /
                      experiences.filter((e) => e.rating).length
                    ).toFixed(1)}
                  </span>
                  <span className="ml-2">Avg Rating</span>
                </div>
              )}
            </div>

            {/* Trust Badges - Compact inline indicators */}
            <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-white/90 sm:gap-6 sm:text-sm">
              <div className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Verified Operator</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Instant Confirmation</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span>Secure Booking</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* All Experiences Grid */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Our Experiences
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              {displayCount > experiences.length
                ? `Showing ${experiences.length} of ${displayCount.toLocaleString()} experiences`
                : `Browse our complete collection of ${displayCount.toLocaleString()} unique experiences`}
            </p>
          </div>

          {/* Adaptive Grid */}
          <div
            className={`grid gap-6 ${
              gridColumns === 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {experiences.map((experience, idx) => (
              <CatalogExperienceCard
                key={experience.id}
                experience={experience}
                primaryColor={primaryColor}
                priority={idx < 6}
              />
            ))}
          </div>

          {/* View All button when there are more experiences */}
          {displayCount > experiences.length && (
            <div className="mt-10 text-center">
              <Link
                href="/experiences"
                className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-base font-semibold text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                View All {displayCount.toLocaleString()} Experiences
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* About the Operator */}
      <section className="bg-gray-50 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              About {site.name}
            </h2>
            {site.description && (
              <p className="mt-4 text-lg text-gray-600">{site.description}</p>
            )}
            <div className="mt-8 flex justify-center gap-8">
              <div className="text-center">
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <svg
                    className="h-6 w-6"
                    style={{ color: primaryColor }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="mt-2 text-sm font-medium text-gray-900">Verified Operator</p>
              </div>
              <div className="text-center">
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <svg
                    className="h-6 w-6"
                    style={{ color: primaryColor }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="mt-2 text-sm font-medium text-gray-900">Instant Confirmation</p>
              </div>
              <div className="text-center">
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <svg
                    className="h-6 w-6"
                    style={{ color: primaryColor }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                    />
                  </svg>
                </div>
                <p className="mt-2 text-sm font-medium text-gray-900">Secure Booking</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Latest Blog Posts */}
      {blogPosts && blogPosts.length > 0 && (
        <HomepageBlogSection
          posts={blogPosts}
          primaryColor={primaryColor}
          siteName={site.name}
        />
      )}

      {/* Testimonials */}
      {displayTestimonials.length > 0 && (
        <section className="bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                What Travelers Say
              </h2>
            </div>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {displayTestimonials.slice(0, 3).map((testimonial, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
                >
                  {/* Star Rating */}
                  <div className="mb-4 flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`h-5 w-5 ${i < testimonial.rating ? 'text-yellow-400' : 'text-gray-200'}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-base leading-7 text-gray-800">
                    &ldquo;{testimonial.text}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full text-base font-semibold text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-base font-semibold text-gray-900">{testimonial.name}</p>
                      <p className="text-sm text-gray-600">{testimonial.location}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Related Microsites - Cross-linking for SEO */}
      {relatedMicrosites && relatedMicrosites.length > 0 && (
        <RelatedMicrosites microsites={relatedMicrosites} />
      )}
    </>
  );
}

/**
 * Experience card optimized for catalog view
 */
function CatalogExperienceCard({
  experience,
  primaryColor,
  priority,
}: {
  experience: ExperienceListItem;
  primaryColor: string;
  priority: boolean;
}) {
  return (
    <Link
      href={`/experiences/${experience.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-200">
        <Image
          src={experience.imageUrl || '/placeholder-experience.jpg'}
          alt={experience.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          unoptimized={isHolibobImage(experience.imageUrl)}
          {...(priority ? { priority: true } : { loading: 'lazy' as const })}
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Title */}
        <h3 className="line-clamp-2 text-lg font-semibold text-gray-900 group-hover:text-gray-700">
          {experience.title}
        </h3>

        {/* Location & Duration */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          {experience.location.name && (
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
              </svg>
              {experience.location.name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {experience.duration.formatted}
          </span>
        </div>

        {/* Rating */}
        {experience.rating && experience.rating.count > 0 && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-yellow-400">★</span>
            <span className="text-sm font-medium text-gray-900">
              {experience.rating.average.toFixed(1)}
            </span>
            <span className="text-sm text-gray-500">({experience.rating.count})</span>
          </div>
        )}

        {/* Price */}
        <div className="mt-auto pt-3">
          <p className="text-sm text-gray-500">From</p>
          <p className="text-xl font-bold" style={{ color: primaryColor }}>
            {experience.price.formatted}
          </p>
        </div>
      </div>
    </Link>
  );
}
