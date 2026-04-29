'use client';

import { useState } from 'react';

interface Review {
  id: string;
  title: string;
  content: string;
  rating: number;
  authorName: string;
  publishedDate: string;
  images: string[];
  productTitle?: string;
}

interface ReviewsCarouselProps {
  reviews: Review[];
  rating?: {
    average: number;
    count: number;
  } | null;
}

const CARD_GAP = 16; // matches gap-4

export function ReviewsCarousel({ reviews, rating }: ReviewsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!reviews || reviews.length === 0) {
    return null;
  }

  const visibleReviews = reviews.slice(0, 6);
  // Desktop shows two cards per view, so the last meaningful index is length-2.
  const lastIndex = Math.max(0, visibleReviews.length - 2);
  const canScrollLeft = currentIndex > 0;
  const canScrollRight = currentIndex < lastIndex;

  const scrollLeft = () => {
    setCurrentIndex(Math.max(0, currentIndex - 1));
  };

  const scrollRight = () => {
    setCurrentIndex(Math.min(lastIndex, currentIndex + 1));
  };

  const formatShortDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const scrollToFullReviews = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="mb-8">
      {/* Header — title on the left, aggregate rating on the right */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">
          Why travelers loved this
        </h2>
        {rating && (
          <a
            href="#reviews"
            onClick={scrollToFullReviews}
            className="flex flex-shrink-0 items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-700"
          >
            <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span>{rating.average.toFixed(1)}</span>
            <span className="text-gray-400">·</span>
            <span className="underline decoration-gray-300 underline-offset-2">
              {rating.count.toLocaleString()} Reviews
            </span>
          </a>
        )}
      </div>

      <div className="relative">
        {/* Left chevron — desktop only; mobile uses native swipe */}
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Previous review"
            onClick={scrollLeft}
            className="absolute -left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md hover:bg-gray-50 sm:flex"
          >
            <svg
              className="h-5 w-5 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}

        {/* Cards container.
            Desktop: chevron buttons drive translateX, two cards visible (~480px each).
            Mobile: chevrons hidden + currentIndex stays at 0, so native scroll-snap
            on the outer div handles swipe — transform stays at translateX(0). */}
        <div className="overflow-x-auto sm:overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div
            className="flex snap-x snap-mandatory gap-4 pb-1 transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${currentIndex * (480 + CARD_GAP)}px)` }}
          >
            {visibleReviews.map((review) => {
              const isExpanded = !!expanded[review.id];
              return (
                <article
                  key={review.id}
                  className="w-[85vw] max-w-[480px] flex-shrink-0 snap-start rounded-xl border border-gray-200 bg-white p-5 sm:w-[480px]"
                >
                  {/* Inline header: stars · name · date */}
                  <header className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <div
                      className="flex items-center gap-0.5"
                      aria-label={`${review.rating} stars`}
                    >
                      {[...Array(5)].map((_, i) => (
                        <svg
                          key={i}
                          className={`h-3.5 w-3.5 ${i < review.rating ? 'text-emerald-500' : 'text-gray-200'}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-gray-300" aria-hidden>
                      ·
                    </span>
                    <span className="font-medium text-gray-900">{review.authorName}</span>
                    <span className="text-gray-300" aria-hidden>
                      ·
                    </span>
                    <span className="text-gray-500">{formatShortDate(review.publishedDate)}</span>
                  </header>

                  {/* Review body — clamps to 4 lines until expanded */}
                  <p
                    className={`text-sm leading-relaxed text-gray-700 ${isExpanded ? '' : 'line-clamp-4'}`}
                  >
                    {review.content}
                  </p>

                  {/* Read more — expands inline; only show when content is long enough to be clipped */}
                  {review.content.length > 220 && (
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => ({ ...s, [review.id]: !isExpanded }))}
                      className="mt-2 text-sm font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-900"
                    >
                      {isExpanded ? 'Read less' : 'Read more'}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {/* Right chevron — desktop only */}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Next review"
            onClick={scrollRight}
            className="absolute -right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md hover:bg-gray-50 sm:flex"
          >
            <svg
              className="h-5 w-5 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
