import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WishlistPage from './page';

vi.mock('@/hooks/useWishlist', () => ({
  useWishlist: () => ({
    items: [],
    count: 0,
    isInWishlist: () => false,
    toggleWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
    clearWishlist: vi.fn(),
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
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('WishlistPage', () => {
  it('renders empty state when no items', () => {
    render(<WishlistPage />);
    expect(screen.getByText('My Wishlist')).toBeDefined();
    expect(screen.getByText('No saved experiences')).toBeDefined();
    expect(screen.getByText('Browse experiences')).toBeDefined();
  });
});
