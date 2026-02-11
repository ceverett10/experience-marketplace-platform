/**
 * Parent Domain Detection and Data Fetching
 * Handles the root experiencess.com domain (not subdomains)
 */

import { parseMicrositeHostname, MICROSITE_PARENT_DOMAINS } from './microsite';
import { prisma } from './prisma';

/**
 * Check if the hostname is the parent domain (experiencess.com, not a subdomain)
 */
export function isParentDomain(hostname: string): boolean {
  const info = parseMicrositeHostname(hostname);

  // It's the parent domain if:
  // 1. It's not a microsite subdomain
  // 2. It matches one of the parent domain patterns (with or without www)
  if (info.isMicrositeSubdomain) {
    return false;
  }

  const cleanHostname = hostname.split(':')[0]?.toLowerCase() ?? hostname.toLowerCase();

  for (const parentDomain of MICROSITE_PARENT_DOMAINS) {
    if (cleanHostname === parentDomain || cleanHostname === `www.${parentDomain}`) {
      return true;
    }
  }

  return false;
}

/**
 * Featured supplier for the parent domain homepage
 */
export interface FeaturedSupplier {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  productCount: number;
  cities: string[];
  categories: string[];
  rating: number | null;
  reviewCount: number;
  logoUrl: string | null;
  heroImageUrl: string | null;
  micrositeUrl: string | null;
}

/**
 * Get featured suppliers for the parent domain homepage
 */
export async function getFeaturedSuppliers(limit: number = 12): Promise<FeaturedSupplier[]> {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: {
        productCount: { gt: 0 },
      },
      orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }, { productCount: 'desc' }],
      take: limit,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        productCount: true,
        cities: true,
        categories: true,
        rating: true,
        reviewCount: true,
        logoUrl: true,
        heroImageUrl: true,
        microsite: {
          select: {
            fullDomain: true,
            status: true,
          },
        },
      },
    });

    return suppliers.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      productCount: s.productCount,
      cities: s.cities,
      categories: s.categories,
      rating: s.rating,
      reviewCount: s.reviewCount,
      // Generated logos disabled - using text-only branding (standard design) for all sites
      logoUrl: null,
      heroImageUrl: s.heroImageUrl,
      micrositeUrl: s.microsite?.status === 'ACTIVE' ? `https://${s.microsite.fullDomain}` : null,
    }));
  } catch (error) {
    console.error('[Parent Domain] Error fetching suppliers:', error);
    return [];
  }
}

/**
 * Category with supplier count
 */
export interface SupplierCategory {
  name: string;
  slug: string;
  supplierCount: number;
}

/**
 * Get categories with supplier counts
 */
export async function getSupplierCategories(): Promise<SupplierCategory[]> {
  try {
    // Get all categories from suppliers
    const suppliers = await prisma.supplier.findMany({
      where: { productCount: { gt: 0 } },
      select: { categories: true },
    });

    // Count suppliers per category
    const categoryCount = new Map<string, number>();
    for (const supplier of suppliers) {
      for (const category of supplier.categories) {
        categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
      }
    }

    // Convert to array and sort by count
    return Array.from(categoryCount.entries())
      .map(([name, supplierCount]) => ({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        supplierCount,
      }))
      .sort((a, b) => b.supplierCount - a.supplierCount)
      .slice(0, 12); // Top 12 categories
  } catch (error) {
    console.error('[Parent Domain] Error fetching categories:', error);
    return [];
  }
}

/**
 * City with supplier count
 */
export interface SupplierCity {
  name: string;
  slug: string;
  supplierCount: number;
}

/**
 * Get cities with supplier counts
 */
export async function getSupplierCities(limit: number = 16): Promise<SupplierCity[]> {
  try {
    // Get all cities from suppliers
    const suppliers = await prisma.supplier.findMany({
      where: { productCount: { gt: 0 } },
      select: { cities: true },
    });

    // Count suppliers per city
    const cityCount = new Map<string, number>();
    for (const supplier of suppliers) {
      for (const city of supplier.cities) {
        cityCount.set(city, (cityCount.get(city) || 0) + 1);
      }
    }

    // Convert to array and sort by count
    return Array.from(cityCount.entries())
      .map(([name, supplierCount]) => ({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        supplierCount,
      }))
      .sort((a, b) => b.supplierCount - a.supplierCount)
      .slice(0, limit);
  } catch (error) {
    console.error('[Parent Domain] Error fetching cities:', error);
    return [];
  }
}

/**
 * Platform stats for the parent domain
 */
export interface PlatformStats {
  totalSuppliers: number;
  totalProducts: number;
  totalCities: number;
  totalCategories: number;
  activeMicrosites: number;
}

/**
 * Get platform statistics
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  try {
    const [suppliers, products, microsites] = await Promise.all([
      prisma.supplier.findMany({
        where: { productCount: { gt: 0 } },
        select: { cities: true, categories: true },
      }),
      prisma.product.count(),
      prisma.micrositeConfig.count({ where: { status: 'ACTIVE' } }),
    ]);

    // Count unique cities and categories
    const uniqueCities = new Set<string>();
    const uniqueCategories = new Set<string>();
    for (const supplier of suppliers) {
      supplier.cities.forEach((c) => uniqueCities.add(c));
      supplier.categories.forEach((c) => uniqueCategories.add(c));
    }

    return {
      totalSuppliers: suppliers.length,
      totalProducts: products,
      totalCities: uniqueCities.size,
      totalCategories: uniqueCategories.size,
      activeMicrosites: microsites,
    };
  } catch (error) {
    console.error('[Parent Domain] Error fetching stats:', error);
    return {
      totalSuppliers: 0,
      totalProducts: 0,
      totalCities: 0,
      totalCategories: 0,
      activeMicrosites: 0,
    };
  }
}

/**
 * Active site for the "Our Brands" section
 */
export interface FeaturedSite {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  primaryDomain: string | null;
  brand: {
    name: string;
    tagline: string | null;
    logoUrl: string | null;
    primaryColor: string;
  } | null;
}

/**
 * Get active sites for the "Our Brands" section
 */
export async function getActiveSites(): Promise<FeaturedSite[]> {
  try {
    const sites = await prisma.site.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        primaryDomain: true,
        brand: {
          select: {
            name: true,
            tagline: true,
            logoUrl: true,
            primaryColor: true,
          },
        },
      },
    });

    // Generated logos disabled - using text-only branding (standard design) for all sites
    return sites.map((site) => ({
      ...site,
      brand: site.brand ? { ...site.brand, logoUrl: null } : null,
    }));
  } catch (error) {
    console.error('[Parent Domain] Error fetching sites:', error);
    return [];
  }
}
