import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WishlistPage from './page';

const mockRemove = vi.fn();
const mockClear = vi.fn();

vi.mock('@/hooks/useWishlist', () => ({
  useWishlist: () => ({
    items: [
      {
        id: 'exp-1',
        title: 'London Eye Tour',
        imageUrl: '/img.jpg',
        price: { amount: 30, currency: 'GBP', formatted: '\u00a330.00' },
        slug: 'exp-1',
        addedAt: Date.now(),
      },
    ],
    count: 1,
    isInWishlist: (id: string) => id === 'exp-1',
    toggleWishlist: vi.fn(),
    removeFromWishlist: mockRemove,
    clearWishlist: mockClear,
  }),
}));

vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0F766E' }),
}));

vi.mock('@/lib/image-utils', () => ({
  BLUR_PLACEHOLDER: 'data:image/png;base64,placeholder',
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('WishlistPage', () => {
  it('renders wishlist with items', () => {
    render(<WishlistPage />);
    expect(screen.getByText('My Wishlist')).toBeDefined();
    expect(screen.getByText('London Eye Tour')).toBeDefined();
    expect(screen.getByText('1 saved experience')).toBeDefined();
  });

  it('shows share list button when items exist', () => {
    render(<WishlistPage />);
    expect(screen.getByText('Share list')).toBeDefined();
  });

  it('shows clear all button when items exist', () => {
    render(<WishlistPage />);
    const clearBtn = screen.getByText('Clear all');
    fireEvent.click(clearBtn);
    expect(mockClear).toHaveBeenCalled();
  });

  it('renders remove button on each item', () => {
    render(<WishlistPage />);
    const removeBtn = screen.getByLabelText('Remove from wishlist');
    fireEvent.click(removeBtn);
    expect(mockRemove).toHaveBeenCalledWith('exp-1');
  });

  it('links to experience detail page', () => {
    render(<WishlistPage />);
    const link = screen.getByText('London Eye Tour').closest('a');
    expect(link?.getAttribute('href')).toBe('/experiences/exp-1');
  });

  it('displays price with per adult label', () => {
    render(<WishlistPage />);
    expect(screen.getByText('\u00a330.00')).toBeDefined();
    expect(screen.getByText('per adult')).toBeDefined();
  });
});
