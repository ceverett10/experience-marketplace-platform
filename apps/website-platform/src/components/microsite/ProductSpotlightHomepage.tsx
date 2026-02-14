/**
 * Product Spotlight Homepage
 *
 * A focused landing page for single-product microsites.
 * Designed to maximize conversion by putting all attention on the one product.
 *
 * Features:
 * - Full-width product hero with image and key info
 * - Inline booking widget (not sidebar)
 * - Product details and gallery
 * - Trust signals
 */

import Image from 'next/image';
import { ExperienceGallery } from '@/components/experiences/ExperienceGallery';
import { BookingWidget } from '@/components/experiences/BookingWidget';
import { MobileBookingCTA } from '@/components/experiences/MobileBookingCTA';
import { TrackViewItem } from '@/components/analytics/TrackViewItem';
import { BLUR_PLACEHOLDER, isHolibobImage } from '@/lib/image-utils';
import { PriceDisplay } from '@/components/ui/PriceDisplay';
import { getProductPricingConfig } from '@/lib/pricing';
import type { Experience } from '@/lib/holibob';
import type { SiteConfig } from '@/lib/tenant';

interface ProductSpotlightHomepageProps {
  site: SiteConfig;
  experience: Experience;
}

export function ProductSpotlightHomepage({ site, experience }: ProductSpotlightHomepageProps) {
  const primaryColor = site.brand?.primaryColor ?? '#6366f1';

  // Check if experience has free cancellation
  const hasFreeCancellation =
    experience.cancellationPolicy?.toLowerCase().includes('free') ||
    experience.cancellationPolicy?.toLowerCase().includes('full refund');

  return (
    <>
      {/* Analytics tracking */}
      <TrackViewItem
        id={experience.id}
        name={experience.title}
        price={experience.price.amount}
        currency={experience.price.currency}
      />

      {/* Product Hero Section */}
      <section className="relative bg-gray-900">
        {/* Hero Image */}
        <div className="absolute inset-0 h-[60vh] min-h-[500px]">
          <Image
            src={experience.imageUrl}
            alt={experience.title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            unoptimized={isHolibobImage(experience.imageUrl)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
        </div>

        {/* Hero Content */}
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-32 sm:px-6 sm:pt-40 lg:px-8 lg:pt-48">
          <div className="max-w-3xl">
            {/* Rating Badge */}
            {experience.rating && experience.rating.count > 0 && (
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 backdrop-blur-sm">
                <span className="text-yellow-400">
                  {'★'.repeat(Math.round(experience.rating.average))}
                  {'☆'.repeat(5 - Math.round(experience.rating.average))}
                </span>
                <span className="text-white">
                  {experience.rating.average.toFixed(1)} ({experience.rating.count} reviews)
                </span>
              </div>
            )}

            {/* Title */}
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {experience.title}
            </h1>

            {/* Quick Info */}
            <div className="mt-6 flex flex-wrap items-center gap-4 text-lg text-white/90">
              {experience.location.name && (
                <span className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  {experience.location.name}
                </span>
              )}
              <span className="flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {experience.duration.formatted}
              </span>
              {hasFreeCancellation && (
                <span className="flex items-center gap-2 text-green-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Free Cancellation
                </span>
              )}
            </div>

            {/* Price and CTA */}
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <div>
                <PriceDisplay
                  priceFormatted={experience.price.formatted}
                  priceAmount={experience.price.amount}
                  currency={experience.price.currency}
                  pricingConfig={getProductPricingConfig(experience.id)}
                  variant="detail"
                  primaryColor="#ffffff"
                  showFrom={true}
                />
              </div>
              <a
                href="#booking"
                className="rounded-full px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
                style={{ backgroundColor: primaryColor }}
              >
                Check Availability
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="bg-white">
        {/* Image Gallery */}
        {experience.images.length > 1 && (
          <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <ExperienceGallery images={experience.images} title={experience.title} />
          </section>
        )}

        {/* Description and Highlights */}
        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-3">
            {/* Left Column - Description */}
            <div className="lg:col-span-2">
              <h2 className="text-2xl font-bold text-gray-900">About This Experience</h2>
              <div
                className="prose prose-lg mt-4 max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: experience.description }}
              />

              {/* Highlights */}
              {experience.highlights && experience.highlights.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-900">Highlights</h3>
                  <ul className="mt-4 space-y-2">
                    {experience.highlights.map((highlight, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <svg
                          className="mt-1 h-5 w-5 flex-shrink-0"
                          style={{ color: primaryColor }}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="text-gray-700">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right Column - Quick Facts */}
            <div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
                <h3 className="text-lg font-semibold text-gray-900">Quick Facts</h3>
                <dl className="mt-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <dt className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-600">
                      <svg
                        className="h-5 w-5"
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
                    </dt>
                    <dd>
                      <p className="text-sm text-gray-500">Duration</p>
                      <p className="font-medium text-gray-900">{experience.duration.formatted}</p>
                    </dd>
                  </div>
                  {experience.languages && experience.languages.length > 0 && (
                    <div className="flex items-start gap-3">
                      <dt className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-600">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                          />
                        </svg>
                      </dt>
                      <dd>
                        <p className="text-sm text-gray-500">Languages</p>
                        <p className="font-medium text-gray-900">
                          {experience.languages.join(', ')}
                        </p>
                      </dd>
                    </div>
                  )}
                  {experience.cancellationPolicy && (
                    <div className="flex items-start gap-3">
                      <dt className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-600">
                        <svg
                          className="h-5 w-5"
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
                      </dt>
                      <dd>
                        <p className="text-sm text-gray-500">Cancellation</p>
                        <p className="font-medium text-gray-900">{experience.cancellationPolicy}</p>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* Inline Booking Widget */}
        <section id="booking" className="bg-gray-50 py-12">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-6 text-center text-2xl font-bold text-gray-900">
              Select Date & Book
            </h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
              <BookingWidget experience={experience} />
            </div>
          </div>
        </section>

        {/* Trust Signals */}
        <section className="bg-white py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
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
                <h3 className="mt-4 text-base font-semibold text-gray-900">Secure Booking</h3>
                <p className="mt-2 text-sm text-gray-600">Your payment is always protected</p>
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
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">Instant Confirmation</h3>
                <p className="mt-2 text-sm text-gray-600">Receive your tickets immediately</p>
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
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">Mobile Tickets</h3>
                <p className="mt-2 text-sm text-gray-600">Show tickets on your phone</p>
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
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">24/7 Support</h3>
                <p className="mt-2 text-sm text-gray-600">We&apos;re here to help anytime</p>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile Sticky CTA */}
        <MobileBookingCTA
          productId={experience.id}
          productName={experience.title}
          priceFormatted={experience.price.formatted}
          priceAmount={experience.price.amount}
          priceCurrency={experience.price.currency}
        />
      </div>
    </>
  );
}
