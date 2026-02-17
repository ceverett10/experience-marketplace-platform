'use client';

/**
 * Animated skeleton loader matching PremiumExperienceCard (default variant) dimensions.
 * Shows pulsing placeholder while experiences load.
 */
export function ExperienceCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-100 bg-white">
      {/* Image area — 4:3 aspect ratio */}
      <div className="aspect-[4/3] rounded-t-2xl bg-gray-200" />

      {/* Content */}
      <div className="flex flex-col p-4">
        {/* Title — 2 lines */}
        <div className="h-4 w-4/5 rounded bg-gray-200" />
        <div className="mt-1.5 h-4 w-3/5 rounded bg-gray-200" />

        {/* Duration + location line */}
        <div className="mt-3 flex items-center gap-2">
          <div className="h-3.5 w-3.5 rounded-full bg-gray-200" />
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-3.5 w-3.5 rounded-full bg-gray-200" />
          <div className="h-3 w-20 rounded bg-gray-200" />
        </div>

        {/* Rating */}
        <div className="mt-2 flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded bg-gray-200" />
          <div className="h-3 w-16 rounded bg-gray-200" />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Price section */}
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="h-3 w-10 rounded bg-gray-200" />
          <div className="mt-1 h-5 w-20 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

/** Grid of skeleton cards for loading state */
export function ExperienceGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <ExperienceCardSkeleton key={i} />
      ))}
    </div>
  );
}
