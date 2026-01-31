'use client';

import { useState, useCallback } from 'react';
import { PremiumExperienceCard } from './PremiumExperienceCard';
import { useBrand } from '@/lib/site-context';

interface Experience {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  imageUrl: string;
  price: {
    amount: number;
    currency: string;
    formatted: string;
  };
  duration: {
    formatted: string;
  };
  rating: {
    average: number;
    count: number;
  } | null;
  location: {
    name: string;
  };
  cancellationPolicy?: {
    type?: string;
  };
}

type BadgeType = 'freeCancellation';

interface ExperiencesGridProps {
  initialExperiences: Experience[];
  hasMore: boolean;
  searchParams: Record<string, string | undefined>;
}

function assignBadges(experience: Experience): BadgeType[] {
  const badges: BadgeType[] = [];
  if (
    experience.cancellationPolicy?.type === 'FREE' ||
    experience.cancellationPolicy?.type?.toLowerCase().includes('free')
  ) {
    badges.push('freeCancellation');
  }
  return badges;
}

export function ExperiencesGrid({
  initialExperiences,
  hasMore: initialHasMore,
  searchParams,
}: ExperiencesGridProps) {
  const brand = useBrand();
  const [experiences, setExperiences] = useState<Experience[]>(initialExperiences);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const primaryColor = brand?.primaryColor ?? '#0F766E';

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      // Build URL with search params
      const params = new URLSearchParams();
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      if (cursor) params.set('cursor', cursor);
      params.set('loadMore', 'true');

      const response = await fetch(`/api/experiences?${params.toString()}`);
      const data = await response.json();

      if (data.experiences && Array.isArray(data.experiences)) {
        setExperiences((prev) => [...prev, ...data.experiences]);
        setHasMore(data.hasMore ?? false);
        setCursor(data.cursor ?? null);
      }
    } catch (error) {
      console.error('Error loading more experiences:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, cursor, searchParams]);

  if (experiences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-20 shadow-sm">
        <div className="rounded-full bg-gray-100 p-4">
          <svg
            className="h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>
        <h3 className="mt-6 text-xl font-semibold text-gray-900">No experiences found</h3>
        <p className="mt-2 text-gray-600">
          Try adjusting your filters or search for a different destination
        </p>
        <a
          href="/experiences"
          className="mt-6 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Clear all filters
        </a>
      </div>
    );
  }

  // Get first experience for featured display
  const featuredExperience = experiences[0];
  const remainingExperiences = experiences.slice(1);

  return (
    <div>
      {/* Featured Experience (first item, larger) */}
      {featuredExperience && (
        <div className="mb-8">
          <PremiumExperienceCard
            experience={featuredExperience}
            variant="featured"
            badges={assignBadges(featuredExperience)}
          />
        </div>
      )}

      {/* Grid of remaining experiences */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {remainingExperiences.map((experience) => (
          <PremiumExperienceCard
            key={experience.id}
            experience={experience}
            badges={assignBadges(experience)}
          />
        ))}
      </div>

      {/* See More Button */}
      {hasMore && (
        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoading}
            className="group flex items-center gap-3 rounded-full px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {isLoading ? (
              <>
                <div
                  className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden="true"
                />
                <span>Loading more...</span>
              </>
            ) : (
              <>
                <span>See More Experiences</span>
                <svg
                  className="h-5 w-5 transition-transform group-hover:translate-y-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      )}

      {/* End of results message */}
      {!hasMore && experiences.length > 0 && (
        <div className="mt-12 text-center">
          <p className="text-gray-500">You've seen all {experiences.length} experiences</p>
        </div>
      )}
    </div>
  );
}
