'use client';

/**
 * Client-side tracker that records an experience view to localStorage.
 * Render this invisibly on the detail page.
 */

import { useEffect } from 'react';
import { trackRecentlyViewed, type RecentlyViewedItem } from './RecentlyViewed';

export function RecentlyViewedTracker({ item }: { item: RecentlyViewedItem }) {
  useEffect(() => {
    trackRecentlyViewed(item);
  }, [item.id]);

  return null;
}
