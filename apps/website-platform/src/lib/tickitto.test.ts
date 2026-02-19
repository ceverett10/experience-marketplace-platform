import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@experience-marketplace/tickitto-api', () => ({
  createTickittoClient: vi.fn(() => ({
    getEvents: vi.fn(),
    getEvent: vi.fn(),
  })),
}));

import {
  getTickittoClient,
  mapTickittoEventToExperience,
  mapTickittoEventToExperienceListItem,
} from './tickitto';

const baseEvent = {
  event_id: 'evt-123',
  title: 'West End Musical',
  short_description: 'Award-winning show',
  description: 'Full description of the musical',
  city: 'London',
  from_price: { amount: 45.5, currency: 'GBP' },
  duration: 150,
  images: [
    { desktop: 'https://example.com/show1.jpg', mobile: 'https://example.com/show1m.jpg' },
    { desktop: 'https://example.com/show2.jpg', mobile: null },
  ],
  venue_location: [
    {
      venue_name: 'Apollo Theatre',
      venue_address: 'Shaftesbury Ave, London',
      latitude: 51.5134,
      longitude: -0.1321,
    },
  ],
  categories: ['Theatre', 'Musicals'],
  product_highlights: ['Award-winning cast'],
  product_includes: ['Standard seat', 'Programme'],
  product_excludes: ['Drinks'],
  cancellation_policy: 'Non-refundable',
  ticket_instructions: ['Collect at box office'],
  entry_notes: ['No latecomers admitted'],
};

describe('tickitto utilities', () => {
  describe('getTickittoClient', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should create and return a client', () => {
      const client = getTickittoClient();
      expect(client).toBeDefined();
      expect(client.getEvents).toBeDefined();
    });

    it('should return cached client on subsequent calls', () => {
      const client1 = getTickittoClient();
      const client2 = getTickittoClient();
      expect(client1).toBe(client2);
    });
  });

  describe('mapTickittoEventToExperience', () => {
    it('should map basic event properties', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);

      expect(result.id).toBe('evt-123');
      expect(result.title).toBe('West End Musical');
      expect(result.slug).toBe('evt-123');
      expect(result.shortDescription).toBe('Award-winning show');
      expect(result.description).toBe('Full description of the musical');
    });

    it('should convert price to cents', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);

      expect(result.price.amount).toBe(4550); // 45.50 * 100
      expect(result.price.currency).toBe('GBP');
      expect(result.price.formatted).toBe('£45.50');
    });

    it('should handle integer prices', () => {
      const event = {
        ...baseEvent,
        from_price: { amount: 25, currency: 'EUR' },
      };
      const result = mapTickittoEventToExperience(event as any);

      expect(result.price.amount).toBe(2500);
      expect(result.price.currency).toBe('EUR');
    });

    it('should format duration correctly', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);

      expect(result.duration.value).toBe(150);
      expect(result.duration.unit).toBe('minutes');
      expect(result.duration.formatted).toBe('2h 30m');
    });

    it('should format exact hour durations', () => {
      const event = { ...baseEvent, duration: 120 };
      const result = mapTickittoEventToExperience(event as any);

      expect(result.duration.formatted).toBe('2 hours');
    });

    it('should format single hour duration', () => {
      const event = { ...baseEvent, duration: 60 };
      const result = mapTickittoEventToExperience(event as any);

      expect(result.duration.formatted).toBe('1 hour');
    });

    it('should format sub-hour durations', () => {
      const event = { ...baseEvent, duration: 45 };
      const result = mapTickittoEventToExperience(event as any);

      expect(result.duration.formatted).toBe('45 min');
    });

    it('should handle null duration', () => {
      const event = { ...baseEvent, duration: null };
      const result = mapTickittoEventToExperience(event as any);

      expect(result.duration.value).toBe(0);
      expect(result.duration.formatted).toBe('Duration varies');
    });

    it('should always return null rating', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);
      expect(result.rating).toBeNull();
    });

    it('should map venue location', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);

      expect(result.location.name).toBe('Apollo Theatre');
      expect(result.location.address).toBe('Shaftesbury Ave, London');
      expect(result.location.lat).toBe(51.5134);
      expect(result.location.lng).toBe(-0.1321);
    });

    it('should fallback to city when no venue', () => {
      const event = { ...baseEvent, venue_location: [] };
      const result = mapTickittoEventToExperience(event as any);

      expect(result.location.name).toBe('London');
      expect(result.location.address).toBe('');
      expect(result.location.lat).toBe(0);
      expect(result.location.lng).toBe(0);
    });

    it('should map images from desktop URLs', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);

      expect(result.imageUrl).toBe('https://example.com/show1.jpg');
      expect(result.images).toEqual([
        'https://example.com/show1.jpg',
        'https://example.com/show2.jpg',
      ]);
    });

    it('should use placeholder when no images', () => {
      const event = { ...baseEvent, images: [] };
      const result = mapTickittoEventToExperience(event as any);

      expect(result.imageUrl).toBe('/placeholder-experience.jpg');
      expect(result.images).toEqual([]);
    });

    it('should map categories with sequential IDs and slugs', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);

      expect(result.categories).toEqual([
        { id: '0', name: 'Theatre', slug: 'theatre' },
        { id: '1', name: 'Musicals', slug: 'musicals' },
      ]);
    });

    it('should map highlights, inclusions, and exclusions', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);

      expect(result.highlights).toEqual(['Award-winning cast']);
      expect(result.inclusions).toEqual(['Standard seat', 'Programme']);
      expect(result.exclusions).toEqual(['Drinks']);
    });

    it('should combine ticket instructions and entry notes', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);

      expect(result.additionalInfo).toEqual([
        'Collect at box office',
        'No latecomers admitted',
      ]);
    });

    it('should set provider to Tickitto', () => {
      const result = mapTickittoEventToExperience(baseEvent as any);

      expect(result.provider).toEqual({ id: 'tickitto', name: 'Tickitto' });
    });
  });

  describe('mapTickittoEventToExperienceListItem', () => {
    it('should map basic properties', () => {
      const result = mapTickittoEventToExperienceListItem(baseEvent as any);

      expect(result.id).toBe('evt-123');
      expect(result.title).toBe('West End Musical');
      expect(result.slug).toBe('evt-123');
      expect(result.shortDescription).toBe('Award-winning show');
    });

    it('should convert price to cents', () => {
      const result = mapTickittoEventToExperienceListItem(baseEvent as any);

      expect(result.price.amount).toBe(4550);
      expect(result.price.currency).toBe('GBP');
      expect(result.price.formatted).toBe('£45.50');
    });

    it('should use primary desktop image', () => {
      const result = mapTickittoEventToExperienceListItem(baseEvent as any);
      expect(result.imageUrl).toBe('https://example.com/show1.jpg');
    });

    it('should use placeholder when no images', () => {
      const event = { ...baseEvent, images: [] };
      const result = mapTickittoEventToExperienceListItem(event as any);
      expect(result.imageUrl).toBe('/placeholder-experience.jpg');
    });

    it('should always return null rating', () => {
      const result = mapTickittoEventToExperienceListItem(baseEvent as any);
      expect(result.rating).toBeNull();
    });

    it('should use city for location name', () => {
      const result = mapTickittoEventToExperienceListItem(baseEvent as any);
      expect(result.location.name).toBe('London');
    });

    it('should format duration', () => {
      const result = mapTickittoEventToExperienceListItem(baseEvent as any);
      expect(result.duration.formatted).toBe('2h 30m');
    });

    it('should handle null duration', () => {
      const event = { ...baseEvent, duration: null };
      const result = mapTickittoEventToExperienceListItem(event as any);
      expect(result.duration.formatted).toBe('Duration varies');
    });
  });
});
