/**
 * Structured Data Generator Service
 * Generates Schema.org JSON-LD for SEO optimization
 *
 * This enables:
 * - Rich snippets in search results (stars, prices, availability)
 * - Better understanding by search engines
 * - Higher click-through rates
 * - Featured snippet eligibility
 */

export interface OrganizationSchema {
  '@context': 'https://schema.org';
  '@type': 'Organization' | 'TravelAgency';
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
  contactPoint?: {
    '@type': 'ContactPoint';
    contactType: string;
    availableLanguage?: string[];
  };
}

export interface ProductSchema {
  '@context': 'https://schema.org';
  '@type': 'Product' | 'TouristTrip';
  name: string;
  description: string;
  image?: string[];
  url: string;
  offers?: {
    '@type': 'Offer';
    price?: number;
    priceCurrency?: string;
    availability?: string;
    validFrom?: string;
    url: string;
  };
  aggregateRating?: {
    '@type': 'AggregateRating';
    ratingValue: number;
    reviewCount: number;
    bestRating?: number;
    worstRating?: number;
  };
  review?: ReviewSchema[];
  provider?: {
    '@type': 'Organization';
    name: string;
  };
}

export interface ReviewSchema {
  '@type': 'Review';
  reviewRating: {
    '@type': 'Rating';
    ratingValue: number;
    bestRating?: number;
  };
  author?: {
    '@type': 'Person';
    name: string;
  };
  reviewBody?: string;
  datePublished?: string;
}

export interface ArticleSchema {
  '@context': 'https://schema.org';
  '@type': 'Article' | 'BlogPosting' | 'TravelGuide';
  headline: string;
  description: string;
  image?: string[];
  datePublished: string;
  dateModified?: string;
  author: {
    '@type': 'Organization' | 'Person';
    name: string;
    url?: string;
  };
  publisher: {
    '@type': 'Organization';
    name: string;
    logo?: {
      '@type': 'ImageObject';
      url: string;
    };
  };
  mainEntityOfPage?: {
    '@type': 'WebPage';
    '@id': string;
  };
  keywords?: string[];
  articleSection?: string;
  wordCount?: number;
}

export interface BreadcrumbSchema {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: Array<{
    '@type': 'ListItem';
    position: number;
    name: string;
    item?: string;
  }>;
}

export interface FAQSchema {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: Array<{
    '@type': 'Question';
    name: string;
    acceptedAnswer: {
      '@type': 'Answer';
      text: string;
    };
  }>;
}

export interface LocalBusinessSchema {
  '@context': 'https://schema.org';
  '@type': 'TravelAgency' | 'LocalBusiness';
  name: string;
  url: string;
  description?: string;
  image?: string;
  priceRange?: string;
  address?: {
    '@type': 'PostalAddress';
    addressCountry: string;
  };
  geo?: {
    '@type': 'GeoCoordinates';
    latitude: number;
    longitude: number;
  };
  areaServed?: string[];
}

export interface WebSiteSchema {
  '@context': 'https://schema.org';
  '@type': 'WebSite';
  name: string;
  url: string;
  potentialAction?: {
    '@type': 'SearchAction';
    target: {
      '@type': 'EntryPoint';
      urlTemplate: string;
    };
    'query-input': string;
  };
}

/**
 * Generate Organization schema for the site
 */
export function generateOrganizationSchema(params: {
  name: string;
  url: string;
  logo?: string;
  description?: string;
  socialLinks?: string[];
}): OrganizationSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: params.name,
    url: params.url,
    ...(params.logo && { logo: params.logo }),
    ...(params.description && { description: params.description }),
    ...(params.socialLinks?.length && { sameAs: params.socialLinks }),
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: ['English'],
    },
  };
}

/**
 * Generate Product/Experience schema
 */
export function generateProductSchema(params: {
  name: string;
  description: string;
  url: string;
  images?: string[];
  price?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  reviews?: Array<{
    rating: number;
    author?: string;
    content?: string;
    date?: string;
  }>;
  providerName?: string;
}): ProductSchema {
  const schema: ProductSchema = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: params.name,
    description: params.description,
    url: params.url,
  };

  if (params.images?.length) {
    schema.image = params.images;
  }

  if (params.price !== undefined) {
    schema.offers = {
      '@type': 'Offer',
      price: params.price,
      priceCurrency: params.currency || 'GBP',
      availability: 'https://schema.org/InStock',
      url: params.url,
    };
  }

  if (params.rating !== undefined && params.reviewCount !== undefined) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Math.round(params.rating * 10) / 10,
      reviewCount: params.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (params.reviews?.length) {
    schema.review = params.reviews.slice(0, 5).map((r) => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: r.rating,
        bestRating: 5,
      },
      ...(r.author && {
        author: {
          '@type': 'Person',
          name: r.author,
        },
      }),
      ...(r.content && { reviewBody: r.content }),
      ...(r.date && { datePublished: r.date }),
    }));
  }

  if (params.providerName) {
    schema.provider = {
      '@type': 'Organization',
      name: params.providerName,
    };
  }

  return schema;
}

/**
 * Generate Article/Blog schema
 */
export function generateArticleSchema(params: {
  headline: string;
  description: string;
  url: string;
  images?: string[];
  datePublished: string;
  dateModified?: string;
  authorName: string;
  publisherName: string;
  publisherLogo?: string;
  keywords?: string[];
  wordCount?: number;
  isBlog?: boolean;
}): ArticleSchema {
  return {
    '@context': 'https://schema.org',
    '@type': params.isBlog ? 'BlogPosting' : 'Article',
    headline: params.headline.substring(0, 110), // Google truncates at 110 chars
    description: params.description.substring(0, 160),
    ...(params.images?.length && { image: params.images }),
    datePublished: params.datePublished,
    ...(params.dateModified && { dateModified: params.dateModified }),
    author: {
      '@type': 'Organization',
      name: params.authorName,
    },
    publisher: {
      '@type': 'Organization',
      name: params.publisherName,
      ...(params.publisherLogo && {
        logo: {
          '@type': 'ImageObject',
          url: params.publisherLogo,
        },
      }),
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': params.url,
    },
    ...(params.keywords?.length && { keywords: params.keywords }),
    ...(params.wordCount && { wordCount: params.wordCount }),
  };
}

/**
 * Generate Breadcrumb schema
 */
export function generateBreadcrumbSchema(
  items: Array<{ name: string; url?: string }>
): BreadcrumbSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url && { item: item.url }),
    })),
  };
}

/**
 * Generate FAQ schema from content
 * Extracts Q&A pairs for rich snippet eligibility
 */
export function generateFAQSchema(
  faqs: Array<{ question: string; answer: string }>
): FAQSchema | null {
  if (!faqs.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Generate WebSite schema with search action
 */
export function generateWebSiteSchema(params: {
  name: string;
  url: string;
  searchUrlTemplate?: string;
}): WebSiteSchema {
  const schema: WebSiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: params.name,
    url: params.url,
  };

  if (params.searchUrlTemplate) {
    schema.potentialAction = {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: params.searchUrlTemplate,
      },
      'query-input': 'required name=search_term_string',
    };
  }

  return schema;
}

/**
 * Generate LocalBusiness schema for destination pages
 */
export function generateLocalBusinessSchema(params: {
  name: string;
  url: string;
  description?: string;
  image?: string;
  priceRange?: string;
  country?: string;
  areasServed?: string[];
}): LocalBusinessSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: params.name,
    url: params.url,
    ...(params.description && { description: params.description }),
    ...(params.image && { image: params.image }),
    ...(params.priceRange && { priceRange: params.priceRange }),
    address: {
      '@type': 'PostalAddress',
      addressCountry: params.country || 'GB',
    },
    ...(params.areasServed?.length && { areaServed: params.areasServed }),
  };
}

/**
 * Extract FAQ pairs from markdown content
 * Looks for Q&A patterns or FAQ sections
 */
export function extractFAQsFromContent(
  content: string
): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];

  // Pattern 1: Q: ... A: ... format
  const qaPattern = /Q:\s*(.+?)\s*A:\s*(.+?)(?=Q:|$)/gis;
  let match;
  while ((match = qaPattern.exec(content)) !== null) {
    const questionText = match[1];
    const answerText = match[2];
    if (questionText && answerText) {
      faqs.push({
        question: questionText.trim(),
        answer: answerText.trim().substring(0, 500),
      });
    }
  }

  // Pattern 2: ### Question? followed by paragraph
  const headingPattern = /###\s*(.+\?)\s*\n+([^#]+)/g;
  while ((match = headingPattern.exec(content)) !== null) {
    const questionText = match[1];
    const answerText = match[2];
    if (questionText && answerText) {
      const question = questionText.trim();
      const answerParts = answerText.trim().split('\n\n');
      const answer = (answerParts[0] || answerText.trim()).substring(0, 500);
      if (!faqs.some((f) => f.question === question)) {
        faqs.push({ question, answer });
      }
    }
  }

  // Pattern 3: FAQ section with bullet points
  const faqSection = content.match(/##\s*FAQ[s]?\s*\n([\s\S]+?)(?=##|$)/i);
  if (faqSection && faqSection[1]) {
    const bulletPattern = /[-*]\s*\*\*(.+?)\*\*[:\s]*(.+?)(?=[-*]|$)/g;
    while ((match = bulletPattern.exec(faqSection[1])) !== null) {
      const questionText = match[1];
      const answerText = match[2];
      if (questionText && answerText) {
        const question = questionText.trim();
        const answer = answerText.trim().substring(0, 500);
        if (!faqs.some((f) => f.question === question)) {
          faqs.push({ question, answer });
        }
      }
    }
  }

  return faqs.slice(0, 10); // Google recommends max 10 FAQs
}

/**
 * Generate all applicable schemas for a page
 */
export function generatePageStructuredData(params: {
  pageType: 'homepage' | 'experience' | 'destination' | 'category' | 'blog';
  siteName: string;
  siteUrl: string;
  siteLogo?: string;
  pageUrl: string;
  title: string;
  description: string;
  images?: string[];
  content?: string;
  // Experience-specific
  price?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  reviews?: Array<{ rating: number; author?: string; content?: string; date?: string }>;
  // Article-specific
  datePublished?: string;
  dateModified?: string;
  keywords?: string[];
  wordCount?: number;
  // Navigation
  breadcrumbs?: Array<{ name: string; url?: string }>;
  // Destination-specific
  destination?: string;
}): object[] {
  const schemas: object[] = [];

  // Always include Organization schema
  schemas.push(
    generateOrganizationSchema({
      name: params.siteName,
      url: params.siteUrl,
      logo: params.siteLogo,
    })
  );

  // Add breadcrumbs if provided
  if (params.breadcrumbs?.length) {
    schemas.push(generateBreadcrumbSchema(params.breadcrumbs));
  }

  // Page-type specific schemas
  switch (params.pageType) {
    case 'homepage':
      schemas.push(
        generateWebSiteSchema({
          name: params.siteName,
          url: params.siteUrl,
          searchUrlTemplate: `${params.siteUrl}/experiences?q={search_term_string}`,
        })
      );
      break;

    case 'experience':
      schemas.push(
        generateProductSchema({
          name: params.title,
          description: params.description,
          url: params.pageUrl,
          images: params.images,
          price: params.price,
          currency: params.currency,
          rating: params.rating,
          reviewCount: params.reviewCount,
          reviews: params.reviews,
          providerName: params.siteName,
        })
      );
      break;

    case 'destination':
    case 'category':
      schemas.push(
        generateLocalBusinessSchema({
          name: params.siteName,
          url: params.pageUrl,
          description: params.description,
          image: params.images?.[0],
          areasServed: params.destination ? [params.destination] : undefined,
        })
      );
      break;

    case 'blog':
      schemas.push(
        generateArticleSchema({
          headline: params.title,
          description: params.description,
          url: params.pageUrl,
          images: params.images,
          datePublished: params.datePublished || new Date().toISOString(),
          dateModified: params.dateModified,
          authorName: params.siteName,
          publisherName: params.siteName,
          publisherLogo: params.siteLogo,
          keywords: params.keywords,
          wordCount: params.wordCount,
          isBlog: true,
        })
      );

      // Extract and add FAQ schema if present
      if (params.content) {
        const faqs = extractFAQsFromContent(params.content);
        if (faqs.length) {
          const faqSchema = generateFAQSchema(faqs);
          if (faqSchema) {
            schemas.push(faqSchema);
          }
        }
      }
      break;
  }

  return schemas;
}

/**
 * Render structured data as JSON-LD script tag
 */
export function renderStructuredDataScript(schemas: object[]): string {
  if (!schemas.length) return '';

  // If single schema, render directly; if multiple, use @graph
  const jsonLd =
    schemas.length === 1
      ? schemas[0]
      : {
          '@context': 'https://schema.org',
          '@graph': schemas.map((s) => {
            // Remove @context from nested schemas in graph
            const { '@context': _, ...rest } = s as { '@context'?: string };
            return rest;
          }),
        };

  return `<script type="application/ld+json">${JSON.stringify(jsonLd, null, 0)}</script>`;
}
