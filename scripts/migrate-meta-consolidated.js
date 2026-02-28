/**
 * Phase 3: Migrate Meta Ads to Consolidated Campaign Structure
 *
 * Restructures ~815 individual 1:1:1 Meta campaigns into 9 consolidated
 * campaigns using CBO (Advantage Campaign Budget) with OUTCOME_SALES
 * and Minimum ROAS bidding.
 *
 * Strategy: MOVE existing ads into new ad sets (preserves social proof,
 * engagement data, and creative performance history) rather than recreating
 * from scratch. New parent campaigns and ad sets must be created fresh
 * because the objective changes from OUTCOME_TRAFFIC → OUTCOME_SALES.
 *
 * Prerequisites:
 *   - Phase 0 enrichment must have run (campaignGroup set on all legacy campaigns)
 *   - Phase 1 DB migration must have run (parent-child fields on AdCampaign)
 *   - Meta Pixel must be configured (META_PIXEL_ID env var)
 *   - Meta Ads API credentials configured (META_*, FACEBOOK_* env vars)
 *
 * Usage:
 *   node scripts/migrate-meta-consolidated.js                  # dry-run (default)
 *   node scripts/migrate-meta-consolidated.js --apply          # execute migration
 *   node scripts/migrate-meta-consolidated.js --apply --skip-pause  # skip pausing old campaigns
 *   node scripts/migrate-meta-consolidated.js --apply --activate    # activate new campaigns
 *
 * On Heroku:
 *   heroku run "node scripts/migrate-meta-consolidated.js --apply" --app holibob-experiences-demand-gen
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Configuration — 9 consolidated campaigns
// ---------------------------------------------------------------------------
// NOTE: Using LOWEST_COST_WITHOUT_CAP for all campaigns because the ad account
// is not yet eligible for LOWEST_COST_WITH_MIN_ROAS (requires business verification).
// Still optimizes for OFFSITE_CONVERSIONS (purchases). Upgrade to ROAS bidding
// once the business is verified on Meta.
const CONSOLIDATED_CAMPAIGNS = [
  {
    name: 'Branded – Harry Potter Tours',
    campaignGroup: 'Branded – Harry Potter Tours',
    dailyBudget: 25,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    roasFloor: null,
  },
  {
    name: 'Branded – London Food Tours',
    campaignGroup: 'Branded – London Food Tours',
    dailyBudget: 25,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    roasFloor: null,
  },
  {
    name: 'Adventure & Outdoor',
    campaignGroup: 'Adventure & Outdoor',
    dailyBudget: 30,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    roasFloor: null,
  },
  {
    name: 'Food, Drink & Culinary',
    campaignGroup: 'Food, Drink & Culinary',
    dailyBudget: 20,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    roasFloor: null,
  },
  {
    name: 'Boats, Sailing & Water',
    campaignGroup: 'Boats, Sailing & Water',
    dailyBudget: 15,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    roasFloor: null,
  },
  {
    name: 'Transfers & Transport',
    campaignGroup: 'Transfers & Transport',
    dailyBudget: 20,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    roasFloor: null,
  },
  {
    name: 'Cultural & Sightseeing',
    campaignGroup: 'Cultural & Sightseeing',
    dailyBudget: 20,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    roasFloor: null,
  },
  {
    name: 'General Tours – Tier 1',
    campaignGroup: 'General Tours – Tier 1',
    dailyBudget: 50,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    roasFloor: null,
  },
  {
    name: 'General Tours – Tier 2',
    campaignGroup: 'General Tours – Tier 2',
    dailyBudget: 30,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    roasFloor: null,
  },
];

// Region map for General Tours ad set naming
const REGION_MAP = {
  GB: 'UK & Ireland',
  IE: 'UK & Ireland',
  DE: 'Europe',
  FR: 'Europe',
  ES: 'Europe',
  IT: 'Europe',
  NL: 'Europe',
  PT: 'Europe',
  AT: 'Europe',
  CH: 'Europe',
  SE: 'Europe',
  NO: 'Europe',
  DK: 'Europe',
  GR: 'Europe',
  CZ: 'Europe',
  PL: 'Europe',
  HU: 'Europe',
  HR: 'Europe',
  RO: 'Europe',
  BG: 'Europe',
  FI: 'Europe',
  BE: 'Europe',
  US: 'Americas',
  CA: 'Americas',
  MX: 'Americas',
  BR: 'Americas',
  AR: 'Americas',
  CO: 'Americas',
  PE: 'Americas',
  CL: 'Americas',
  AU: 'Asia-Pacific',
  NZ: 'Asia-Pacific',
  JP: 'Asia-Pacific',
  TH: 'Asia-Pacific',
  SG: 'Asia-Pacific',
  ID: 'Asia-Pacific',
  MY: 'Asia-Pacific',
  VN: 'Asia-Pacific',
  KR: 'Asia-Pacific',
  IN: 'Asia-Pacific',
  PH: 'Asia-Pacific',
  AE: 'Middle East & Africa',
  ZA: 'Middle East & Africa',
  MA: 'Middle East & Africa',
  EG: 'Middle East & Africa',
  KE: 'Middle East & Africa',
  TZ: 'Middle East & Africa',
  JO: 'Middle East & Africa',
  TR: 'Middle East & Africa',
};

// Max ads to move into each ad set
const MAX_ADS_PER_ADSET = 6;

// Profitability threshold for General Tours Tier 1 vs Tier 2
const GENERAL_TOURS_TIER1_THRESHOLD = 50;

// Rate limiter — Meta API allows ~200/hour for writes, higher for reads
const RATE_LIMIT_WRITE_MS = 20_000; // 20 seconds between write API calls (3/min)
const RATE_LIMIT_READ_MS = 4_000; // 4 seconds between read API calls (~15/min)
let lastApiCall = 0;

async function rateLimitedCall(fn, isRead = false) {
  const limit = isRead ? RATE_LIMIT_READ_MS : RATE_LIMIT_WRITE_MS;
  const now = Date.now();
  const elapsed = now - lastApiCall;
  if (elapsed < limit) {
    await new Promise((resolve) => setTimeout(resolve, limit - elapsed));
  }
  lastApiCall = Date.now();
  return fn();
}

// ---------------------------------------------------------------------------
// Token decryption (mirrors packages/jobs/src/services/social/token-encryption.ts)
// ---------------------------------------------------------------------------
const crypto = require('crypto');

function decryptToken(encrypted) {
  const secret = process.env['SOCIAL_TOKEN_SECRET'];
  if (!secret || secret.length !== 64) {
    // No encryption key — return as-is (plaintext token)
    return encrypted;
  }
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    // Not in encrypted format — return as plaintext
    return encrypted;
  }
  const key = Buffer.from(secret, 'hex');
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ---------------------------------------------------------------------------
// Minimal Meta API client (standalone — doesn't import from jobs package)
// ---------------------------------------------------------------------------
class MigrationMetaClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.adAccountId = process.env['META_AD_ACCOUNT_ID'] || process.env['FACEBOOK_AD_ACCOUNT_ID'];
    this.pageId = process.env['META_PAGE_ID'] || process.env['FACEBOOK_PAGE_ID'];
    this.pixelId = process.env['META_PIXEL_ID'] || process.env['FACEBOOK_PIXEL_ID'];
    this.apiVersion = 'v18.0';

    if (!this.accessToken || !this.adAccountId) {
      throw new Error('Missing access token or META_AD_ACCOUNT_ID');
    }
    if (!this.pixelId) {
      throw new Error('Missing META_PIXEL_ID — needed for OUTCOME_SALES conversion tracking');
    }
  }

  /**
   * Create a client by fetching the access token from the SocialAccount table.
   * This mirrors how getMetaAdsClient() works in the main jobs codebase.
   */
  static async create() {
    const accounts = await prisma.socialAccount.findMany({
      where: { platform: 'FACEBOOK', isActive: true },
      select: { id: true, accessToken: true, tokenExpiresAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    for (const account of accounts) {
      if (!account.accessToken) continue;
      try {
        const token = decryptToken(account.accessToken);
        // Quick validation — try a simple API call
        const client = new MigrationMetaClient(token);
        return client;
      } catch (err) {
        console.warn(`  Skipping social account ${account.id}: ${err.message}`);
      }
    }

    throw new Error(
      'No valid Facebook access token found in SocialAccount table. ' +
        'Connect a Facebook account in the admin dashboard first.'
    );
  }

  async apiCall(method, endpoint, params = {}, retries = 3) {
    const url = new URL(`https://graph.facebook.com/${this.apiVersion}/${endpoint}`);
    const body = new URLSearchParams();
    body.append('access_token', this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      body.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

    const fetchOptions =
      method === 'GET'
        ? { method: 'GET', signal: AbortSignal.timeout(30_000) }
        : {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout(60_000),
          };

    if (method === 'GET') {
      for (const [key, value] of body.entries()) {
        url.searchParams.set(key, value);
      }
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url.toString(), fetchOptions);
        const data = await response.json();

        if (data.error) {
          const err = data.error;
          // Rate limit error (code 17) — backoff and retry
          if (err.code === 17 && attempt < retries) {
            const waitSec = 60 * attempt;
            console.warn(
              `    Rate limited on ${endpoint} — waiting ${waitSec}s (attempt ${attempt}/${retries})`
            );
            await new Promise((r) => setTimeout(r, waitSec * 1000));
            continue;
          }
          const detail = err.error_user_msg || err.error_user_title || '';
          throw new Error(
            `Meta API error [${err.code}/${err.error_subcode || 'n/a'}]: ${err.message}${detail ? ' — ' + detail : ''}`
          );
        }
        return data;
      } catch (err) {
        const isRetryable =
          err.name === 'TimeoutError' ||
          err.name === 'AbortError' ||
          err.message?.includes('fetch');
        if (attempt < retries && isRetryable) {
          console.warn(`    Retry ${attempt}/${retries} for ${endpoint}: ${err.message}`);
          await new Promise((r) => setTimeout(r, 5000 * attempt));
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Fetch all ads belonging to a campaign.
   * Returns array of { id, name, status, adset_id }.
   */
  async getCampaignAds(campaignId) {
    const data = await rateLimitedCall(
      () =>
        this.apiCall('GET', `${campaignId}/ads`, {
          fields: 'id,name,status,adset_id',
          limit: 100,
        }),
      true // read operation — faster rate limit
    );
    return data.data || [];
  }

  /**
   * Move an existing ad to a different ad set.
   * Preserves the ad's creative, social proof (likes/comments/shares),
   * and performance history. The ad inherits the new ad set's targeting
   * and delivery settings.
   */
  async moveAdToAdSet(adId, newAdSetId, status) {
    const params = { adset_id: newAdSetId };
    if (status) params.status = status;
    return rateLimitedCall(() => this.apiCall('POST', adId, params));
  }

  async createCampaign(config) {
    // CBO is automatic in v18.0 when daily_budget is set at campaign level
    // and NOT set at ad set level. No explicit flag needed.
    // Bid strategy is set at campaign level for CBO campaigns.
    const params = {
      name: config.name,
      objective: 'OUTCOME_SALES',
      status: config.status || 'PAUSED',
      special_ad_categories: '[]',
      daily_budget: Math.round(config.dailyBudget * 100).toString(), // pence/cents as string
    };
    // Bid strategy at campaign level (required for CBO with OUTCOME_SALES)
    // Must always be set explicitly — without it, OUTCOME_SALES defaults to a strategy
    // that requires bid_amount on ad sets
    if (config.bidStrategy) {
      params.bid_strategy = config.bidStrategy;
      if (config.roasFloor) {
        params.roas_average_floor = config.roasFloor.toString();
      }
    }
    console.info(`    Campaign params: ${JSON.stringify(params)}`);
    return rateLimitedCall(() => this.apiCall('POST', `act_${this.adAccountId}/campaigns`, params));
  }

  async updateCampaign(campaignId, config) {
    const params = {};
    if (config.bidStrategy) {
      params.bid_strategy = config.bidStrategy;
      if (config.roasFloor) {
        params.roas_average_floor = config.roasFloor.toString();
      }
    }
    if (config.dailyBudget) {
      params.daily_budget = Math.round(config.dailyBudget * 100).toString();
    }
    console.info(`    Updating campaign ${campaignId}: ${JSON.stringify(params)}`);
    return rateLimitedCall(() => this.apiCall('POST', campaignId, params));
  }

  async createAdSet(config) {
    // In CBO campaigns, bid strategy is set at campaign level, not ad set level.
    // Ad sets inherit the campaign's bid strategy and budget allocation.
    const params = {
      campaign_id: config.campaignId,
      name: config.name,
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      status: config.status || 'PAUSED',
      promoted_object: { pixel_id: this.pixelId, custom_event_type: 'PURCHASE' },
      targeting: this.buildTargeting(config.targeting),
    };

    // DSA compliance for EU targeting
    if (config.dsaBeneficiary) params.dsa_beneficiary = config.dsaBeneficiary;
    if (config.dsaPayor) params.dsa_payor = config.dsaPayor;

    console.info(`      Ad set params: ${JSON.stringify({ ...params, targeting: '...' })}`);
    return rateLimitedCall(() => this.apiCall('POST', `act_${this.adAccountId}/adsets`, params));
  }

  async createAd(config) {
    const creative = {
      object_story_spec: {
        page_id: this.pageId,
        link_data: {
          link: config.linkUrl,
          message: config.body,
          name: config.headline,
          call_to_action: {
            type: config.callToAction || 'LEARN_MORE',
          },
        },
      },
    };

    if (config.imageUrl) {
      creative.object_story_spec.link_data.picture = config.imageUrl;
    }

    return rateLimitedCall(() =>
      this.apiCall('POST', `act_${this.adAccountId}/ads`, {
        adset_id: config.adSetId,
        name: config.name,
        status: config.status || 'PAUSED',
        creative,
      })
    );
  }

  async searchInterests(query) {
    const data = await rateLimitedCall(() =>
      this.apiCall('GET', 'search', {
        type: 'adinterest',
        q: query,
      })
    );
    return (data.data || []).slice(0, 5);
  }

  async batchPauseCampaigns(campaignIds) {
    // Batch API — pause up to 50 campaigns per request
    const batches = [];
    for (let i = 0; i < campaignIds.length; i += 50) {
      batches.push(campaignIds.slice(i, i + 50));
    }

    for (const batch of batches) {
      const batchRequests = batch.map((id) => ({
        method: 'POST',
        relative_url: id,
        body: 'status=PAUSED',
      }));

      await rateLimitedCall(() => this.apiCall('POST', '', { batch: batchRequests }));
      console.info(`  Paused batch of ${batch.length} campaigns`);
    }
  }

  buildTargeting(config) {
    const targeting = {};
    if (config.countries?.length > 0) {
      targeting.geo_locations = { countries: config.countries };
    }
    if (config.interests?.length > 0) {
      targeting.flexible_spec = [
        { interests: config.interests.map((i) => ({ id: i.id, name: i.name })) },
      ];
    }
    if (config.ageMin) targeting.age_min = config.ageMin;
    if (config.ageMax) targeting.age_max = config.ageMax;
    return targeting;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a simple profitability score for a campaign (0-100).
 * Based on ROAS and total revenue, used for General Tours tier assignment.
 */
function computeProfitabilityScore(campaign) {
  const spend = Number(campaign.totalSpend || 0);
  const revenue = Number(campaign.revenue || 0);

  if (spend === 0) return 25; // No data — default to low tier

  const roas = revenue / spend;
  // Score = ROAS weight (0-60) + revenue weight (0-40)
  const roasScore = Math.min(roas / 3, 1) * 60;
  const revenueScore = Math.min(revenue / 500, 1) * 40;
  return Math.round(roasScore + revenueScore);
}

/**
 * Generate a UTM campaign value for a child ad set (used for revenue attribution).
 */
function generateUtmCampaign(campaignGroup, adSetName) {
  return `meta_${campaignGroup}_${adSetName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

/**
 * Extract geo target countries from a campaign's existing targeting data.
 */
function extractGeoTargets(campaign) {
  const pd = campaign.proposalData;
  if (pd?.deployedTargeting?.countries) return pd.deployedTargeting.countries;
  if (campaign.geoTargets?.length > 0) return campaign.geoTargets;
  return ['GB']; // Default fallback
}

/**
 * Check if any targeted countries require DSA compliance.
 */
function requiresDsa(countries) {
  const euCountries = new Set([
    'AT',
    'BE',
    'BG',
    'HR',
    'CZ',
    'DK',
    'EE',
    'FI',
    'FR',
    'DE',
    'GR',
    'HU',
    'IE',
    'IT',
    'LV',
    'LT',
    'LU',
    'MT',
    'NL',
    'PL',
    'PT',
    'RO',
    'SK',
    'SI',
    'ES',
    'SE',
  ]);
  return countries.some((c) => euCountries.has(c));
}

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const skipPause = args.includes('--skip-pause');
  const skipFetch = args.includes('--skip-fetch');
  const activate = args.includes('--activate');

  console.info('=== Phase 3: Meta Ads Consolidated Migration ===');
  console.info(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.info(`Skip pause: ${skipPause}`);
  console.info(`Skip fetch: ${skipFetch}`);
  console.info(`Activate new campaigns: ${activate}`);
  console.info('');
  console.info('Strategy: MOVE existing ads into new ad sets (preserves social proof)');
  console.info('');

  // -------------------------------------------------------------------------
  // Step 1: Load legacy campaigns and validate enrichment
  // -------------------------------------------------------------------------
  console.info('Step 1: Loading legacy FACEBOOK campaigns...');

  const legacyCampaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      parentCampaignId: null,
    },
    select: {
      id: true,
      name: true,
      keywords: true,
      status: true,
      campaignGroup: true,
      platformCampaignId: true,
      targetUrl: true,
      landingPagePath: true,
      landingPageType: true,
      geoTargets: true,
      totalSpend: true,
      revenue: true,
      totalClicks: true,
      conversions: true,
      micrositeId: true,
      siteId: true,
      proposalData: true,
      microsite: {
        select: {
          id: true,
          siteName: true,
          supplierId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Separate existing consolidated parents from legacy 1:1:1 campaigns
  const existingParents = legacyCampaigns.filter(
    (c) => c.proposalData?.consolidatedCampaign === true
  );
  const legacy = legacyCampaigns.filter((c) => !c.proposalData?.consolidatedCampaign);

  console.info(`  Legacy 1:1:1 campaigns: ${legacy.length}`);
  console.info(`  Existing consolidated parents: ${existingParents.length}`);

  // Validate enrichment — check that all campaigns have a campaignGroup
  const unenriched = legacy.filter((c) => !c.campaignGroup);
  if (unenriched.length > 0) {
    console.warn(`\n  WARNING: ${unenriched.length} campaigns without campaignGroup.`);
    console.warn('  Run the enrichment script first: node scripts/enrich-campaign-mapping.js');

    if (apply) {
      console.info('  Auto-assigning "General Tours" to unenriched campaigns...');
      for (const c of unenriched) {
        c.campaignGroup = 'General Tours';
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Assign General Tours tier based on profitability
  // -------------------------------------------------------------------------
  console.info('\nStep 2: Assigning General Tours tiers...');

  let tier1Count = 0;
  let tier2Count = 0;
  for (const campaign of legacy) {
    if (campaign.campaignGroup === 'General Tours') {
      const score = computeProfitabilityScore(campaign);
      if (score >= GENERAL_TOURS_TIER1_THRESHOLD) {
        campaign.campaignGroup = 'General Tours – Tier 1';
        tier1Count++;
      } else {
        campaign.campaignGroup = 'General Tours – Tier 2';
        tier2Count++;
      }
    }
  }

  console.info(`  Tier 1 (score >= ${GENERAL_TOURS_TIER1_THRESHOLD}): ${tier1Count}`);
  console.info(`  Tier 2 (score < ${GENERAL_TOURS_TIER1_THRESHOLD}): ${tier2Count}`);

  // -------------------------------------------------------------------------
  // Step 3: Group campaigns by campaign group → ad set grouping
  // -------------------------------------------------------------------------
  console.info('\nStep 3: Grouping campaigns into consolidated structure...');

  // Group by campaignGroup
  const groups = {};
  for (const campaign of legacy) {
    const group = campaign.campaignGroup;
    if (!groups[group]) groups[group] = [];
    groups[group].push(campaign);
  }

  // For General Tours, further group by region for ad set assignment
  const adSetPlan = [];
  for (const config of CONSOLIDATED_CAMPAIGNS) {
    const campaignsInGroup = groups[config.campaignGroup] || [];
    if (campaignsInGroup.length === 0) {
      adSetPlan.push({
        ...config,
        adSets: [],
        totalCampaigns: 0,
      });
      continue;
    }

    let adSets;
    if (config.campaignGroup.startsWith('General Tours')) {
      // Group by region
      const byRegion = {};
      for (const c of campaignsInGroup) {
        const countries = extractGeoTargets(c);
        const region = countries.map((code) => REGION_MAP[code]).filter(Boolean)[0] || 'Mixed';
        if (!byRegion[region]) byRegion[region] = [];
        byRegion[region].push(c);
      }
      adSets = Object.entries(byRegion).map(([region, campaigns]) => ({
        name: `${config.name} – ${region}`,
        region,
        campaigns,
        countries: [...new Set(campaigns.flatMap((c) => extractGeoTargets(c)))],
      }));
    } else {
      // Single ad set per campaign group
      const countries = [...new Set(campaignsInGroup.flatMap((c) => extractGeoTargets(c)))];
      adSets = [
        {
          name: config.name,
          region: null,
          campaigns: campaignsInGroup,
          countries,
        },
      ];
    }

    adSetPlan.push({
      ...config,
      adSets,
      totalCampaigns: campaignsInGroup.length,
    });
  }

  // -------------------------------------------------------------------------
  // Step 3.5: Fetch existing ad IDs from Meta for legacy campaigns
  // -------------------------------------------------------------------------
  console.info('\nStep 3.5: Fetching existing ad IDs from Meta...');

  // Build a map: legacy campaign DB id → Meta ad IDs
  const campaignAdMap = new Map(); // dbId → [{ id, name, status, adset_id }]
  const campaignsWithPlatformId = legacy.filter((c) => c.platformCampaignId);

  console.info(
    `  Campaigns with platform IDs: ${campaignsWithPlatformId.length} / ${legacy.length}`
  );

  if (skipFetch) {
    console.info('  [SKIP FETCH] Skipping ad fetching — will create new ads instead of moving');
  } else if (apply && campaignsWithPlatformId.length > 0) {
    const metaClient = await MigrationMetaClient.create();
    let fetched = 0;
    let withAds = 0;
    let errors = 0;
    const startTime = Date.now();

    for (const campaign of campaignsWithPlatformId) {
      try {
        const ads = await metaClient.getCampaignAds(campaign.platformCampaignId);
        campaignAdMap.set(campaign.id, ads);
        if (ads.length > 0) withAds++;
        fetched++;
        if (fetched % 100 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          console.info(
            `    Fetched ${fetched}/${campaignsWithPlatformId.length} (${withAds} with ads, ${errors} errors, ${elapsed}s elapsed)...`
          );
        }
      } catch (err) {
        errors++;
        console.warn(
          `    Failed to fetch ads for campaign ${campaign.platformCampaignId}: ${err.message}`
        );
        campaignAdMap.set(campaign.id, []);
      }
    }

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.info(
      `  Fetched ads for ${fetched} campaigns (${withAds} have existing ads, ${errors} errors) in ${totalElapsed}s`
    );
  } else if (!apply) {
    // Dry run — estimate based on having platform IDs
    const withPlatformId = campaignsWithPlatformId.length;
    console.info(`  [DRY RUN] Would fetch ads for ${withPlatformId} campaigns`);
    console.info(`  Assuming ~1 ad per campaign for estimation`);
  }

  // -------------------------------------------------------------------------
  // Print plan
  // -------------------------------------------------------------------------
  console.info('\n=== Migration Plan ===');
  let totalAdSets = 0;
  let totalAdsToMove = 0;
  let totalAdsToCreate = 0;

  for (const plan of adSetPlan) {
    console.info(`\n  Campaign: ${plan.name}`);
    console.info(`    Budget: £${plan.dailyBudget}/day`);
    console.info(`    Bid strategy: ${plan.bidStrategy}`);
    console.info(`    ROAS floor: ${plan.roasFloor || 'none'}`);
    console.info(`    Legacy campaigns: ${plan.totalCampaigns}`);
    console.info(`    Ad sets: ${plan.adSets.length}`);

    for (const adSet of plan.adSets) {
      // Sort by performance
      const sorted = [...adSet.campaigns].sort((a, b) => {
        const roasA = Number(a.revenue || 0) / Math.max(Number(a.totalSpend || 0), 0.01);
        const roasB = Number(b.revenue || 0) / Math.max(Number(b.totalSpend || 0), 0.01);
        return roasB - roasA;
      });
      const topCampaigns = sorted.slice(0, MAX_ADS_PER_ADSET);

      // Count movable vs create-needed
      let movable = 0;
      let needsCreate = 0;
      for (const c of topCampaigns) {
        if (skipFetch) {
          needsCreate++; // All ads will be created fresh when skipping fetch
        } else {
          const existingAds = campaignAdMap.get(c.id);
          if (existingAds && existingAds.length > 0) {
            movable++;
          } else if (c.platformCampaignId) {
            movable++; // Assume we can fetch the ad during apply
          } else {
            needsCreate++;
          }
        }
      }

      console.info(`      Ad Set: ${adSet.name}`);
      console.info(
        `        Countries: ${adSet.countries.slice(0, 5).join(', ')}${adSet.countries.length > 5 ? '...' : ''}`
      );
      console.info(`        Source campaigns: ${adSet.campaigns.length}`);
      console.info(
        `        Top ${topCampaigns.length}: ${movable} to move, ${needsCreate} to create fresh`
      );

      totalAdSets++;
      totalAdsToMove += movable;
      totalAdsToCreate += needsCreate;
    }
  }

  const activeLegacy = legacy.filter((c) => c.platformCampaignId && c.status === 'ACTIVE').length;

  console.info(`\n=== Totals ===`);
  console.info(`  Parent campaigns to create: ${CONSOLIDATED_CAMPAIGNS.length}`);
  console.info(`  Ad sets to create: ${totalAdSets}`);
  console.info(`  Ads to MOVE (preserves social proof): ${totalAdsToMove}`);
  console.info(`  Ads to CREATE (no existing ad found): ${totalAdsToCreate}`);
  console.info(`  Legacy campaigns to pause: ${activeLegacy}`);

  const estimatedCalls =
    (skipPause ? 0 : Math.ceil(legacy.length / 50)) + // Batch pause
    CONSOLIDATED_CAMPAIGNS.length + // Create campaigns
    totalAdSets * 2 + // Interest search + create ad set
    totalAdsToMove + // Move ads (1 call each)
    totalAdsToCreate; // Create ads (1 call each)
  const estimatedMinutes = Math.ceil((estimatedCalls * RATE_LIMIT_WRITE_MS) / 60_000);
  console.info(`  Estimated API calls: ${estimatedCalls}`);
  console.info(`  Estimated time: ~${estimatedMinutes} minutes`);

  if (!apply) {
    console.info('\n=== DRY RUN — no changes made ===');
    console.info('Run with --apply to execute the migration.');
    return;
  }

  // -------------------------------------------------------------------------
  // Step 4: Pause old campaigns on Meta (keep for historical reference)
  // -------------------------------------------------------------------------
  if (!skipPause) {
    console.info('\nStep 4: Pausing legacy campaigns on Meta...');
    const activePlatformIds = legacy
      .filter((c) => c.platformCampaignId && c.status === 'ACTIVE')
      .map((c) => c.platformCampaignId);

    const metaClient = await MigrationMetaClient.create();

    if (activePlatformIds.length > 0) {
      await metaClient.batchPauseCampaigns(activePlatformIds);
      console.info(`  Paused ${activePlatformIds.length} campaigns on Meta`);
    } else {
      console.info('  No active campaigns to pause on Meta');
    }

    // Mark as COMPLETED in DB so sync/optimizer/reports skip them.
    // The campaigns stay PAUSED on Meta (not deleted) for historical reference.
    console.info('  Marking legacy campaigns as COMPLETED in DB...');
    const archived = await prisma.adCampaign.updateMany({
      where: {
        platform: 'FACEBOOK',
        parentCampaignId: null,
        status: { in: ['ACTIVE', 'PAUSED'] },
        NOT: {
          proposalData: { path: ['consolidatedCampaign'], equals: true },
        },
      },
      data: { status: 'COMPLETED' },
    });
    console.info(`  Marked ${archived.count} campaigns as COMPLETED`);
    console.info('  (Old campaigns remain PAUSED on Meta — not deleted)');
  } else {
    console.info('\nStep 4: Skipped (--skip-pause)');
  }

  // -------------------------------------------------------------------------
  // Step 5: Create consolidated campaigns, ad sets, and move/create ads
  // -------------------------------------------------------------------------
  console.info('\nStep 5: Creating consolidated structure and moving ads...');

  const metaClient = await MigrationMetaClient.create();
  const siteName = 'Holibob Experiences'; // DSA beneficiary/payor

  // Get the primary site ID
  const primarySite = await prisma.site.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });

  if (!primarySite) {
    throw new Error('No active site found in database');
  }

  let campaignsCreated = 0;
  let adSetsCreated = 0;
  let adsMoved = 0;
  let adsCreatedFresh = 0;
  let adsFailed = 0;

  for (const plan of adSetPlan) {
    if (plan.adSets.length === 0) {
      console.info(`\n  Skipping ${plan.name} — no campaigns in this group`);
      continue;
    }

    // Check if parent already exists (idempotency)
    const existingParent = existingParents.find((p) => p.campaignGroup === plan.campaignGroup);

    let parentId;
    let platformCampaignId;

    if (existingParent) {
      // Check if the existing campaign has the correct bid strategy
      const existingBidStrategy = existingParent.proposalData?.bidStrategy;
      if (existingBidStrategy === plan.bidStrategy) {
        console.info(`\n  ${plan.name} — parent exists with correct bid strategy, reusing`);
        parentId = existingParent.id;
        platformCampaignId = existingParent.platformCampaignId;
      } else {
        // Bid strategy mismatch — can't update CBO campaigns. Delete and recreate.
        console.info(
          `\n  ${plan.name} — parent exists but bid strategy mismatch (${existingBidStrategy} vs ${plan.bidStrategy}), recreating`
        );
        // Pause orphaned Meta campaign
        if (existingParent.platformCampaignId) {
          try {
            await metaClient.updateCampaign(existingParent.platformCampaignId, {});
            // Just pausing — set status
            await rateLimitedCall(() =>
              metaClient.apiCall('POST', existingParent.platformCampaignId, { status: 'PAUSED' })
            );
            console.info(`    Paused orphaned Meta campaign ${existingParent.platformCampaignId}`);
          } catch (err) {
            console.warn(`    Could not pause orphaned campaign: ${err.message}`);
          }
        }
        // Mark old DB record as completed
        await prisma.adCampaign.update({
          where: { id: existingParent.id },
          data: { status: 'COMPLETED' },
        });
        console.info(`    Marked old DB record ${existingParent.id} as COMPLETED`);
        // Fall through to create new campaign below
      }
    }

    if (!parentId) {
      // Create campaign on Meta
      console.info(`\n  Creating: ${plan.name} (£${plan.dailyBudget}/day, ${plan.bidStrategy})`);
      const result = await metaClient.createCampaign({
        name: plan.name,
        dailyBudget: plan.dailyBudget,
        bidStrategy: plan.bidStrategy,
        roasFloor: plan.roasFloor,
        status: activate ? 'ACTIVE' : 'PAUSED',
      });
      platformCampaignId = result.id;
      console.info(`    Meta campaign ID: ${platformCampaignId}`);

      // Create parent record in DB
      const parentUtmCampaign = generateUtmCampaign(plan.campaignGroup, 'parent');
      const parentRecord = await prisma.adCampaign.create({
        data: {
          siteId: primarySite.id,
          platform: 'FACEBOOK',
          name: plan.name,
          status: activate ? 'ACTIVE' : 'PAUSED',
          campaignGroup: plan.campaignGroup,
          platformCampaignId,
          dailyBudget: plan.dailyBudget,
          maxCpc: 0,
          keywords: [],
          targetUrl: `https://${primarySite.customDomain || primarySite.subdomain || 'holibob.com'}`,
          utmSource: 'facebook_ads',
          utmMedium: 'cpc',
          utmCampaign: parentUtmCampaign,
          proposalData: {
            consolidatedCampaign: true,
            bidStrategy: plan.bidStrategy,
            roasFloor: plan.roasFloor,
            migratedAt: new Date().toISOString(),
          },
        },
      });
      parentId = parentRecord.id;
      campaignsCreated++;
      console.info(`    DB parent record: ${parentId}`);
    }

    // Create ad sets and move/create ads
    for (const adSet of plan.adSets) {
      console.info(`    Ad set: ${adSet.name}`);

      // Check for existing child (idempotency)
      const existingChild = await prisma.adCampaign.findFirst({
        where: {
          parentCampaignId: parentId,
          name: { startsWith: adSet.name },
          status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
        },
      });

      if (existingChild) {
        console.info(`      Already exists (${existingChild.id}), skipping`);
        continue;
      }

      // Search for relevant interests
      const searchTerms = adSet.campaigns.flatMap((c) => c.keywords || []).slice(0, 3);
      const interests = [];
      for (const term of searchTerms.slice(0, 2)) {
        try {
          const results = await metaClient.searchInterests(term);
          for (const i of results) {
            if (!interests.find((existing) => existing.id === i.id)) {
              interests.push({ id: i.id, name: i.name });
            }
          }
        } catch (err) {
          console.warn(`      Interest search failed for "${term}": ${err.message}`);
        }
        if (interests.length >= 10) break;
      }

      // Determine DSA requirement
      const needsDsa = requiresDsa(adSet.countries);

      // Create ad set on Meta
      const adSetResult = await metaClient.createAdSet({
        campaignId: platformCampaignId,
        name: `${adSet.name} - Ad Set`,
        targeting: {
          countries: adSet.countries,
          interests: interests.length > 0 ? interests : undefined,
          ageMin: 18,
          ageMax: 65,
        },
        bidStrategy: plan.bidStrategy,
        roasFloor: plan.roasFloor,
        status: activate ? 'ACTIVE' : 'PAUSED',
        dsaBeneficiary: needsDsa ? siteName : undefined,
        dsaPayor: needsDsa ? siteName : undefined,
      });

      const platformAdSetId = adSetResult.id;
      console.info(`      Meta ad set ID: ${platformAdSetId}`);
      adSetsCreated++;

      // Select top-performing campaigns (by ROAS)
      const sortedCampaigns = [...adSet.campaigns].sort((a, b) => {
        const roasA = Number(a.revenue || 0) / Math.max(Number(a.totalSpend || 0), 0.01);
        const roasB = Number(b.revenue || 0) / Math.max(Number(b.totalSpend || 0), 0.01);
        return roasB - roasA;
      });
      const topCampaigns = sortedCampaigns.slice(0, MAX_ADS_PER_ADSET);

      // Move or create ads
      let firstAdId = null;
      const movedAdIds = [];
      const utmCampaign = generateUtmCampaign(plan.campaignGroup, adSet.name);

      for (const sourceCampaign of topCampaigns) {
        const existingAds = campaignAdMap.get(sourceCampaign.id) || [];
        const existingAd = existingAds[0]; // Each 1:1:1 campaign has 1 ad

        if (existingAd) {
          // ---- MOVE existing ad (preserves social proof) ----
          try {
            const adStatus = activate ? 'ACTIVE' : 'PAUSED';
            await metaClient.moveAdToAdSet(existingAd.id, platformAdSetId, adStatus);
            movedAdIds.push(existingAd.id);
            if (!firstAdId) firstAdId = existingAd.id;
            adsMoved++;
            console.info(
              `      MOVED ad ${existingAd.id} from campaign ${sourceCampaign.platformCampaignId} (${sourceCampaign.name.slice(0, 35)})`
            );
          } catch (err) {
            console.warn(`      Failed to move ad ${existingAd.id}: ${err.message}`);
            // Fall through to create fresh
            adsFailed++;
          }
        }

        if (!existingAd || (existingAd && !movedAdIds.includes(existingAd.id))) {
          // ---- CREATE fresh ad (fallback when no existing ad or move failed) ----
          const creative = sourceCampaign.proposalData?.generatedCreative;
          if (!creative?.headline || !creative?.body) {
            console.info(
              `      Skipping "${sourceCampaign.name}" — no creative data and no existing ad`
            );
            continue;
          }

          try {
            const siteHost = primarySite.customDomain || primarySite.subdomain || 'holibob.com';
            const linkUrl = sourceCampaign.targetUrl || `https://${siteHost}`;

            const adResult = await metaClient.createAd({
              adSetId: platformAdSetId,
              name: `${adSet.name} - ${sourceCampaign.name.slice(0, 30)}`,
              linkUrl,
              headline: creative.headline,
              body: creative.body,
              callToAction: creative.callToAction || 'LEARN_MORE',
              imageUrl: creative.imageUrl || undefined,
              status: activate ? 'ACTIVE' : 'PAUSED',
            });

            if (!firstAdId) firstAdId = adResult.id;
            adsCreatedFresh++;
            console.info(`      CREATED ad ${adResult.id} (${sourceCampaign.name.slice(0, 35)})`);
          } catch (err) {
            console.error(`      Failed to create ad for "${sourceCampaign.name}": ${err.message}`);
            adsFailed++;
          }
        }
      }

      // Create child record in DB (one record per ad set)
      const bestSource = topCampaigns[0];
      if (bestSource && firstAdId) {
        await prisma.adCampaign.create({
          data: {
            siteId: bestSource.siteId || primarySite.id,
            micrositeId: bestSource.micrositeId || null,
            platform: 'FACEBOOK',
            parentCampaignId: parentId,
            platformCampaignId,
            platformAdSetId,
            platformAdId: firstAdId,
            campaignGroup: plan.campaignGroup,
            name: adSet.name,
            status: activate ? 'ACTIVE' : 'PAUSED',
            dailyBudget: 0, // CBO manages budget at parent level
            maxCpc: 0,
            keywords: adSet.campaigns.flatMap((c) => c.keywords || []).slice(0, 50),
            targetUrl:
              bestSource.targetUrl ||
              `https://${primarySite.customDomain || primarySite.subdomain || 'holibob.com'}`,
            landingPagePath: bestSource.landingPagePath,
            landingPageType: bestSource.landingPageType,
            geoTargets: adSet.countries,
            utmSource: 'facebook_ads',
            utmMedium: 'cpc',
            utmCampaign,
            proposalData: {
              generatedCreative: bestSource.proposalData?.generatedCreative || null,
              deployedTargeting: {
                countries: adSet.countries,
                interests: interests.map((i) => i.name),
                interestCount: interests.length,
              },
              migratedFrom: adSet.campaigns.map((c) => c.id),
              movedAdIds,
              preservedSocialProof: movedAdIds.length > 0,
            },
          },
        });
        console.info(`      DB child record created`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.info('\n=== Migration Complete ===');
  console.info(`  Parent campaigns created: ${campaignsCreated}`);
  console.info(`  Ad sets created: ${adSetsCreated}`);
  console.info(`  Ads MOVED (social proof preserved): ${adsMoved}`);
  console.info(`  Ads CREATED (fresh, no existing ad): ${adsCreatedFresh}`);
  console.info(`  Ads failed: ${adsFailed}`);
  console.info(`  New campaigns status: ${activate ? 'ACTIVE' : 'PAUSED'}`);
  console.info('');
  console.info('  Old campaigns: PAUSED on Meta (not deleted), COMPLETED in DB');

  if (!activate) {
    console.info('\n  New campaigns are PAUSED. To activate:');
    console.info('    1. Review in Meta Ads Manager');
    console.info('    2. Enable one at a time via Ads Manager or admin dashboard');
    console.info('    3. Or re-run with --activate flag');
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
