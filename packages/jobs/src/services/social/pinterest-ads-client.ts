/**
 * Pinterest Ads API v5 Client
 *
 * Provides keyword bid estimates and search volume data from Pinterest's advertising platform.
 * Used by the paid keyword scanner to discover cross-platform CPC opportunities.
 *
 * Docs: https://developers.pinterest.com/docs/api/v5/
 */

// Use sandbox API while app is in Trial mode; switch to production once approved
const PINTEREST_API_BASE =
  process.env['PINTEREST_USE_SANDBOX'] === 'true'
    ? 'https://api-sandbox.pinterest.com'
    : 'https://api.pinterest.com';

export interface PinterestKeywordMetric {
  keyword: string;
  bidMin: number; // dollars (normalized from micros)
  bidMax: number;
  bidSuggested: number;
  monthlySearches: number;
  competition: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Client for Pinterest Ads API keyword metrics.
 * Retrieves bid estimates and search volume for keywords on the Pinterest platform.
 */
export class PinterestAdsClient {
  private readonly accessToken: string;
  private readonly adAccountId: string;

  // Sliding-window rate limiter (10 req/min, conservative)
  private static requestTimestamps: number[] = [];
  private static readonly RATE_LIMIT = 10;
  private static readonly WINDOW_MS = 60_000;

  constructor(config: { accessToken: string; adAccountId: string }) {
    this.accessToken = config.accessToken;
    this.adAccountId = config.adAccountId;
  }

  /**
   * Get keyword metrics (bid estimates + search volume) from Pinterest Ads API.
   * Batches keywords internally — pass up to 100 at once.
   *
   * Endpoint: POST /v5/ad_accounts/{ad_account_id}/keywords/metrics
   */
  async getKeywordMetrics(
    keywords: string[],
    country: string = 'GB'
  ): Promise<PinterestKeywordMetric[]> {
    if (keywords.length === 0) return [];

    const results: PinterestKeywordMetric[] = [];
    const batchSize = 5; // Pinterest limits keywords per request

    for (let i = 0; i < keywords.length; i += batchSize) {
      const batch = keywords.slice(i, i + batchSize);

      try {
        await this.enforceRateLimit();

        const response = await fetch(
          `${PINTEREST_API_BASE}/v5/ad_accounts/${this.adAccountId}/keywords/metrics?` +
            new URLSearchParams({
              country,
              keywords: batch.join(','),
            }),
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `[PinterestAds] API error (${response.status}): ${errorText.substring(0, 200)}`
          );
          // Throw on auth errors so the scanner can detect persistent failures
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Pinterest Ads API auth error (${response.status}): ${errorText.substring(0, 200)}`);
          }
          continue; // Skip this batch, try next
        }

        const data = (await response.json()) as {
          items?: Array<{
            keyword: string;
            metrics?: {
              bid_price_in_micro_currency?: number;
              min_bid_price_in_micro_currency?: number;
              max_bid_price_in_micro_currency?: number;
              monthly_search_volume?: number;
              overall_competition?: string;
            };
          }>;
        };

        if (data.items) {
          for (const item of data.items) {
            const metrics = item.metrics;
            if (!metrics) continue;

            // Convert from micros (1/1,000,000 dollar) to dollars
            const microToDollar = (micros: number | undefined) =>
              micros ? micros / 1_000_000 : 0;

            results.push({
              keyword: item.keyword,
              bidMin: microToDollar(metrics.min_bid_price_in_micro_currency),
              bidMax: microToDollar(metrics.max_bid_price_in_micro_currency),
              bidSuggested: microToDollar(metrics.bid_price_in_micro_currency),
              monthlySearches: metrics.monthly_search_volume ?? 0,
              competition: normalizeCompetition(metrics.overall_competition),
            });
          }
        }
      } catch (error) {
        console.error(`[PinterestAds] Batch failed for keywords: ${batch.join(', ')}`, error);
      }
    }

    return results;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    // Remove timestamps outside the window
    PinterestAdsClient.requestTimestamps = PinterestAdsClient.requestTimestamps.filter(
      (ts) => now - ts < PinterestAdsClient.WINDOW_MS
    );

    if (PinterestAdsClient.requestTimestamps.length >= PinterestAdsClient.RATE_LIMIT) {
      const oldestInWindow = PinterestAdsClient.requestTimestamps[0]!;
      const waitMs = PinterestAdsClient.WINDOW_MS - (now - oldestInWindow) + 100;
      console.log(`[PinterestAds] Rate limit reached, waiting ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    PinterestAdsClient.requestTimestamps.push(Date.now());
  }
}

function normalizeCompetition(
  value: string | undefined
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (!value) return 'MEDIUM';
  const upper = value.toUpperCase();
  if (upper === 'LOW' || upper === 'MEDIUM' || upper === 'HIGH') {
    return upper;
  }
  return 'MEDIUM';
}
