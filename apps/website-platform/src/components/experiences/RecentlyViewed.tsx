'use client';

/**
 * Recently Viewed Experiences
 *
 * Tracks viewed experiences in localStorage and displays them.
 * Shows on detail pages (excluding the current experience).
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BLUR_PLACEHOLDER, isHolibobImage } from '@/lib/image-utils';

const STORAGE_KEY = 'holibob_recently_viewed';
const MAX_ITEMS = 6;

export interface RecentlyViewedItem {
  id: string;
  slug: string;
  title: string;
  imageUrl: string;
  priceFormatted: string;
  duration: string;
}

/**
 * Call this on experience detail pages to record the view.
 */
export function trackRecentlyViewed(item: RecentlyViewedItem) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let items: RecentlyViewedItem[] = stored ? JSON.parse(stored) : [];

    // Remove duplicate if exists
    items = items.filter((i) => i.id !== item.id);

    // Add to front
    items.unshift(item);

    // Keep max items
    items = items.slice(0, MAX_ITEMS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage may be unavailable
  }
}

interface RecentlyViewedProps {
  /** Current experience ID to exclude from the list */
  currentId: string;
}

export function RecentlyViewed({ currentId }: RecentlyViewedProps) {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: RecentlyViewedItem[] = JSON.parse(stored);
        // Filter out the current experience
        setItems(parsed.filter((i) => i.id !== currentId).slice(0, 4));
      }
    } catch {
      // localStorage may be unavailable
    }
  }, [currentId]);

  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Recently viewed</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/experiences/${item.slug}`}
            className="group overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-gray-200">
              <Image
                src={item.imageUrl || '/placeholder-experience.jpg'}
                alt={item.title}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                loading="lazy"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                placeholder="blur"
                blurDataURL={BLUR_PLACEHOLDER}
                unoptimized={isHolibobImage(item.imageUrl)}
              />
            </div>
            <div className="p-3">
              <h3 className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-gray-700">
                {item.title}
              </h3>
              <div className="mt-1.5 flex items-center justify-between text-xs text-gray-500">
                <span>{item.duration}</span>
                <span className="font-semibold text-gray-900">{item.priceFormatted}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
