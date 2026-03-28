'use client';

import { useState, useCallback, useEffect } from 'react';

const WISHLIST_KEY = 'experience_wishlist';

export interface WishlistItem {
  id: string;
  title: string;
  imageUrl: string;
  price: { amount: number; currency: string; formatted: string };
  slug: string;
  addedAt: number;
}

function getStoredWishlist(): WishlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(WISHLIST_KEY);
    return data ? (JSON.parse(data) as WishlistItem[]) : [];
  } catch {
    return [];
  }
}

function saveWishlist(items: WishlistItem[]) {
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(items));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Hook for managing a wishlist/favorites list in localStorage.
 * Returns current items, toggle function, check function, and count.
 */
export function useWishlist() {
  const [items, setItems] = useState<WishlistItem[]>([]);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setItems(getStoredWishlist());
  }, []);

  const isInWishlist = useCallback((id: string) => items.some((item) => item.id === id), [items]);

  const toggleWishlist = useCallback((item: Omit<WishlistItem, 'addedAt'>) => {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      const next = exists
        ? prev.filter((i) => i.id !== item.id)
        : [...prev, { ...item, addedAt: Date.now() }];
      saveWishlist(next);
      return next;
    });
  }, []);

  const removeFromWishlist = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      saveWishlist(next);
      return next;
    });
  }, []);

  const clearWishlist = useCallback(() => {
    setItems([]);
    saveWishlist([]);
  }, []);

  return {
    items,
    count: items.length,
    isInWishlist,
    toggleWishlist,
    removeFromWishlist,
    clearWishlist,
  };
}
