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

// Rate limiter: Google Ads API allows ~1,500 req/min for basic access.
// The daily operations limit is separate and much higher (~15,000+).
let _requestTimestamps: number[] = [];
const RATE_LIMIT = 50; // per minute — well within Google's per-minute burst limit
const WINDOW_MS = 60_000;

export function getConfig(): GoogleAdsConfig | null {
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

export async function apiRequest(
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

/**
 * Safely parse a searchStream response.
 * The API returns an array of batch objects, but batches may have no `results`
 * field when there are zero rows. This helper normalises the response into a
 * flat array of result rows.
 */
export function flattenStreamResults<T>(response: unknown): T[] {
  const batches = Array.isArray(response) ? response : [response];
  const rows: T[] = [];
  for (const batch of batches) {
    if (batch && Array.isArray((batch as { results?: unknown }).results)) {
      rows.push(...(batch as { results: T[] }).results);
    }
  }
  return rows;
}

// --- Helpers -----------------------------------------------------------------

/** Ensure a URL has a protocol prefix so Google Ads API doesn't reject it. */
function ensureProtocol(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

// --- Public API --------------------------------------------------------------

export function isGoogleAdsConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Find all existing campaigns by name (for handling duplicates).
 * Only finds ENABLED or PAUSED campaigns (REMOVED ones don't cause conflicts).
 */
async function findCampaignsByName(config: GoogleAdsConfig, name: string): Promise<string[]> {
  try {
    const escapedName = name.replace(/'/g, "\\'");
    const result = (await apiRequest(config, 'POST', '/googleAds:search', {
      query: `SELECT campaign.id FROM campaign WHERE campaign.name = '${escapedName}' AND campaign.status != 'REMOVED'`,
    })) as { results?: Array<{ campaign: { id: string } }> };

    return (result.results ?? []).map((r) => r.campaign.id);
  } catch {
    return [];
  }
}

/**
 * Remove a campaign from Google Ads (sets status to REMOVED).
 * Public wrapper that gets config automatically.
 */
export async function removeGoogleCampaign(campaignId: string): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;
  return removeCampaign(config, campaignId);
}

/**
 * Remove a campaign from Google Ads (sets status to REMOVED).
 * Uses the remove operation, not a status update.
 */
async function removeCampaign(config: GoogleAdsConfig, campaignId: string): Promise<boolean> {
  try {
    const resourceName = `customers/${config.customerId}/campaigns/${campaignId}`;
    await apiRequest(config, 'POST', '/campaigns:mutate', {
      operations: [{ remove: resourceName }],
    });
    return true;
  } catch (error) {
    console.error(`[GoogleAds] Remove campaign ${campaignId} failed:`, error);
    return false;
  }
}

/**
 * Create a Search campaign.
 * Handles DUPLICATE_CAMPAIGN_NAME by removing the orphaned campaign and retrying.
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

  // Inner function for the actual creation
  const attemptCreate = async (name: string) => {
    // Step 1: Create campaign budget
    const budgetResult = (await apiRequest(config, 'POST', '/campaignBudgets:mutate', {
      operations: [
        {
          create: {
            name: `${name} Budget ${Date.now()}`,
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
            name,
            status: campaignConfig.status || 'PAUSED',
            advertisingChannelType: 'SEARCH',
            campaignBudget: budgetResourceName,
            manualCpc: { enhancedCpcEnabled: false },
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
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
    return { campaignId, budgetId };
  };

  try {
    const result = await attemptCreate(campaignConfig.name);
    console.log(
      `[GoogleAds] Created search campaign ${result.campaignId}: "${campaignConfig.name}"`
    );
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Handle DUPLICATE_CAMPAIGN_NAME: remove the orphan and retry
    if (errorMsg.includes('DUPLICATE_CAMPAIGN_NAME')) {
      console.warn(
        `[GoogleAds] Duplicate campaign name "${campaignConfig.name}", removing orphan and retrying`
      );
      const existingIds = await findCampaignsByName(config, campaignConfig.name);
      for (const existingId of existingIds) {
        const removed = await removeCampaign(config, existingId);
        if (removed) console.info(`[GoogleAds] Removed orphaned campaign ${existingId}`);
      }
      try {
        const result = await attemptCreate(campaignConfig.name);
        console.log(
          `[GoogleAds] Created search campaign ${result.campaignId}: "${campaignConfig.name}" (after removing orphan)`
        );
        return result;
      } catch (retryError) {
        console.error('[GoogleAds] Create campaign failed on retry:', retryError);
        return null;
      }
    }

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

  // Ensure finalUrl has protocol — some DB records have bare domains
  const finalUrl = ensureProtocol(config_.finalUrl);

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
              finalUrls: [finalUrl],
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

    const raw = await apiRequest(config, 'POST', '/googleAds:searchStream', { query });
    const rows = flattenStreamResults<{
      metrics: {
        costMicros: string;
        clicks: string;
        impressions: string;
        conversions: string;
        averageCpc: string;
      };
    }>(raw);

    if (rows.length === 0) return null;

    // Aggregate all rows
    let totalSpendMicros = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalConversions = 0;

    for (const row of rows) {
      totalSpendMicros += parseInt(row.metrics.costMicros || '0');
      totalClicks += parseInt(row.metrics.clicks || '0');
      totalImpressions += parseInt(row.metrics.impressions || '0');
      totalConversions += parseFloat(row.metrics.conversions || '0');
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

    const raw = await apiRequest(config, 'POST', '/googleAds:searchStream', { query });
    const rows = flattenStreamResults<{
      conversionAction: {
        id: string;
        resourceName: string;
        name: string;
        type: string;
        status: string;
      };
    }>(raw);

    const actions = rows.map((row) => ({
      id: row.conversionAction.id,
      resourceName: row.conversionAction.resourceName,
      name: row.conversionAction.name,
      type: row.conversionAction.type,
      status: row.conversionAction.status,
    }));

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

/**
 * Add campaign-level negative keywords.
 * Uses BROAD match type for widest exclusion coverage.
 * Batches in chunks of 1000 (API limit per mutate call).
 */
export async function addCampaignNegativeKeywords(
  campaignId: string,
  keywords: string[]
): Promise<number> {
  const config = getConfig();
  if (!config || keywords.length === 0) return 0;

  const campaignResourceName = `customers/${config.customerId}/campaigns/${campaignId}`;
  const BATCH_SIZE = 1000;
  let totalAdded = 0;

  try {
    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
      const batch = keywords.slice(i, i + BATCH_SIZE);
      const operations = batch.map((kw) => ({
        create: {
          campaign: campaignResourceName,
          negative: true,
          keyword: {
            text: kw,
            matchType: 'BROAD',
          },
        },
      }));

      await apiRequest(config, 'POST', '/campaignCriteria:mutate', { operations });
      totalAdded += batch.length;
    }

    console.log(`[GoogleAds] Added ${totalAdded} negative keywords to campaign ${campaignId}`);
    return totalAdded;
  } catch (error) {
    console.error(`[GoogleAds] Add negative keywords failed for campaign ${campaignId}:`, error);
    return totalAdded;
  }
}

/**
 * Get search term report for a campaign.
 * Returns actual queries that triggered ads with performance metrics.
 */
export async function getSearchTermReport(
  campaignId: string,
  dateRange?: { startDate: string; endDate: string }
): Promise<
  Array<{
    searchTerm: string;
    clicks: number;
    impressions: number;
    costMicros: number;
    conversions: number;
  }>
> {
  const config = getConfig();
  if (!config) return [];

  try {
    const dateFilter = dateRange
      ? `AND segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'`
      : `AND segments.date DURING LAST_30_DAYS`;

    const query = `
      SELECT
        search_term_view.search_term,
        metrics.clicks,
        metrics.impressions,
        metrics.cost_micros,
        metrics.conversions
      FROM search_term_view
      WHERE campaign.id = ${campaignId}
      ${dateFilter}
      ORDER BY metrics.cost_micros DESC
      LIMIT 1000
    `.trim();

    const raw = await apiRequest(config, 'POST', '/googleAds:searchStream', { query });
    const rows = flattenStreamResults<{
      searchTermView: { searchTerm: string };
      metrics: {
        clicks: string;
        impressions: string;
        costMicros: string;
        conversions: string;
      };
    }>(raw);
    return rows.map((row) => ({
      searchTerm: row.searchTermView.searchTerm,
      clicks: parseInt(row.metrics.clicks || '0'),
      impressions: parseInt(row.metrics.impressions || '0'),
      costMicros: parseInt(row.metrics.costMicros || '0'),
      conversions: parseFloat(row.metrics.conversions || '0'),
    }));
  } catch (error) {
    console.error(`[GoogleAds] Search term report failed for campaign ${campaignId}:`, error);
    return [];
  }
}

// --- Campaign Asset Functions (Sitelinks, Callouts, Structured Snippets) ------

interface SitelinkInput {
  linkText: string; // Max 25 chars
  description1: string; // Max 35 chars
  description2: string; // Max 35 chars
  finalUrl: string;
}

/**
 * Create sitelink assets and link them to a campaign.
 * Sitelinks appear as additional links below the main ad.
 * Character limits: linkText 25, description1/2 35 each.
 */
export async function createAndLinkSitelinks(
  campaignId: string,
  sitelinks: SitelinkInput[]
): Promise<number> {
  const config = getConfig();
  if (!config || sitelinks.length === 0) return 0;

  try {
    // Step 1: Create sitelink assets
    const assetOperations = sitelinks.map((sl) => ({
      create: {
        sitelinkAsset: {
          linkText: sl.linkText.substring(0, 25),
          description1: sl.description1.substring(0, 35),
          description2: sl.description2.substring(0, 35),
        },
        finalUrls: [sl.finalUrl],
      },
    }));

    const assetResult = (await apiRequest(config, 'POST', '/assets:mutate', {
      operations: assetOperations,
    })) as { results: Array<{ resourceName: string }> };

    const assetResourceNames = assetResult.results.map((r) => r.resourceName);
    if (assetResourceNames.length === 0) return 0;

    // Step 2: Link assets to campaign
    const campaignResourceName = `customers/${config.customerId}/campaigns/${campaignId}`;
    const linkOperations = assetResourceNames.map((assetRn) => ({
      create: {
        asset: assetRn,
        campaign: campaignResourceName,
        fieldType: 'SITELINK',
      },
    }));

    await apiRequest(config, 'POST', '/campaignAssets:mutate', {
      operations: linkOperations,
    });

    console.log(
      `[GoogleAds] Linked ${assetResourceNames.length} sitelinks to campaign ${campaignId}`
    );
    return assetResourceNames.length;
  } catch (error) {
    console.error(`[GoogleAds] Create/link sitelinks failed for campaign ${campaignId}:`, error);
    return 0;
  }
}

/**
 * Create callout assets and link them to a campaign.
 * Callouts appear as short text snippets below the ad (e.g., "Free Cancellation").
 * Max 25 characters per callout.
 */
export async function createAndLinkCallouts(
  campaignId: string,
  calloutTexts: string[]
): Promise<number> {
  const config = getConfig();
  if (!config || calloutTexts.length === 0) return 0;

  try {
    // Step 1: Create callout assets
    const assetOperations = calloutTexts.map((text) => ({
      create: {
        calloutAsset: {
          calloutText: text.substring(0, 25),
        },
      },
    }));

    const assetResult = (await apiRequest(config, 'POST', '/assets:mutate', {
      operations: assetOperations,
    })) as { results: Array<{ resourceName: string }> };

    const assetResourceNames = assetResult.results.map((r) => r.resourceName);
    if (assetResourceNames.length === 0) return 0;

    // Step 2: Link assets to campaign
    const campaignResourceName = `customers/${config.customerId}/campaigns/${campaignId}`;
    const linkOperations = assetResourceNames.map((assetRn) => ({
      create: {
        asset: assetRn,
        campaign: campaignResourceName,
        fieldType: 'CALLOUT',
      },
    }));

    await apiRequest(config, 'POST', '/campaignAssets:mutate', {
      operations: linkOperations,
    });

    console.log(
      `[GoogleAds] Linked ${assetResourceNames.length} callouts to campaign ${campaignId}`
    );
    return assetResourceNames.length;
  } catch (error) {
    console.error(`[GoogleAds] Create/link callouts failed for campaign ${campaignId}:`, error);
    return 0;
  }
}

/**
 * Valid headers for structured snippet assets per Google Ads API.
 * @see https://developers.google.com/google-ads/api/reference/data/structured-snippet-headers
 */
type StructuredSnippetHeader =
  | 'Amenities'
  | 'Brands'
  | 'Courses'
  | 'Degree programs'
  | 'Destinations'
  | 'Featured hotels'
  | 'Insurance coverage'
  | 'Models'
  | 'Neighborhoods'
  | 'Service catalog'
  | 'Shows'
  | 'Styles'
  | 'Types';

/**
 * Create a structured snippet asset and link it to a campaign.
 * Structured snippets show additional info under a predefined header
 * (e.g., "Destinations: London, Paris, Rome").
 * Values: 3-10 items, max 25 chars each.
 */
export async function createAndLinkStructuredSnippets(
  campaignId: string,
  snippet: { header: StructuredSnippetHeader; values: string[] }
): Promise<boolean> {
  const config = getConfig();
  if (!config || snippet.values.length < 3) return false;

  try {
    // Ensure 3-10 values, each max 25 chars
    const values = snippet.values.slice(0, 10).map((v) => v.substring(0, 25));

    // Step 1: Create structured snippet asset
    const assetResult = (await apiRequest(config, 'POST', '/assets:mutate', {
      operations: [
        {
          create: {
            structuredSnippetAsset: {
              header: snippet.header,
              values,
            },
          },
        },
      ],
    })) as { results: Array<{ resourceName: string }> };

    const assetResourceName = assetResult.results[0]?.resourceName;
    if (!assetResourceName) return false;

    // Step 2: Link asset to campaign
    const campaignResourceName = `customers/${config.customerId}/campaigns/${campaignId}`;
    await apiRequest(config, 'POST', '/campaignAssets:mutate', {
      operations: [
        {
          create: {
            asset: assetResourceName,
            campaign: campaignResourceName,
            fieldType: 'STRUCTURED_SNIPPET',
          },
        },
      ],
    });

    console.log(
      `[GoogleAds] Linked structured snippet (${snippet.header}: ${values.length} values) to campaign ${campaignId}`
    );
    return true;
  } catch (error) {
    console.error(
      `[GoogleAds] Create/link structured snippets failed for campaign ${campaignId}:`,
      error
    );
    return false;
  }
}

/**
 * ISO 3166-1 alpha-2 → Google Ads Geo Target Constant ID mapping.
 * Full list: https://developers.google.com/google-ads/api/reference/data/geotargets
 */
const COUNTRY_CODE_TO_GEO_ID: Record<string, number> = {
  GB: 2826,
  US: 2840,
  CA: 2124,
  AU: 2036,
  IE: 2372,
  NZ: 2554,
  DE: 2276,
  FR: 2250,
  ES: 2724,
  IT: 2380,
  NL: 2528,
  PT: 2620,
  AT: 2040,
  CH: 2756,
  BE: 2056,
  SE: 2752,
  NO: 2578,
  DK: 2208,
  FI: 2246,
  SG: 2702,
  HK: 2344,
  JP: 2392,
  KR: 2410,
  IN: 2356,
  ZA: 2710,
  AE: 2784,
  BR: 2076,
  MX: 2484,
};

/**
 * Set geo-targeting on a campaign using campaign criteria.
 * Uses PRESENCE_OR_INTEREST — reaches people IN or INTERESTED IN
 * the targeted locations. Ideal for travel: someone in London
 * searching "boat tours Barcelona" will still see the ad.
 */
export async function setCampaignGeoTargets(
  campaignId: string,
  countryCodes: string[]
): Promise<number> {
  const config = getConfig();
  if (!config || countryCodes.length === 0) return 0;

  const campaignResourceName = `customers/${config.customerId}/campaigns/${campaignId}`;

  // Resolve country codes to Google Geo Target Constant IDs
  const geoIds = countryCodes
    .map((code) => COUNTRY_CODE_TO_GEO_ID[code.toUpperCase()])
    .filter((id): id is number => id !== undefined);

  if (geoIds.length === 0) {
    console.warn(`[GoogleAds] No valid geo target IDs for countries: ${countryCodes.join(', ')}`);
    return 0;
  }

  try {
    // Step 1: Set campaign geo target type to PRESENCE_OR_INTEREST
    // Note: negativeGeoTargetType only supports PRESENCE for Search campaigns
    await apiRequest(config, 'POST', '/campaigns:mutate', {
      operations: [
        {
          update: {
            resourceName: campaignResourceName,
            geoTargetTypeSetting: {
              positiveGeoTargetType: 'PRESENCE_OR_INTEREST',
            },
          },
          updateMask: 'geoTargetTypeSetting.positiveGeoTargetType',
        },
      ],
    });

    // Step 2: Add location criteria for each target country
    const operations = geoIds.map((geoId) => ({
      create: {
        campaign: campaignResourceName,
        location: {
          geoTargetConstant: `geoTargetConstants/${geoId}`,
        },
        negative: false,
      },
    }));

    await apiRequest(config, 'POST', '/campaignCriteria:mutate', { operations });

    console.log(
      `[GoogleAds] Set geo targets on campaign ${campaignId}: ${countryCodes.join(', ')} (${geoIds.length} locations)`
    );
    return geoIds.length;
  } catch (error) {
    console.error(`[GoogleAds] Set geo targets failed for campaign ${campaignId}:`, error);
    return 0;
  }
}
