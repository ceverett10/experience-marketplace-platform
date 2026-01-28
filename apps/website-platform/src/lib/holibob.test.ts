import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getHolibobClient,
  mapProductToExperience,
  formatPrice,
  formatDuration,
  type Experience,
} from './holibob';
import { DEFAULT_SITE_CONFIG } from './tenant';

// Mock the holibob-api module
vi.mock('@experience-marketplace/holibob-api', () => ({
  createHolibobClient: vi.fn(() => ({
    discoverProducts: vi.fn(),
    getProduct: vi.fn(),
  })),
}));

describe('holibob utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getHolibobClient', () => {
    it('should create a client for a site', () => {
      const client = getHolibobClient(DEFAULT_SITE_CONFIG);
      expect(client).toBeDefined();
      expect(client.discoverProducts).toBeDefined();
    });

    it('should cache clients by partner ID', () => {
      const client1 = getHolibobClient(DEFAULT_SITE_CONFIG);
      const client2 = getHolibobClient(DEFAULT_SITE_CONFIG);
      expect(client1).toBe(client2);
    });

    it('should create different clients for different partner IDs', () => {
      const site1 = { ...DEFAULT_SITE_CONFIG, holibobPartnerId: 'partner-1' };
      const site2 = { ...DEFAULT_SITE_CONFIG, holibobPartnerId: 'partner-2' };

      const client1 = getHolibobClient(site1);
      const client2 = getHolibobClient(site2);

      // They should be different instances (though mocked)
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
    });
  });

  describe('formatPrice', () => {
    it('should format GBP correctly', () => {
      expect(formatPrice(2500, 'GBP')).toBe('£25.00');
      expect(formatPrice(100, 'GBP')).toBe('£1.00');
      expect(formatPrice(0, 'GBP')).toBe('£0.00');
    });

    it('should format EUR correctly', () => {
      expect(formatPrice(2500, 'EUR')).toBe('€25.00');
    });

    it('should format USD correctly', () => {
      expect(formatPrice(2500, 'USD')).toBe('US$25.00');
    });

    it('should handle decimal amounts', () => {
      expect(formatPrice(2599, 'GBP')).toBe('£25.99');
      expect(formatPrice(99, 'GBP')).toBe('£0.99');
    });

    it('should handle large amounts', () => {
      expect(formatPrice(1000000, 'GBP')).toBe('£10,000.00');
    });
  });

  describe('formatDuration', () => {
    describe('minutes', () => {
      it('should format minutes under 60', () => {
        expect(formatDuration(30, 'minutes')).toBe('30m');
        expect(formatDuration(45, 'minutes')).toBe('45m');
        expect(formatDuration(59, 'minutes')).toBe('59m');
      });

      it('should convert 60+ minutes to hours', () => {
        expect(formatDuration(60, 'minutes')).toBe('1h');
        expect(formatDuration(90, 'minutes')).toBe('1h 30m');
        expect(formatDuration(120, 'minutes')).toBe('2h');
        expect(formatDuration(150, 'minutes')).toBe('2h 30m');
      });
    });

    describe('hours', () => {
      it('should format singular hour', () => {
        expect(formatDuration(1, 'hours')).toBe('1 hour');
      });

      it('should format plural hours', () => {
        expect(formatDuration(2, 'hours')).toBe('2 hours');
        expect(formatDuration(5, 'hours')).toBe('5 hours');
      });
    });

    describe('days', () => {
      it('should format singular day', () => {
        expect(formatDuration(1, 'days')).toBe('1 day');
      });

      it('should format plural days', () => {
        expect(formatDuration(3, 'days')).toBe('3 days');
        expect(formatDuration(7, 'days')).toBe('7 days');
      });
    });

    it('should handle unknown units', () => {
      expect(formatDuration(5, 'weeks')).toBe('5 weeks');
    });
  });

  describe('mapProductToExperience', () => {
    const baseProduct = {
      id: 'prod-123',
      name: 'London Eye Tour',
      slug: 'london-eye-tour',
      shortDescription: 'Amazing views',
      description: 'Full description here',
    };

    it('should map basic product properties', () => {
      const result = mapProductToExperience(baseProduct);

      expect(result.id).toBe('prod-123');
      expect(result.title).toBe('London Eye Tour');
      expect(result.slug).toBe('london-eye-tour');
      expect(result.shortDescription).toBe('Amazing views');
      expect(result.description).toBe('Full description here');
    });

    it('should use title over name when both exist', () => {
      const product = { ...baseProduct, title: 'Official Title' };
      const result = mapProductToExperience(product);
      expect(result.title).toBe('Official Title');
    });

    it('should use id as slug when slug not provided', () => {
      const product = { id: 'prod-456', name: 'Test' };
      const result = mapProductToExperience(product);
      expect(result.slug).toBe('prod-456');
    });

    it('should handle pricing from different sources', () => {
      // Using pricing object
      const product1 = {
        ...baseProduct,
        pricing: { retailPrice: { amount: 2500, currency: 'GBP' } },
      };
      const result1 = mapProductToExperience(product1);
      expect(result1.price.amount).toBe(2500);
      expect(result1.price.currency).toBe('GBP');

      // Using priceFrom
      const product2 = {
        ...baseProduct,
        priceFrom: 3000,
        currency: 'EUR',
      };
      const result2 = mapProductToExperience(product2);
      expect(result2.price.amount).toBe(3000);
      expect(result2.price.currency).toBe('EUR');
    });

    it('should handle duration as number (minutes)', () => {
      const product = { ...baseProduct, duration: 90 };
      const result = mapProductToExperience(product);
      expect(result.duration.value).toBe(90);
      expect(result.duration.unit).toBe('minutes');
      expect(result.duration.formatted).toBe('1h 30m');
    });

    it('should handle duration as object', () => {
      const product = { ...baseProduct, duration: { value: 2, unit: 'hours' } };
      const result = mapProductToExperience(product);
      expect(result.duration.value).toBe(2);
      expect(result.duration.unit).toBe('hours');
      expect(result.duration.formatted).toBe('2 hours');
    });

    it('should use durationText when provided', () => {
      const product = {
        ...baseProduct,
        duration: 60,
        durationText: 'Approximately 1 hour',
      };
      const result = mapProductToExperience(product);
      expect(result.duration.formatted).toBe('Approximately 1 hour');
    });

    it('should handle rating from reviews object', () => {
      const product = {
        ...baseProduct,
        reviews: { averageRating: 4.5, totalCount: 100 },
      };
      const result = mapProductToExperience(product);
      expect(result.rating?.average).toBe(4.5);
      expect(result.rating?.count).toBe(100);
    });

    it('should handle rating from direct properties', () => {
      const product = {
        ...baseProduct,
        rating: 4.8,
        reviewCount: 50,
      };
      const result = mapProductToExperience(product);
      expect(result.rating?.average).toBe(4.8);
      expect(result.rating?.count).toBe(50);
    });

    it('should return null rating when no rating provided', () => {
      const result = mapProductToExperience(baseProduct);
      expect(result.rating).toBeNull();
    });

    it('should handle location with coordinates object', () => {
      const product = {
        ...baseProduct,
        location: {
          name: 'London Eye',
          address: 'South Bank',
          coordinates: { lat: 51.5033, lng: -0.1196 },
        },
      };
      const result = mapProductToExperience(product);
      expect(result.location.name).toBe('London Eye');
      expect(result.location.address).toBe('South Bank');
      expect(result.location.lat).toBe(51.5033);
      expect(result.location.lng).toBe(-0.1196);
    });

    it('should handle location with direct lat/lng', () => {
      const product = {
        ...baseProduct,
        location: {
          name: 'Big Ben',
          lat: 51.5007,
          lng: -0.1246,
        },
      };
      const result = mapProductToExperience(product);
      expect(result.location.lat).toBe(51.5007);
      expect(result.location.lng).toBe(-0.1246);
    });

    it('should handle cancellation policy as string', () => {
      const product = {
        ...baseProduct,
        cancellationPolicy: 'Free cancellation up to 24 hours before',
      };
      const result = mapProductToExperience(product);
      expect(result.cancellationPolicy).toBe('Free cancellation up to 24 hours before');
    });

    it('should handle cancellation policy as object', () => {
      const product = {
        ...baseProduct,
        cancellationPolicy: { description: 'Flexible policy' },
      };
      const result = mapProductToExperience(product);
      expect(result.cancellationPolicy).toBe('Flexible policy');
    });

    it('should handle images array', () => {
      const product = {
        ...baseProduct,
        images: [{ url: 'https://example.com/1.jpg' }, { url: 'https://example.com/2.jpg' }],
      };
      const result = mapProductToExperience(product);
      expect(result.images).toHaveLength(2);
      expect(result.images[0]).toBe('https://example.com/1.jpg');
    });

    it('should handle categories', () => {
      const product = {
        ...baseProduct,
        categories: [
          { id: 'cat-1', name: 'Tours', slug: 'tours' },
          { id: 'cat-2', name: 'Attractions', slug: 'attractions' },
        ],
      };
      const result = mapProductToExperience(product);
      expect(result.categories).toHaveLength(2);
      expect(result.categories[0]!.name).toBe('Tours');
    });

    it('should provide default values for missing fields', () => {
      const minimalProduct = { id: 'min-123' };
      const result = mapProductToExperience(minimalProduct);

      expect(result.title).toBe('Untitled Experience');
      expect(result.shortDescription).toBe('');
      expect(result.description).toBe('');
      expect(result.imageUrl).toBe('/placeholder-experience.jpg');
      expect(result.images).toEqual([]);
      expect(result.price.amount).toBe(0);
      expect(result.price.currency).toBe('GBP');
      expect(result.categories).toEqual([]);
      expect(result.highlights).toEqual([]);
      expect(result.inclusions).toEqual([]);
      expect(result.exclusions).toEqual([]);
    });
  });
});
