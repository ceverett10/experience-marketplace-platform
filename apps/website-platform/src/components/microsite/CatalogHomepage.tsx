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
import { BLUR_PLACEHOLDER } from '@/lib/image-utils';
import type { SiteConfig, HomepageConfig } from '@/lib/tenant';
import type { MicrositeLayoutConfig } from '@/lib/microsite-layout';
import type { ExperienceListItem } from '@/lib/holibob';
import type { RelatedMicrosite } from '@/lib/microsite-experiences';
import { HomepageBlogSection } from './HomepageBlogSection';
import { ReviewsCarousel } from '@/components/experiences/ReviewsCarousel';
import { CuratedCollections } from './CuratedCollections';
import { PremiumExperienceCard } from '@/components/experiences/PremiumExperienceCard';
import { SignatureExperience, selectSignatureExperience } from './SignatureExperience';

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

interface CatalogHomepageProps {
  site: SiteConfig;
  layoutConfig: MicrositeLayoutConfig;
  experiences: ExperienceListItem[];
  /** Total number of experiences available (may differ from experiences.length if homepage is capped) */
  totalExperienceCount?: number;
  heroConfig?: HomepageConfig['hero'];
  testimonials?: HomepageConfig['testimonials'];
  reviews?: Array<{
    id: string;
    title: string;
    content: string;
    rating: number;
    authorName: string;
    publishedDate: string;
    images: string[];
    productTitle?: string;
  }>;
  relatedMicrosites?: RelatedMicrosite[];
  blogPosts?: BlogPost[];
  collections?: Collection[];
  isPpc?: boolean;
  supplierStats?: {
    totalReviews: number;
    yearsActive: number;
  };
}

export function CatalogHomepage({
  site,
  layoutConfig,
  experiences,
  totalExperienceCount,
  heroConfig,
  testimonials,
  reviews,
  relatedMicrosites: _relatedMicrosites,
  blogPosts,
  collections,
  isPpc,
  supplierStats,
}: CatalogHomepageProps) {
  const primaryColor = site.brand?.primaryColor ?? '#6366f1';
  const gridColumns = layoutConfig.gridColumns;
  // Use actual total count if provided, otherwise fall back to displayed experiences length
  const displayCount = totalExperienceCount ?? experiences.length;

  // PPC: Compute destination and min price for search-intent H1
  const ppcDestination = site.micrositeContext?.supplierCities?.[0];
  const cheapestExperience =
    isPpc && experiences.length > 0
      ? experiences.reduce<ExperienceListItem | undefined>(
          (min, e) => (!min || e.price.amount < min.price.amount ? e : min),
          undefined
        )
      : null;

  // Compute eyebrow text from supplier categories/cities
  const eyebrow = site.micrositeContext?.supplierCities?.[0]
    ? `${site.micrositeContext.supplierCategories?.[0] ?? 'Experiences'} in ${site.micrositeContext.supplierCities[0]}`
    : null;

  const signatureExperience = !isPpc ? selectSignatureExperience(experiences) : null;
  const gridExperiences = signatureExperience
    ? experiences.filter((e) => e.id !== signatureExperience.id)
    : experiences;

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
      <section className="relative overflow-hidden pb-8">
        {/* Background */}
        <div
          className="absolute inset-0 overflow-hidden"
        >
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
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background: `linear-gradient(135deg, ${primaryColor} 0%, ${site.brand?.secondaryColor ?? primaryColor} 100%)`,
              }}
            />
          )}
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${primaryColor}40 0%, rgba(0,0,0,0.55) 100%)` }} />
        </div>

        {/* Content */}
        <div
          className={`relative mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8 ${
            isPpc ? 'pt-8 sm:pt-12' : 'pt-24 sm:pt-32'
          }`}
        >
          <div className="text-center">
            {!isPpc && eyebrow && (
              <p className="mb-3 text-sm font-medium uppercase tracking-widest text-white/70">
                {eyebrow}
              </p>
            )}
            {/* Site Name */}
            <h1
              className={`font-bold text-white ${isPpc ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'}`}
            >
              {site.name}
            </h1>

            {/* Tagline */}
            {site.brand?.tagline && (
              <p
                className={`mx-auto max-w-2xl text-white/90 ${isPpc ? 'mt-2 text-base' : 'mt-4 text-lg'}`}
              >
                {site.brand.tagline}
              </p>
            )}

            {/* Stats + Trust Badges (organic only — PPC uses header trust bar) */}
            {!isPpc && (
              <>
                <div className="mt-6 flex justify-center gap-8 text-white/80">
                  <div>
                    <span className="text-2xl font-bold text-white">
                      {displayCount.toLocaleString()}
                    </span>
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

                {supplierStats && supplierStats.totalReviews > 0 && (
                  <div>
                    <span className="text-2xl font-bold text-white">
                      {supplierStats.totalReviews.toLocaleString()}
                    </span>
                    <span className="ml-2">Reviews</span>
                  </div>
                )}
                {supplierStats && supplierStats.yearsActive > 0 && (
                  <div>
                    <span className="text-2xl font-bold text-white">
                      {supplierStats.yearsActive}+
                    </span>
                    <span className="ml-2">Years</span>
                  </div>
                )}
              </>
            )}

            {/* PPC: Compact experience count strip */}
            {isPpc && (
              <p className="mt-3 text-sm text-white/80">
                {displayCount.toLocaleString()} experiences available &middot; Instant confirmation
              </p>
            )}
          </div>
        </div>
        {!isPpc && (
          <div className="absolute -bottom-1 left-0 right-0">
            <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="block w-full" preserveAspectRatio="none">
              <path d="M0 40C240 70 480 80 720 60C960 40 1200 10 1440 30V80H0V40Z" fill="white" />
            </svg>
          </div>
        )}
      </section>

      {/* Curated Collections */}
      {collections && collections.length > 0 && (
        <CuratedCollections
          collections={collections}
          primaryColor={primaryColor}
          siteName={site.name}
        />
      )}

      {signatureExperience && (
        <SignatureExperience experience={signatureExperience} primaryColor={primaryColor} />
      )}

      {/* All Experiences Grid */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              {isPpc
                ? `${displayCount.toLocaleString()} ${ppcDestination ? `${ppcDestination} ` : ''}Experiences${cheapestExperience ? ` — From ${cheapestExperience.price.formatted}` : ''}`
                : signatureExperience ? 'More Experiences' : 'Our Experiences'}
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              {isPpc
                ? 'Compare & book with best price guarantee'
                : displayCount > experiences.length
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
            {gridExperiences.map((experience, idx) => (
              <PremiumExperienceCard
                key={experience.id}
                experience={experience}
                priority={idx < 6}
                openInNewTab
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
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
            {site.description && <p className="mt-4 text-lg text-gray-600">{site.description}</p>}
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

      {/* Why Book With Us */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Why Book With Us?
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              Everything you need for an unforgettable experience
            </p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: primaryColor }}
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
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Flexible Cancellation</h3>
              <p className="mt-2 text-sm text-gray-600">
                Check each experience for cancellation terms and conditions.
              </p>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: primaryColor }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Instant Confirmation</h3>
              <p className="mt-2 text-sm text-gray-600">
                Get your booking confirmed immediately. No waiting, no uncertainty.
              </p>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: primaryColor }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Secure Payments</h3>
              <p className="mt-2 text-sm text-gray-600">
                All transactions are protected with Stripe encryption. Your data is safe with us.
              </p>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: primaryColor }}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Handpicked Experiences</h3>
              <p className="mt-2 text-sm text-gray-600">
                Every experience is vetted for quality. Only the best make it onto our platform.
              </p>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: primaryColor }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.746 3.746 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.746 3.746 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Verified Reviews</h3>
              <p className="mt-2 text-sm text-gray-600">
                Read genuine reviews from travelers who have been there and done it.
              </p>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: primaryColor }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">24/7 Customer Support</h3>
              <p className="mt-2 text-sm text-gray-600">
                Got a question? Our team is here around the clock to help you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Latest Blog Posts */}
      {blogPosts && blogPosts.length > 0 && (
        <HomepageBlogSection posts={blogPosts} primaryColor={primaryColor} siteName={site.name} />
      )}

      {/* Reviews & Testimonials */}
      {reviews && reviews.length > 0 ? (
        <section className="bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <ReviewsCarousel reviews={reviews} />
          </div>
        </section>
      ) : displayTestimonials.length > 0 ? (
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
      ) : null}
    </>
  );
}
