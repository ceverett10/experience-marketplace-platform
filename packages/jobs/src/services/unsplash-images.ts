/**
 * Unsplash Image Service
 * Fetches free, high-quality images for destinations and categories
 *
 * API Documentation: https://unsplash.com/documentation
 * Free tier: 50 requests/hour for demo apps
 * Production: Apply for production access for higher limits
 *
 * Usage notes:
 * - Attribution is required when using Unsplash images
 * - Use download endpoint to track downloads (required by Unsplash guidelines)
 */

interface UnsplashCredentials {
  accessKey?: string;
}

interface UnsplashPhoto {
  id: string;
  slug: string;
  width: number;
  height: number;
  color: string; // Dominant color (hex)
  blur_hash: string; // BlurHash for loading placeholder
  description: string | null;
  alt_description: string | null;
  urls: {
    raw: string; // Base URL for custom sizing
    full: string; // Full resolution
    regular: string; // 1080px width
    small: string; // 400px width
    thumb: string; // 200px width
  };
  links: {
    self: string;
    html: string; // Link to photo page (for attribution)
    download: string; // Download tracking endpoint
    download_location: string;
  };
  user: {
    id: string;
    username: string;
    name: string;
    portfolio_url: string | null;
    links: {
      html: string; // User profile page (for attribution)
    };
  };
}

interface UnsplashSearchResult {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
}

export interface ImageResult {
  url: string; // Regular size URL (1080px) - hotlinked as per Unsplash requirements
  thumbnailUrl: string; // Small size URL (400px)
  blurHash: string; // For loading placeholder
  color: string; // Dominant color for fallback
  alt: string;
  // REQUIRED by Unsplash API Guidelines: Must be displayed when showing images
  attribution: {
    photographerName: string;
    photographerUrl: string; // Link to photographer profile with UTM params
    photoUrl: string; // Link to photo on Unsplash with UTM params
    unsplashUrl: string; // Link to Unsplash.com with UTM params
  };
  // REQUIRED by Unsplash API Guidelines: Must be called when image is displayed/used
  downloadLocation: string;
}

/**
 * Stored attribution data for database persistence
 * This is what gets saved with destinations/categories in HomepageConfig
 */
export interface StoredImageAttribution {
  imageUrl: string;
  thumbnailUrl?: string;
  photographerName: string;
  photographerUrl: string;
  unsplashUrl: string;
  downloadLocation: string; // Must call this endpoint when image is displayed
}

export class UnsplashImageService {
  private readonly baseUrl = 'https://api.unsplash.com';
  private readonly accessKey: string;

  constructor(credentials?: UnsplashCredentials) {
    const accessKey = credentials?.accessKey || process.env['UNSPLASH_ACCESS_KEY'];

    if (!accessKey) {
      throw new Error(
        'Unsplash credentials not found. Set UNSPLASH_ACCESS_KEY environment variable. ' +
          'Get a free API key at https://unsplash.com/developers'
      );
    }

    this.accessKey = accessKey;
  }

  /**
   * Search for images by query
   * @param query - Search term (e.g., "London food tour", "wine tasting")
   * @param options - Search options
   */
  async searchImages(
    query: string,
    options?: {
      perPage?: number;
      page?: number;
      orientation?: 'landscape' | 'portrait' | 'squarish';
      contentFilter?: 'low' | 'high';
    }
  ): Promise<ImageResult[]> {
    const params = new URLSearchParams({
      query,
      per_page: String(options?.perPage || 5),
      page: String(options?.page || 1),
      orientation: options?.orientation || 'landscape',
      content_filter: options?.contentFilter || 'high', // Safe for all audiences
    });

    console.log(`[Unsplash] Searching for "${query}"`);

    const response = await fetch(`${this.baseUrl}/search/photos?${params}`, {
      headers: {
        Authorization: `Client-ID ${this.accessKey}`,
        'Accept-Version': 'v1',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Unsplash] Search failed: ${response.status} - ${errorText}`);
      throw new Error(`Unsplash search failed: ${response.status}`);
    }

    const data: UnsplashSearchResult = (await response.json()) as UnsplashSearchResult;
    console.log(`[Unsplash] Found ${data.total} images for "${query}"`);

    return data.results.map((photo) => this.mapPhotoToResult(photo));
  }

  /**
   * Get a single random photo for a query
   * Useful for getting hero images or single category images
   */
  async getRandomImage(
    query: string,
    options?: {
      orientation?: 'landscape' | 'portrait' | 'squarish';
      contentFilter?: 'low' | 'high';
    }
  ): Promise<ImageResult | null> {
    const params = new URLSearchParams({
      query,
      orientation: options?.orientation || 'landscape',
      content_filter: options?.contentFilter || 'high',
    });

    console.log(`[Unsplash] Getting random image for "${query}"`);

    try {
      const response = await fetch(`${this.baseUrl}/photos/random?${params}`, {
        headers: {
          Authorization: `Client-ID ${this.accessKey}`,
          'Accept-Version': 'v1',
        },
      });

      if (!response.ok) {
        console.error(`[Unsplash] Random image failed: ${response.status}`);
        return null;
      }

      const photo: UnsplashPhoto = (await response.json()) as UnsplashPhoto;
      return this.mapPhotoToResult(photo);
    } catch (error) {
      console.error(`[Unsplash] Error getting random image:`, error);
      return null;
    }
  }

  /**
   * Fetch images for destinations
   * Uses location-aware queries with fallback for best results
   */
  async getDestinationImage(
    destinationName: string,
    context?: {
      niche?: string; // e.g., "food tours" to add context
      location?: string; // Parent location for context
    }
  ): Promise<ImageResult | null> {
    // Try multiple query variants in order of specificity
    // This handles cases where specific queries return no results
    const queryVariants: string[] = [];

    // 1. Most specific: destination + parent location + travel
    if (
      context?.location &&
      !destinationName.toLowerCase().includes(context.location.toLowerCase())
    ) {
      queryVariants.push(`${destinationName} ${context.location} travel`);
    }

    // 2. Destination + simple location context (e.g., "Borough Market London")
    const loc = context?.location;
    if (loc) {
      const simpleLocation = loc.split(',')[0]?.trim() ?? ''; // "London" from "London, England"
      if (simpleLocation && !destinationName.toLowerCase().includes(simpleLocation.toLowerCase())) {
        queryVariants.push(`${destinationName} ${simpleLocation}`);
      }
    }

    // 3. Just the destination name (often works best for well-known places)
    queryVariants.push(destinationName);

    // 4. Destination + street/area for neighborhoods
    queryVariants.push(`${destinationName} street`);

    // Try each query variant until we find results
    for (const query of queryVariants) {
      const results = await this.searchImages(query, { perPage: 3, orientation: 'landscape' });
      const firstResult = results[0];

      if (firstResult) {
        return firstResult;
      }

      // Small delay between fallback attempts
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(
      `[Unsplash] No images found for destination: ${destinationName} (tried ${queryVariants.length} queries)`
    );
    return null;
  }

  /**
   * Fetch images for experience categories
   * Uses category-specific queries for best results
   */
  async getCategoryImage(
    categoryName: string,
    context?: {
      location?: string; // e.g., "London" for location-specific imagery
    }
  ): Promise<ImageResult | null> {
    // Build a category-specific query
    const queryParts = [categoryName];
    if (context?.location) {
      queryParts.push(context.location);
    }
    // Add "experience" or "tour" context for travel-relevant images
    queryParts.push('experience');

    const query = queryParts.join(' ');
    const results = await this.searchImages(query, { perPage: 3, orientation: 'landscape' });

    // Return the first result
    return results[0] || null;
  }

  /**
   * Batch fetch images for multiple items (destinations or categories)
   * More efficient than individual calls, with rate limit consideration
   */
  async batchGetImages(
    items: Array<{ name: string; type: 'destination' | 'category' }>,
    context?: { location?: string; niche?: string }
  ): Promise<Map<string, ImageResult | null>> {
    const results = new Map<string, ImageResult | null>();

    // Process in batches to respect rate limits
    const batchSize = 5;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      // Fetch batch in parallel
      const promises = batch.map(async (item) => {
        const result =
          item.type === 'destination'
            ? await this.getDestinationImage(item.name, context)
            : await this.getCategoryImage(item.name, context);

        return { name: item.name, result };
      });

      const batchResults = await Promise.all(promises);
      for (const { name, result } of batchResults) {
        results.set(name, result);
      }

      // Add a small delay between batches to be nice to the API
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  /**
   * Track a download (required by Unsplash guidelines when image is displayed)
   */
  async trackDownload(downloadLocation: string): Promise<void> {
    try {
      await fetch(`${downloadLocation}`, {
        headers: {
          Authorization: `Client-ID ${this.accessKey}`,
        },
      });
    } catch (error) {
      // Non-critical, just log
      console.warn('[Unsplash] Failed to track download:', error);
    }
  }

  /**
   * Generate a custom-sized URL from a raw Unsplash URL
   * @param rawUrl - The raw URL from Unsplash
   * @param options - Sizing options
   */
  getCustomSizeUrl(
    rawUrl: string,
    options: {
      width?: number;
      height?: number;
      fit?: 'clamp' | 'clip' | 'crop' | 'facearea' | 'fill' | 'fillmax' | 'max' | 'min' | 'scale';
      quality?: number; // 1-100
      format?: 'auto' | 'jpg' | 'png' | 'webp';
    }
  ): string {
    const params = new URLSearchParams();

    if (options.width) params.set('w', String(options.width));
    if (options.height) params.set('h', String(options.height));
    if (options.fit) params.set('fit', options.fit);
    if (options.quality) params.set('q', String(options.quality));
    if (options.format) params.set('fm', options.format);

    // Add auto=format for best browser compatibility
    params.set('auto', 'format');

    return `${rawUrl}&${params.toString()}`;
  }

  /**
   * Map Unsplash API response to our ImageResult type
   * Includes all required attribution and tracking data per Unsplash API Guidelines
   */
  private mapPhotoToResult(photo: UnsplashPhoto): ImageResult {
    // UTM params required by Unsplash - use your app name
    const utmParams = 'utm_source=experience_marketplace&utm_medium=referral';

    return {
      url: photo.urls.regular,
      thumbnailUrl: photo.urls.small,
      blurHash: photo.blur_hash,
      color: photo.color,
      alt: photo.alt_description || photo.description || 'Travel destination image',
      attribution: {
        photographerName: photo.user.name,
        photographerUrl: `${photo.user.links.html}?${utmParams}`,
        photoUrl: `${photo.links.html}?${utmParams}`,
        unsplashUrl: `https://unsplash.com?${utmParams}`,
      },
      // REQUIRED: Must trigger this endpoint when image is displayed
      downloadLocation: photo.links.download_location,
    };
  }
}

/**
 * Singleton instance for easy use
 */
let unsplashInstance: UnsplashImageService | null = null;

export function getUnsplashService(): UnsplashImageService {
  if (!unsplashInstance) {
    unsplashInstance = new UnsplashImageService();
  }
  return unsplashInstance;
}

/** Attribution data structure for storage */
interface ImageAttributionData {
  photographerName: string;
  photographerUrl: string;
  unsplashUrl: string;
}

/** Item with optional image and attribution */
interface ItemWithImage {
  name: string;
  slug: string;
  icon: string;
  description?: string;
  imageUrl?: string;
  imageAttribution?: ImageAttributionData;
}

/** Hero section with optional background image */
interface HeroConfig {
  title?: string;
  subtitle?: string;
  backgroundImage?: string;
  backgroundImageAttribution?: ImageAttributionData;
}

/**
 * Helper to enrich homepage config destinations/categories/hero with images
 * Includes full attribution data as REQUIRED by Unsplash API Guidelines
 *
 * COMPLIANCE NOTES:
 * - Images are hotlinked from Unsplash CDN (required)
 * - Attribution data is stored for display (required)
 * - UTM parameters are included in all links (required)
 */
export async function enrichHomepageConfigWithImages(
  config: {
    hero?: HeroConfig;
    destinations?: Array<ItemWithImage>;
    categories?: Array<ItemWithImage>;
  },
  context?: { location?: string; niche?: string }
): Promise<{
  hero?: HeroConfig;
  destinations?: Array<ItemWithImage>;
  categories?: Array<ItemWithImage>;
}> {
  try {
    const service = getUnsplashService();

    // Collect all items that need images
    const items: Array<{ name: string; type: 'destination' | 'category' }> = [];

    if (config.destinations) {
      for (const dest of config.destinations) {
        if (!dest.imageUrl) {
          items.push({ name: dest.name, type: 'destination' });
        }
      }
    }

    if (config.categories) {
      for (const cat of config.categories) {
        if (!cat.imageUrl) {
          items.push({ name: cat.name, type: 'category' });
        }
      }
    }

    // Fetch hero image if not already set
    let enrichedHero = config.hero;
    if (config.hero && !config.hero.backgroundImage) {
      console.log(
        `[Unsplash] Fetching hero background image for niche: ${context?.niche}, location: ${context?.location}`
      );

      // Build a search query for the hero image based on niche and location
      const heroQuery = buildHeroImageQuery(context?.niche, context?.location);
      const heroImage = await service.getRandomImage(heroQuery, { orientation: 'landscape' });

      if (heroImage) {
        enrichedHero = {
          ...config.hero,
          backgroundImage: heroImage.url,
          backgroundImageAttribution: {
            photographerName: heroImage.attribution.photographerName,
            photographerUrl: heroImage.attribution.photographerUrl,
            unsplashUrl: heroImage.attribution.unsplashUrl,
          },
        };
        console.log(`[Unsplash] Hero image found: ${heroImage.alt}`);
      }
    }

    if (items.length === 0 && !enrichedHero?.backgroundImage) {
      return { ...config, hero: enrichedHero };
    }

    console.log(`[Unsplash] Enriching ${items.length} items with images (with attribution)`);

    // Batch fetch images for destinations and categories
    const imageResults =
      items.length > 0 ? await service.batchGetImages(items, context) : new Map();

    // Enrich destinations with images AND attribution
    const enrichedDestinations = config.destinations?.map((dest) => {
      if (dest.imageUrl) return dest;
      const image = imageResults.get(dest.name);
      if (!image) return dest;

      return {
        ...dest,
        imageUrl: image.url,
        // REQUIRED: Store attribution for display
        imageAttribution: {
          photographerName: image.attribution.photographerName,
          photographerUrl: image.attribution.photographerUrl,
          unsplashUrl: image.attribution.unsplashUrl,
        },
      };
    });

    // Enrich categories with images AND attribution
    const enrichedCategories = config.categories?.map((cat) => {
      if (cat.imageUrl) return cat;
      const image = imageResults.get(cat.name);
      if (!image) return cat;

      return {
        ...cat,
        imageUrl: image.url,
        // REQUIRED: Store attribution for display
        imageAttribution: {
          photographerName: image.attribution.photographerName,
          photographerUrl: image.attribution.photographerUrl,
          unsplashUrl: image.attribution.unsplashUrl,
        },
      };
    });

    return {
      hero: enrichedHero,
      destinations: enrichedDestinations,
      categories: enrichedCategories,
    };
  } catch (error) {
    console.error('[Unsplash] Error enriching config with images:', error);
    // Return original config if image fetching fails
    return config;
  }
}

/**
 * Build a search query for hero images based on niche and location
 * Creates evocative, high-quality image queries
 */
function buildHeroImageQuery(niche?: string, location?: string): string {
  const queryParts: string[] = [];

  // Add location for location-specific imagery
  if (location) {
    // Extract the city name (before any comma)
    const city = location.split(',')[0]?.trim();
    if (city) {
      queryParts.push(city);
    }
  }

  // Add niche-specific terms
  if (niche) {
    const nicheTerms: Record<string, string> = {
      'food tours': 'food market culinary',
      'food-tours': 'food market culinary',
      'wine tours': 'vineyard wine',
      'adventure tours': 'adventure nature scenic',
      'walking tours': 'city street architecture',
      'cultural tours': 'cultural heritage landmark',
      'boat tours': 'waterfront harbor boats',
      tours: 'travel destination scenic',
    };
    const nicheLower = niche.toLowerCase();
    const nicheQuery = nicheTerms[nicheLower] || niche;
    queryParts.push(nicheQuery);
  } else {
    // Default travel-related terms
    queryParts.push('travel destination');
  }

  return queryParts.join(' ');
}
