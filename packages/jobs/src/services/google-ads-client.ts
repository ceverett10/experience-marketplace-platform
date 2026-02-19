/**
 * Google Ads API Client
 *
 * Manages Google Search campaigns for paid traffic acquisition.
 * Uses the Google Ads REST API v23 directly (no npm wrapper needed).
 *
 * Required env vars:
 *   GOOGLE_ADS_DEVELOPER_TOKEN - From Google Ads API Center
 *   GOOGLE_ADS_CLIENT_ID       - OAuth2 client ID
 *   GOOGLE_ADS_CLIENT_SECRET   - OAuth2 client secret
 *   GOOGLE_ADS_REFRESH_TOKEN   - OAuth2 refresh token
 *   GOOGLE_ADS_CUSTOMER_ID     - Account ID (format: 1234567890, no dashes)
 *
 * Docs: https://developers.google.com/google-ads/api/docs/start
 */

const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v23';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string; // Client account for campaign operations
  loginCustomerId?: string; // Manager/MCC account (for login-customer-id header)
}

// Rate limiter: Google Ads allows ~1,500 operations/day for basic access
let _requestTimestamps: number[] = [];
const RATE_LIMIT = 15; // per minute (Google allows ~1,500 ops/day = ~62/hr)
const WINDOW_MS = 60_000;

function getConfig(): GoogleAdsConfig | null {
  const developerToken = process.env['GOOGLE_ADS_DEVELOPER_TOKEN'];
  const clientId = process.env['GOOGLE_ADS_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_ADS_CLIENT_SECRET'];
  const refreshToken = process.env['GOOGLE_ADS_REFRESH_TOKEN'];
  const managerId = process.env['GOOGLE_ADS_CUSTOMER_ID']?.replace(/-/g, '');
  // Use dedicated client account if set, otherwise fall back to CUSTOMER_ID
  const clientCustomerId =
    process.env['GOOGLE_ADS_CLIENT_CUSTOMER_ID']?.replace(/-/g, '') || managerId;

  if (!developerToken || !clientId || !clientSecret || !refreshToken || !clientCustomerId) {
    return null;
  }

  return {
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    customerId: clientCustomerId,
    // Set login-customer-id when using a client account under an MCC
    loginCustomerId: managerId !== clientCustomerId ? managerId : undefined,
  };
}

let _cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(config: GoogleAdsConfig): Promise<string> {
  if (_cachedAccessToken && Date.now() < _cachedAccessToken.expiresAt - 60_000) {
    return _cachedAccessToken.token;
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google OAuth refresh failed: ${error}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  _cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  _requestTimestamps = _requestTimestamps.filter((ts) => now - ts < WINDOW_MS);
  if (_requestTimestamps.length >= RATE_LIMIT) {
    const oldest = _requestTimestamps[0]!;
    const waitMs = WINDOW_MS - (now - oldest) + 100;
    console.log(`[GoogleAds] Rate limit reached, waiting ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  _requestTimestamps.push(Date.now());
}

async function apiRequest(
  config: GoogleAdsConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  await enforceRateLimit();
  const accessToken = await getAccessToken(config);

  const url = `${GOOGLE_ADS_API_BASE}/customers/${config.customerId}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': config.developerToken,
    'Content-Type': 'application/json',
  };
  if (config.loginCustomerId) {
    headers['login-customer-id'] = config.loginCustomerId;
  }

  const response = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Ads API error (${response.status}): ${error.substring(0, 2000)}`);
  }

  return response.json();
}

// --- Public API --------------------------------------------------------------

export function isGoogleAdsConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Create a Search campaign.
 */
export async function createSearchCampaign(campaignConfig: {
  name: string;
  dailyBudgetMicros: number; // Budget in micros (1 GBP = 1,000,000 micros)
  status?: 'ENABLED' | 'PAUSED';
}): Promise<{ campaignId: string; budgetId: string } | null> {
  const config = getConfig();
  if (!config) {
    console.log('[GoogleAds] Not configured, skipping campaign creation');
    return null;
  }

  try {
    // Step 1: Create campaign budget
    const budgetResult = (await apiRequest(config, 'POST', '/campaignBudgets:mutate', {
      operations: [
        {
          create: {
            name: `${campaignConfig.name} Budget ${Date.now()}`,
            amountMicros: (
              Math.ceil(campaignConfig.dailyBudgetMicros / 10_000) * 10_000
            ).toString(),
            deliveryMethod: 'STANDARD',
          },
        },
      ],
    })) as { results: Array<{ resourceName: string }> };

    const budgetResourceName = budgetResult.results[0]?.resourceName;
    if (!budgetResourceName) throw new Error('Failed to create budget');

    // Step 2: Create campaign
    const campaignResult = (await apiRequest(config, 'POST', '/campaigns:mutate', {
      operations: [
        {
          create: {
            name: campaignConfig.name,
            status: campaignConfig.status || 'PAUSED',
            advertisingChannelType: 'SEARCH',
            campaignBudget: budgetResourceName,
            targetSpend: {},
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: false,
              targetContentNetwork: false,
            },
            containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
          },
        },
      ],
    })) as { results: Array<{ resourceName: string }> };

    const campaignResourceName = campaignResult.results[0]?.resourceName;
    if (!campaignResourceName) throw new Error('Failed to create campaign');

    const campaignId = campaignResourceName.split('/').pop()!;
    const budgetId = budgetResourceName.split('/').pop()!;

    console.log(`[GoogleAds] Created search campaign ${campaignId}: "${campaignConfig.name}"`);
    return { campaignId, budgetId };
  } catch (error) {
    console.error('[GoogleAds] Create campaign failed:', error);
    return null;
  }
}

/**
 * Create an ad group with keywords.
 */
export async function createKeywordAdGroup(config_: {
  campaignId: string;
  name: string;
  cpcBidMicros: number;
  keywords: Array<{ text: string; matchType: 'EXACT' | 'PHRASE' | 'BROAD' }>;
}): Promise<{ adGroupId: string } | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const campaignResourceName = `customers/${config.customerId}/campaigns/${config_.campaignId}`;

    // Create ad group
    const agResult = (await apiRequest(config, 'POST', '/adGroups:mutate', {
      operations: [
        {
          create: {
            name: config_.name,
            campaign: campaignResourceName,
            status: 'ENABLED',
            cpcBidMicros: (Math.ceil(config_.cpcBidMicros / 10_000) * 10_000).toString(),
            type: 'SEARCH_STANDARD',
          },
        },
      ],
    })) as { results: Array<{ resourceName: string }> };

    const adGroupResourceName = agResult.results[0]?.resourceName;
    if (!adGroupResourceName) throw new Error('Failed to create ad group');

    // Add keywords
    if (config_.keywords.length > 0) {
      const keywordOps = config_.keywords.map((kw) => ({
        create: {
          adGroup: adGroupResourceName,
          status: 'ENABLED',
          keyword: {
            text: kw.text,
            matchType: kw.matchType,
          },
        },
      }));

      await apiRequest(config, 'POST', '/adGroupCriteria:mutate', {
        operations: keywordOps,
      });
    }

    const adGroupId = adGroupResourceName.split('/').pop()!;
    console.log(
      `[GoogleAds] Created ad group ${adGroupId} with ${config_.keywords.length} keywords`
    );
    return { adGroupId };
  } catch (error) {
    console.error('[GoogleAds] Create ad group failed:', error);
    return null;
  }
}

/**
 * Create a responsive search ad.
 */
export async function createResponsiveSearchAd(config_: {
  adGroupId: string;
  headlines: string[]; // 3-15 headlines, max 30 chars each
  descriptions: string[]; // 2-4 descriptions, max 90 chars each
  finalUrl: string;
  path1?: string; // Display URL path, max 15 chars
  path2?: string;
}): Promise<{ adId: string } | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const adGroupResourceName = `customers/${config.customerId}/adGroups/${config_.adGroupId}`;

    const result = (await apiRequest(config, 'POST', '/adGroupAds:mutate', {
      operations: [
        {
          create: {
            adGroup: adGroupResourceName,
            status: 'ENABLED',
            ad: {
              responsiveSearchAd: {
                headlines: config_.headlines.map((h) => ({ text: h })),
                descriptions: config_.descriptions.map((d) => ({ text: d })),
                path1: config_.path1,
                path2: config_.path2,
              },
              finalUrls: [config_.finalUrl],
            },
          },
        },
      ],
    })) as { results: Array<{ resourceName: string }> };

    const adResourceName = result.results[0]?.resourceName;
    const adId = adResourceName?.split('/').pop() || '';
    console.log(`[GoogleAds] Created responsive search ad ${adId}`);
    return { adId };
  } catch (error) {
    console.error('[GoogleAds] Create RSA failed:', error);
    return null;
  }
}

/**
 * Get campaign performance metrics via Google Ads Query Language (GAQL).
 */
export async function getCampaignPerformance(
  campaignId: string,
  dateRange?: { startDate: string; endDate: string }
): Promise<{
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  avgCpc: number;
} | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const dateFilter = dateRange
      ? `AND segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'`
      : `AND segments.date DURING LAST_30_DAYS`;

    const query = `
      SELECT
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions,
        metrics.average_cpc
      FROM campaign
      WHERE campaign.id = ${campaignId}
      ${dateFilter}
    `.trim();

    const result = (await apiRequest(config, 'POST', '/googleAds:searchStream', {
      query,
    })) as Array<{
      results: Array<{
        metrics: {
          costMicros: string;
          clicks: string;
          impressions: string;
          conversions: string;
          averageCpc: string;
        };
      }>;
    }>;

    if (!result[0]?.results?.length) return null;

    // Aggregate all rows
    let totalSpendMicros = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalConversions = 0;

    for (const batch of result) {
      for (const row of batch.results) {
        totalSpendMicros += parseInt(row.metrics.costMicros || '0');
        totalClicks += parseInt(row.metrics.clicks || '0');
        totalImpressions += parseInt(row.metrics.impressions || '0');
        totalConversions += parseFloat(row.metrics.conversions || '0');
      }
    }

    return {
      spend: totalSpendMicros / 1_000_000,
      clicks: totalClicks,
      impressions: totalImpressions,
      conversions: Math.round(totalConversions),
      avgCpc: totalClicks > 0 ? totalSpendMicros / totalClicks / 1_000_000 : 0,
    };
  } catch (error) {
    console.error('[GoogleAds] Get performance failed:', error);
    return null;
  }
}

/**
 * Pause or enable a campaign.
 */
export async function setCampaignStatus(
  campaignId: string,
  status: 'ENABLED' | 'PAUSED'
): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  try {
    const resourceName = `customers/${config.customerId}/campaigns/${campaignId}`;
    await apiRequest(config, 'POST', '/campaigns:mutate', {
      operations: [
        {
          update: { resourceName, status },
          updateMask: 'status',
        },
      ],
    });
    return true;
  } catch (error) {
    console.error('[GoogleAds] Set campaign status failed:', error);
    return false;
  }
}

/**
 * List all active conversion actions in the customer account.
 * Uses GAQL to query the conversion_action resource.
 */
export async function listConversionActions(): Promise<
  Array<{
    id: string;
    resourceName: string;
    name: string;
    type: string;
    status: string;
  }>
> {
  const config = getConfig();
  if (!config) return [];

  try {
    const query = `
      SELECT
        conversion_action.id,
        conversion_action.resource_name,
        conversion_action.name,
        conversion_action.type,
        conversion_action.status
      FROM conversion_action
      WHERE conversion_action.status != 'REMOVED'
    `.trim();

    const result = (await apiRequest(config, 'POST', '/googleAds:searchStream', {
      query,
    })) as Array<{
      results: Array<{
        conversionAction: {
          id: string;
          resourceName: string;
          name: string;
          type: string;
          status: string;
        };
      }>;
    }>;

    const actions: Array<{
      id: string;
      resourceName: string;
      name: string;
      type: string;
      status: string;
    }> = [];

    for (const batch of result) {
      for (const row of batch.results) {
        actions.push({
          id: row.conversionAction.id,
          resourceName: row.conversionAction.resourceName,
          name: row.conversionAction.name,
          type: row.conversionAction.type,
          status: row.conversionAction.status,
        });
      }
    }

    console.log(`[GoogleAds] Found ${actions.length} conversion actions`);
    return actions;
  } catch (error) {
    console.error('[GoogleAds] List conversion actions failed:', error);
    return [];
  }
}

/**
 * Update keyword bids in an ad group.
 */
export async function updateKeywordBids(
  keywordBids: Array<{ criterionId: string; adGroupId: string; cpcBidMicros: number }>
): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  try {
    const operations = keywordBids.map((kb) => ({
      update: {
        resourceName: `customers/${config.customerId}/adGroupCriteria/${kb.adGroupId}~${kb.criterionId}`,
        cpcBidMicros: (Math.ceil(kb.cpcBidMicros / 10_000) * 10_000).toString(),
      },
      updateMask: 'cpcBidMicros',
    }));

    await apiRequest(config, 'POST', '/adGroupCriteria:mutate', { operations });
    return true;
  } catch (error) {
    console.error('[GoogleAds] Update keyword bids failed:', error);
    return false;
  }
}

/**
 * Task 4.9: Migrate a campaign from MANUAL_CPC to TARGET_ROAS bidding.
 * Should only be called after a campaign has 15+ conversions.
 * @param campaignId Google Ads campaign ID
 * @param targetRoas Target ROAS value (e.g. 2.0 = 200% return)
 */
export async function migrateToSmartBidding(
  campaignId: string,
  targetRoas: number = 2.0
): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  try {
    await apiRequest(config, 'POST', '/campaigns:mutate', {
      operations: [
        {
          update: {
            resourceName: `customers/${config.customerId}/campaigns/${campaignId}`,
            biddingStrategyType: 'TARGET_ROAS',
            targetRoas: {
              targetRoas: targetRoas,
            },
          },
          updateMask: 'biddingStrategyType,targetRoas.targetRoas',
        },
      ],
    });

    console.log(
      `[GoogleAds] Migrated campaign ${campaignId} to TARGET_ROAS (target: ${targetRoas})`
    );
    return true;
  } catch (error) {
    console.error(`[GoogleAds] Smart Bidding migration failed for ${campaignId}:`, error);
    return false;
  }
}
