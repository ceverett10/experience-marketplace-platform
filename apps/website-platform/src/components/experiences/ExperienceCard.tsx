'use client';

import Link from 'next/link';
import { useBrand } from '@/lib/site-context';
import type { ExperienceListItem } from '@/lib/holibob';

interface ExperienceCardProps {
  experience: ExperienceListItem;
  variant?: 'default' | 'compact' | 'featured';
}

export function ExperienceCard({ experience, variant = 'default' }: ExperienceCardProps) {
  const brand = useBrand();

  if (variant === 'compact') {
    return (
      <Link
        href={`/experiences/${experience.slug}`}
        className="group flex gap-4 rounded-lg border border-gray-200 p-3 transition-shadow hover:shadow-md"
      >
        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
          <img
            src={experience.imageUrl || '/placeholder-experience.jpg'}
            alt={experience.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <h3 className="truncate text-sm font-medium text-gray-900 group-hover:text-gray-700">
            {experience.title}
          </h3>
          <p className="mt-1 text-xs text-gray-500">{experience.duration.formatted}</p>
          <p className="mt-1 text-sm font-semibold" style={{ color: brand?.primaryColor ?? '#6366f1' }}>
            From {experience.price.formatted}
          </p>
        </div>
      </Link>
    );
  }

  if (variant === 'featured') {
    return (
      <Link
        href={`/experiences/${experience.slug}`}
        className="group relative flex h-80 flex-col justify-end overflow-hidden rounded-2xl"
      >
        {/* Image */}
        <img
          src={experience.imageUrl || '/placeholder-experience.jpg'}
          alt={experience.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
              <span className="text-sm text-white/70">
                ({experience.rating.count})
              </span>
            </div>
          )}

          <h3 className="text-xl font-semibold text-white line-clamp-2">
            {experience.title}
          </h3>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-white/80">{experience.duration.formatted}</span>
            <span className="text-lg font-bold text-white">
              From {experience.price.formatted}
            </span>
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
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={experience.imageUrl || '/placeholder-experience.jpg'}
          alt={experience.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {experience.rating && (
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 backdrop-blur-sm">
            <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">
              {experience.rating.average.toFixed(1)}
            </span>
          </div>
        )}
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
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          <span className="text-sm text-gray-500">{experience.duration.formatted}</span>
          <span className="font-semibold" style={{ color: brand?.primaryColor ?? '#6366f1' }}>
            From {experience.price.formatted}
          </span>
        </div>
      </div>
    </Link>
  );
}
