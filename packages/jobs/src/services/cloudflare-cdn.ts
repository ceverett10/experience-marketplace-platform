/**
 * Cloudflare CDN Configuration Service
 * Automatically optimizes domains for image performance and caching
 */

interface CloudflareConfig {
  apiToken: string;
  accountId: string;
}

interface ZoneOptimizationSettings {
  // Caching
  cacheLevel: 'aggressive' | 'basic' | 'simplified';
  browserCacheTTL: number;

  // Performance
  minify: {
    css: boolean;
    html: boolean;
    js: boolean;
  };
  brotli: boolean;
  earlyHints: boolean;
  http3: boolean;

  // Images
  polish: 'off' | 'lossless' | 'lossy';
  webp: boolean;
  mirage: boolean;
}

const OPTIMAL_SETTINGS: ZoneOptimizationSettings = {
  cacheLevel: 'aggressive',
  browserCacheTTL: 31536000, // 1 year
  minify: {
    css: true,
    html: true,
    js: true,
  },
  brotli: true,
  earlyHints: true,
  http3: true,
  polish: 'lossy', // Image optimization
  webp: true, // WebP conversion
  mirage: true, // Lazy load images
};

export class CloudflareCDNService {
  private apiToken: string;
  private accountId: string;
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(config: CloudflareConfig) {
    this.apiToken = config.apiToken;
    this.accountId = config.accountId;
  }

  /**
   * Configure optimal CDN settings for a domain
   */
  async optimizeZone(domain: string): Promise<{ success: boolean; zoneId?: string; error?: string }> {
    try {
      // 1. Find or create the zone
      const zoneId = await this.getZoneId(domain);
      if (!zoneId) {
        return { success: false, error: 'Zone not found in Cloudflare' };
      }

      console.log(`[Cloudflare CDN] Optimizing ${domain} (Zone: ${zoneId})`);

      // 2. Apply all optimization settings in parallel
      await Promise.all([
        this.setCacheLevel(zoneId, OPTIMAL_SETTINGS.cacheLevel),
        this.setBrowserCacheTTL(zoneId, OPTIMAL_SETTINGS.browserCacheTTL),
        this.setMinification(zoneId, OPTIMAL_SETTINGS.minify),
        this.setBrotli(zoneId, OPTIMAL_SETTINGS.brotli),
        this.setEarlyHints(zoneId, OPTIMAL_SETTINGS.earlyHints),
        this.setHTTP3(zoneId, OPTIMAL_SETTINGS.http3),
        this.setPolish(zoneId, OPTIMAL_SETTINGS.polish),
        this.setWebP(zoneId, OPTIMAL_SETTINGS.webp),
        this.setMirage(zoneId, OPTIMAL_SETTINGS.mirage),
      ]);

      // 3. Create page rules for Next.js image optimization
      await this.createImageCachingRule(zoneId, domain);

      console.log(`[Cloudflare CDN] ✓ ${domain} optimized successfully`);
      return { success: true, zoneId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Cloudflare CDN] Error optimizing ${domain}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get zone ID for a domain
   */
  private async getZoneId(domain: string): Promise<string | null> {
    const response = await fetch(`${this.baseUrl}/zones?name=${domain}`, {
      headers: this.getHeaders(),
    });

    const data = (await response.json()) as { success: boolean; result: Array<{ id: string }> };
    if (data.success && data.result.length > 0 && data.result[0]) {
      return data.result[0].id;
    }
    return null;
  }

  /**
   * Set cache level
   */
  private async setCacheLevel(zoneId: string, level: string): Promise<void> {
    await this.updateZoneSetting(zoneId, 'cache_level', { value: level });
  }

  /**
   * Set browser cache TTL
   */
  private async setBrowserCacheTTL(zoneId: string, ttl: number): Promise<void> {
    await this.updateZoneSetting(zoneId, 'browser_cache_ttl', { value: ttl });
  }

  /**
   * Set minification settings
   */
  private async setMinification(zoneId: string, minify: { css: boolean; html: boolean; js: boolean }): Promise<void> {
    await this.updateZoneSetting(zoneId, 'minify', { value: minify });
  }

  /**
   * Enable Brotli compression
   */
  private async setBrotli(zoneId: string, enabled: boolean): Promise<void> {
    await this.updateZoneSetting(zoneId, 'brotli', { value: enabled ? 'on' : 'off' });
  }

  /**
   * Enable Early Hints
   */
  private async setEarlyHints(zoneId: string, enabled: boolean): Promise<void> {
    await this.updateZoneSetting(zoneId, 'early_hints', { value: enabled ? 'on' : 'off' });
  }

  /**
   * Enable HTTP/3
   */
  private async setHTTP3(zoneId: string, enabled: boolean): Promise<void> {
    await this.updateZoneSetting(zoneId, 'http3', { value: enabled ? 'on' : 'off' });
  }

  /**
   * Set Polish (image optimization)
   */
  private async setPolish(zoneId: string, level: string): Promise<void> {
    await this.updateZoneSetting(zoneId, 'polish', { value: level });
  }

  /**
   * Enable WebP conversion
   */
  private async setWebP(zoneId: string, enabled: boolean): Promise<void> {
    await this.updateZoneSetting(zoneId, 'webp', { value: enabled ? 'on' : 'off' });
  }

  /**
   * Enable Mirage (lazy loading)
   */
  private async setMirage(zoneId: string, enabled: boolean): Promise<void> {
    await this.updateZoneSetting(zoneId, 'mirage', { value: enabled ? 'on' : 'off' });
  }

  /**
   * Update a zone setting
   */
  private async updateZoneSetting(zoneId: string, setting: string, data: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}/zones/${zoneId}/settings/${setting}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    const result = (await response.json()) as { success: boolean; errors?: unknown[] };
    if (!result.success) {
      console.warn(`[Cloudflare CDN] Warning: Failed to set ${setting}:`, result.errors);
    }
  }

  /**
   * Create page rule for caching Next.js images
   */
  private async createImageCachingRule(zoneId: string, domain: string): Promise<void> {
    // Check if rule already exists
    const existingRules = await fetch(`${this.baseUrl}/zones/${zoneId}/pagerules`, {
      headers: this.getHeaders(),
    });
    const rulesData = (await existingRules.json()) as {
      success: boolean;
      result: Array<{ targets: Array<{ constraint: { value: string } }> }>;
    };

    if (rulesData.success) {
      const hasImageRule = rulesData.result.some((rule) =>
        rule.targets[0]?.constraint?.value?.includes('/_next/image')
      );

      if (hasImageRule) {
        console.log('[Cloudflare CDN] Image caching rule already exists');
        return;
      }
    }

    // Create new page rule for Next.js images
    const pageRuleData = {
      targets: [
        {
          target: 'url',
          constraint: {
            operator: 'matches',
            value: `*${domain}/_next/image*`,
          },
        },
      ],
      actions: [
        {
          id: 'cache_level',
          value: 'cache_everything',
        },
        {
          id: 'edge_cache_ttl',
          value: 31536000, // 1 year
        },
        {
          id: 'browser_cache_ttl',
          value: 31536000, // 1 year
        },
      ],
      status: 'active',
      priority: 1,
    };

    const response = await fetch(`${this.baseUrl}/zones/${zoneId}/pagerules`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(pageRuleData),
    });

    const result = (await response.json()) as { success: boolean; errors?: unknown[] };
    if (result.success) {
      console.log('[Cloudflare CDN] ✓ Image caching rule created');
    } else {
      console.warn('[Cloudflare CDN] Failed to create image caching rule:', result.errors);
    }
  }

  /**
   * Get request headers for Cloudflare API
   */
  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }
}

/**
 * Create Cloudflare CDN service from environment variables
 */
export function createCloudflareCDN(): CloudflareCDNService | null {
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];

  if (!apiToken || !accountId) {
    console.warn('[Cloudflare CDN] API credentials not configured');
    return null;
  }

  return new CloudflareCDNService({ apiToken, accountId });
}
