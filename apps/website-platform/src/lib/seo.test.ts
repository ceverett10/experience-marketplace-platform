import { describe, it, expect } from 'vitest';
import {
  generateOrganizationJsonLd,
  generateWebsiteJsonLd,
  generateExperienceJsonLd,
  generateProductJsonLd,
  generateBreadcrumbJsonLd,
  generateExperienceListJsonLd,
  generateFaqJsonLd,
  generateLocalBusinessJsonLd,
  getCanonicalUrl,
  generateMetaDescription,
  generateOpenGraphTags,
  generateTwitterTags,
} from './seo';
import { DEFAULT_SITE_CONFIG, type SiteConfig } from './tenant';
import type { Experience, ExperienceListItem } from './holibob';

const baseUrl = 'https://example.com';

const mockExperience: Experience = {
  id: 'exp-123',
  title: 'London Eye Tour',
  slug: 'london-eye-tour',
  shortDescription: 'Amazing views of London',
  description: 'Experience breathtaking views of London from the iconic London Eye.',
  imageUrl: 'https://example.com/london-eye.jpg',
  images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
  price: {
    amount: 3500,
    currency: 'GBP',
    formatted: '£35.00',
  },
  duration: {
    value: 30,
    unit: 'minutes',
    formatted: '30 minutes',
  },
  rating: {
    average: 4.7,
    count: 2453,
  },
  location: {
    name: 'London, UK',
    address: 'South Bank, London',
    lat: 51.5033,
    lng: -0.1196,
  },
  categories: [{ id: 'cat-1', name: 'Attractions', slug: 'attractions' }],
  highlights: ['Skip-the-line', 'Audio guide'],
  inclusions: ['Entry ticket', 'Audio guide'],
  exclusions: ['Food and drinks'],
  cancellationPolicy: 'Free cancellation up to 24 hours before',
};

const mockExperienceListItem: ExperienceListItem = {
  id: 'exp-123',
  title: 'London Eye Tour',
  slug: 'london-eye-tour',
  shortDescription: 'Amazing views of London',
  imageUrl: 'https://example.com/london-eye.jpg',
  price: { amount: 3500, currency: 'GBP', formatted: '£35.00' },
  duration: { formatted: '30 minutes' },
  rating: { average: 4.7, count: 2453 },
  location: { name: 'London, UK' },
};

describe('SEO utilities', () => {
  describe('generateOrganizationJsonLd', () => {
    it('should generate valid Organization schema', () => {
      const result = generateOrganizationJsonLd(DEFAULT_SITE_CONFIG, baseUrl);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('Organization');
      expect(result.name).toBe(DEFAULT_SITE_CONFIG.name);
      expect(result.url).toBe(baseUrl);
    });

    it('should include logo when provided', () => {
      const siteWithLogo: SiteConfig = {
        ...DEFAULT_SITE_CONFIG,
        brand: {
          ...DEFAULT_SITE_CONFIG.brand!,
          logoUrl: 'https://example.com/logo.png',
        },
      };

      const result = generateOrganizationJsonLd(siteWithLogo, baseUrl);
      expect(result.logo).toBe('https://example.com/logo.png');
    });

    it('should include social links when provided', () => {
      const siteWithSocial: SiteConfig = {
        ...DEFAULT_SITE_CONFIG,
        brand: {
          ...DEFAULT_SITE_CONFIG.brand!,
          socialLinks: {
            facebook: 'https://facebook.com/test',
            twitter: 'https://twitter.com/test',
          },
        },
      };

      const result = generateOrganizationJsonLd(siteWithSocial, baseUrl);
      expect(result.sameAs).toContain('https://facebook.com/test');
      expect(result.sameAs).toContain('https://twitter.com/test');
    });
  });

  describe('generateWebsiteJsonLd', () => {
    it('should generate valid WebSite schema', () => {
      const result = generateWebsiteJsonLd(DEFAULT_SITE_CONFIG, baseUrl);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('WebSite');
      expect(result.name).toBe(DEFAULT_SITE_CONFIG.name);
      expect(result.url).toBe(baseUrl);
    });

    it('should include SearchAction', () => {
      const result = generateWebsiteJsonLd(DEFAULT_SITE_CONFIG, baseUrl);

      expect(result.potentialAction['@type']).toBe('SearchAction');
      expect(result.potentialAction.target.urlTemplate).toContain('/experiences?q=');
    });
  });

  describe('generateExperienceJsonLd', () => {
    it('should generate valid TouristAttraction schema', () => {
      const result = generateExperienceJsonLd(mockExperience, baseUrl);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('TouristAttraction');
      expect(result.name).toBe('London Eye Tour');
      expect(result.url).toBe(`${baseUrl}/experiences/london-eye-tour`);
    });

    it('should include images array when available', () => {
      const result = generateExperienceJsonLd(mockExperience, baseUrl);
      expect(result.image).toEqual(['https://example.com/img1.jpg', 'https://example.com/img2.jpg']);
    });

    it('should include rating when available', () => {
      const result = generateExperienceJsonLd(mockExperience, baseUrl);

      expect(result.aggregateRating?.ratingValue).toBe(4.7);
      expect(result.aggregateRating?.ratingCount).toBe(2453);
      expect(result.aggregateRating?.bestRating).toBe(5);
    });

    it('should include geo coordinates when available', () => {
      const result = generateExperienceJsonLd(mockExperience, baseUrl);

      expect(result.geo?.latitude).toBe(51.5033);
      expect(result.geo?.longitude).toBe(-0.1196);
    });

    it('should include offer with price', () => {
      const result = generateExperienceJsonLd(mockExperience, baseUrl);

      expect(result.offers.price).toBe(35); // 3500 / 100
      expect(result.offers.priceCurrency).toBe('GBP');
      expect(result.offers.availability).toBe('https://schema.org/InStock');
    });

    it('should not include rating when null', () => {
      const expWithoutRating = { ...mockExperience, rating: null };
      const result = generateExperienceJsonLd(expWithoutRating, baseUrl);
      expect(result.aggregateRating).toBeUndefined();
    });
  });

  describe('generateProductJsonLd', () => {
    it('should generate valid Product schema', () => {
      const result = generateProductJsonLd(mockExperience, baseUrl);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('Product');
      expect(result.name).toBe('London Eye Tour');
    });

    it('should include brand', () => {
      const result = generateProductJsonLd(mockExperience, baseUrl);
      expect(result.brand['@type']).toBe('Organization');
    });
  });

  describe('generateBreadcrumbJsonLd', () => {
    it('should generate valid BreadcrumbList schema', () => {
      const items = [
        { name: 'Home', url: '/' },
        { name: 'Experiences', url: '/experiences' },
        { name: 'London Eye Tour', url: '/experiences/london-eye-tour' },
      ];

      const result = generateBreadcrumbJsonLd(items, baseUrl);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('BreadcrumbList');
      expect(result.itemListElement).toHaveLength(3);
    });

    it('should include position for each item', () => {
      const items = [
        { name: 'Home', url: '/' },
        { name: 'Experiences', url: '/experiences' },
      ];

      const result = generateBreadcrumbJsonLd(items, baseUrl);

      expect(result.itemListElement[0]!.position).toBe(1);
      expect(result.itemListElement[1]!.position).toBe(2);
    });

    it('should prepend baseUrl to relative URLs', () => {
      const items = [{ name: 'Experiences', url: '/experiences' }];

      const result = generateBreadcrumbJsonLd(items, baseUrl);
      expect(result.itemListElement[0]!.item).toBe(`${baseUrl}/experiences`);
    });

    it('should keep absolute URLs as-is', () => {
      const items = [{ name: 'External', url: 'https://other.com/page' }];

      const result = generateBreadcrumbJsonLd(items, baseUrl);
      expect(result.itemListElement[0]!.item).toBe('https://other.com/page');
    });
  });

  describe('generateExperienceListJsonLd', () => {
    it('should generate valid ItemList schema', () => {
      const experiences = [mockExperienceListItem];

      const result = generateExperienceListJsonLd(experiences, baseUrl);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('ItemList');
      expect(result.numberOfItems).toBe(1);
    });

    it('should include list name', () => {
      const result = generateExperienceListJsonLd([mockExperienceListItem], baseUrl, 'Featured Experiences');
      expect(result.name).toBe('Featured Experiences');
    });

    it('should use default list name', () => {
      const result = generateExperienceListJsonLd([mockExperienceListItem], baseUrl);
      expect(result.name).toBe('Experiences');
    });
  });

  describe('generateFaqJsonLd', () => {
    it('should generate valid FAQPage schema', () => {
      const faqs = [
        { question: 'How do I book?', answer: 'Select your date and click Book Now.' },
        { question: 'Can I cancel?', answer: 'Yes, free cancellation up to 24 hours.' },
      ];

      const result = generateFaqJsonLd(faqs);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('FAQPage');
      expect(result.mainEntity).toHaveLength(2);
    });

    it('should format questions correctly', () => {
      const faqs = [{ question: 'Test question?', answer: 'Test answer.' }];

      const result = generateFaqJsonLd(faqs);

      expect(result.mainEntity[0]!['@type']).toBe('Question');
      expect(result.mainEntity[0]!.name).toBe('Test question?');
      expect(result.mainEntity[0]!.acceptedAnswer.text).toBe('Test answer.');
    });
  });

  describe('generateLocalBusinessJsonLd', () => {
    it('should generate valid LocalBusiness schema', () => {
      const result = generateLocalBusinessJsonLd(DEFAULT_SITE_CONFIG, baseUrl);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('LocalBusiness');
      expect(result.name).toBe(DEFAULT_SITE_CONFIG.name);
    });

    it('should include location when provided', () => {
      const location = {
        address: '123 Main St',
        city: 'London',
        country: 'UK',
        lat: 51.5074,
        lng: -0.1278,
      };

      const result = generateLocalBusinessJsonLd(DEFAULT_SITE_CONFIG, baseUrl, location);

      expect(result.address?.streetAddress).toBe('123 Main St');
      expect(result.geo?.latitude).toBe(51.5074);
    });
  });

  describe('getCanonicalUrl', () => {
    it('should generate canonical URL with base path', () => {
      const result = getCanonicalUrl('/experiences', baseUrl);
      expect(result).toBe(`${baseUrl}/experiences`);
    });

    it('should include allowed search params', () => {
      const searchParams = { category: 'tours', page: '2', sort: 'price' };
      const result = getCanonicalUrl('/experiences', baseUrl, searchParams);

      expect(result).toContain('category=tours');
      expect(result).toContain('page=2');
      expect(result).not.toContain('sort=price'); // sort is not in allowed list
    });

    it('should include location param', () => {
      const searchParams = { location: 'london' };
      const result = getCanonicalUrl('/experiences', baseUrl, searchParams);

      expect(result).toContain('location=london');
    });
  });

  describe('generateMetaDescription', () => {
    it('should replace template variables', () => {
      const template = 'Explore {count} experiences in {location}';
      const result = generateMetaDescription(template, { count: 50, location: 'London' });

      expect(result).toBe('Explore 50 experiences in London');
    });

    it('should truncate long descriptions', () => {
      const longTemplate = 'A'.repeat(200);
      const result = generateMetaDescription(longTemplate, {});

      expect(result.length).toBe(160);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should not truncate short descriptions', () => {
      const shortTemplate = 'Short description';
      const result = generateMetaDescription(shortTemplate, {});

      expect(result).toBe('Short description');
    });
  });

  describe('generateOpenGraphTags', () => {
    it('should generate OpenGraph tags', () => {
      const result = generateOpenGraphTags(
        'Test Title',
        'Test Description',
        'https://example.com/page',
        'https://example.com/image.jpg'
      );

      expect(result.title).toBe('Test Title');
      expect(result.description).toBe('Test Description');
      expect(result.url).toBe('https://example.com/page');
      expect(result.type).toBe('website');
    });

    it('should include image when provided', () => {
      const result = generateOpenGraphTags(
        'Title',
        'Description',
        'https://example.com',
        'https://example.com/image.jpg'
      );

      expect(result.images).toHaveLength(1);
      expect(result.images[0]!.url).toBe('https://example.com/image.jpg');
      expect(result.images[0]!.width).toBe(1200);
      expect(result.images[0]!.height).toBe(630);
    });

    it('should return empty images array when no image', () => {
      const result = generateOpenGraphTags('Title', 'Description', 'https://example.com');
      expect(result.images).toEqual([]);
    });

    it('should support different types', () => {
      const result = generateOpenGraphTags('Title', 'Desc', 'url', undefined, 'product');
      expect(result.type).toBe('product');
    });
  });

  describe('generateTwitterTags', () => {
    it('should generate Twitter Card tags', () => {
      const result = generateTwitterTags(
        'Test Title',
        'Test Description',
        'https://example.com/image.jpg'
      );

      expect(result.title).toBe('Test Title');
      expect(result.description).toBe('Test Description');
      expect(result.card).toBe('summary_large_image');
    });

    it('should include image when provided', () => {
      const result = generateTwitterTags('Title', 'Description', 'https://example.com/image.jpg');
      expect(result.images).toEqual(['https://example.com/image.jpg']);
    });

    it('should support summary card type', () => {
      const result = generateTwitterTags('Title', 'Description', undefined, 'summary');
      expect(result.card).toBe('summary');
    });
  });
});
