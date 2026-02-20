'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useBrand } from '@/lib/site-context';
import { BLUR_PLACEHOLDER, isHolibobImage } from '@/lib/image-utils';
import { PriceDisplay, DiscountBadge } from '@/components/ui/PriceDisplay';
import { getProductPricingConfig } from '@/lib/pricing';
import type { ExperienceListItem } from '@/lib/holibob';

interface ExperienceCardProps {
  experience: ExperienceListItem;
  variant?: 'default' | 'compact' | 'featured';
  priority?: boolean;
}

export function ExperienceCard({
  experience,
  variant = 'default',
  priority = false,
}: ExperienceCardProps) {
  const brand = useBrand();
  const pricingConfig = getProductPricingConfig(experience.id);

  if (variant === 'compact') {
    return (
      <Link
        href={`/experiences/${experience.slug}`}
        className="group flex gap-4 rounded-lg border border-gray-200 p-3 transition-shadow hover:shadow-md"
      >
        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-200">
          <Image
            src={experience.imageUrl || '/placeholder-experience.jpg'}
            alt={experience.title}
            width={80}
            height={80}
            loading={priority ? 'eager' : 'lazy'}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            unoptimized={isHolibobImage(experience.imageUrl)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <h3 className="truncate text-sm font-medium text-gray-900 group-hover:text-gray-700">
            {experience.title}
          </h3>
          {experience.duration.formatted && (
            <p className="mt-1 text-xs text-gray-500">{experience.duration.formatted}</p>
          )}
          <div className="mt-1">
            <PriceDisplay
              priceFormatted={experience.price.formatted}
              priceAmount={experience.price.amount}
              currency={experience.price.currency}
              pricingConfig={pricingConfig}
              variant="compact"
              primaryColor={brand?.primaryColor ?? '#6366f1'}
            />
          </div>
        </div>
      </Link>
    );
  }

  if (variant === 'featured') {
    return (
      <Link
        href={`/experiences/${experience.slug}`}
        className="group relative flex h-80 flex-col justify-end overflow-hidden rounded-2xl bg-gray-200"
      >
        {/* Image */}
        <Image
          src={experience.imageUrl || '/placeholder-experience.jpg'}
          alt={experience.title}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          {...(priority ? { priority: true } : { loading: 'lazy' as const })}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          unoptimized={isHolibobImage(experience.imageUrl)}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* Content */}
        <div className="relative p-6">
          {experience.rating && (
            <div className="mb-2 flex items-center gap-1">
              <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-medium text-white">
                {experience.rating.average.toFixed(1)}
              </span>
              <span className="text-sm text-white/70">({experience.rating.count})</span>
            </div>
          )}

          <h3 className="text-xl font-semibold text-white line-clamp-2">{experience.title}</h3>

          <div className="mt-2 flex items-center justify-between">
            {experience.duration.formatted && (
              <span className="text-sm text-white/80">{experience.duration.formatted}</span>
            )}
            <div className="text-right">
              {pricingConfig.markupPercentage > 0 && (
                <span className="block text-xs text-white/60 line-through">
                  {(() => {
                    const rrp =
                      experience.price.amount * (1 + pricingConfig.markupPercentage / 100);
                    return new Intl.NumberFormat('en-GB', {
                      style: 'currency',
                      currency: experience.price.currency,
                    }).format(Math.ceil(rrp) - 0.01);
                  })()}
                </span>
              )}
              <span className="text-lg font-bold text-white">
                From {experience.price.formatted}
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Default variant
  return (
    <Link
      href={`/experiences/${experience.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-lg"
    >
      {/* Image */}
      <div className="relative aspect-[16/9] overflow-hidden sm:aspect-[4/3] bg-gray-200">
        <Image
          src={experience.imageUrl || '/placeholder-experience.jpg'}
          alt={experience.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          {...(priority ? { priority: true } : { loading: 'lazy' as const })}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          unoptimized={isHolibobImage(experience.imageUrl)}
        />
        {experience.rating && (
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 backdrop-blur-sm">
            <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">
              {experience.rating.average.toFixed(1)}
            </span>
            {experience.rating.count > 0 && (
              <span className="text-xs text-gray-500">
                ({experience.rating.count.toLocaleString()})
              </span>
            )}
          </div>
        )}
        {/* Discount Badge */}
        <DiscountBadge pricingConfig={pricingConfig} className="absolute right-3 top-3" />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-gray-500">{experience.location.name}</p>
        <h3 className="mt-1 text-base font-semibold text-gray-900 line-clamp-2 group-hover:text-gray-700">
          {experience.title}
        </h3>
        <p className="mt-2 flex-1 text-sm text-gray-600 line-clamp-2">
          {experience.shortDescription}
        </p>
        {/* Star Rating with Review Count */}
        {experience.rating && (
          <div className="mt-2 flex items-center gap-1">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <svg
                  key={i}
                  className={`h-3.5 w-3.5 ${i < Math.round(experience.rating!.average) ? 'text-yellow-400' : 'text-gray-200'}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-xs font-medium text-gray-700">
              {experience.rating.average.toFixed(1)}
            </span>
            {experience.rating.count > 0 && (
              <span className="text-xs text-gray-500">
                ({experience.rating.count.toLocaleString()} reviews)
              </span>
            )}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          {experience.duration.formatted && (
            <span className="text-sm text-gray-500">{experience.duration.formatted}</span>
          )}
          <PriceDisplay
            priceFormatted={experience.price.formatted}
            priceAmount={experience.price.amount}
            currency={experience.price.currency}
            pricingConfig={pricingConfig}
            variant="card"
            primaryColor={brand?.primaryColor ?? '#6366f1'}
          />
        </div>
        {/* Trust Signals */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
            Free cancellation
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                clipRule="evenodd"
              />
            </svg>
            Best price guarantee
          </span>
        </div>
      </div>
    </Link>
  );
}
