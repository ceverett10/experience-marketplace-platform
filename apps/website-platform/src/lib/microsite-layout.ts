/**
 * Microsite Layout System
 *
 * Determines the appropriate homepage layout for microsites based on product count.
 * Three layout types are available:
 * - PRODUCT_SPOTLIGHT: For single-product microsites (landing page focused on conversion)
 * - CATALOG: For supplier microsites with 2-50 products (compact grid, no empty sections)
 * - MARKETPLACE: For larger catalogs (full marketplace layout, rarely used for microsites)
 */

// Layout types matching the Prisma enum
export type MicrositeLayoutType = 'PRODUCT_SPOTLIGHT' | 'CATALOG' | 'MARKETPLACE' | 'AUTO';

// Resolved layout type (never AUTO - always resolves to a concrete type)
export type ResolvedLayoutType = Exclude<MicrositeLayoutType, 'AUTO'>;

// Layout configuration for rendering decisions
export interface MicrositeLayoutConfig {
  resolvedType: ResolvedLayoutType;
  gridColumns: 1 | 2 | 3 | 4;
  showCategories: boolean;
  showDestinations: boolean;
  heroStyle: 'product-focused' | 'compact' | 'full';
  maxFeaturedProducts: number;
  showPagination: boolean;
  productCount: number;
}

/**
 * Resolve the layout type based on configured type and product count
 * If configured type is AUTO, determines the best layout based on product count
 */
export function resolveLayoutType(
  configuredType: MicrositeLayoutType,
  productCount: number
): ResolvedLayoutType {
  // If explicitly configured, use that type (unless it's AUTO)
  if (configuredType !== 'AUTO') {
    return configuredType;
  }

  // AUTO resolution based on product count
  if (productCount === 1) {
    return 'PRODUCT_SPOTLIGHT';
  }
  if (productCount <= 50) {
    return 'CATALOG';
  }
  return 'MARKETPLACE';
}

/**
 * Get full layout configuration for a microsite
 * This determines all rendering decisions for the homepage
 */
export function getLayoutConfig(
  configuredType: MicrositeLayoutType,
  productCount: number
): MicrositeLayoutConfig {
  const resolvedType = resolveLayoutType(configuredType, productCount);

  switch (resolvedType) {
    case 'PRODUCT_SPOTLIGHT':
      return {
        resolvedType,
        gridColumns: 1,
        showCategories: false,
        showDestinations: false,
        heroStyle: 'product-focused',
        maxFeaturedProducts: 1,
        showPagination: false,
        productCount,
      };

    case 'CATALOG':
      return {
        resolvedType,
        // Adaptive columns: 2 for very small catalogs, 3 for larger
        gridColumns: productCount <= 4 ? 2 : 3,
        // Only show categories if there are enough products to make it useful
        showCategories: productCount >= 10,
        showDestinations: false,
        heroStyle: 'compact',
        maxFeaturedProducts: Math.min(productCount, 6),
        showPagination: false, // Show all products, no pagination
        productCount,
      };

    case 'MARKETPLACE':
      return {
        resolvedType,
        gridColumns: 4,
        showCategories: true,
        showDestinations: true,
        heroStyle: 'full',
        maxFeaturedProducts: 8,
        showPagination: true,
        productCount,
      };
  }
}

/**
 * Layout type display names for UI
 */
export const LAYOUT_TYPE_LABELS: Record<MicrositeLayoutType, string> = {
  AUTO: 'Automatic (based on product count)',
  PRODUCT_SPOTLIGHT: 'Product Spotlight (1 product)',
  CATALOG: 'Catalog (2-50 products)',
  MARKETPLACE: 'Marketplace (50+ products)',
};

/**
 * Layout type descriptions for UI
 */
export const LAYOUT_TYPE_DESCRIPTIONS: Record<MicrositeLayoutType, string> = {
  AUTO: 'System automatically selects the best layout based on your product count',
  PRODUCT_SPOTLIGHT: 'Focused landing page for a single premium product with inline booking widget',
  CATALOG: 'Clean product grid with compact hero, optimized for small-to-medium catalogs',
  MARKETPLACE: 'Full marketplace layout with categories, destinations, and pagination',
};
