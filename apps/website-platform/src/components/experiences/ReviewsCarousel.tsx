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
}

interface ReviewsCarouselProps {
  reviews: Review[];
  rating?: {
    average: number;
    count: number;
  } | null;
}

export function ReviewsCarousel({ reviews, rating }: ReviewsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!reviews || reviews.length === 0) {
    return null;
  }

  const visibleReviews = reviews.slice(0, 6);
  const canScrollLeft = currentIndex > 0;
  const canScrollRight = currentIndex < visibleReviews.length - 2;

  const scrollLeft = () => {
    setCurrentIndex(Math.max(0, currentIndex - 1));
  };

  const scrollRight = () => {
    setCurrentIndex(Math.min(visibleReviews.length - 2, currentIndex + 1));
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">What travelers are saying</h2>
        {rating && (
          <a href="#reviews" className="text-sm font-medium text-teal-600 hover:text-teal-700">
            See all {rating.count.toLocaleString()} reviews
          </a>
        )}
      </div>

      <div className="relative">
        {/* Carousel Navigation - Left */}
        {canScrollLeft && (
          <button
            onClick={scrollLeft}
            className="absolute -left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white shadow-lg hover:bg-gray-50"
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

        {/* Reviews Container */}
        <div className="overflow-hidden">
          <div
            className="flex gap-4 transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${currentIndex * 320}px)` }}
          >
            {visibleReviews.map((review) => (
              <div
                key={review.id}
                className="w-[300px] flex-shrink-0 rounded-xl border border-gray-200 bg-white p-5"
              >
                {/* Rating Stars */}
                <div className="mb-3 flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className={`h-4 w-4 ${i < review.rating ? 'text-gray-900' : 'text-gray-200'}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                  <span className="ml-1 text-sm font-medium text-gray-900">{review.rating}</span>
                </div>

                {/* Author Info */}
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
                    {review.authorName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{review.authorName}</p>
                    <p className="flex items-center gap-1.5 text-xs text-gray-500">
                      {formatDate(review.publishedDate)}
                      <span className="text-emerald-600">• Verified booking</span>
                    </p>
                  </div>
                </div>

                {/* Review Content */}
                <p className="line-clamp-4 text-sm leading-relaxed text-gray-600">
                  {review.content}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Carousel Navigation - Right */}
        {canScrollRight && (
          <button
            onClick={scrollRight}
            className="absolute -right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white shadow-lg hover:bg-gray-50"
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
