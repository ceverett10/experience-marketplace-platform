'use client';

import Image from 'next/image';
import { useState, useCallback, useRef } from 'react';

interface ExperienceGalleryProps {
  images: string[];
  title: string;
}

export function ExperienceGallery({ images, title }: ExperienceGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Touch/swipe handling for lightbox
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      touchEndX.current = e.changedTouches[0].clientX;
      const diff = touchStartX.current - touchEndX.current;
      const threshold = 50;
      if (Math.abs(diff) > threshold) {
        if (diff > 0) {
          // Swipe left - next image
          setSelectedIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
        } else {
          // Swipe right - previous image
          setSelectedIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
        }
      }
    },
    [images.length]
  );

  const displayImages = images.slice(0, 5);
  const remainingCount = images.length - 5;

  return (
    <>
      {/* Gallery Grid */}
      <div className="relative mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="grid gap-2 overflow-hidden rounded-xl sm:grid-cols-4 sm:grid-rows-2">
          {/* Main Image */}
          <div
            className="relative h-64 cursor-pointer sm:col-span-2 sm:row-span-2 sm:h-full"
            onClick={() => {
              setSelectedIndex(0);
              setIsModalOpen(true);
            }}
          >
            <Image
              src={displayImages[0] || '/placeholder-experience.jpg'}
              alt={title}
              fill
              priority
              sizes="(max-width: 640px) 100vw, 50vw"
              className="object-cover transition-opacity hover:opacity-90"
            />
          </div>

          {/* Secondary Images */}
          {displayImages.slice(1, 5).map((image, idx) => (
            <div
              key={idx}
              className="relative hidden h-40 cursor-pointer sm:block"
              onClick={() => {
                setSelectedIndex(idx + 1);
                setIsModalOpen(true);
              }}
            >
              <Image
                src={image}
                alt={`${title} - Image ${idx + 2}`}
                fill
                loading="lazy"
                sizes="25vw"
                className="object-cover transition-opacity hover:opacity-90"
              />
              {/* Show more overlay on last image */}
              {idx === 3 && remainingCount > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="text-lg font-semibold text-white">+{remainingCount} more</span>
                </div>
              )}
            </div>
          ))}

          {/* View All Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="absolute bottom-4 right-4 flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-md hover:bg-gray-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            Show all photos
          </button>
        </div>
      </div>

      {/* Lightbox Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setIsModalOpen(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Close button */}
          <button
            onClick={() => setIsModalOpen(false)}
            className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Navigation */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
                }}
                className="absolute left-4 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
                }}
                className="absolute right-4 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </button>
            </>
          )}

          {/* Image - using next/image for optimization */}
          <div
            className="relative h-[90vh] w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={images[selectedIndex]}
              alt={`${title} - Image ${selectedIndex + 1}`}
              fill
              sizes="90vw"
              className="object-contain"
            />
          </div>

          {/* Counter + swipe hint on mobile */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-sm text-white">
            {selectedIndex + 1} / {images.length}
            {images.length > 1 && (
              <span className="ml-2 text-white/60 sm:hidden">Swipe to navigate</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
