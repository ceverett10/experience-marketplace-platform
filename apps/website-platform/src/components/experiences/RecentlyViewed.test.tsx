import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentlyViewed, trackRecentlyViewed, type RecentlyViewedItem } from './RecentlyViewed';

// Mock image-utils
vi.mock('@/lib/image-utils', () => ({
  BLUR_PLACEHOLDER: 'data:image/svg+xml;base64,placeholder',
  isHolibobImage: (url: string) => url.includes('images.holibob.tech'),
}));

const STORAGE_KEY = 'holibob_recently_viewed';

// Provide a working localStorage mock since jsdom's may be incomplete
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageMap.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storageMap.delete(key);
  }),
  clear: vi.fn(() => {
    storageMap.clear();
  }),
  get length() {
    return storageMap.size;
  },
  key: vi.fn((index: number) => {
    const keys = Array.from(storageMap.keys());
    return keys[index] ?? null;
  }),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

const createItem = (
  id: string,
  overrides: Partial<RecentlyViewedItem> = {}
): RecentlyViewedItem => ({
  id,
  slug: `experience-${id}`,
  title: `Experience ${id}`,
  imageUrl: `https://example.com/${id}.jpg`,
  priceFormatted: '£25.00',
  duration: '2 hours',
  ...overrides,
});

describe('RecentlyViewed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMap.clear();
  });

  describe('rendering with items', () => {
    it('renders section heading', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify([createItem('1'), createItem('2')]));

      render(<RecentlyViewed currentId="other" />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Recently viewed');
    });

    it('renders item titles', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify([createItem('1'), createItem('2')]));

      render(<RecentlyViewed currentId="other" />);
      expect(screen.getByText('Experience 1')).toBeInTheDocument();
      expect(screen.getByText('Experience 2')).toBeInTheDocument();
    });

    it('renders item images with correct src and alt', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify([createItem('1')]));

      render(<RecentlyViewed currentId="other" />);
      const img = screen.getByAltText('Experience 1');
      expect(img).toHaveAttribute('src', 'https://example.com/1.jpg');
    });

    it('renders item prices', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify([createItem('1', { priceFormatted: '£50.00' })]));

      render(<RecentlyViewed currentId="other" />);
      expect(screen.getByText('£50.00')).toBeInTheDocument();
    });

    it('renders item durations', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify([createItem('1', { duration: '3 hours' })]));

      render(<RecentlyViewed currentId="other" />);
      expect(screen.getByText('3 hours')).toBeInTheDocument();
    });

    it('renders links to experience detail pages', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify([createItem('1', { slug: 'london-eye' })]));

      render(<RecentlyViewed currentId="other" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/experiences/london-eye');
    });

    it('uses placeholder image when imageUrl is empty', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify([createItem('1', { imageUrl: '' })]));

      render(<RecentlyViewed currentId="other" />);
      const img = screen.getByAltText('Experience 1');
      expect(img).toHaveAttribute('src', '/placeholder-experience.jpg');
    });
  });

  describe('filtering', () => {
    it('excludes the current experience from the list', () => {
      storageMap.set(
        STORAGE_KEY,
        JSON.stringify([createItem('1'), createItem('2'), createItem('3')])
      );

      render(<RecentlyViewed currentId="2" />);
      expect(screen.getByText('Experience 1')).toBeInTheDocument();
      expect(screen.queryByText('Experience 2')).not.toBeInTheDocument();
      expect(screen.getByText('Experience 3')).toBeInTheDocument();
    });

    it('limits displayed items to 4', () => {
      storageMap.set(
        STORAGE_KEY,
        JSON.stringify([
          createItem('1'),
          createItem('2'),
          createItem('3'),
          createItem('4'),
          createItem('5'),
          createItem('6'),
        ])
      );

      render(<RecentlyViewed currentId="other" />);
      expect(screen.getByText('Experience 1')).toBeInTheDocument();
      expect(screen.getByText('Experience 4')).toBeInTheDocument();
      expect(screen.queryByText('Experience 5')).not.toBeInTheDocument();
      expect(screen.queryByText('Experience 6')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders nothing when localStorage is empty', () => {
      const { container } = render(<RecentlyViewed currentId="any" />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when all items are filtered out by currentId', () => {
      storageMap.set(STORAGE_KEY, JSON.stringify([createItem('1')]));

      const { container } = render(<RecentlyViewed currentId="1" />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when localStorage has invalid JSON', () => {
      storageMap.set(STORAGE_KEY, 'not-valid-json');
      const { container } = render(<RecentlyViewed currentId="any" />);
      expect(container.innerHTML).toBe('');
    });
  });
});

describe('trackRecentlyViewed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMap.clear();
  });

  it('adds an item to localStorage', () => {
    trackRecentlyViewed(createItem('1'));
    const stored = JSON.parse(storageMap.get(STORAGE_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('1');
  });

  it('adds new item to the front of the list', () => {
    trackRecentlyViewed(createItem('1'));
    trackRecentlyViewed(createItem('2'));
    const stored = JSON.parse(storageMap.get(STORAGE_KEY)!);
    expect(stored[0].id).toBe('2');
    expect(stored[1].id).toBe('1');
  });

  it('removes duplicate before re-adding', () => {
    trackRecentlyViewed(createItem('1'));
    trackRecentlyViewed(createItem('2'));
    trackRecentlyViewed(createItem('1'));
    const stored = JSON.parse(storageMap.get(STORAGE_KEY)!);
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe('1');
    expect(stored[1].id).toBe('2');
  });

  it('limits stored items to MAX_ITEMS (6)', () => {
    for (let i = 1; i <= 8; i++) {
      trackRecentlyViewed(createItem(String(i)));
    }
    const stored = JSON.parse(storageMap.get(STORAGE_KEY)!);
    expect(stored).toHaveLength(6);
    expect(stored[0].id).toBe('8');
    expect(stored[5].id).toBe('3');
  });

  it('handles localStorage being unavailable gracefully', () => {
    mockLocalStorage.getItem.mockImplementationOnce(() => {
      throw new Error('localStorage not available');
    });

    expect(() => trackRecentlyViewed(createItem('1'))).not.toThrow();
  });
});
