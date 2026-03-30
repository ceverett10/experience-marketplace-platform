import Image from 'next/image';
import Link from 'next/link';
import { BLUR_PLACEHOLDER } from '@/lib/image-utils';
import type { ExperienceListItem } from '@/lib/holibob';
import { PriceDisplay, DiscountBadge } from '@/components/ui/PriceDisplay';
import { getProductPricingConfig } from '@/lib/pricing';

interface SignatureExperienceProps {
  experience: ExperienceListItem;
  primaryColor: string;
}

export function SignatureExperience({ experience, primaryColor }: SignatureExperienceProps) {
  const pricingConfig = getProductPricingConfig(experience.id);
  const badgeText =
    experience.rating && experience.rating.count >= 10
      ? 'Most Popular'
      : experience.rating && experience.rating.average >= 4.5
        ? 'Highest Rated'
        : 'Our Signature Experience';

  return (
    <section className="bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Our Signature Experience
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
            The experience our guests love most
          </p>
        </div>
        <Link
          href={`/experiences/${experience.slug}`}
          target="_blank"
          rel="noopener"
          className="group block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-lg"
        >
          <div className="grid md:grid-cols-2">
            <div className="relative aspect-[4/3] overflow-hidden bg-gray-200 md:aspect-auto md:min-h-[320px]">
              <Image
                src={experience.imageUrl || '/placeholder-experience.jpg'}
                alt={experience.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                placeholder="blur"
                blurDataURL={BLUR_PLACEHOLDER}
                priority
              />
              <div
                className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: `var(--supplier-brand, ${primaryColor})` }}
              >
                {badgeText}
              </div>
              {pricingConfig.showDiscountBadge && (
                <div className="absolute right-4 top-4">
                  <DiscountBadge pricingConfig={pricingConfig} />
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <h3 className="text-xl font-bold text-gray-900 group-hover:text-gray-700 sm:text-2xl">
                {experience.title}
              </h3>
              {experience.shortDescription && (
                <p className="mt-3 line-clamp-3 text-base leading-relaxed text-gray-600">
                  {experience.shortDescription}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                {experience.duration.formatted && (
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="h-4 w-4"
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
                    {experience.duration.formatted}
                  </span>
                )}
                {experience.location.name && (
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
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
                {experience.cancellationPolicy?.type === 'FREE' && (
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Free cancellation
                  </span>
                )}
              </div>
              {experience.rating && experience.rating.count > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`h-4 w-4 ${i < Math.round(experience.rating!.average) ? 'text-yellow-400' : 'text-gray-200'}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {experience.rating.average.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-500">
                    ({experience.rating.count.toLocaleString()} reviews)
                  </span>
                </div>
              )}
              <div className="mt-6 flex items-center justify-between">
                <PriceDisplay
                  priceFormatted={experience.price.formatted}
                  priceAmount={experience.price.amount}
                  currency={experience.price.currency}
                  pricingConfig={pricingConfig}
                  variant="card"
                  primaryColor={primaryColor}
                />
                <span
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity group-hover:opacity-90"
                  style={{ backgroundColor: `var(--supplier-brand, ${primaryColor})` }}
                >
                  Book This Experience
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}

export function selectSignatureExperience(
  experiences: ExperienceListItem[],
): ExperienceListItem | null {
  if (experiences.length === 0) return null;
  const first = experiences[0]!;
  return experiences.reduce<ExperienceListItem>((best, current) => {
    const bestScore = (best.rating?.count ?? 0) * (best.rating?.average ?? 0);
    const currentScore = (current.rating?.count ?? 0) * (current.rating?.average ?? 0);
    if (currentScore > bestScore) return current;
    if (currentScore === bestScore) {
      if ((current.rating?.average ?? 0) > (best.rating?.average ?? 0)) return current;
    }
    return best;
  }, first);
}
