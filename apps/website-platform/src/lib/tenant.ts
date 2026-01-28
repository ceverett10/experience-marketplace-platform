/**
 * Multi-tenant Site Management
 * Handles site identification, configuration loading, and theming
 */

import type { Site, Brand } from '@prisma/client';

// Site configuration with brand info
export interface SiteConfig {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  primaryDomain: string | null;
  holibobPartnerId: string;

  // Brand theming
  brand: {
    name: string;
    tagline: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    headingFont: string;
    bodyFont: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    ogImageUrl: string | null;
    socialLinks: Record<string, string> | null;
  } | null;

  // SEO Configuration
  seoConfig: {
    titleTemplate: string;
    defaultDescription: string;
    keywords: string[];
  } | null;
}

// Default site configuration for development/fallback
export const DEFAULT_SITE_CONFIG: SiteConfig = {
  id: 'default',
  slug: 'default',
  name: 'Experience Marketplace',
  description: 'Discover unique experiences in your destination',
  primaryDomain: null,
  holibobPartnerId: process.env['HOLIBOB_PARTNER_ID'] ?? 'demo',
  brand: {
    name: 'Experience Marketplace',
    tagline: 'Discover Unique Experiences',
    primaryColor: '#6366f1',
    secondaryColor: '#8b5cf6',
    accentColor: '#f59e0b',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    logoUrl: null,
    faviconUrl: null,
    ogImageUrl: null,
    socialLinks: null,
  },
  seoConfig: {
    titleTemplate: '%s | Experience Marketplace',
    defaultDescription: 'Discover and book unique experiences, tours, and activities in your destination.',
    keywords: ['experiences', 'tours', 'activities', 'travel', 'booking'],
  },
};

/**
 * Get site configuration from hostname
 * In production, this would query the database
 */
export async function getSiteFromHostname(hostname: string): Promise<SiteConfig> {
  // Remove port and www prefix for matching
  const cleanHostname = hostname
    .split(':')[0]
    ?.replace(/^www\./, '')
    ?? hostname;

  // Development: localhost or preview deployments
  if (
    cleanHostname === 'localhost' ||
    cleanHostname.includes('127.0.0.1') ||
    cleanHostname.includes('.vercel.app') ||
    cleanHostname.includes('.herokuapp.com')
  ) {
    return DEFAULT_SITE_CONFIG;
  }

  // In production, query the database for site by domain
  try {
    const { prisma } = await import('@experience-marketplace/database');

    // Find domain and its associated site
    const domain = await prisma.domain.findUnique({
      where: { domain: cleanHostname },
      include: {
        site: {
          include: {
            brand: true,
          },
        },
      },
    });

    if (domain?.site) {
      return mapSiteToConfig(domain.site as Site & { brand: Brand | null });
    }

    // Fallback: try to find site by slug matching subdomain
    const subdomain = cleanHostname.split('.')[0];
    if (subdomain) {
      const site = await prisma.site.findUnique({
        where: { slug: subdomain },
        include: { brand: true },
      });

      if (site) {
        return mapSiteToConfig(site as Site & { brand: Brand | null });
      }
    }
  } catch (error) {
    console.error('Error fetching site from database:', error);
  }

  return DEFAULT_SITE_CONFIG;
}

/**
 * Map database Site model to SiteConfig
 */
function mapSiteToConfig(site: Site & { brand: Brand | null }): SiteConfig {
  const seoConfig = site.seoConfig as {
    titleTemplate?: string;
    defaultDescription?: string;
    keywords?: string[];
  } | null;

  return {
    id: site.id,
    slug: site.slug,
    name: site.name,
    description: site.description,
    primaryDomain: site.primaryDomain,
    holibobPartnerId: site.holibobPartnerId,
    brand: site.brand
      ? {
          name: site.brand.name,
          tagline: site.brand.tagline,
          primaryColor: site.brand.primaryColor,
          secondaryColor: site.brand.secondaryColor,
          accentColor: site.brand.accentColor,
          headingFont: site.brand.headingFont,
          bodyFont: site.brand.bodyFont,
          logoUrl: site.brand.logoUrl,
          faviconUrl: site.brand.faviconUrl,
          ogImageUrl: site.brand.ogImageUrl,
          socialLinks: site.brand.socialLinks as Record<string, string> | null,
        }
      : null,
    seoConfig: seoConfig
      ? {
          titleTemplate: seoConfig.titleTemplate ?? '%s | ' + site.name,
          defaultDescription: seoConfig.defaultDescription ?? site.description ?? '',
          keywords: seoConfig.keywords ?? [],
        }
      : {
          titleTemplate: '%s | ' + site.name,
          defaultDescription: site.description ?? '',
          keywords: [],
        },
  };
}

/**
 * Generate CSS variables from brand configuration
 */
export function generateBrandCSSVariables(brand: SiteConfig['brand']): string {
  if (!brand) {
    return '';
  }

  return `
    :root {
      --color-primary: ${brand.primaryColor};
      --color-secondary: ${brand.secondaryColor};
      --color-accent: ${brand.accentColor};
      --font-heading: ${brand.headingFont}, system-ui, sans-serif;
      --font-body: ${brand.bodyFont}, system-ui, sans-serif;
    }
  `.trim();
}
