'use client';

import Link from 'next/link';
import { useBrand } from '@/lib/site-context';
import type { ExperienceListItem } from '@/lib/holibob';

type BadgeType = 'bestseller' | 'recommended' | 'new' | 'mostViewed' | 'likelyToSellOut';

interface PremiumExperienceCardProps {
  experience: ExperienceListItem;
  variant?: 'default' | 'large' | 'horizontal' | 'featured';
  badges?: BadgeType[];
  showQuickActions?: boolean;
  rank?: number;
  className?: string;
}

const BADGE_STYLES: Record<BadgeType, { bg: string; text: string; icon?: string; label: string }> = {
  bestseller: { bg: 'bg-amber-500', text: 'text-white', label: 'Best Seller' },
  recommended: { bg: 'bg-teal-600', text: 'text-white', label: 'Recommended' },
  new: { bg: 'bg-purple-600', text: 'text-white', label: 'New' },
  mostViewed: { bg: 'bg-blue-600', text: 'text-white', label: 'Most Viewed' },
  likelyToSellOut: { bg: 'bg-rose-600', text: 'text-white', label: 'Likely to Sell Out' },
};

// StarRating component - can be used for detailed rating display
// function StarRating({ rating, count }: { rating: number; count: number }) { ... }

function QuickActionButtons() {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-rose-500"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        aria-label="Add to favorites"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      </button>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-blue-500"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        aria-label="Share"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
        </svg>
      </button>
    </div>
  );
}

export function PremiumExperienceCard({
  experience,
  variant = 'default',
  badges = [],
  showQuickActions = true,
  rank,
  className = '',
}: PremiumExperienceCardProps) {
  const brand = useBrand();
  const primaryColor = brand?.primaryColor ?? '#0F766E';

  // Featured full-width card
  if (variant === 'featured') {
    return (
      <Link
        href={`/experiences/${experience.slug}`}
        className={`group relative flex h-[500px] flex-col justify-end overflow-hidden rounded-3xl ${className}`}
      >
        {/* Background Image */}
        <img
          src={experience.imageUrl || '/placeholder-experience.jpg'}
          alt={experience.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* Badges */}
        <div className="absolute left-6 top-6 flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span
              key={badge}
              className={`${BADGE_STYLES[badge].bg} ${BADGE_STYLES[badge].text} rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide`}
            >
              {BADGE_STYLES[badge].label}
            </span>
          ))}
        </div>

        {/* Quick Actions */}
        {showQuickActions && (
          <div className="absolute right-6 top-6">
            <QuickActionButtons />
          </div>
        )}

        {/* Content */}
        <div className="relative p-8">
          {/* Location */}
          <p className="mb-2 flex items-center gap-1.5 text-sm text-white/80">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {experience.location.name}
          </p>

          {/* Title */}
          <h2 className="mb-4 text-3xl font-bold text-white line-clamp-2">{experience.title}</h2>

          {/* Rating */}
          {experience.rating && (
            <div className="mb-4 flex items-center gap-1.5">
              <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-lg font-semibold text-white">{experience.rating.average.toFixed(1)}</span>
              <span className="text-white/70">({experience.rating.count.toLocaleString()} reviews)</span>
            </div>
          )}

          {/* Meta & Price */}
          <div className="flex items-end justify-between">
            <div className="flex items-center gap-4 text-white/80">
              <span className="flex items-center gap-1.5">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {experience.duration.formatted}
              </span>
            </div>

            <div className="text-right">
              <p className="text-sm text-white/70">From</p>
              <p className="text-3xl font-bold text-white">{experience.price.formatted}</p>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Large card variant
  if (variant === 'large') {
    return (
      <Link
        href={`/experiences/${experience.slug}`}
        className={`group relative flex h-96 flex-col justify-end overflow-hidden rounded-2xl ${className}`}
      >
        {/* Background Image */}
        <img
          src={experience.imageUrl || '/placeholder-experience.jpg'}
          alt={experience.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Badges */}
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          {rank && rank <= 3 && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 text-sm font-bold text-gray-900">
              #{rank}
            </span>
          )}
          {badges.map((badge) => (
            <span
              key={badge}
              className={`${BADGE_STYLES[badge].bg} ${BADGE_STYLES[badge].text} rounded-full px-2.5 py-1 text-xs font-semibold`}
            >
              {BADGE_STYLES[badge].label}
            </span>
          ))}
        </div>

        {/* Quick Actions */}
        {showQuickActions && (
          <div className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100">
            <QuickActionButtons />
          </div>
        )}

        {/* Content */}
        <div className="relative p-5">
          {experience.rating && (
            <div className="mb-2 flex items-center gap-1">
              <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-semibold text-white">{experience.rating.average.toFixed(1)}</span>
              <span className="text-sm text-white/70">({experience.rating.count})</span>
            </div>
          )}

          <h3 className="mb-2 text-xl font-bold text-white line-clamp-2">{experience.title}</h3>

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/80">{experience.duration.formatted}</span>
            <span className="text-lg font-bold text-white">From {experience.price.formatted}</span>
          </div>
        </div>
      </Link>
    );
  }

  // Horizontal card variant
  if (variant === 'horizontal') {
    return (
      <Link
        href={`/experiences/${experience.slug}`}
        className={`group flex gap-4 overflow-hidden rounded-xl border border-gray-100 bg-white transition-all hover:border-gray-200 hover:shadow-lg ${className}`}
      >
        {/* Image */}
        <div className="relative h-40 w-48 flex-shrink-0 overflow-hidden">
          <img
            src={experience.imageUrl || '/placeholder-experience.jpg'}
            alt={experience.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {badges.length > 0 && badges[0] && (
            <div className="absolute left-2 top-2">
              <span className={`${BADGE_STYLES[badges[0]].bg} ${BADGE_STYLES[badges[0]].text} rounded-md px-2 py-0.5 text-xs font-semibold`}>
                {BADGE_STYLES[badges[0]].label}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col justify-center py-3 pr-4">
          <p className="text-xs text-gray-500">{experience.location.name}</p>
          <h3 className="mt-1 text-base font-semibold text-gray-900 line-clamp-2 group-hover:text-gray-700">
            {experience.title}
          </h3>

          {experience.rating && (
            <div className="mt-2 flex items-center gap-1">
              <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-medium text-gray-900">{experience.rating.average.toFixed(1)}</span>
              <span className="text-xs text-gray-500">({experience.rating.count})</span>
            </div>
          )}

          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="text-xs text-gray-500">{experience.duration.formatted}</span>
            <span className="text-base font-bold" style={{ color: primaryColor }}>
              From {experience.price.formatted}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  // Default card variant
  return (
    <Link
      href={`/experiences/${experience.slug}`}
      className={`group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all hover:border-gray-200 hover:shadow-xl ${className}`}
    >
      {/* Image Container */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={experience.imageUrl || '/placeholder-experience.jpg'}
          alt={experience.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Badges */}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {rank && rank <= 10 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-xs font-bold text-gray-900 shadow-sm backdrop-blur-sm">
              #{rank}
            </span>
          )}
          {badges.map((badge) => (
            <span
              key={badge}
              className={`${BADGE_STYLES[badge].bg} ${BADGE_STYLES[badge].text} rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm`}
            >
              {BADGE_STYLES[badge].label}
            </span>
          ))}
        </div>

        {/* Rating Badge */}
        {experience.rating && (
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 shadow-sm backdrop-blur-sm">
            <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-sm font-semibold text-gray-900">{experience.rating.average.toFixed(1)}</span>
          </div>
        )}

        {/* Quick Actions (hover) */}
        {showQuickActions && (
          <div className="absolute bottom-3 right-3 opacity-0 transition-all duration-200 group-hover:opacity-100">
            <QuickActionButtons />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Location */}
        <p className="flex items-center gap-1 text-xs text-gray-500">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          {experience.location.name}
        </p>

        {/* Title */}
        <h3 className="mt-2 text-base font-semibold text-gray-900 line-clamp-2 group-hover:text-gray-700">
          {experience.title}
        </h3>

        {/* Description */}
        <p className="mt-2 flex-1 text-sm text-gray-600 line-clamp-2">
          {experience.shortDescription}
        </p>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {experience.duration.formatted}
          </div>

          <div className="text-right">
            <p className="text-xs text-gray-500">From</p>
            <p className="text-lg font-bold" style={{ color: primaryColor }}>
              {experience.price.formatted}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
