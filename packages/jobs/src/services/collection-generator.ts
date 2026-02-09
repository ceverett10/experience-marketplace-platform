/**
 * Collection Generator Service
 *
 * Analyzes products for a microsite and creates AI-powered curated collections.
 * Collections help users discover experiences and provide SEO landing pages.
 *
 * Collection Types:
 * - AUDIENCE: Perfect for Couples, Family Adventures, Solo Explorer, Groups
 * - SEASONAL: Winter Warmers, Summer Escapes, Spring Discoveries
 * - THEMATIC: Adrenaline Rush, Foodie Favorites, Cultural Immersion
 * - CURATED: Highest Rated, Best Sellers, New Arrivals
 */

import { prisma } from '@experience-marketplace/database';
import type { Product, MicrositeConfig, CollectionType } from '@prisma/client';

// Keywords for audience classification
const AUDIENCE_KEYWORDS = {
  couples: [
    'romantic',
    'couples',
    'honeymoon',
    'date',
    'intimate',
    'wine',
    'sunset',
    'dinner',
    'spa',
    'relaxation',
  ],
  families: [
    'family',
    'kids',
    'children',
    'child-friendly',
    'educational',
    'fun',
    'interactive',
    'zoo',
    'aquarium',
    'theme park',
  ],
  solo: ['solo', 'individual', 'personal', 'photography', 'walking', 'hiking', 'yoga', 'wellness'],
  groups: [
    'group',
    'team',
    'corporate',
    'party',
    'bachelor',
    'bachelorette',
    'celebration',
    'large group',
  ],
};

// Keywords for thematic classification
const THEMATIC_KEYWORDS = {
  adventure: [
    'adventure',
    'extreme',
    'adrenaline',
    'thrill',
    'climbing',
    'rafting',
    'bungee',
    'skydiving',
    'zip',
    'kayak',
    'hiking',
    'trekking',
  ],
  food: [
    'food',
    'culinary',
    'cooking',
    'wine',
    'beer',
    'tasting',
    'restaurant',
    'gastronomy',
    'market',
    'foodie',
  ],
  culture: [
    'culture',
    'history',
    'museum',
    'art',
    'heritage',
    'architecture',
    'traditional',
    'ancient',
    'historical',
  ],
  nature: [
    'nature',
    'wildlife',
    'safari',
    'bird',
    'eco',
    'garden',
    'park',
    'forest',
    'beach',
    'mountain',
  ],
  relaxation: ['spa', 'wellness', 'relaxation', 'massage', 'yoga', 'meditation', 'retreat', 'zen'],
};

// Collection definitions
const COLLECTION_DEFINITIONS = {
  // Audience-based collections
  AUDIENCE: [
    {
      slug: 'perfect-for-couples',
      name: 'Perfect for Couples',
      description: 'Romantic experiences designed for unforgettable moments together',
      iconEmoji: '❤️',
      targetAudience: 'couples',
      keywords: AUDIENCE_KEYWORDS.couples,
    },
    {
      slug: 'family-adventures',
      name: 'Family Adventures',
      description: 'Fun-filled experiences the whole family will love',
      iconEmoji: '👨‍👩‍👧‍👦',
      targetAudience: 'families',
      keywords: AUDIENCE_KEYWORDS.families,
    },
    {
      slug: 'solo-explorer',
      name: 'Solo Explorer',
      description: 'Perfect experiences for independent travelers',
      iconEmoji: '🎒',
      targetAudience: 'solo',
      keywords: AUDIENCE_KEYWORDS.solo,
    },
    {
      slug: 'group-experiences',
      name: 'Group Experiences',
      description: 'Activities perfect for groups and celebrations',
      iconEmoji: '🎉',
      targetAudience: 'groups',
      keywords: AUDIENCE_KEYWORDS.groups,
    },
  ],

  // Seasonal collections
  SEASONAL: [
    {
      slug: 'winter-warmers',
      name: 'Winter Warmers',
      description: 'Cozy experiences perfect for the colder months',
      iconEmoji: '❄️',
      seasonalMonths: [12, 1, 2],
      keywords: ['winter', 'christmas', 'holiday', 'cozy', 'indoor', 'warm', 'festive'],
    },
    {
      slug: 'summer-escapes',
      name: 'Summer Escapes',
      description: 'Outdoor adventures and sun-soaked experiences',
      iconEmoji: '☀️',
      seasonalMonths: [6, 7, 8],
      keywords: ['summer', 'outdoor', 'beach', 'water', 'sunshine', 'boat', 'swim'],
    },
    {
      slug: 'spring-discoveries',
      name: 'Spring Discoveries',
      description: 'Fresh experiences as nature comes alive',
      iconEmoji: '🌸',
      seasonalMonths: [3, 4, 5],
      keywords: ['spring', 'flower', 'garden', 'blossom', 'nature', 'walking'],
    },
    {
      slug: 'autumn-adventures',
      name: 'Autumn Adventures',
      description: 'Colorful experiences amid fall foliage',
      iconEmoji: '🍂',
      seasonalMonths: [9, 10, 11],
      keywords: ['autumn', 'fall', 'harvest', 'wine', 'hiking', 'foliage'],
    },
  ],

  // Thematic collections
  THEMATIC: [
    {
      slug: 'adrenaline-rush',
      name: 'Adrenaline Rush',
      description: 'Heart-pumping adventures for thrill seekers',
      iconEmoji: '🏔️',
      keywords: THEMATIC_KEYWORDS.adventure,
    },
    {
      slug: 'foodie-favorites',
      name: 'Foodie Favorites',
      description: 'Culinary experiences for food lovers',
      iconEmoji: '🍽️',
      keywords: THEMATIC_KEYWORDS.food,
    },
    {
      slug: 'cultural-immersion',
      name: 'Cultural Immersion',
      description: 'Dive deep into local history and traditions',
      iconEmoji: '🏛️',
      keywords: THEMATIC_KEYWORDS.culture,
    },
    {
      slug: 'nature-escapes',
      name: 'Nature Escapes',
      description: 'Connect with the natural world',
      iconEmoji: '🌿',
      keywords: THEMATIC_KEYWORDS.nature,
    },
    {
      slug: 'wellness-retreat',
      name: 'Wellness & Relaxation',
      description: 'Rejuvenate your mind and body',
      iconEmoji: '🧘',
      keywords: THEMATIC_KEYWORDS.relaxation,
    },
  ],

  // Curated collections (data-driven, no keywords needed)
  CURATED: [
    {
      slug: 'highest-rated',
      name: 'Highest Rated',
      description: 'Top-rated experiences loved by travelers',
      iconEmoji: '⭐',
      curationType: 'rating',
    },
    {
      slug: 'best-sellers',
      name: 'Best Sellers',
      description: 'Our most popular experiences',
      iconEmoji: '🔥',
      curationType: 'bookings',
    },
    {
      slug: 'new-arrivals',
      name: 'New Arrivals',
      description: 'Recently added experiences to discover',
      iconEmoji: '✨',
      curationType: 'new',
    },
    {
      slug: 'great-value',
      name: 'Great Value',
      description: 'Amazing experiences at accessible prices',
      iconEmoji: '💰',
      curationType: 'value',
    },
  ],
};

interface CollectionDefinition {
  slug: string;
  name: string;
  description: string;
  iconEmoji: string;
  targetAudience?: string;
  seasonalMonths?: number[];
  keywords?: string[];
  curationType?: 'rating' | 'bookings' | 'new' | 'value';
}

interface ProductWithScore {
  product: Product;
  score: number;
  featuredReason?: string;
}

/**
 * Calculate relevance score for a product against keywords
 */
function calculateKeywordScore(product: Product, keywords: string[]): number {
  let score = 0;
  const searchText = [
    product.title,
    product.description,
    product.shortDescription,
    ...(product.categories || []),
    ...(product.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const keyword of keywords) {
    if (searchText.includes(keyword.toLowerCase())) {
      // Title matches are worth more
      if (product.title.toLowerCase().includes(keyword.toLowerCase())) {
        score += 3;
      } else {
        score += 1;
      }
    }
  }

  return score;
}

/**
 * Get products sorted by rating for "Highest Rated" collection
 */
function getHighestRatedProducts(products: Product[]): ProductWithScore[] {
  return products
    .filter((p) => p.rating && p.rating >= 4.0 && (p.reviewCount || 0) >= 5)
    .sort((a, b) => {
      // Sort by rating first, then by review count
      if ((b.rating || 0) !== (a.rating || 0)) {
        return (b.rating || 0) - (a.rating || 0);
      }
      return (b.reviewCount || 0) - (a.reviewCount || 0);
    })
    .slice(0, 12)
    .map((product) => ({
      product,
      score: (product.rating || 0) * 10,
      featuredReason: `${product.rating?.toFixed(1)} stars`,
    }));
}

/**
 * Get products sorted by bookings for "Best Sellers" collection
 */
function getBestSellerProducts(products: Product[]): ProductWithScore[] {
  return products
    .filter((p) => (p.bookingCount || 0) > 0)
    .sort((a, b) => (b.bookingCount || 0) - (a.bookingCount || 0))
    .slice(0, 12)
    .map((product) => ({
      product,
      score: product.bookingCount || 0,
      featuredReason: 'Popular choice',
    }));
}

/**
 * Get recently added products for "New Arrivals" collection
 */
function getNewArrivalProducts(products: Product[]): ProductWithScore[] {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return products
    .filter((p) => p.createdAt >= thirtyDaysAgo)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 12)
    .map((product) => ({
      product,
      score: 100, // All new arrivals get equal score
      featuredReason: 'New',
    }));
}

/**
 * Get products with good value (rating/price ratio) for "Great Value" collection
 */
function getGreatValueProducts(products: Product[]): ProductWithScore[] {
  return products
    .filter((p) => p.priceFrom && p.rating && p.rating >= 4.0)
    .map((product) => {
      const price = Number(product.priceFrom) || 1;
      const rating = product.rating || 0;
      // Value score: higher rating + lower price = better value
      const valueScore = (rating / 5) * 100 - Math.log10(price) * 20;
      return {
        product,
        score: valueScore,
        featuredReason: 'Great value',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

/**
 * Match products to a keyword-based collection
 */
function matchProductsToCollection(
  products: Product[],
  definition: CollectionDefinition
): ProductWithScore[] {
  const keywords = definition.keywords || [];
  if (keywords.length === 0) return [];

  const scoredProducts = products
    .map((product) => ({
      product,
      score: calculateKeywordScore(product, keywords),
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return scoredProducts;
}

/**
 * Generate collections for a microsite
 */
export async function generateCollectionsForMicrosite(
  micrositeId: string,
  options?: {
    collectionTypes?: CollectionType[];
    minProductsPerCollection?: number;
    forceRegenerate?: boolean;
  }
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  collections: string[];
}> {
  const {
    collectionTypes = ['AUDIENCE', 'SEASONAL', 'THEMATIC', 'CURATED'],
    minProductsPerCollection = 3,
    forceRegenerate = false,
  } = options || {};

  // Fetch microsite with supplier
  const microsite = await prisma.micrositeConfig.findUnique({
    where: { id: micrositeId },
    include: {
      supplier: {
        include: {
          products: true,
        },
      },
    },
  });

  if (!microsite) {
    throw new Error(`Microsite not found: ${micrositeId}`);
  }

  if (!microsite.supplier || !microsite.supplier.products.length) {
    console.log(`[CollectionGenerator] No products found for microsite ${micrositeId}`);
    return { created: 0, updated: 0, skipped: 0, collections: [] };
  }

  const products = microsite.supplier.products;
  console.log(
    `[CollectionGenerator] Processing ${products.length} products for microsite ${micrositeId}`
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const collectionNames: string[] = [];

  // Process each collection type
  for (const collectionType of collectionTypes) {
    const definitions = COLLECTION_DEFINITIONS[collectionType] || [];

    for (const definition of definitions) {
      let matchedProducts: ProductWithScore[];

      // Cast to our common interface for easier handling
      const def = definition as CollectionDefinition;

      // Get matching products based on collection type
      if (collectionType === 'CURATED' && def.curationType) {
        switch (def.curationType) {
          case 'rating':
            matchedProducts = getHighestRatedProducts(products);
            break;
          case 'bookings':
            matchedProducts = getBestSellerProducts(products);
            break;
          case 'new':
            matchedProducts = getNewArrivalProducts(products);
            break;
          case 'value':
            matchedProducts = getGreatValueProducts(products);
            break;
          default:
            matchedProducts = [];
        }
      } else {
        matchedProducts = matchProductsToCollection(products, def);
      }

      // Skip if not enough products
      if (matchedProducts.length < minProductsPerCollection) {
        console.log(
          `[CollectionGenerator] Skipping ${def.slug}: only ${matchedProducts.length} products (min: ${minProductsPerCollection})`
        );
        skipped++;
        continue;
      }

      // Check if collection already exists
      const existingCollection = await prisma.curatedCollection.findUnique({
        where: {
          micrositeId_slug: {
            micrositeId,
            slug: def.slug,
          },
        },
      });

      if (existingCollection && !forceRegenerate) {
        console.log(`[CollectionGenerator] Collection ${def.slug} already exists, skipping`);
        skipped++;
        continue;
      }

      // Create or update collection
      const collectionData = {
        name: def.name,
        slug: def.slug,
        description: def.description,
        iconEmoji: def.iconEmoji,
        collectionType: collectionType as CollectionType,
        targetAudience: def.targetAudience || null,
        seasonalMonths: def.seasonalMonths || [],
        micrositeId,
        isActive: true,
        isAiGenerated: true,
      };

      let collection;
      if (existingCollection) {
        // Update existing collection
        collection = await prisma.curatedCollection.update({
          where: { id: existingCollection.id },
          data: collectionData,
        });

        // Delete existing product associations
        await prisma.productCollection.deleteMany({
          where: { collectionId: collection.id },
        });

        updated++;
      } else {
        // Create new collection
        collection = await prisma.curatedCollection.create({
          data: collectionData,
        });
        created++;
      }

      // Create product associations
      await prisma.productCollection.createMany({
        data: matchedProducts.map((mp, index) => ({
          collectionId: collection.id,
          productId: mp.product.id,
          sortOrder: index,
          featuredReason: mp.featuredReason || null,
        })),
      });

      collectionNames.push(def.name);
      console.log(
        `[CollectionGenerator] ${existingCollection ? 'Updated' : 'Created'} collection: ${def.name} with ${matchedProducts.length} products`
      );
    }
  }

  console.log(
    `[CollectionGenerator] Completed: ${created} created, ${updated} updated, ${skipped} skipped`
  );

  return {
    created,
    updated,
    skipped,
    collections: collectionNames,
  };
}

/**
 * Refresh collections for a rotating subset of microsites (batch processing for scale)
 *
 * Strategy: Process 5% of microsites per run (daily), meaning each site gets
 * refreshed roughly every 20 days. This spreads load across time and prevents
 * database spikes with thousands of microsites.
 *
 * @param options.percentPerRun - Percentage of total microsites to process (default 5%)
 * @param options.maxPerRun - Maximum microsites per run regardless of percentage (default 100)
 * @param options.forceRegenerate - Whether to regenerate existing collections
 */
export async function refreshAllCollections(options?: {
  percentPerRun?: number;
  maxPerRun?: number;
  forceRegenerate?: boolean;
}): Promise<{
  micrositesProcessed: number;
  totalMicrosites: number;
  totalCreated: number;
  totalUpdated: number;
  errors: string[];
}> {
  const { percentPerRun = 5, maxPerRun = 100, forceRegenerate = false } = options || {};

  // Get total count of active microsites with products
  const totalMicrosites = await prisma.micrositeConfig.count({
    where: {
      status: 'ACTIVE',
      supplierId: { not: null },
    },
  });

  // Calculate batch size: percentage-based with min/max bounds
  const batchSize = Math.max(1, Math.min(maxPerRun, Math.floor(totalMicrosites * (percentPerRun / 100))));

  // Get microsites that haven't had collections refreshed recently
  // Order by updatedAt of their collections (oldest first), or by microsite creation if no collections
  const microsites = await prisma.micrositeConfig.findMany({
    where: {
      status: 'ACTIVE',
      supplierId: { not: null },
    },
    select: {
      id: true,
      siteName: true,
      collections: {
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' }, // Fallback ordering
    take: batchSize * 2, // Fetch extra to sort properly
  });

  // Sort by last collection update (oldest first, null = never updated = highest priority)
  const sortedMicrosites = microsites
    .map((ms) => ({
      id: ms.id,
      siteName: ms.siteName,
      lastCollectionUpdate: ms.collections[0]?.updatedAt || null,
    }))
    .sort((a, b) => {
      if (!a.lastCollectionUpdate) return -1;
      if (!b.lastCollectionUpdate) return 1;
      return a.lastCollectionUpdate.getTime() - b.lastCollectionUpdate.getTime();
    })
    .slice(0, batchSize);

  console.log(
    `[CollectionGenerator] Refreshing collections for ${sortedMicrosites.length} of ${totalMicrosites} microsites (${percentPerRun}% batch)`
  );

  let micrositesProcessed = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  const errors: string[] = [];

  for (const microsite of sortedMicrosites) {
    try {
      const result = await generateCollectionsForMicrosite(microsite.id, {
        forceRegenerate,
      });

      totalCreated += result.created;
      totalUpdated += result.updated;
      micrositesProcessed++;

      // Small delay between microsites to spread database load
      if (micrositesProcessed < sortedMicrosites.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      const errorMsg = `Error processing ${microsite.siteName}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[CollectionGenerator] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  return {
    micrositesProcessed,
    totalMicrosites,
    totalCreated,
    totalUpdated,
    errors,
  };
}

/**
 * Get active collections for a microsite
 */
export async function getCollectionsForMicrosite(micrositeId: string) {
  const currentMonth = new Date().getMonth() + 1; // 1-12

  return prisma.curatedCollection.findMany({
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
              holibobProductId: true,
              slug: true,
              title: true,
              shortDescription: true,
              primaryImageUrl: true,
              priceFrom: true,
              currency: true,
              rating: true,
              reviewCount: true,
              duration: true,
              city: true,
            },
          },
        },
        take: 8, // Limit products shown per collection
      },
    },
    orderBy: { sortOrder: 'asc' },
    take: 6, // Max collections to show on homepage
  });
}
