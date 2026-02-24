/**
 * SEO Utilities
 * Helpers for generating structured data, meta tags, and SEO markup
 */

import type { SiteConfig } from './tenant';
import type { Experience, ExperienceListItem } from './holibob';

/**
 * Generate Organization JSON-LD
 */
export function generateOrganizationJsonLd(site: SiteConfig, baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    description: site.description,
    url: baseUrl,
    logo: site.brand?.logoUrl,
    sameAs: site.brand?.socialLinks ? Object.values(site.brand.socialLinks).filter(Boolean) : [],
  };
}

/**
 * Generate WebSite JSON-LD with SearchAction
 */
export function generateWebsiteJsonLd(site: SiteConfig, baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/experiences?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Generate TouristAttraction JSON-LD for an experience
 */
export function generateExperienceJsonLd(experience: Experience, baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: experience.title,
    description: experience.description,
    url: `${baseUrl}/experiences/${experience.slug}`,
    image: experience.images.length > 0 ? experience.images : [experience.imageUrl],
    address: {
      '@type': 'PostalAddress',
      streetAddress: experience.location.address,
      addressLocality: experience.location.name,
    },
    geo:
      experience.location.lat && experience.location.lng
        ? {
            '@type': 'GeoCoordinates',
            latitude: experience.location.lat,
            longitude: experience.location.lng,
          }
        : undefined,
    aggregateRating: experience.rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: experience.rating.average,
          ratingCount: experience.rating.count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined,
    offers: {
      '@type': 'Offer',
      price: experience.price.amount,
      priceCurrency: experience.price.currency,
      availability: 'https://schema.org/InStock',
      validFrom: new Date().toISOString(),
    },
  };
}

/**
 * Generate Product JSON-LD (alternative schema for experiences)
 */
export function generateProductJsonLd(experience: Experience, baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: experience.title,
    description: experience.shortDescription,
    url: `${baseUrl}/experiences/${experience.slug}`,
    image: experience.images.length > 0 ? experience.images : [experience.imageUrl],
    brand: {
      '@type': 'Organization',
      name: 'Experience Marketplace',
    },
    aggregateRating: experience.rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: experience.rating.average,
          ratingCount: experience.rating.count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined,
    offers: {
      '@type': 'Offer',
      price: experience.price.amount,
      priceCurrency: experience.price.currency,
      availability: 'https://schema.org/InStock',
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      url: `${baseUrl}/experiences/${experience.slug}`,
    },
  };
}

/**
 * Generate BreadcrumbList JSON-LD
 */
export function generateBreadcrumbJsonLd(items: { name: string; url: string }[], baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`,
    })),
  };
}

/**
 * Generate ItemList JSON-LD for experience listings
 */
export function generateExperienceListJsonLd(
  experiences: ExperienceListItem[],
  baseUrl: string,
  listName: string = 'Experiences'
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: experiences.length,
    itemListElement: experiences.map((exp, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${baseUrl}/experiences/${exp.slug}`,
      name: exp.title,
      image: exp.imageUrl,
    })),
  };
}

/**
 * Generate FAQPage JSON-LD
 */
export function generateFaqJsonLd(faqs: { question: string; answer: string }[]) {
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
 * Generate LocalBusiness JSON-LD
 */
export function generateLocalBusinessJsonLd(
  site: SiteConfig,
  baseUrl: string,
  location?: {
    address: string;
    city: string;
    country: string;
    lat: number;
    lng: number;
  }
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': baseUrl,
    name: site.name,
    description: site.description,
    url: baseUrl,
    logo: site.brand?.logoUrl,
    image: site.brand?.ogImageUrl,
    address: location
      ? {
          '@type': 'PostalAddress',
          streetAddress: location.address,
          addressLocality: location.city,
          addressCountry: location.country,
        }
      : undefined,
    geo: location
      ? {
          '@type': 'GeoCoordinates',
          latitude: location.lat,
          longitude: location.lng,
        }
      : undefined,
    sameAs: site.brand?.socialLinks ? Object.values(site.brand.socialLinks).filter(Boolean) : [],
  };
}

/**
 * Clean a plain-text string (e.g., meta description) that may contain leaked
 * markdown link syntax or URL-encoded characters from content generation.
 *
 * Safe to call on already-clean strings — returns them unchanged.
 */
export function cleanPlainText(text: string): string {
  let result = text;
  // Strip markdown links [text](url) → text
  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Decode URL-encoded characters (%20 → space, etc.)
  try {
    result = decodeURIComponent(result);
  } catch {
    result = result.replace(/%20/g, ' ');
  }
  // Remove orphaned closing paren before a capitalised word (broken link artifact)
  result = result.replace(/\)\s+(?=[A-Z])/g, ' ');
  result = result.replace(/^\s*\)/, '');
  // Collapse multiple spaces
  result = result.replace(/\s{2,}/g, ' ').trim();
  return result;
}

/**
 * Generate canonical URL
 */
export function getCanonicalUrl(
  path: string,
  baseUrl: string,
  searchParams?: Record<string, string>
): string {
  const url = new URL(path, baseUrl);

  // Only include specific search params in canonical
  const allowedParams = ['category', 'location', 'page'];

  if (searchParams) {
    allowedParams.forEach((param) => {
      if (searchParams[param]) {
        url.searchParams.set(param, searchParams[param]);
      }
    });
  }

  return url.toString();
}

/**
 * Generate meta description with dynamic content
 */
export function generateMetaDescription(
  template: string,
  variables: Record<string, string | number>
): string {
  let description = template;

  Object.entries(variables).forEach(([key, value]) => {
    description = description.replace(new RegExp(`{${key}}`, 'g'), String(value));
  });

  // Truncate to 160 characters
  if (description.length > 160) {
    description = description.substring(0, 157) + '...';
  }

  return description;
}

/**
 * Generate OpenGraph tags
 */
export function generateOpenGraphTags(
  title: string,
  description: string,
  url: string,
  image?: string,
  type: 'website' | 'article' | 'product' = 'website'
) {
  return {
    title,
    description,
    url,
    type,
    images: image
      ? [
          {
            url: image,
            width: 1200,
            height: 630,
            alt: title,
          },
        ]
      : [],
  };
}

/**
 * Generate Twitter Card tags
 */
export function generateTwitterTags(
  title: string,
  description: string,
  image?: string,
  card: 'summary' | 'summary_large_image' = 'summary_large_image'
) {
  return {
    card,
    title,
    description,
    images: image ? [image] : [],
  };
}
