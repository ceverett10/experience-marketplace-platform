import type { ExperienceListItem } from '@/lib/holibob';

interface TouristTripSchemaProps {
  experience: ExperienceListItem;
  url: string;
  siteName: string;
}

interface ExperienceListSchemaProps {
  experiences: ExperienceListItem[];
  listName: string;
  url: string;
  siteName: string;
  description?: string;
}

interface BreadcrumbSchemaProps {
  items: Array<{
    name: string;
    url: string;
  }>;
}

interface FAQSchemaProps {
  questions: Array<{
    question: string;
    answer: string;
  }>;
}

interface OrganizationSchemaProps {
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
}

/**
 * Schema.org TouristTrip markup for individual experience pages
 * Helps search engines understand the experience content for rich results
 */
export function TouristTripSchema({ experience, url, siteName }: TouristTripSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: experience.title,
    description: experience.shortDescription,
    image: experience.imageUrl,
    url: url,
    touristType: 'Cultural Tourism',
    provider: {
      '@type': 'TourOperator',
      name: siteName,
      url: url.split('/').slice(0, 3).join('/'),
    },
    offers: {
      '@type': 'Offer',
      price: (experience.price.amount / 100).toFixed(2),
      priceCurrency: experience.price.currency,
      availability: 'https://schema.org/InStock',
      validFrom: new Date().toISOString(),
      url: url,
    },
    ...(experience.rating && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: experience.rating.average.toFixed(1),
        reviewCount: experience.rating.count,
        bestRating: '5',
        worstRating: '1',
      },
    }),
    ...(experience.location && {
      touristDestination: {
        '@type': 'TouristDestination',
        name: experience.location.name,
      },
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Schema.org Product markup for experience products
 * More specific for e-commerce style product listings
 */
export function ProductSchema({ experience, url, siteName }: TouristTripSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: experience.title,
    description: experience.shortDescription,
    image: experience.imageUrl,
    url: url,
    brand: {
      '@type': 'Brand',
      name: siteName,
    },
    offers: {
      '@type': 'Offer',
      price: (experience.price.amount / 100).toFixed(2),
      priceCurrency: experience.price.currency,
      availability: 'https://schema.org/InStock',
      url: url,
      priceValidUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
    ...(experience.rating && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: experience.rating.average.toFixed(1),
        reviewCount: experience.rating.count,
        bestRating: '5',
        worstRating: '1',
      },
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Schema.org ItemList markup for experience list pages
 * Helps search engines understand lists of experiences
 */
export function ExperienceListSchema({
  experiences,
  listName,
  url,
  siteName,
  description,
}: ExperienceListSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    description: description,
    url: url,
    numberOfItems: experiences.length,
    itemListElement: experiences.map((exp, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'TouristTrip',
        name: exp.title,
        description: exp.shortDescription,
        image: exp.imageUrl,
        url: `${url.split('/').slice(0, 3).join('/')}/experiences/${exp.slug}`,
        offers: {
          '@type': 'Offer',
          price: (exp.price.amount / 100).toFixed(2),
          priceCurrency: exp.price.currency,
        },
        ...(exp.rating && {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: exp.rating.average.toFixed(1),
            reviewCount: exp.rating.count,
          },
        }),
      },
    })),
    provider: {
      '@type': 'TourOperator',
      name: siteName,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Schema.org BreadcrumbList markup
 * Helps search engines understand site navigation hierarchy
 */
export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Schema.org FAQPage markup
 * Helps content appear in FAQ rich results
 */
export function FAQSchema({ questions }: FAQSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Schema.org Organization markup
 * Establishes brand identity for search engines
 */
export function OrganizationSchema({
  name,
  url,
  logo,
  description,
  sameAs,
}: OrganizationSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: name,
    url: url,
    ...(logo && { logo: logo }),
    ...(description && { description: description }),
    ...(sameAs && sameAs.length > 0 && { sameAs: sameAs }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Schema.org WebSite markup with SearchAction
 * Enables sitelinks searchbox in Google results
 */
export function WebSiteSchema({
  name,
  url,
  description,
}: {
  name: string;
  url: string;
  description?: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: name,
    url: url,
    ...(description && { description: description }),
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${url}/experiences?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Schema.org Event markup for time-specific experiences
 */
export function EventSchema({
  experience,
  startDate,
  endDate,
  url,
  siteName,
}: {
  experience: ExperienceListItem;
  startDate: string;
  endDate?: string;
  url: string;
  siteName: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: experience.title,
    description: experience.shortDescription,
    image: experience.imageUrl,
    url: url,
    startDate: startDate,
    ...(endDate && { endDate: endDate }),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: experience.location.name,
    },
    organizer: {
      '@type': 'Organization',
      name: siteName,
      url: url.split('/').slice(0, 3).join('/'),
    },
    offers: {
      '@type': 'Offer',
      price: (experience.price.amount / 100).toFixed(2),
      priceCurrency: experience.price.currency,
      availability: 'https://schema.org/InStock',
      url: url,
      validFrom: new Date().toISOString(),
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Combined structured data component that outputs multiple schemas
 */
export function ExperienceStructuredData({
  experience,
  url,
  siteName,
  breadcrumbs,
  faqs,
}: {
  experience: ExperienceListItem;
  url: string;
  siteName: string;
  breadcrumbs?: Array<{ name: string; url: string }>;
  faqs?: Array<{ question: string; answer: string }>;
}) {
  return (
    <>
      <TouristTripSchema experience={experience} url={url} siteName={siteName} />
      <ProductSchema experience={experience} url={url} siteName={siteName} />
      {breadcrumbs && <BreadcrumbSchema items={breadcrumbs} />}
      {faqs && faqs.length > 0 && <FAQSchema questions={faqs} />}
    </>
  );
}
