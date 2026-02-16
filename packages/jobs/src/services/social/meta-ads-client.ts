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
        // Throw on auth errors so the scanner can detect persistent failures
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `Meta Ads API auth error (${response.status}): ${errorText.substring(0, 200)}`
          );
        }
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
      const centsToDollars = (cents: number | undefined) => (cents ? cents / 100 : 0);

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

  // =========================================================================
  // Campaign Management (CRUD)
  // =========================================================================

  /**
   * Create a campaign in the ad account.
   * Docs: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
   */
  async createCampaign(config: {
    name: string;
    objective?: string;
    dailyBudget: number; // In account currency (e.g., GBP pennies)
    status?: 'ACTIVE' | 'PAUSED';
    specialAdCategories?: string[];
  }): Promise<{ campaignId: string } | null> {
    try {
      await this.enforceRateLimit();

      const params = new URLSearchParams({
        name: config.name,
        objective: config.objective || 'OUTCOME_TRAFFIC',
        daily_budget: Math.round(config.dailyBudget * 100).toString(), // Convert to pennies/cents
        status: config.status || 'PAUSED',
        special_ad_categories: JSON.stringify(config.specialAdCategories || []),
        is_adset_budget_sharing_enabled: 'false',
        access_token: this.accessToken,
      });

      const response = await fetch(`${META_API_BASE}/${this.adAccountId}/campaigns`, {
        method: 'POST',
        body: params,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(
          `[MetaAds] Create campaign error (${response.status}): ${error.substring(0, 300)}`
        );
        return null;
      }

      const data = (await response.json()) as { id: string };
      console.log(`[MetaAds] Created campaign ${data.id}: "${config.name}"`);
      return { campaignId: data.id };
    } catch (error) {
      console.error('[MetaAds] Create campaign failed:', error);
      return null;
    }
  }

  /**
   * Create an ad set with interest targeting and bid control.
   * Docs: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
   */
  async createAdSet(config: {
    campaignId: string;
    name: string;
    dailyBudget?: number; // Optional — omit when using Campaign Budget Optimization (CBO)
    bidAmount: number; // Max CPC bid in account currency
    targeting: {
      countries: string[];
      interests?: Array<{ id: string; name: string }>;
      ageMin?: number;
      ageMax?: number;
    };
    optimizationGoal?: string;
    billingEvent?: string;
    status?: 'ACTIVE' | 'PAUSED';
  }): Promise<{ adSetId: string } | null> {
    try {
      await this.enforceRateLimit();

      const targetingSpec: Record<string, unknown> = {
        geo_locations: { countries: config.targeting.countries },
      };
      if (config.targeting.interests?.length) {
        targetingSpec['flexible_spec'] = [
          { interests: config.targeting.interests.map((i) => ({ id: i.id, name: i.name })) },
        ];
      }
      if (config.targeting.ageMin) targetingSpec['age_min'] = config.targeting.ageMin;
      if (config.targeting.ageMax) targetingSpec['age_max'] = config.targeting.ageMax;

      const params = new URLSearchParams({
        name: config.name,
        campaign_id: config.campaignId,
        bid_amount: Math.round(config.bidAmount * 100).toString(),
        billing_event: config.billingEvent || 'LINK_CLICKS',
        optimization_goal: config.optimizationGoal || 'LINK_CLICKS',
        targeting: JSON.stringify(targetingSpec),
        status: config.status || 'PAUSED',
        access_token: this.accessToken,
      });
      // Only set ad set budget if not using Campaign Budget Optimization (CBO)
      if (config.dailyBudget != null) {
        params.set('daily_budget', Math.round(config.dailyBudget * 100).toString());
      }

      const response = await fetch(`${META_API_BASE}/${this.adAccountId}/adsets`, {
        method: 'POST',
        body: params,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(
          `[MetaAds] Create ad set error (${response.status}): ${error.substring(0, 300)}`
        );
        return null;
      }

      const data = (await response.json()) as { id: string };
      console.log(`[MetaAds] Created ad set ${data.id}: "${config.name}"`);
      return { adSetId: data.id };
    } catch (error) {
      console.error('[MetaAds] Create ad set failed:', error);
      return null;
    }
  }

  /**
   * Create an ad (creative + placement) within an ad set.
   * Uses a link ad with image for driving traffic to a landing page.
   */
  async createAd(config: {
    adSetId: string;
    name: string;
    pageId: string; // Facebook Page ID
    linkUrl: string;
    headline: string;
    body: string;
    imageUrl?: string;
    callToAction?: string;
    status?: 'ACTIVE' | 'PAUSED';
  }): Promise<{ adId: string } | null> {
    try {
      await this.enforceRateLimit();

      const creative: Record<string, unknown> = {
        object_story_spec: {
          page_id: config.pageId,
          link_data: {
            link: config.linkUrl,
            message: config.body,
            name: config.headline,
            call_to_action: {
              type: config.callToAction || 'LEARN_MORE',
            },
            ...(config.imageUrl ? { picture: config.imageUrl } : {}),
          },
        },
      };

      const params = new URLSearchParams({
        name: config.name,
        adset_id: config.adSetId,
        creative: JSON.stringify(creative),
        status: config.status || 'PAUSED',
        access_token: this.accessToken,
      });

      const response = await fetch(`${META_API_BASE}/${this.adAccountId}/ads`, {
        method: 'POST',
        body: params,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[MetaAds] Create ad error (${response.status}): ${error.substring(0, 300)}`);
        return null;
      }

      const data = (await response.json()) as { id: string };
      console.log(`[MetaAds] Created ad ${data.id}: "${config.name}"`);
      return { adId: data.id };
    } catch (error) {
      console.error('[MetaAds] Create ad failed:', error);
      return null;
    }
  }

  /**
   * Update bid amount on an ad set.
   */
  async updateBid(adSetId: string, newBidAmount: number): Promise<boolean> {
    try {
      await this.enforceRateLimit();

      const params = new URLSearchParams({
        bid_amount: Math.round(newBidAmount * 100).toString(),
        access_token: this.accessToken,
      });

      const response = await fetch(`${META_API_BASE}/${adSetId}`, {
        method: 'POST',
        body: params,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(
          `[MetaAds] Update bid error (${response.status}): ${error.substring(0, 200)}`
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error('[MetaAds] Update bid failed:', error);
      return false;
    }
  }

  /**
   * Pause or resume a campaign.
   */
  async setCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<boolean> {
    try {
      await this.enforceRateLimit();

      const params = new URLSearchParams({
        status,
        access_token: this.accessToken,
      });

      const response = await fetch(`${META_API_BASE}/${campaignId}`, {
        method: 'POST',
        body: params,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(
          `[MetaAds] Set status error (${response.status}): ${error.substring(0, 200)}`
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error('[MetaAds] Set campaign status failed:', error);
      return false;
    }
  }

  /**
   * Get campaign performance insights.
   * Returns spend, clicks, impressions, CPC, CPM, reach, actions.
   */
  async getCampaignInsights(
    campaignId: string,
    dateRange?: { since: string; until: string }
  ): Promise<{
    spend: number;
    clicks: number;
    impressions: number;
    cpc: number;
    cpm: number;
    reach: number;
    actions: number;
  } | null> {
    try {
      await this.enforceRateLimit();

      const params = new URLSearchParams({
        fields: 'spend,clicks,impressions,cpc,cpm,reach,actions',
        access_token: this.accessToken,
      });

      if (dateRange) {
        params.set('time_range', JSON.stringify(dateRange));
      }

      const response = await fetch(`${META_API_BASE}/${campaignId}/insights?${params}`);

      if (!response.ok) {
        const error = await response.text();
        console.error(`[MetaAds] Insights error (${response.status}): ${error.substring(0, 200)}`);
        return null;
      }

      const data = (await response.json()) as {
        data?: Array<{
          spend?: string;
          clicks?: string;
          impressions?: string;
          cpc?: string;
          cpm?: string;
          reach?: string;
          actions?: Array<{ action_type: string; value: string }>;
        }>;
      };

      if (!data.data || data.data.length === 0) return null;

      const row = data.data[0]!;
      const linkClicks = row.actions?.find((a) => a.action_type === 'link_click');

      return {
        spend: parseFloat(row.spend || '0'),
        clicks: parseInt(row.clicks || '0'),
        impressions: parseInt(row.impressions || '0'),
        cpc: parseFloat(row.cpc || '0'),
        cpm: parseFloat(row.cpm || '0'),
        reach: parseInt(row.reach || '0'),
        actions: linkClicks ? parseInt(linkClicks.value) : parseInt(row.clicks || '0'),
      };
    } catch (error) {
      console.error('[MetaAds] Get insights failed:', error);
      return null;
    }
  }

  /**
   * List all campaigns in the ad account with basic metrics.
   */
  async listCampaigns(status?: 'ACTIVE' | 'PAUSED'): Promise<
    Array<{
      id: string;
      name: string;
      status: string;
      dailyBudget: number;
    }>
  > {
    try {
      await this.enforceRateLimit();

      const params = new URLSearchParams({
        fields: 'id,name,status,daily_budget',
        access_token: this.accessToken,
        limit: '100',
      });

      if (status) {
        params.set('effective_status', JSON.stringify([status]));
      }

      const response = await fetch(`${META_API_BASE}/${this.adAccountId}/campaigns?${params}`);

      if (!response.ok) {
        const error = await response.text();
        console.error(
          `[MetaAds] List campaigns error (${response.status}): ${error.substring(0, 200)}`
        );
        return [];
      }

      const data = (await response.json()) as {
        data?: Array<{ id: string; name: string; status: string; daily_budget: string }>;
      };

      return (data.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        dailyBudget: parseInt(c.daily_budget || '0') / 100,
      }));
    } catch (error) {
      console.error('[MetaAds] List campaigns failed:', error);
      return [];
    }
  }

  /**
   * List all pixels in the ad account.
   * Endpoint: GET /{ad_account_id}/adspixels
   */
  async getAdPixels(): Promise<
    Array<{
      id: string;
      name: string;
      creationTime: string;
      lastFiredTime: string | null;
    }>
  > {
    try {
      await this.enforceRateLimit();

      const params = new URLSearchParams({
        fields: 'id,name,creation_time,last_fired_time',
        access_token: this.accessToken,
        limit: '100',
      });

      const response = await fetch(`${META_API_BASE}/${this.adAccountId}/adspixels?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[MetaAds] Get pixels error (${response.status}): ${errorText.substring(0, 200)}`
        );
        return [];
      }

      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          name: string;
          creation_time?: string;
          last_fired_time?: string;
        }>;
      };

      return (data.data || []).map((pixel) => ({
        id: pixel.id,
        name: pixel.name,
        creationTime: pixel.creation_time || '',
        lastFiredTime: pixel.last_fired_time || null,
      }));
    } catch (error) {
      console.error('[MetaAds] Get pixels failed:', error);
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
