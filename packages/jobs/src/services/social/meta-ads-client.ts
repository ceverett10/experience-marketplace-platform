/**
 * Meta Marketing API Client
 *
 * Provides interest-based audience discovery and delivery/bid estimates from Meta's advertising platform.
 * Used by the paid keyword scanner to discover cross-platform CPC opportunities.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/
 */

const META_API_BASE = 'https://graph.facebook.com/v18.0';

export interface MetaAdInterest {
  id: string;
  name: string;
  audienceSize: number;
  audienceSizeUpper: number;
  topic: string;
  path: string[];
}

export interface MetaDeliveryEstimate {
  interestId: string;
  interestName: string;
  dailyReach: { lower: number; upper: number };
  suggestedBid: { min: number; max: number; median: number };
  estimatedCpc: number; // dollars
  audienceSize: number;
}

/**
 * Client for Meta Marketing API interest targeting and delivery estimates.
 * Discovers targetable audiences and CPC estimates for paid traffic acquisition.
 */
export class MetaAdsClient {
  private readonly accessToken: string;
  private readonly adAccountId: string; // Format: act_XXXXXXXXXX

  // Stricter rate limiter: Meta enforces 200 calls/hour with burst protection
  private static requestTimestamps: number[] = [];
  private static readonly RATE_LIMIT = 3; // per minute (conservative)
  private static readonly WINDOW_MS = 60_000;

  constructor(config: { accessToken: string; adAccountId: string }) {
    this.accessToken = config.accessToken;
    // Ensure act_ prefix
    this.adAccountId = config.adAccountId.startsWith('act_')
      ? config.adAccountId
      : `act_${config.adAccountId}`;
  }

  /**
   * Search for targetable interests related to a keyword.
   * Endpoint: GET /search?type=adinterest&q={keyword}
   */
  async searchInterests(keyword: string): Promise<MetaAdInterest[]> {
    try {
      await this.enforceRateLimit();

      const params = new URLSearchParams({
        type: 'adinterest',
        q: keyword,
        access_token: this.accessToken,
      });

      const response = await fetch(`${META_API_BASE}/search?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[MetaAds] Interest search error (${response.status}): ${errorText.substring(0, 200)}`
        );
        return [];
      }

      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          name: string;
          audience_size_lower_bound?: number;
          audience_size_upper_bound?: number;
          topic?: string;
          path?: string[];
        }>;
      };

      if (!data.data) return [];

      return data.data.map((interest) => ({
        id: interest.id,
        name: interest.name,
        audienceSize: interest.audience_size_lower_bound ?? 0,
        audienceSizeUpper: interest.audience_size_upper_bound ?? 0,
        topic: interest.topic ?? '',
        path: interest.path ?? [],
      }));
    } catch (error) {
      console.error(`[MetaAds] Interest search failed for "${keyword}":`, error);
      return [];
    }
  }

  /**
   * Get delivery estimates (bid ranges, reach) for interest-based audiences.
   * Endpoint: GET /act_{ad_account_id}/delivery_estimate
   *
   * Returns estimated CPC and audience reach for the given interest targeting.
   */
  async getDeliveryEstimate(
    interests: Array<{ id: string; name: string }>,
    optimizationGoal: string = 'LINK_CLICKS',
    country: string = 'GB'
  ): Promise<MetaDeliveryEstimate[]> {
    if (interests.length === 0) return [];

    try {
      await this.enforceRateLimit();

      const targetingSpec = JSON.stringify({
        geo_locations: { countries: [country] },
        flexible_spec: [
          {
            interests: interests.map((i) => ({ id: i.id, name: i.name })),
          },
        ],
      });

      const params = new URLSearchParams({
        optimization_goal: optimizationGoal,
        targeting_spec: targetingSpec,
        access_token: this.accessToken,
      });

      const response = await fetch(
        `${META_API_BASE}/${this.adAccountId}/delivery_estimate?${params}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[MetaAds] Delivery estimate error (${response.status}): ${errorText.substring(0, 200)}`
        );
        return [];
      }

      const data = (await response.json()) as {
        data?: Array<{
          daily_outcomes_curve?: Array<{
            reach: number;
            actions: number;
            spend: number;
          }>;
          estimate_dau?: number;
          estimate_mau_lower_bound?: number;
          estimate_mau_upper_bound?: number;
          bid_estimate?: {
            min_bid?: number;
            max_bid?: number;
            median_bid?: number;
          };
        }>;
      };

      if (!data.data || data.data.length === 0) return [];

      const estimate = data.data[0]!;
      const bidEst = estimate.bid_estimate;

      // Convert from cents to dollars
      const centsToDollars = (cents: number | undefined) =>
        cents ? cents / 100 : 0;

      const minBid = centsToDollars(bidEst?.min_bid);
      const maxBid = centsToDollars(bidEst?.max_bid);
      const medianBid = centsToDollars(bidEst?.median_bid);

      // Calculate estimated CPC from daily outcomes curve if available
      let estimatedCpc = medianBid;
      const curve = estimate.daily_outcomes_curve;
      if (curve && curve.length > 0) {
        // Use mid-point of curve for realistic CPC
        const midPoint = curve[Math.floor(curve.length / 2)];
        if (midPoint && midPoint.actions > 0) {
          estimatedCpc = midPoint.spend / midPoint.actions;
        }
      }

      const audienceSize = estimate.estimate_mau_upper_bound ?? estimate.estimate_dau ?? 0;

      // Return one estimate per interest (they share the same delivery estimate when grouped)
      return interests.map((interest) => ({
        interestId: interest.id,
        interestName: interest.name,
        dailyReach: {
          lower: estimate.estimate_mau_lower_bound ?? 0,
          upper: estimate.estimate_mau_upper_bound ?? 0,
        },
        suggestedBid: { min: minBid, max: maxBid, median: medianBid },
        estimatedCpc,
        audienceSize,
      }));
    } catch (error) {
      console.error(`[MetaAds] Delivery estimate failed:`, error);
      return [];
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    MetaAdsClient.requestTimestamps = MetaAdsClient.requestTimestamps.filter(
      (ts) => now - ts < MetaAdsClient.WINDOW_MS
    );

    if (MetaAdsClient.requestTimestamps.length >= MetaAdsClient.RATE_LIMIT) {
      const oldestInWindow = MetaAdsClient.requestTimestamps[0]!;
      const waitMs = MetaAdsClient.WINDOW_MS - (now - oldestInWindow) + 100;
      console.log(`[MetaAds] Rate limit reached, waiting ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    MetaAdsClient.requestTimestamps.push(Date.now());
  }
}
