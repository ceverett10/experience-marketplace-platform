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
 * - Images are downloaded and cached in R2 for fast delivery
 */

import { uploadToR2, isR2Configured } from './image-storage.js';

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
 * Download an image from a URL and cache it to R2 for fast delivery
 * Returns the R2 URL if successful, or the original URL if R2 is not configured
 */
async function cacheImageToR2(
  imageUrl: string,
  cacheKey: string,
  width: number = 1280,
  quality: number = 80
): Promise<string> {
  // If R2 is not configured, return original URL
  if (!isR2Configured()) {
    console.log('[Image Cache] R2 not configured, using original URL');
    return imageUrl;
  }

  try {
    // Build optimized Unsplash URL
    const url = new URL(imageUrl);
    url.searchParams.set('w', width.toString());
    url.searchParams.set('q', quality.toString());
    url.searchParams.set('fm', 'jpg');
    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'crop');

    console.log(`[Image Cache] Downloading image: ${cacheKey}`);

    // Download the image
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`[Image Cache] Failed to download: ${response.status}`);
      return imageUrl;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Upload to R2
    const r2Key = `images/${cacheKey}.jpg`;
    const r2Url = await uploadToR2(buffer, r2Key, contentType);

    console.log(`[Image Cache] Cached to R2: ${r2Url} (${buffer.length} bytes)`);
    return r2Url;
  } catch (error) {
    console.error('[Image Cache] Error caching image:', error);
    return imageUrl;
  }
}

/**
 * Generate a cache key for an image based on context
 */
function generateImageCacheKey(type: 'hero' | 'category' | 'destination', identifier: string): string {
  // Sanitize the identifier for use as a filename
  const sanitized = identifier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  const timestamp = Date.now();
  return `${type}-${sanitized}-${timestamp}`;
}

/**
 * Helper to enrich homepage config destinations/categories/hero with images
 * Includes full attribution data as REQUIRED by Unsplash API Guidelines
 *
 * Images are downloaded and cached in R2 for fast delivery.
 * Attribution data is stored for display (required by Unsplash guidelines).
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
        // Cache hero image to R2 for fast delivery
        const cacheKey = generateImageCacheKey('hero', context?.niche || context?.location || 'default');
        const cachedUrl = await cacheImageToR2(heroImage.url, cacheKey, 1920, 80);

        enrichedHero = {
          ...config.hero,
          backgroundImage: cachedUrl,
          backgroundImageAttribution: {
            photographerName: heroImage.attribution.photographerName,
            photographerUrl: heroImage.attribution.photographerUrl,
            unsplashUrl: heroImage.attribution.unsplashUrl,
          },
        };
        console.log(`[Unsplash] Hero image cached: ${cachedUrl}`);
      }
    }

    if (items.length === 0 && !enrichedHero?.backgroundImage) {
      return { ...config, hero: enrichedHero };
    }

    console.log(`[Unsplash] Enriching ${items.length} items with images (with attribution)`);

    // Batch fetch images for destinations and categories
    const imageResults =
      items.length > 0 ? await service.batchGetImages(items, context) : new Map();

    // Enrich destinations with images AND attribution (with R2 caching)
    const enrichedDestinations = config.destinations
      ? await Promise.all(
          config.destinations.map(async (dest) => {
            if (dest.imageUrl) return dest;
            const image = imageResults.get(dest.name);
            if (!image) return dest;

            // Cache destination image to R2 (smaller size for cards)
            const cacheKey = generateImageCacheKey('destination', dest.name);
            const cachedUrl = await cacheImageToR2(image.url, cacheKey, 800, 75);

            return {
              ...dest,
              imageUrl: cachedUrl,
              // REQUIRED: Store attribution for display
              imageAttribution: {
                photographerName: image.attribution.photographerName,
                photographerUrl: image.attribution.photographerUrl,
                unsplashUrl: image.attribution.unsplashUrl,
              },
            };
          })
        )
      : undefined;

    // Enrich categories with images AND attribution (with R2 caching)
    const enrichedCategories = config.categories
      ? await Promise.all(
          config.categories.map(async (cat) => {
            if (cat.imageUrl) return cat;
            const image = imageResults.get(cat.name);
            if (!image) return cat;

            // Cache category image to R2 (smaller size for cards)
            const cacheKey = generateImageCacheKey('category', cat.name);
            const cachedUrl = await cacheImageToR2(image.url, cacheKey, 800, 75);

            return {
              ...cat,
              imageUrl: cachedUrl,
              // REQUIRED: Store attribution for display
              imageAttribution: {
                photographerName: image.attribution.photographerName,
                photographerUrl: image.attribution.photographerUrl,
                unsplashUrl: image.attribution.unsplashUrl,
              },
            };
          })
        )
      : undefined;

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
 * Creates evocative, high-quality image queries optimized for stunning hero backgrounds
 *
 * Best practices for Unsplash hero image queries:
 * - Use atmospheric/mood terms: "cinematic", "dramatic", "golden hour", "aerial"
 * - Be specific but not too narrow
 * - Include quality indicators: "beautiful", "stunning", "professional"
 * - Avoid overly generic terms like just "travel" or "tour"
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

  // Comprehensive niche-to-visual mapping for evocative hero images
  // Each mapping uses atmospheric terms that photograph well
  if (niche) {
    const nicheTerms: Record<string, string> = {
      // Food & Culinary
      'food tours': 'street food market atmosphere vibrant',
      'food-tours': 'street food market atmosphere vibrant',
      food: 'culinary market fresh ingredients beautiful',
      culinary: 'gourmet dining restaurant ambiance',

      // Wine & Beverages
      'wine tours': 'vineyard sunset golden hour rolling hills',
      wine: 'vineyard landscape scenic winery',
      beer: 'craft brewery atmospheric',

      // Adventure & Outdoor
      'adventure tours': 'epic mountain landscape dramatic sky',
      adventure: 'dramatic landscape wilderness explorer',
      hiking: 'mountain trail sunrise scenic vista',
      outdoor: 'nature landscape breathtaking view',

      // Walking & City
      'walking tours': 'beautiful historic street golden hour architecture',
      walking: 'cobblestone street charming old town',
      'city tours': 'iconic cityscape skyline dramatic',
      city: 'urban skyline sunset dramatic',

      // Cultural & Historical
      'cultural tours': 'ancient architecture heritage landmark stunning',
      cultural: 'historic landmark beautiful architecture',
      museum: 'grand architecture interior stunning',
      historical: 'ancient ruins atmospheric dramatic',
      'harry potter': 'magical castle gothic architecture misty',

      // Water & Boats
      'boat tours': 'sailboat sunset ocean golden hour',
      boat: 'yacht ocean sunset peaceful',
      cruise: 'luxury cruise ship ocean sunset',
      sailing: 'sailboat dramatic sky ocean',

      // Romance & Special Occasions
      honeymoon: 'romantic sunset beach couple silhouette',
      romantic: 'sunset romantic destination beautiful',
      anniversary: 'romantic golden hour waterfront elegant',
      wedding: 'romantic venue elegant beautiful',

      // Party & Celebration
      bachelorette: 'celebration nightlife glamorous city',
      bachelor: 'adventure celebration group friends',
      party: 'celebration vibrant nightlife',

      // Corporate & Team
      corporate: 'modern business team professional',
      'team building': 'team collaboration outdoor adventure',
      business: 'professional meeting modern elegant',

      // Solo & Individual
      solo: 'solo traveler scenic landscape peaceful',
      individual: 'peaceful journey scenic destination',

      // Tickets & Events
      tickets: 'entertainment venue lights spectacular',
      events: 'spectacular show lights performance',
      concert: 'concert lights dramatic atmosphere',
      theater: 'theater elegant interior dramatic',

      // Default fallback - still evocative
      tours: 'travel destination scenic beautiful landscape',
    };

    const nicheLower = niche.toLowerCase();

    // Try exact match first
    let nicheQuery = nicheTerms[nicheLower];

    // If no exact match, try partial matching
    if (!nicheQuery) {
      for (const [key, value] of Object.entries(nicheTerms)) {
        if (nicheLower.includes(key) || key.includes(nicheLower)) {
          nicheQuery = value;
          break;
        }
      }
    }

    // Use matched query or the original niche with enhancement
    queryParts.push(nicheQuery || `${niche} beautiful scenic`);
  } else {
    // Default - use evocative travel terms
    queryParts.push('travel destination beautiful landscape golden hour');
  }

  return queryParts.join(' ');
}
