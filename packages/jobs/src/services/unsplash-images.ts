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
  url: string; // Regular size URL (1080px)
  thumbnailUrl: string; // Small size URL (400px)
  blurHash: string; // For loading placeholder
  color: string; // Dominant color for fallback
  alt: string;
  attribution: {
    photographerName: string;
    photographerUrl: string;
    photoUrl: string;
  };
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

    const data: UnsplashSearchResult = await response.json();
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

      const photo: UnsplashPhoto = await response.json();
      return this.mapPhotoToResult(photo);
    } catch (error) {
      console.error(`[Unsplash] Error getting random image:`, error);
      return null;
    }
  }

  /**
   * Fetch images for destinations
   * Uses location-aware queries for best results
   */
  async getDestinationImage(
    destinationName: string,
    context?: {
      niche?: string; // e.g., "food tours" to add context
      location?: string; // Parent location for context
    }
  ): Promise<ImageResult | null> {
    // Build a location-aware query
    const queryParts = [destinationName];
    if (context?.location && !destinationName.toLowerCase().includes(context.location.toLowerCase())) {
      queryParts.push(context.location);
    }
    // Add niche context for more relevant results (but keep it travel-focused)
    if (context?.niche) {
      queryParts.push('travel');
    } else {
      queryParts.push('cityscape travel');
    }

    const query = queryParts.join(' ');
    const results = await this.searchImages(query, { perPage: 3, orientation: 'landscape' });

    // Return the first (most relevant) result
    return results[0] || null;
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
   */
  private mapPhotoToResult(photo: UnsplashPhoto): ImageResult {
    return {
      url: photo.urls.regular,
      thumbnailUrl: photo.urls.small,
      blurHash: photo.blur_hash,
      color: photo.color,
      alt: photo.alt_description || photo.description || 'Travel destination image',
      attribution: {
        photographerName: photo.user.name,
        photographerUrl: `${photo.user.links.html}?utm_source=experience_marketplace&utm_medium=referral`,
        photoUrl: `${photo.links.html}?utm_source=experience_marketplace&utm_medium=referral`,
      },
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

/**
 * Helper to enrich homepage config destinations/categories with images
 */
export async function enrichHomepageConfigWithImages(
  config: {
    destinations?: Array<{ name: string; slug: string; icon: string; description?: string; imageUrl?: string }>;
    categories?: Array<{ name: string; slug: string; icon: string; description?: string; imageUrl?: string }>;
  },
  context?: { location?: string; niche?: string }
): Promise<{
  destinations?: Array<{ name: string; slug: string; icon: string; description?: string; imageUrl?: string }>;
  categories?: Array<{ name: string; slug: string; icon: string; description?: string; imageUrl?: string }>;
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

    if (items.length === 0) {
      return config;
    }

    console.log(`[Unsplash] Enriching ${items.length} items with images`);

    // Batch fetch images
    const imageResults = await service.batchGetImages(items, context);

    // Enrich destinations
    const enrichedDestinations = config.destinations?.map((dest) => {
      if (dest.imageUrl) return dest;
      const image = imageResults.get(dest.name);
      return {
        ...dest,
        imageUrl: image?.url || undefined,
      };
    });

    // Enrich categories
    const enrichedCategories = config.categories?.map((cat) => {
      if (cat.imageUrl) return cat;
      const image = imageResults.get(cat.name);
      return {
        ...cat,
        imageUrl: image?.url || undefined,
      };
    });

    return {
      destinations: enrichedDestinations,
      categories: enrichedCategories,
    };
  } catch (error) {
    console.error('[Unsplash] Error enriching config with images:', error);
    // Return original config if image fetching fails
    return config;
  }
}
