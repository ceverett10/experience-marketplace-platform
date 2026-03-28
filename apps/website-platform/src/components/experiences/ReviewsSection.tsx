'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { inferTravelerType, TRAVELER_TYPE_CONFIG, type TravelerType } from '@/lib/review-tags';

interface Review {
  id: string;
  title: string;
  content: string;
  rating: number;
  authorName: string;
  publishedDate: string;
  images: string[];
}

interface ReviewsSectionProps {
  reviews: Review[];
  rating?: {
    average: number;
    count: number;
  } | null;
}

type SortOption = 'newest' | 'oldest' | 'highest' | 'lowest';

const REVIEWS_PER_PAGE = 10;

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          className={`${sizeClass} ${i < rating ? 'text-gray-900' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function formatDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString('en-GB', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function ReviewsSection({ reviews, rating }: ReviewsSectionProps) {
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [filterTravelerType, setFilterTravelerType] = useState<TravelerType | null>(null);
  const [visibleCount, setVisibleCount] = useState(REVIEWS_PER_PAGE);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());

  // Infer traveler types for all reviews
  const reviewTravelerTypes = useMemo(() => {
    const map = new Map<string, TravelerType>();
    for (const review of reviews) {
      const type = inferTravelerType(review.content);
      if (type) map.set(review.id, type);
    }
    return map;
  }, [reviews]);

  // Count reviews by traveler type for filter chips
  const travelerTypeCounts = useMemo(() => {
    const counts = new Map<TravelerType, number>();
    for (const type of reviewTravelerTypes.values()) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return counts;
  }, [reviewTravelerTypes]);

  const ratingBreakdown = useMemo(() => {
    const counts = new Map<number, number>([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ]);
    for (const review of reviews) {
      const star = Math.min(5, Math.max(1, Math.round(review.rating)));
      counts.set(star, (counts.get(star) ?? 0) + 1);
    }
    return counts;
  }, [reviews]);

  const filteredAndSorted = useMemo(() => {
    let result = filterRating
      ? reviews.filter((r) => Math.round(r.rating) === filterRating)
      : reviews;

    // Apply traveler type filter
    if (filterTravelerType) {
      result = result.filter((r) => reviewTravelerTypes.get(r.id) === filterTravelerType);
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime();
        case 'oldest':
          return new Date(a.publishedDate).getTime() - new Date(b.publishedDate).getTime();
        case 'highest':
          return b.rating - a.rating;
        case 'lowest':
          return a.rating - b.rating;
        default:
          return 0;
      }
    });

    return result;
  }, [reviews, sortBy, filterRating, filterTravelerType, reviewTravelerTypes]);

  const visibleReviews = filteredAndSorted.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAndSorted.length;

  const toggleExpanded = (id: string) => {
    setExpandedReviews((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleFilterClick = (star: number) => {
    setFilterRating(filterRating === star ? null : star);
    setVisibleCount(REVIEWS_PER_PAGE);
  };

  if (!reviews || reviews.length === 0) {
    return null;
  }

  return (
    <section id="reviews" className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {/* Header */}
        <h2 className="mb-6 text-xl font-semibold text-gray-900">Traveler reviews</h2>

        {/* Rating Summary + Breakdown */}
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
          {/* Average Rating */}
          {rating && (
            <div className="flex flex-col items-center">
              <span className="text-4xl font-bold text-gray-900">{rating.average.toFixed(1)}</span>
              <StarRating rating={Math.round(rating.average)} size="lg" />
              <span className="mt-1 text-sm text-gray-500">
                {rating.count.toLocaleString()} {rating.count === 1 ? 'review' : 'reviews'}
              </span>
            </div>
          )}

          {/* Rating Bars */}
          <div className="flex-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingBreakdown.get(star) ?? 0;
              const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
              const isActive = filterRating === star;

              return (
                <button
                  key={star}
                  onClick={() => handleFilterClick(star)}
                  className={`group flex w-full items-center gap-3 rounded-md px-2 py-1 text-left transition-colors ${
                    isActive ? 'bg-teal-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="w-12 text-sm text-gray-600">{star} star</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isActive ? 'bg-teal-600' : 'bg-gray-800 group-hover:bg-gray-700'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm text-gray-500">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Traveler Type Filter Chips */}
        {travelerTypeCounts.size > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="text-xs font-medium text-gray-500 self-center mr-1">
              Filter by traveler:
            </span>
            {Array.from(travelerTypeCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const config = TRAVELER_TYPE_CONFIG[type];
                const isActive = filterTravelerType === type;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setFilterTravelerType(isActive ? null : type);
                      setVisibleCount(REVIEWS_PER_PAGE);
                    }}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-teal-100 text-teal-800 ring-1 ring-teal-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{config.icon}</span>
                    {config.label}
                    <span className="text-[10px] opacity-70">({count})</span>
                  </button>
                );
              })}
          </div>
        )}

        {/* Controls: Filter indicator + Sort */}
        <div className="mb-6 flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="text-sm text-gray-600">
            {filterRating || filterTravelerType ? (
              <span>
                Showing {filteredAndSorted.length} {filterRating ? `${filterRating}-star ` : ''}
                {filterTravelerType
                  ? `${TRAVELER_TYPE_CONFIG[filterTravelerType].label.toLowerCase()} `
                  : ''}
                {filteredAndSorted.length === 1 ? 'review' : 'reviews'}
                <button
                  onClick={() => {
                    setFilterRating(null);
                    setFilterTravelerType(null);
                    setVisibleCount(REVIEWS_PER_PAGE);
                  }}
                  className="ml-2 text-teal-600 hover:text-teal-700"
                >
                  Clear filter
                </button>
              </span>
            ) : (
              <span>
                {reviews.length.toLocaleString()} {reviews.length === 1 ? 'review' : 'reviews'}
              </span>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortOption);
              setVisibleCount(REVIEWS_PER_PAGE);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
          </select>
        </div>

        {/* Reviews List */}
        <div className="space-y-6">
          {visibleReviews.map((review) => {
            const isExpanded = expandedReviews.has(review.id);
            const isLong = review.content.length > 300;

            return (
              <div
                key={review.id}
                className="border-b border-gray-100 pb-6 last:border-b-0 last:pb-0"
              >
                {/* Review Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
                      {review.authorName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{review.authorName}</p>
                        {reviewTravelerTypes.get(review.id) && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                            {TRAVELER_TYPE_CONFIG[reviewTravelerTypes.get(review.id)!].icon}{' '}
                            {TRAVELER_TYPE_CONFIG[reviewTravelerTypes.get(review.id)!].label}
                          </span>
                        )}
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-gray-500">
                        {formatDate(review.publishedDate)}
                        <span className="text-emerald-600">• Verified booking</span>
                      </p>
                    </div>
                  </div>
                  <StarRating rating={review.rating} />
                </div>

                {/* Review Title */}
                {review.title && <h3 className="mb-2 font-medium text-gray-900">{review.title}</h3>}

                {/* Review Content */}
                <p
                  className={`text-sm leading-relaxed text-gray-600 ${
                    !isExpanded && isLong ? 'line-clamp-4' : ''
                  }`}
                >
                  {review.content}
                </p>
                {isLong && (
                  <button
                    onClick={() => toggleExpanded(review.id)}
                    className="mt-1 text-sm font-medium text-teal-600 hover:text-teal-700"
                  >
                    {isExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}

                {/* Review Images */}
                {review.images.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {review.images.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200"
                      >
                        <Image
                          src={img}
                          alt={`Review photo ${idx + 1}`}
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Show More */}
        {hasMore && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setVisibleCount((prev) => prev + REVIEWS_PER_PAGE)}
              className="rounded-lg border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Show more reviews ({filteredAndSorted.length - visibleCount} remaining)
            </button>
          </div>
        )}

        {/* Empty filter state */}
        {filteredAndSorted.length === 0 && filterRating && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500">No {filterRating}-star reviews yet.</p>
            <button
              onClick={() => {
                setFilterRating(null);
                setVisibleCount(REVIEWS_PER_PAGE);
              }}
              className="mt-2 text-sm font-medium text-teal-600 hover:text-teal-700"
            >
              View all reviews
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
