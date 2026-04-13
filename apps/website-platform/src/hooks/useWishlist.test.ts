import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWishlist } from './useWishlist';

// Mock localStorage
const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((key) => delete store[key]);
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  });
});

const mockItem = {
  id: 'exp-1',
  title: 'London Eye Tour',
  imageUrl: 'https://example.com/img.jpg',
  price: { amount: 30, currency: 'GBP', formatted: '£30.00' },
  slug: 'exp-1',
};

describe('useWishlist', () => {
  it('starts with empty wishlist', () => {
    const { result } = renderHook(() => useWishlist());
    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it('adds item to wishlist', () => {
    const { result } = renderHook(() => useWishlist());

    act(() => {
      result.current.toggleWishlist(mockItem);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.id).toBe('exp-1');
    expect(result.current.count).toBe(1);
  });

  it('removes item when toggled again', () => {
    const { result } = renderHook(() => useWishlist());

    act(() => {
      result.current.toggleWishlist(mockItem);
    });
    expect(result.current.count).toBe(1);

    act(() => {
      result.current.toggleWishlist(mockItem);
    });
    expect(result.current.count).toBe(0);
  });

  it('isInWishlist returns correct state', () => {
    const { result } = renderHook(() => useWishlist());

    expect(result.current.isInWishlist('exp-1')).toBe(false);

    act(() => {
      result.current.toggleWishlist(mockItem);
    });

    expect(result.current.isInWishlist('exp-1')).toBe(true);
    expect(result.current.isInWishlist('exp-2')).toBe(false);
  });

  it('removeFromWishlist removes specific item', () => {
    const { result } = renderHook(() => useWishlist());

    act(() => {
      result.current.toggleWishlist(mockItem);
      result.current.toggleWishlist({ ...mockItem, id: 'exp-2', slug: 'exp-2' });
    });
    expect(result.current.count).toBe(2);

    act(() => {
      result.current.removeFromWishlist('exp-1');
    });
    expect(result.current.count).toBe(1);
    expect(result.current.isInWishlist('exp-1')).toBe(false);
    expect(result.current.isInWishlist('exp-2')).toBe(true);
  });

  it('clearWishlist removes all items', () => {
    const { result } = renderHook(() => useWishlist());

    act(() => {
      result.current.toggleWishlist(mockItem);
      result.current.toggleWishlist({ ...mockItem, id: 'exp-2', slug: 'exp-2' });
    });
    expect(result.current.count).toBe(2);

    act(() => {
      result.current.clearWishlist();
    });
    expect(result.current.count).toBe(0);
    expect(result.current.items).toEqual([]);
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useWishlist());

    act(() => {
      result.current.toggleWishlist(mockItem);
    });

    expect(localStorage.setItem).toHaveBeenCalled();
    const saved = JSON.parse(store['experience_wishlist'] ?? '[]');
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('exp-1');
  });
});
