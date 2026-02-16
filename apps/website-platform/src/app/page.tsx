import { headers } from 'next/headers';
import { Hero } from '@/components/layout/Hero';
import { FeaturedExperiences } from '@/components/experiences/FeaturedExperiences';
import { CategoryGrid } from '@/components/experiences/CategoryGrid';
import { LatestBlogPosts } from '@/components/content/LatestBlogPosts';
import { ProductSpotlightHomepage, CatalogHomepage } from '@/components/microsite';
import { getSiteFromHostname, type HomepageConfig } from '@/lib/tenant';
import {
  getHolibobClient,
  mapProductToExperience,
  type ExperienceListItem,
  type Experience,
  parseIsoDuration,
} from '@/lib/holibob';
import { prisma } from '@/lib/prisma';
import { optimizeUnsplashUrl, shouldSkipOptimization } from '@/lib/image-utils';
import {
  getMicrositeHomepageProducts,
  isMicrosite,
  localProductToExperienceListItem,
  getRelatedMicrosites,
} from '@/lib/microsite-experiences';
import {
  isParentDomain,
  getFeaturedSuppliers,
  getSupplierCategories,
  getSupplierCities,
  getPlatformStats,
  getActiveSites,
} from '@/lib/parent-domain';
import { ParentDomainHomepage } from '@/components/parent-domain/ParentDomainHomepage';
import { TourOperatorSchema, WebSiteSchema } from '@/components/seo/StructuredData';
import type { SiteConfig } from '@/lib/tenant';

// Revalidate every 5 minutes for fresh content
export const revalidate = 300;

// Map category path to search terms for Holibob API filtering
const CATEGORY_SEARCH_TERMS: Record<string, string> = {
  'food-wine-and-beer-experiences': 'food tours wine tasting culinary',
  'sightseeing-tours': 'sightseeing tours guided walks',
  'outdoor-activities': 'outdoor adventure hiking nature',
  'cultural-experiences': 'cultural heritage museum art',
  'water-activities': 'boat cruise water sports',
  'theme-parks-and-attractions': 'theme park attractions',
  'shows-and-events': 'theater shows concerts events',
  'wellness-and-spa': 'spa wellness relaxation',
};

interface FeaturedExperiencesResult {
  experiences: ExperienceListItem[];
  totalCount: number;
}

async function getFeaturedExperiences(
  siteConfig: Awaited<ReturnType<typeof getSiteFromHostname>>,
  popularExperiencesConfig?: HomepageConfig['popularExperiences']
): Promise<FeaturedExperiencesResult> {
  // === MICROSITE HANDLING ===
  // For microsites, use Product List by Provider endpoint (NOT Product Discovery)
  // This is the CORRECT approach - Product Discovery is for marketplace search
  if (isMicrosite(siteConfig.micrositeContext)) {
    const micrositeContext = siteConfig.micrositeContext;

    // For SUPPLIER microsites, use Product List filtered by Provider ID
    if (micrositeContext.entityType === 'SUPPLIER' && micrositeContext.holibobSupplierId) {
      try {
        const client = getHolibobClient(siteConfig);

        console.log(
          `[Homepage] Microsite SUPPLIER mode: Fetching products via Product List for provider`,
          micrositeContext.holibobSupplierId
        );

        // Use Product List by Provider endpoint - the CORRECT approach for microsites
        // Fetch only 20 products for homepage display (prevents timeout for large catalogs)
        const response = await client.getProductsByProvider(micrositeContext.holibobSupplierId, {
          pageSize: 20,
          page: 1,
        });

        const supplierProducts: ExperienceListItem[] = response.nodes.map((product) => {
          // Map to ExperienceListItem format
          const primaryImage =
            product.imageList?.[0]?.url ?? product.imageUrl ?? '/placeholder-experience.jpg';
          // ProductList API returns guidePrice in MAJOR units (e.g., 71 EUR, not 7100 cents)
          const priceAmount = product.guidePrice ?? product.priceFrom ?? 0;
          const priceCurrency = product.guidePriceCurrency ?? product.priceCurrency ?? 'GBP';
          // Use pre-formatted text if available, otherwise format directly (no /100 division)
          const priceFormatted =
            product.guidePriceFormattedText ??
            new Intl.NumberFormat('en-GB', { style: 'currency', currency: priceCurrency }).format(
              priceAmount
            );

          let durationFormatted = 'Duration varies';
          if (product.durationText) {
            durationFormatted = product.durationText;
          } else if (product.maxDuration != null) {
            const minutes = parseIsoDuration(product.maxDuration);
            if (minutes > 0) durationFormatted = formatDuration(minutes, 'minutes');
          }

          return {
            id: product.id,
            title: product.name ?? 'Experience',
            slug: product.id,
            // ProductListItem only has 'description', not 'shortDescription'
            shortDescription: product.description?.slice(0, 200) ?? '',
            imageUrl: primaryImage,
            price: {
              amount: priceAmount,
              currency: priceCurrency,
              formatted: priceFormatted,
            },
            duration: { formatted: durationFormatted },
            rating: product.reviewRating
              ? { average: product.reviewRating, count: product.reviewCount ?? 0 }
              : null,
            // ProductListItem place field has different schema - use empty for now
            location: { name: '' },
          };
        });

        console.log(
          `[Homepage] Microsite: Found ${supplierProducts.length} products for provider`,
          micrositeContext.holibobSupplierId
        );

        if (supplierProducts.length > 0) {
          // Return up to 20 products for homepage display, but pass actual total count
          return {
            experiences: supplierProducts.slice(0, 20),
            totalCount: response.recordCount ?? supplierProducts.length,
          };
        }
        // Fall through to cache if API returns no products
      } catch (error) {
        console.error(
          '[Homepage] Error fetching microsite supplier products via Product List:',
          error
        );
      }
    }

    // For PRODUCT microsites or as fallback, try local cache
    try {
      const localProducts = await getMicrositeHomepageProducts(siteConfig.micrositeContext, 8);
      if (localProducts.length > 0) {
        console.log(`[Homepage] Microsite fallback: Using ${localProducts.length} cached products`);
        return {
          experiences: localProducts.map(localProductToExperienceListItem),
          totalCount: localProducts.length, // Local cache doesn't have separate total
        };
      }
    } catch (error) {
      console.error('[Homepage] Error fetching cached microsite products:', error);
    }
  }
  // === END MICROSITE HANDLING ===

  try {
    const client = getHolibobClient(siteConfig);

    // Build search terms by combining categoryPath keywords + searchTerms
    const searchTermParts: string[] = [];

    // Add category-specific search terms (e.g., "food tours wine tasting culinary")
    if (popularExperiencesConfig?.categoryPath) {
      const categoryTerms = CATEGORY_SEARCH_TERMS[popularExperiencesConfig.categoryPath];
      if (categoryTerms) {
        searchTermParts.push(categoryTerms);
      }
    }

    // Add explicit search terms from site config (e.g., ["food tours", "culinary"])
    if (popularExperiencesConfig?.searchTerms?.length) {
      searchTermParts.push(...popularExperiencesConfig.searchTerms);
    }

    // Build filter with correct Holibob ProductFilter property names
    const filter: {
      currency: string;
      freeText?: string;
      searchTerm?: string;
    } = {
      currency: 'GBP',
    };

    // "Where" - location as freeText (e.g., "London")
    // Product Discovery API requires where.freeText when no consumerTripSelector is provided
    filter.freeText =
      popularExperiencesConfig?.destination ||
      siteConfig.homepageConfig?.destinations?.[0]?.name ||
      siteConfig.name;

    // "What" - combined search terms for filtering by category/niche
    if (searchTermParts.length > 0) {
      filter.searchTerm = searchTermParts.join(' ');
    }

    console.log('[Homepage] Fetching featured experiences with filter:', JSON.stringify(filter));

    // Get featured/popular experiences from Holibob Product Discovery API
    const response = await client.discoverProducts(filter, { pageSize: 8 });

    // Map to our experience format
    const experiences = response.products.map((product) => {
      // Get primary image from imageList (Product Detail API format - direct array)
      const primaryImage =
        product.imageList?.[0]?.url ?? product.imageUrl ?? '/placeholder-experience.jpg';

      // Get price - Product Detail API uses guidePrice, Product Discovery uses priceFrom
      const priceAmount = product.guidePrice ?? product.priceFrom ?? 0;
      const priceCurrency = 'GBP';
      const priceFormatted = formatPrice(priceAmount, priceCurrency);

      // Get duration - Product Discovery API returns maxDuration as ISO 8601 (e.g., "PT210M")
      // Product Detail API returns durationText as a string
      let durationFormatted = 'Duration varies';
      if (product.durationText) {
        durationFormatted = product.durationText;
      } else if (product.maxDuration != null) {
        // Parse ISO 8601 duration from Product Discovery API
        const minutes = parseIsoDuration(product.maxDuration);
        if (minutes > 0) {
          durationFormatted = formatDuration(minutes, 'minutes');
        }
      } else if (typeof product.duration === 'number' && product.duration > 0) {
        durationFormatted = formatDuration(product.duration, 'minutes');
      } else if (typeof product.duration === 'string') {
        const minutes = parseIsoDuration(product.duration);
        if (minutes > 0) {
          durationFormatted = formatDuration(minutes, 'minutes');
        }
      }

      return {
        id: product.id,
        title: product.name ?? 'Experience',
        slug: product.id,
        shortDescription: product.shortDescription ?? '',
        imageUrl: primaryImage,
        price: {
          amount: priceAmount,
          currency: priceCurrency,
          formatted: priceFormatted,
        },
        duration: {
          formatted: durationFormatted,
        },
        // Rating data from Holibob Product Discovery API
        rating: product.reviewRating
          ? {
              average: product.reviewRating,
              count: product.reviewCount ?? 0,
            }
          : null,
        location: {
          name: product.location?.name ?? '',
        },
      };
    });

    return {
      experiences,
      totalCount: response.totalCount ?? experiences.length,
    };
  } catch (error) {
    console.error('Error fetching featured experiences:', error);
    // Return empty result - no mock data
    return { experiences: [], totalCount: 0 };
  }
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

function formatDuration(value: number, unit: string): string {
  if (unit === 'minutes') {
    if (value >= 60) {
      const hours = Math.floor(value / 60);
      const mins = value % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${value}m`;
  }
  if (unit === 'hours') {
    return value === 1 ? '1 hour' : `${value} hours`;
  }
  if (unit === 'days') {
    return value === 1 ? '1 day' : `${value} days`;
  }
  return `${value} ${unit}`;
}

// Default destinations when none configured
const DEFAULT_DESTINATIONS = [
  { name: 'London', slug: 'london', icon: '🇬🇧' },
  { name: 'Paris', slug: 'paris', icon: '🇫🇷' },
  { name: 'Barcelona', slug: 'barcelona', icon: '🇪🇸' },
  { name: 'Rome', slug: 'rome', icon: '🇮🇹' },
  { name: 'Amsterdam', slug: 'amsterdam', icon: '🇳🇱' },
  { name: 'Edinburgh', slug: 'edinburgh', icon: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { name: 'Lisbon', slug: 'lisbon', icon: '🇵🇹' },
  { name: 'Berlin', slug: 'berlin', icon: '🇩🇪' },
];

// Map category path to user-friendly label for search
const CATEGORY_LABELS: Record<string, string> = {
  'food-wine-and-beer-experiences': 'Food & Drink',
  'sightseeing-tours': 'Sightseeing Tours',
  'outdoor-activities': 'Outdoor Activities',
  'cultural-experiences': 'Cultural Experiences',
  'water-activities': 'Water Activities',
  'theme-parks-and-attractions': 'Theme Parks',
  'shows-and-events': 'Shows & Events',
  'wellness-and-spa': 'Wellness & Spa',
};

/**
 * Fetch curated collections for homepage
 */
async function getHomepageCollections(micrositeId: string) {
  try {
    const currentMonth = new Date().getMonth() + 1; // 1-12

    return await prisma.curatedCollection.findMany({
      where: {
        micrositeId,
        isActive: true,
        OR: [
          // Non-seasonal collections (empty seasonalMonths array)
          { seasonalMonths: { isEmpty: true } },
          // Seasonal collections matching current month
          { seasonalMonths: { has: currentMonth } },
        ],
      },
      include: {
        products: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                primaryImageUrl: true,
                title: true,
              },
            },
          },
          take: 4, // For preview images on homepage cards
        },
      },
      orderBy: { sortOrder: 'asc' },
      take: 4, // Show up to 4 collections on homepage
    });
  } catch (error) {
    console.error('Error fetching homepage collections:', error);
    return [];
  }
}

/**
 * Fetch latest blog posts for homepage
 */
async function getLatestBlogPosts(siteId: string, micrositeId?: string) {
  try {
    // For microsites, query by micrositeId; for regular sites, query by siteId
    const whereClause = micrositeId
      ? { micrositeId, type: 'BLOG' as const, status: 'PUBLISHED' as const }
      : { siteId, type: 'BLOG' as const, status: 'PUBLISHED' as const };

    return await prisma.page.findMany({
      where: whereClause,
      include: {
        content: {
          select: {
            body: true,
            qualityScore: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 3,
    });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return [];
  }
}

/**
 * Build a compelling SEO title for the homepage.
 * Uses seoConfig.defaultTitle if it's already well-optimized (>30 chars, not just site name).
 * Otherwise generates dynamically from categories, cities, and keywords.
 */
function buildHomepageTitle(site: SiteConfig): string {
  const existing = site.seoConfig?.defaultTitle;
  // Use existing title if it's well-optimized (not just the site name, >30 chars)
  if (existing && existing !== site.name && existing.length > 30) {
    return existing;
  }

  const ctx = site.micrositeContext;
  const categories =
    ctx?.supplierCategories ?? site.homepageConfig?.categories?.map((c) => c.name) ?? [];
  const cities = ctx?.supplierCities ?? site.homepageConfig?.destinations?.map((d) => d.name) ?? [];
  const topCategory = categories[0];
  const topCity = cities[0];

  if (topCategory && topCity) {
    const title = `Best ${topCategory} in ${topCity} | ${site.name}`;
    return title.length <= 60 ? title : `${topCategory} in ${topCity} | ${site.name}`;
  }
  if (topCategory) {
    return `${site.name} | Book ${topCategory} Online`;
  }
  return `${site.name} - Book Unique Experiences & Tours`;
}

/**
 * Build a compelling SEO description for the homepage.
 * Uses seoConfig.defaultDescription if it's already detailed (>80 chars).
 * Otherwise generates dynamically from experience count, categories, and cities.
 */
function buildHomepageDescription(site: SiteConfig): string {
  const existing = site.seoConfig?.defaultDescription;
  if (existing && existing.length > 80) {
    return existing;
  }

  const ctx = site.micrositeContext;
  const count = ctx?.cachedProductCount ?? 0;
  const categories =
    ctx?.supplierCategories ?? site.homepageConfig?.categories?.map((c) => c.name) ?? [];
  const cities = ctx?.supplierCities ?? site.homepageConfig?.destinations?.map((d) => d.name) ?? [];

  const parts: string[] = [];

  // Opening with count + category + city
  const topCategories = categories.slice(0, 3);
  const topCity = cities[0];
  if (count > 0 && topCity) {
    parts.push(`Explore ${count}+ experiences in ${topCity}`);
  } else if (count > 0) {
    parts.push(`Explore ${count}+ unique experiences with ${site.name}`);
  } else if (topCity) {
    parts.push(`Discover the best experiences in ${topCity}`);
  } else {
    parts.push(`Discover unique experiences with ${site.name}`);
  }

  // Add category examples
  if (topCategories.length > 1) {
    parts.push(`including ${topCategories.join(', ')}`);
  }

  // Trust signals + CTA
  parts.push('- free cancellation, instant confirmation. Book online today!');

  let description = parts.join(' ');
  // Trim to ~160 chars at word boundary
  if (description.length > 160) {
    description = description.substring(0, 157).replace(/\s+\S*$/, '') + '...';
  }
  return description;
}

/**
 * Generate metadata for homepage including canonical URL
 * Handles regular sites, microsites, and parent domain
 */
export async function generateMetadata() {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';

  // Parent domain has its own metadata
  if (isParentDomain(hostname)) {
    return {
      title: 'Experiencess - Discover Amazing Experiences',
      description: 'Find and book unique experiences, tours, and activities worldwide.',
      alternates: {
        canonical: `https://${hostname}`,
      },
    };
  }

  const site = await getSiteFromHostname(hostname);
  const baseUrl = `https://${site.primaryDomain || hostname}`;

  const ogImage = site.brand?.ogImageUrl || site.homepageConfig?.hero?.backgroundImage || undefined;

  return {
    title: buildHomepageTitle(site),
    description: buildHomepageDescription(site),
    alternates: {
      canonical: baseUrl,
    },
    openGraph: {
      title: buildHomepageTitle(site),
      description: buildHomepageDescription(site),
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function HomePage() {
  const headersList = await headers();
  // On Heroku/Cloudflare, use x-forwarded-host to get the actual external domain
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';

  // === PARENT DOMAIN HANDLING ===
  // For experiencess.com (the marketplace root), render the directory/homepage
  if (isParentDomain(hostname)) {
    console.log('[Homepage] Parent domain detected:', hostname);
    const [suppliers, categories, cities, stats, sites] = await Promise.all([
      getFeaturedSuppliers(12),
      getSupplierCategories(),
      getSupplierCities(16),
      getPlatformStats(),
      getActiveSites(),
    ]);

    return (
      <ParentDomainHomepage
        suppliers={suppliers}
        categories={categories}
        cities={cities}
        stats={stats}
        sites={sites}
      />
    );
  }
  // === END PARENT DOMAIN HANDLING ===

  const site = await getSiteFromHostname(hostname);

  // === MICROSITE LAYOUT ROUTING ===
  if (isMicrosite(site.micrositeContext)) {
    const layoutConfig = site.micrositeContext.layoutConfig;
    console.log(
      '[Homepage] Microsite detected with layout:',
      layoutConfig.resolvedType,
      'entityType:',
      site.micrositeContext.entityType,
      'productCount:',
      layoutConfig.productCount
    );

    // PRODUCT_SPOTLIGHT: Single product landing page
    if (layoutConfig.resolvedType === 'PRODUCT_SPOTLIGHT') {
      // Fetch the single product from Holibob API
      if (site.micrositeContext.holibobProductId) {
        try {
          const client = getHolibobClient(site);
          const product = await client.getProduct(site.micrositeContext.holibobProductId);
          if (product) {
            const experience = mapProductToExperience(product);
            return <ProductSpotlightHomepage site={site} experience={experience} />;
          }
        } catch (error) {
          console.error('[Homepage] Error fetching spotlight product:', error);
        }
      }
      // Fall through to catalog if product fetch fails
    }

    // OPPORTUNITY microsites with rich homepageConfig → full Site-style homepage
    // These represent global categories (e.g. "small group travel for seniors") with 100K+ products
    // They use Product Discovery API (not Product List by Provider) so they work like main Sites
    const hasRichConfig =
      site.micrositeContext.entityType === 'OPPORTUNITY' &&
      site.homepageConfig?.destinations?.length;

    if (hasRichConfig) {
      console.log(
        '[Homepage] OPPORTUNITY microsite with rich config — using full Site-style homepage'
      );
      // Fall through to the Site-style homepage rendering below
    } else {
      // SUPPLIER/PRODUCT microsites → CatalogHomepage
      // Uses Product List by Provider for supplier-specific product catalogs
      const { experiences, totalCount } = await getFeaturedExperiences(
        site,
        site.homepageConfig?.popularExperiences
      );

      // Fetch related microsites for cross-linking (SEO benefit)
      let relatedMicrosites: Awaited<ReturnType<typeof getRelatedMicrosites>> = [];
      if (site.micrositeContext.micrositeId) {
        relatedMicrosites = await getRelatedMicrosites(
          site.micrositeContext.micrositeId,
          site.micrositeContext.supplierCities || [],
          site.micrositeContext.supplierCategories || [],
          6
        );
      }

      // Fetch blog posts and collections for microsite
      const [micrositeBlogPosts, micrositeCollections] = await Promise.all([
        getLatestBlogPosts(site.id, site.micrositeContext.micrositeId),
        site.micrositeContext.micrositeId
          ? getHomepageCollections(site.micrositeContext.micrositeId)
          : Promise.resolve([]),
      ]);

      return (
        <CatalogHomepage
          site={site}
          layoutConfig={layoutConfig}
          experiences={experiences}
          totalExperienceCount={totalCount}
          heroConfig={site.homepageConfig?.hero}
          testimonials={site.homepageConfig?.testimonials}
          relatedMicrosites={relatedMicrosites}
          blogPosts={micrositeBlogPosts}
          collections={micrositeCollections}
        />
      );
    }
  }
  // === END MICROSITE LAYOUT ROUTING ===

  // Get homepage configuration (AI-generated or default)
  const homepageConfig = site.homepageConfig;
  const heroConfig = homepageConfig?.hero;
  const popularExperiencesConfig = homepageConfig?.popularExperiences;
  const destinations = homepageConfig?.destinations ?? DEFAULT_DESTINATIONS;
  const categories = homepageConfig?.categories ?? [];
  const testimonials = homepageConfig?.testimonials ?? [
    {
      name: 'Sarah M.',
      location: 'London, UK',
      text: 'Absolutely fantastic experience! The booking process was seamless and the tour exceeded all expectations. Would highly recommend to anyone visiting.',
      rating: 5,
    },
    {
      name: 'James T.',
      location: 'New York, US',
      text: 'Great selection of experiences and very competitive prices. The free cancellation policy gave us peace of mind when planning our trip.',
      rating: 5,
    },
    {
      name: 'Maria L.',
      location: 'Barcelona, Spain',
      text: 'We booked a family tour and it was perfectly organized. The kids loved every minute. Easy to book and excellent customer support.',
      rating: 4,
    },
  ];

  // Get the search term for destination links
  // Priority: 1. Site's specific searchTerms (e.g., "harry potter tours")
  //           2. SEO primary keywords (e.g., "harry potter experiences")
  //           3. Generic category label (e.g., "Sightseeing Tours") - fallback only
  const searchTermForLinks = (() => {
    // Use site's specific search terms if configured (most specific)
    if (popularExperiencesConfig?.searchTerms?.length) {
      return popularExperiencesConfig.searchTerms[0];
    }
    // Fall back to SEO primary keywords
    if (site.seoConfig?.keywords?.length) {
      return site.seoConfig.keywords[0];
    }
    // Last resort: generic category label
    if (popularExperiencesConfig?.categoryPath) {
      return CATEGORY_LABELS[popularExperiencesConfig.categoryPath];
    }
    return undefined;
  })();

  const { experiences } = await getFeaturedExperiences(site, popularExperiencesConfig);

  // Fetch latest blog posts
  const blogPosts = await getLatestBlogPosts(site.id);

  // Note: Related microsites cross-linking is handled in CatalogHomepage for microsites
  // Regular marketplace sites don't need cross-linking to microsites

  // Build structured data for SEO
  const siteUrl = `https://${site.primaryDomain || hostname}`;
  const logoUrl = site.brand?.logoUrl
    ? site.brand.logoUrl.startsWith('http')
      ? site.brand.logoUrl
      : `${siteUrl}${site.brand.logoUrl}`
    : undefined;

  // Calculate aggregate rating from experiences
  const ratedExperiences = experiences.filter((e) => e.rating && e.rating.average > 0);
  const aggregateRating =
    ratedExperiences.length > 0
      ? {
          ratingValue:
            ratedExperiences.reduce((sum, exp) => sum + (exp.rating?.average || 0), 0) /
            ratedExperiences.length,
          reviewCount: ratedExperiences.reduce((sum, exp) => sum + (exp.rating?.count || 0), 0),
        }
      : undefined;

  // Build areaServed from destinations
  const areaServed = destinations.slice(0, 5).map((d) => d.name);

  // Build enriched description for structured data (same logic as meta description)
  const enrichedDescription = buildHomepageDescription(site);

  // Preload hero image URL so browser fetches it immediately
  // R2 images are pre-optimized, Unsplash images need URL optimization
  const heroImageUrl = heroConfig?.backgroundImage
    ? shouldSkipOptimization(heroConfig.backgroundImage)
      ? heroConfig.backgroundImage
      : optimizeUnsplashUrl(heroConfig.backgroundImage, 1280, 40)
    : null;

  return (
    <>
      {/* Preload hero image - critical for LCP */}
      {heroImageUrl && <link rel="preload" as="image" href={heroImageUrl} fetchPriority="high" />}

      {/* TourOperator structured data - helps Google understand the business */}
      <TourOperatorSchema
        name={site.name}
        url={siteUrl}
        logo={logoUrl}
        description={enrichedDescription}
        areaServed={areaServed}
        priceRange="$$"
        aggregateRating={aggregateRating}
      />

      {/* WebSite schema with search action for sitelinks searchbox */}
      <WebSiteSchema name={site.name} url={siteUrl} description={enrichedDescription} />

      {/* Hero Section */}
      <Hero
        title={heroConfig?.title}
        subtitle={heroConfig?.subtitle}
        backgroundImage={heroConfig?.backgroundImage}
        backgroundImageAttribution={heroConfig?.backgroundImageAttribution}
      />

      {/* Featured Experiences */}
      <FeaturedExperiences
        title={popularExperiencesConfig?.title ?? 'Popular Experiences'}
        subtitle={
          popularExperiencesConfig?.subtitle ??
          'Discover the most loved experiences in your destination'
        }
        experiences={experiences}
        variant="grid"
        staffPickCount={3}
      />

      {/* Categories */}
      {categories.length > 0 && (
        <CategoryGrid
          title="Explore by Category"
          subtitle="Find the perfect experience for your interests"
          categories={categories.map((cat, idx) => ({
            id: `cat-${idx}`,
            name: cat.name,
            slug: cat.slug,
            icon: cat.icon,
            imageUrl: cat.imageUrl,
            imageAttribution: cat.imageAttribution,
          }))}
          destination={popularExperiencesConfig?.destination}
        />
      )}

      {/* Why Book With Us */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Why Book With Us?
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              Everything you need for an unforgettable experience
            </p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Free Cancellation */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                <svg
                  className="h-5 w-5 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Free Cancellation</h3>
              <p className="mt-2 text-sm text-gray-600">
                Change of plans? Cancel up to 24 hours before for a full refund. No questions asked.
              </p>
            </div>
            {/* Instant Confirmation */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <svg
                  className="h-5 w-5 text-purple-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Instant Confirmation</h3>
              <p className="mt-2 text-sm text-gray-600">
                Get your booking confirmed immediately. No waiting, no uncertainty.
              </p>
            </div>
            {/* Secure Payments */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <svg
                  className="h-5 w-5 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Secure Payments</h3>
              <p className="mt-2 text-sm text-gray-600">
                All transactions are protected with Stripe encryption. Your data is safe with us.
              </p>
            </div>
            {/* Handpicked Experiences */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Handpicked Experiences</h3>
              <p className="mt-2 text-sm text-gray-600">
                Every experience is vetted for quality. Only the best make it onto our platform.
              </p>
            </div>
            {/* Verified Reviews */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
                <svg
                  className="h-5 w-5 text-teal-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.746 3.746 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.746 3.746 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">Verified Reviews</h3>
              <p className="mt-2 text-sm text-gray-600">
                Read genuine reviews from travelers who have been there and done it.
              </p>
            </div>
            {/* 24/7 Support */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100">
                <svg
                  className="h-5 w-5 text-rose-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">24/7 Customer Support</h3>
              <p className="mt-2 text-sm text-gray-600">
                Got a question? Our team is here around the clock to help you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Highest Rated Experiences - differentiated by sorting */}
      {experiences.filter((e) => e.rating && e.rating.average > 0).length > 0 && (
        <FeaturedExperiences
          title="Highest Rated"
          subtitle="Top-rated experiences chosen by travelers like you"
          experiences={[...experiences]
            .filter((e) => e.rating && e.rating.average > 0)
            .sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0))
            .slice(0, 4)}
          variant="grid"
        />
      )}

      {/* Popular Destinations */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Popular Destinations
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              Browse experiences by location
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {destinations.map((dest) => {
              // Build URL with destination and niche-specific search term
              const params = new URLSearchParams();
              params.set('destination', dest.slug);
              if (searchTermForLinks) {
                params.set('q', searchTermForLinks);
              }
              return (
                <a
                  key={dest.slug}
                  href={`/experiences?${params.toString()}`}
                  className="group flex flex-col items-center justify-center rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md"
                >
                  <span className="text-4xl">{dest.icon}</span>
                  <span className="mt-3 text-center text-sm font-medium text-gray-900 group-hover:text-indigo-600">
                    {dest.name}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* Customer Testimonials */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              What Our Travelers Say
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-base text-gray-600">
              Real experiences from real travelers
            </p>
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((testimonial, idx) => (
              <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                {/* Star Rating */}
                <div className="mb-4 flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className={`h-5 w-5 ${i < testimonial.rating ? 'text-yellow-400' : 'text-gray-200'}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                {/* Testimonial Text - Larger, darker, more readable */}
                <p className="text-base leading-7 text-gray-800">
                  &ldquo;{testimonial.text}&rdquo;
                </p>
                {/* Author Info */}
                <div className="mt-6 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-base font-semibold text-indigo-600">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-900">{testimonial.name}</p>
                    <p className="text-sm text-gray-600">{testimonial.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Latest Blog Posts - SEO Content */}
      <LatestBlogPosts posts={blogPosts} siteName={site.name} />
    </>
  );
}
