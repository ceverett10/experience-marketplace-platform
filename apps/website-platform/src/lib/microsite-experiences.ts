/**
 * Microsite Experience Fetching
 * Provides methods to fetch products/experiences for supplier and product microsites
 * Uses cached local data for SEO pages, with real-time Holibob for availability
 */

import { prisma } from '@/lib/prisma';
import type { MicrositeContext } from '@/lib/tenant';

/**
 * Local product data from our synced database (used for SEO/listing pages)
 */
export interface LocalProduct {
  id: string;
  holibobProductId: string;
  slug: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  priceFrom: number | null;
  currency: string;
  duration: string | null;
  city: string | null;
  country: string | null;
  rating: number | null;
  reviewCount: number;
  primaryImageUrl: string | null;
  images: string[] | null;
  categories: string[];
  tags: string[];
}

/**
 * Supplier data from our synced database
 */
export interface LocalSupplier {
  id: string;
  holibobSupplierId: string;
  slug: string;
  name: string;
  description: string | null;
  productCount: number;
  cities: string[];
  categories: string[];
  rating: number | null;
  reviewCount: number;
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  priceCurrency: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
}

/**
 * Get products for a supplier microsite
 * Returns cached local data for fast SEO-friendly page rendering
 */
export async function getSupplierProducts(
  supplierId: string,
  options: {
    limit?: number;
    offset?: number;
    sortBy?: 'rating' | 'reviewCount' | 'priceFrom' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ products: LocalProduct[]; total: number }> {
  const { limit = 20, offset = 0, sortBy = 'rating', sortOrder = 'desc' } = options;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: { supplierId },
      orderBy: { [sortBy]: sortOrder },
      take: limit,
      skip: offset,
      select: {
        id: true,
        holibobProductId: true,
        slug: true,
        title: true,
        description: true,
        shortDescription: true,
        priceFrom: true,
        currency: true,
        duration: true,
        city: true,
        country: true,
        rating: true,
        reviewCount: true,
        primaryImageUrl: true,
        images: true,
        categories: true,
        tags: true,
      },
    }),
    prisma.product.count({ where: { supplierId } }),
  ]);

  return {
    products: products.map((p) => ({
      ...p,
      priceFrom: p.priceFrom ? Number(p.priceFrom) : null,
      images: p.images as string[] | null,
    })),
    total,
  };
}

/**
 * Get a single product for a product microsite
 * Returns cached local data with full details
 */
export async function getProductById(productId: string): Promise<LocalProduct | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      holibobProductId: true,
      slug: true,
      title: true,
      description: true,
      shortDescription: true,
      priceFrom: true,
      currency: true,
      duration: true,
      city: true,
      country: true,
      rating: true,
      reviewCount: true,
      primaryImageUrl: true,
      images: true,
      categories: true,
      tags: true,
    },
  });

  if (!product) return null;

  return {
    ...product,
    priceFrom: product.priceFrom ? Number(product.priceFrom) : null,
    images: product.images as string[] | null,
  };
}

/**
 * Get a product by its Holibob product ID
 */
export async function getProductByHolibobId(
  holibobProductId: string
): Promise<LocalProduct | null> {
  const product = await prisma.product.findUnique({
    where: { holibobProductId },
    select: {
      id: true,
      holibobProductId: true,
      slug: true,
      title: true,
      description: true,
      shortDescription: true,
      priceFrom: true,
      currency: true,
      duration: true,
      city: true,
      country: true,
      rating: true,
      reviewCount: true,
      primaryImageUrl: true,
      images: true,
      categories: true,
      tags: true,
    },
  });

  if (!product) return null;

  return {
    ...product,
    priceFrom: product.priceFrom ? Number(product.priceFrom) : null,
    images: product.images as string[] | null,
  };
}

/**
 * Get supplier details
 */
export async function getSupplierById(supplierId: string): Promise<LocalSupplier | null> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      holibobSupplierId: true,
      slug: true,
      name: true,
      description: true,
      productCount: true,
      cities: true,
      categories: true,
      rating: true,
      reviewCount: true,
      priceRangeMin: true,
      priceRangeMax: true,
      priceCurrency: true,
      logoUrl: true,
      heroImageUrl: true,
    },
  });

  if (!supplier) return null;

  return {
    ...supplier,
    priceRangeMin: supplier.priceRangeMin ? Number(supplier.priceRangeMin) : null,
    priceRangeMax: supplier.priceRangeMax ? Number(supplier.priceRangeMax) : null,
  };
}

/**
 * Get supplier by Holibob supplier ID
 */
export async function getSupplierByHolibobId(
  holibobSupplierId: string
): Promise<LocalSupplier | null> {
  const supplier = await prisma.supplier.findUnique({
    where: { holibobSupplierId },
    select: {
      id: true,
      holibobSupplierId: true,
      slug: true,
      name: true,
      description: true,
      productCount: true,
      cities: true,
      categories: true,
      rating: true,
      reviewCount: true,
      priceRangeMin: true,
      priceRangeMax: true,
      priceCurrency: true,
      logoUrl: true,
      heroImageUrl: true,
    },
  });

  if (!supplier) return null;

  return {
    ...supplier,
    priceRangeMin: supplier.priceRangeMin ? Number(supplier.priceRangeMin) : null,
    priceRangeMax: supplier.priceRangeMax ? Number(supplier.priceRangeMax) : null,
  };
}

/**
 * Get related products for a product microsite
 * Returns other products from the same supplier or in the same city/category
 */
export async function getRelatedProducts(
  product: LocalProduct,
  supplierId: string,
  limit: number = 8
): Promise<LocalProduct[]> {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        // Same supplier (highest priority)
        { supplierId, id: { not: product.id } },
        // Same city
        { city: product.city, id: { not: product.id } },
        // Same category
        { categories: { hasSome: product.categories }, id: { not: product.id } },
      ],
    },
    orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
    take: limit,
    select: {
      id: true,
      holibobProductId: true,
      slug: true,
      title: true,
      description: true,
      shortDescription: true,
      priceFrom: true,
      currency: true,
      duration: true,
      city: true,
      country: true,
      rating: true,
      reviewCount: true,
      primaryImageUrl: true,
      images: true,
      categories: true,
      tags: true,
    },
  });

  return products.map((p) => ({
    ...p,
    priceFrom: p.priceFrom ? Number(p.priceFrom) : null,
    images: p.images as string[] | null,
  }));
}

/**
 * Get featured experiences for a microsite homepage
 * Uses local cached data for fast SEO-friendly rendering
 */
export async function getMicrositeHomepageProducts(
  micrositeContext: MicrositeContext,
  limit: number = 8
): Promise<LocalProduct[]> {
  if (micrositeContext.entityType === 'SUPPLIER' && micrositeContext.supplierId) {
    // For supplier microsites, get their top-rated products
    const { products } = await getSupplierProducts(micrositeContext.supplierId, {
      limit,
      sortBy: 'rating',
      sortOrder: 'desc',
    });
    return products;
  }

  if (micrositeContext.entityType === 'PRODUCT' && micrositeContext.productId) {
    // For product microsites, get the product and its related products
    const product = await getProductById(micrositeContext.productId);
    if (!product) return [];

    // Get the supplier ID from the product to find related products
    const fullProduct = await prisma.product.findUnique({
      where: { id: micrositeContext.productId },
      select: { supplierId: true },
    });

    if (!fullProduct) return [product];

    const related = await getRelatedProducts(product, fullProduct.supplierId, limit - 1);
    return [product, ...related];
  }

  return [];
}

/**
 * Check if the current site is a microsite
 */
export function isMicrosite(
  micrositeContext?: MicrositeContext
): micrositeContext is MicrositeContext {
  return !!micrositeContext;
}

/**
 * Convert local product to the format expected by existing experience components
 */
export function localProductToExperienceListItem(product: LocalProduct) {
  return {
    id: product.holibobProductId,
    title: product.title,
    slug: product.holibobProductId, // Use Holibob ID for booking compatibility
    shortDescription: product.shortDescription ?? '',
    imageUrl: product.primaryImageUrl ?? '/placeholder-experience.jpg',
    price: {
      amount: product.priceFrom ?? 0,
      currency: product.currency,
      formatted: formatPrice(product.priceFrom ?? 0, product.currency),
    },
    duration: {
      formatted: product.duration ?? 'Duration varies',
    },
    rating: product.rating
      ? {
          average: product.rating,
          count: product.reviewCount,
        }
      : null,
    location: {
      name: product.city ?? '',
    },
  };
}

function formatPrice(amount: number, currency: string): string {
  // Handle prices that might be stored as major units (not cents)
  const displayAmount = amount > 1000 ? amount / 100 : amount;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(displayAmount);
}

/**
 * Related microsite data for cross-linking
 */
export interface RelatedMicrosite {
  fullDomain: string;
  siteName: string;
  tagline: string | null;
  logoUrl: string | null;
  categories: string[];
  cities: string[];
  productCount: number;
  rating: number | null;
}

/**
 * Get related microsites for cross-linking
 * Finds microsites with similar cities or categories
 */
export async function getRelatedMicrosites(
  currentMicrositeId: string,
  cities: string[],
  categories: string[],
  limit: number = 6
): Promise<RelatedMicrosite[]> {
  // Get active microsites that share cities or categories
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      id: { not: currentMicrositeId },
      status: 'ACTIVE',
      supplier: {
        OR: [
          { cities: { hasSome: cities.length > 0 ? cities : ['_none_'] } },
          { categories: { hasSome: categories.length > 0 ? categories : ['_none_'] } },
        ],
      },
    },
    include: {
      supplier: {
        select: {
          cities: true,
          categories: true,
          productCount: true,
          rating: true,
          logoUrl: true,
        },
      },
      brand: {
        select: {
          logoUrl: true,
        },
      },
    },
    orderBy: [{ supplier: { rating: 'desc' } }, { supplier: { productCount: 'desc' } }],
    take: limit,
  });

  return microsites.map((ms) => ({
    fullDomain: ms.fullDomain,
    siteName: ms.siteName,
    tagline: ms.tagline,
    // Generated logos disabled - using text-only branding (standard design) for all sites
    logoUrl: null,
    categories: ms.supplier?.categories || [],
    cities: ms.supplier?.cities || [],
    productCount: ms.supplier?.productCount || 0,
    rating: ms.supplier?.rating || null,
  }));
}
