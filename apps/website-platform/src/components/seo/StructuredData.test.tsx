import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  TouristTripSchema,
  ProductSchema,
  ExperienceListSchema,
  BreadcrumbSchema,
  FAQSchema,
  OrganizationSchema,
  TourOperatorSchema,
  WebSiteSchema,
  EventSchema,
  ExperienceStructuredData,
} from './StructuredData';

afterEach(cleanup);

/** Parse JSON-LD from all script[type="application/ld+json"] in the container */
function getJsonLd(container: HTMLElement): any {
  const script = container.querySelector('script[type="application/ld+json"]');
  return script ? JSON.parse(script.textContent!) : null;
}

function getAllJsonLd(container: HTMLElement): any[] {
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  return Array.from(scripts).map((s) => JSON.parse(s.textContent!));
}

const mockExperience = {
  id: 'exp-1',
  title: 'London Eye Tour',
  slug: 'london-eye-tour',
  shortDescription: 'Amazing views of London',
  imageUrl: 'https://example.com/eye.jpg',
  price: { amount: 35, currency: 'GBP', formatted: '£35.00' },
  duration: { formatted: '1 hour', value: 60, unit: 'minutes' as const },
  rating: { average: 4.5, count: 120 },
  location: { name: 'London' },
} as any;

describe('StructuredData', () => {
  describe('TouristTripSchema', () => {
    it('renders correct schema type and properties', () => {
      const { container } = render(
        <TouristTripSchema
          experience={mockExperience}
          url="https://example.com/experiences/london-eye-tour"
          siteName="Test Tours"
        />
      );
      const schema = getJsonLd(container);

      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@type']).toBe('TouristTrip');
      expect(schema.name).toBe('London Eye Tour');
      expect(schema.description).toBe('Amazing views of London');
      expect(schema.image).toBe('https://example.com/eye.jpg');
    });

    it('includes offer with price', () => {
      const { container } = render(
        <TouristTripSchema experience={mockExperience} url="https://example.com/exp" siteName="Test" />
      );
      const schema = getJsonLd(container);

      expect(schema.offers['@type']).toBe('Offer');
      expect(schema.offers.price).toBe('35.00');
      expect(schema.offers.priceCurrency).toBe('GBP');
      expect(schema.offers.availability).toBe('https://schema.org/InStock');
    });

    it('includes tourist destination from location', () => {
      const { container } = render(
        <TouristTripSchema experience={mockExperience} url="https://example.com/exp" siteName="Test" />
      );
      const schema = getJsonLd(container);

      expect(schema.touristDestination.name).toBe('London');
    });

    it('extracts provider URL from experience URL', () => {
      const { container } = render(
        <TouristTripSchema
          experience={mockExperience}
          url="https://example.com/experiences/london"
          siteName="Test Tours"
        />
      );
      const schema = getJsonLd(container);

      expect(schema.provider.url).toBe('https://example.com');
      expect(schema.provider.name).toBe('Test Tours');
    });
  });

  describe('ProductSchema', () => {
    it('renders Product type with brand', () => {
      const { container } = render(
        <ProductSchema experience={mockExperience} url="https://example.com/exp" siteName="Test Tours" />
      );
      const schema = getJsonLd(container);

      expect(schema['@type']).toBe('Product');
      expect(schema.brand.name).toBe('Test Tours');
    });

    it('includes aggregateRating when rating exists', () => {
      const { container } = render(
        <ProductSchema experience={mockExperience} url="https://example.com/exp" siteName="Test" />
      );
      const schema = getJsonLd(container);

      expect(schema.aggregateRating['@type']).toBe('AggregateRating');
      expect(schema.aggregateRating.ratingValue).toBe('4.5');
      expect(schema.aggregateRating.reviewCount).toBe(120);
      expect(schema.aggregateRating.bestRating).toBe('5');
    });

    it('omits aggregateRating when no rating', () => {
      const noRating = { ...mockExperience, rating: null };
      const { container } = render(
        <ProductSchema experience={noRating} url="https://example.com/exp" siteName="Test" />
      );
      const schema = getJsonLd(container);

      expect(schema.aggregateRating).toBeUndefined();
    });

    it('includes priceValidUntil in offers', () => {
      const { container } = render(
        <ProductSchema experience={mockExperience} url="https://example.com/exp" siteName="Test" />
      );
      const schema = getJsonLd(container);

      expect(schema.offers.priceValidUntil).toBeDefined();
      expect(schema.offers.priceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('ExperienceListSchema', () => {
    it('renders ItemList with correct number of items', () => {
      const { container } = render(
        <ExperienceListSchema
          experiences={[mockExperience, { ...mockExperience, id: 'exp-2', slug: 'tour-2' }]}
          listName="Popular Tours"
          url="https://example.com/experiences"
          siteName="Test Tours"
          description="Top tours"
        />
      );
      const schema = getJsonLd(container);

      expect(schema['@type']).toBe('ItemList');
      expect(schema.name).toBe('Popular Tours');
      expect(schema.numberOfItems).toBe(2);
      expect(schema.itemListElement).toHaveLength(2);
      expect(schema.itemListElement[0].position).toBe(1);
      expect(schema.itemListElement[1].position).toBe(2);
    });

    it('builds experience URLs from base URL', () => {
      const { container } = render(
        <ExperienceListSchema
          experiences={[mockExperience]}
          listName="Tours"
          url="https://example.com/experiences"
          siteName="Test"
        />
      );
      const schema = getJsonLd(container);

      expect(schema.itemListElement[0].item.url).toBe(
        'https://example.com/experiences/london-eye-tour'
      );
    });

    it('includes aggregateRating only when count > 0', () => {
      const noCount = { ...mockExperience, rating: { average: 4.0, count: 0 } };
      const { container } = render(
        <ExperienceListSchema
          experiences={[noCount]}
          listName="Tours"
          url="https://example.com"
          siteName="Test"
        />
      );
      const schema = getJsonLd(container);

      expect(schema.itemListElement[0].item.aggregateRating).toBeUndefined();
    });
  });

  describe('BreadcrumbSchema', () => {
    it('renders BreadcrumbList with positions', () => {
      const { container } = render(
        <BreadcrumbSchema
          items={[
            { name: 'Home', url: 'https://example.com' },
            { name: 'Experiences', url: 'https://example.com/experiences' },
            { name: 'London Eye', url: 'https://example.com/experiences/london-eye' },
          ]}
        />
      );
      const schema = getJsonLd(container);

      expect(schema['@type']).toBe('BreadcrumbList');
      expect(schema.itemListElement).toHaveLength(3);
      expect(schema.itemListElement[0].position).toBe(1);
      expect(schema.itemListElement[0].name).toBe('Home');
      expect(schema.itemListElement[2].position).toBe(3);
    });
  });

  describe('FAQSchema', () => {
    it('renders FAQPage with questions and answers', () => {
      const { container } = render(
        <FAQSchema
          questions={[
            { question: 'How to book?', answer: 'Click the button' },
            { question: 'Can I cancel?', answer: 'Yes, free cancellation' },
          ]}
        />
      );
      const schema = getJsonLd(container);

      expect(schema['@type']).toBe('FAQPage');
      expect(schema.mainEntity).toHaveLength(2);
      expect(schema.mainEntity[0]['@type']).toBe('Question');
      expect(schema.mainEntity[0].name).toBe('How to book?');
      expect(schema.mainEntity[0].acceptedAnswer.text).toBe('Click the button');
    });
  });

  describe('OrganizationSchema', () => {
    it('renders Organization with required fields', () => {
      const { container } = render(
        <OrganizationSchema name="Test Tours" url="https://example.com" />
      );
      const schema = getJsonLd(container);

      expect(schema['@type']).toBe('Organization');
      expect(schema.name).toBe('Test Tours');
      expect(schema.url).toBe('https://example.com');
    });

    it('includes optional fields when provided', () => {
      const { container } = render(
        <OrganizationSchema
          name="Test Tours"
          url="https://example.com"
          logo="https://example.com/logo.png"
          description="Best tours"
          sameAs={['https://facebook.com/test', 'https://twitter.com/test']}
        />
      );
      const schema = getJsonLd(container);

      expect(schema.logo).toBe('https://example.com/logo.png');
      expect(schema.description).toBe('Best tours');
      expect(schema.sameAs).toHaveLength(2);
    });

    it('omits optional fields when not provided', () => {
      const { container } = render(
        <OrganizationSchema name="Test" url="https://example.com" />
      );
      const schema = getJsonLd(container);

      expect(schema.logo).toBeUndefined();
      expect(schema.description).toBeUndefined();
      expect(schema.sameAs).toBeUndefined();
    });
  });

  describe('TourOperatorSchema', () => {
    it('renders TourOperator with LocalBusiness types', () => {
      const { container } = render(
        <TourOperatorSchema name="Tour Co" url="https://tourco.com" />
      );
      const schema = getJsonLd(container);

      expect(schema['@type']).toEqual(['TourOperator', 'LocalBusiness']);
      expect(schema['@id']).toBe('https://tourco.com#organization');
      expect(schema.additionalType).toBe('https://schema.org/TravelAgency');
    });

    it('includes logo as ImageObject', () => {
      const { container } = render(
        <TourOperatorSchema name="Tour Co" url="https://tourco.com" logo="https://tourco.com/logo.png" />
      );
      const schema = getJsonLd(container);

      expect(schema.logo['@type']).toBe('ImageObject');
      expect(schema.logo.url).toBe('https://tourco.com/logo.png');
      expect(schema.image).toBe('https://tourco.com/logo.png');
    });

    it('includes address as PostalAddress', () => {
      const { container } = render(
        <TourOperatorSchema
          name="Tour Co"
          url="https://tourco.com"
          address={{
            streetAddress: '123 Main St',
            addressLocality: 'London',
            postalCode: 'SW1A 1AA',
            addressCountry: 'GB',
          }}
        />
      );
      const schema = getJsonLd(container);

      expect(schema.address['@type']).toBe('PostalAddress');
      expect(schema.address.streetAddress).toBe('123 Main St');
      expect(schema.address.addressCountry).toBe('GB');
    });

    it('includes areaServed as Place objects', () => {
      const { container } = render(
        <TourOperatorSchema name="Tour Co" url="https://tourco.com" areaServed={['London', 'Paris']} />
      );
      const schema = getJsonLd(container);

      expect(schema.areaServed).toHaveLength(2);
      expect(schema.areaServed[0]).toEqual({ '@type': 'Place', name: 'London' });
    });

    it('includes aggregateRating when reviewCount > 0', () => {
      const { container } = render(
        <TourOperatorSchema
          name="Tour Co"
          url="https://tourco.com"
          aggregateRating={{ ratingValue: 4.8, reviewCount: 200 }}
        />
      );
      const schema = getJsonLd(container);

      expect(schema.aggregateRating.ratingValue).toBe('4.8');
      expect(schema.aggregateRating.reviewCount).toBe(200);
    });

    it('omits aggregateRating when reviewCount is 0', () => {
      const { container } = render(
        <TourOperatorSchema
          name="Tour Co"
          url="https://tourco.com"
          aggregateRating={{ ratingValue: 0, reviewCount: 0 }}
        />
      );
      const schema = getJsonLd(container);

      expect(schema.aggregateRating).toBeUndefined();
    });
  });

  describe('WebSiteSchema', () => {
    it('renders WebSite with SearchAction', () => {
      const { container } = render(
        <WebSiteSchema name="Test Tours" url="https://example.com" />
      );
      const schema = getJsonLd(container);

      expect(schema['@type']).toBe('WebSite');
      expect(schema.name).toBe('Test Tours');
      expect(schema.potentialAction['@type']).toBe('SearchAction');
      expect(schema.potentialAction.target.urlTemplate).toBe(
        'https://example.com/experiences?q={search_term_string}'
      );
    });

    it('includes description when provided', () => {
      const { container } = render(
        <WebSiteSchema name="Test" url="https://example.com" description="Best tours" />
      );
      const schema = getJsonLd(container);

      expect(schema.description).toBe('Best tours');
    });
  });

  describe('EventSchema', () => {
    it('renders Event with required fields', () => {
      const { container } = render(
        <EventSchema
          experience={mockExperience}
          startDate="2025-06-01T10:00:00Z"
          url="https://example.com/events/london-eye"
          siteName="Test Tours"
        />
      );
      const schema = getJsonLd(container);

      expect(schema['@type']).toBe('Event');
      expect(schema.name).toBe('London Eye Tour');
      expect(schema.startDate).toBe('2025-06-01T10:00:00Z');
      expect(schema.eventStatus).toBe('https://schema.org/EventScheduled');
      expect(schema.location.name).toBe('London');
      expect(schema.organizer.name).toBe('Test Tours');
    });

    it('includes endDate when provided', () => {
      const { container } = render(
        <EventSchema
          experience={mockExperience}
          startDate="2025-06-01T10:00:00Z"
          endDate="2025-06-01T12:00:00Z"
          url="https://example.com/events/london-eye"
          siteName="Test"
        />
      );
      const schema = getJsonLd(container);

      expect(schema.endDate).toBe('2025-06-01T12:00:00Z');
    });

    it('omits endDate when not provided', () => {
      const { container } = render(
        <EventSchema
          experience={mockExperience}
          startDate="2025-06-01T10:00:00Z"
          url="https://example.com/events/london-eye"
          siteName="Test"
        />
      );
      const schema = getJsonLd(container);

      expect(schema.endDate).toBeUndefined();
    });
  });

  describe('ExperienceStructuredData', () => {
    it('renders TouristTrip and Product schemas', () => {
      const { container } = render(
        <ExperienceStructuredData
          experience={mockExperience}
          url="https://example.com/exp"
          siteName="Test"
        />
      );
      const schemas = getAllJsonLd(container);

      expect(schemas).toHaveLength(2);
      const types = schemas.map((s) => s['@type']);
      expect(types).toContain('TouristTrip');
      expect(types).toContain('Product');
    });

    it('includes breadcrumbs when provided', () => {
      const { container } = render(
        <ExperienceStructuredData
          experience={mockExperience}
          url="https://example.com/exp"
          siteName="Test"
          breadcrumbs={[{ name: 'Home', url: 'https://example.com' }]}
        />
      );
      const schemas = getAllJsonLd(container);

      expect(schemas).toHaveLength(3);
    });

    it('includes FAQ when provided', () => {
      const { container } = render(
        <ExperienceStructuredData
          experience={mockExperience}
          url="https://example.com/exp"
          siteName="Test"
          faqs={[{ question: 'Q1?', answer: 'A1' }]}
        />
      );
      const schemas = getAllJsonLd(container);

      expect(schemas).toHaveLength(3);
    });

    it('omits FAQ when empty array', () => {
      const { container } = render(
        <ExperienceStructuredData
          experience={mockExperience}
          url="https://example.com/exp"
          siteName="Test"
          faqs={[]}
        />
      );
      const schemas = getAllJsonLd(container);

      expect(schemas).toHaveLength(2);
    });
  });
});
