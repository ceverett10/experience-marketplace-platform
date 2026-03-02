/**
 * Move ~911 Legacy Ads into Consolidated Meta Campaigns
 *
 * Phase 3 migration created 8 consolidated campaigns (PAUSED) with 1 ad set
 * each containing 6 fresh ads (48 total). This script moves/recreates the
 * remaining ~911 legacy ads into those consolidated campaigns.
 *
 * Key constraints:
 * 1. Legacy campaigns use OUTCOME_TRAFFIC, new use OUTCOME_SALES.
 *    Meta API silently accepts cross-objective ad moves (returns 200) but does NOT
 *    actually move the ad.
 * 2. Legacy creatives reference a pixel the account no longer has access to.
 *    Reusing creative IDs fails with error 1815045.
 *
 * Strategy: Create NEW ads with fresh creatives built from object_story_spec
 * (the page post content — link, image, text, CTA). This avoids both issues.
 *
 * Usage:
 *   node scripts/move-ads-to-consolidated.js                # dry-run (default)
 *   node scripts/move-ads-to-consolidated.js --test-move    # test 1 cross-objective move
 *   node scripts/move-ads-to-consolidated.js --apply        # execute migration
 *
 * On Heroku:
 *   heroku run "node scripts/move-ads-to-consolidated.js" --app holibob-experiences-demand-gen
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Region map (same as migrate-meta-consolidated.js)
// ---------------------------------------------------------------------------
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

const EU_COUNTRIES = new Set([
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

// Rate limiting
const RATE_LIMIT_WRITE_MS = 20_000;
const RATE_LIMIT_READ_MS = 4_000;
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
// Token decryption
// ---------------------------------------------------------------------------
function decryptToken(encrypted) {
  const secret = process.env['SOCIAL_TOKEN_SECRET'];
  if (!secret || secret.length !== 64) return encrypted;
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted;
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
// Meta API client (minimal, standalone)
// ---------------------------------------------------------------------------
class MetaClient {
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
      throw new Error('Missing META_PIXEL_ID');
    }
  }

  static async create() {
    const accounts = await prisma.socialAccount.findMany({
      where: { platform: 'FACEBOOK', isActive: true },
      select: { id: true, accessToken: true },
      orderBy: { updatedAt: 'desc' },
    });
    for (const account of accounts) {
      if (!account.accessToken) continue;
      try {
        const token = decryptToken(account.accessToken);
        return new MetaClient(token);
      } catch (err) {
        console.warn(`  Skipping social account ${account.id}: ${err.message}`);
      }
    }
    throw new Error('No valid Facebook access token found in SocialAccount table.');
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
          if (err.code === 17 && attempt < retries) {
            const waitSec = 60 * attempt;
            console.warn(`    Rate limited on ${endpoint} — waiting ${waitSec}s`);
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
   * Fetch ALL ads in the ad account, paginating automatically.
   * Returns array of { id, name, status, campaign_id, adset_id, creative }.
   */
  async fetchAllAccountAds() {
    const allAds = [];
    // Light fields only — object_story_spec is too large for batch fetch
    const fields = 'id,name,status,campaign_id,adset_id,creative{id}';
    let page = 1;

    // First page via apiCall
    console.info(`    Fetching ads page ${page}...`);
    const firstData = await rateLimitedCall(
      () => this.apiCall('GET', `act_${this.adAccountId}/ads`, { fields, limit: 100 }),
      true
    );
    const firstAds = firstData.data || [];
    allAds.push(...firstAds);
    console.info(`    Got ${firstAds.length} ads (total: ${allAds.length})`);

    // Follow pagination URLs
    let nextUrl = firstData.paging?.next || null;
    while (nextUrl) {
      page++;
      console.info(`    Fetching ads page ${page}...`);
      const pageData = await rateLimitedCall(async () => {
        const response = await fetch(nextUrl, { signal: AbortSignal.timeout(30_000) });
        return response.json();
      }, true);
      if (pageData.error) {
        console.warn(`    Pagination error: ${pageData.error.message}`);
        break;
      }
      const pageAds = pageData.data || [];
      allAds.push(...pageAds);
      console.info(`    Got ${pageAds.length} more ads (total: ${allAds.length})`);
      nextUrl = pageData.paging?.next || null;
    }

    return allAds;
  }

  /**
   * Fetch creative details (object_story_spec) for a single ad's creative.
   * Called on-demand per ad during migration, not in bulk.
   */
  async fetchCreativeDetails(creativeId) {
    const fields = 'id,object_story_spec,url_tags';
    return rateLimitedCall(() => this.apiCall('GET', creativeId, { fields }), true);
  }

  /** Test moving an ad to a different ad set (cross-objective). */
  async testMoveAd(adId, targetAdSetId) {
    return rateLimitedCall(() =>
      this.apiCall('POST', adId, { adset_id: targetAdSetId, status: 'PAUSED' })
    );
  }

  /** Move an ad back to its original ad set. */
  async moveAdBack(adId, originalAdSetId) {
    return rateLimitedCall(() =>
      this.apiCall('POST', adId, { adset_id: originalAdSetId, status: 'PAUSED' })
    );
  }

  /** Create an ad set on Meta. */
  async createAdSet(config) {
    const targeting = {};
    if (config.countries?.length > 0) {
      targeting.geo_locations = { countries: config.countries };
    }
    if (config.ageMin) targeting.age_min = config.ageMin;
    if (config.ageMax) targeting.age_max = config.ageMax;

    const params = {
      campaign_id: config.campaignId,
      name: config.name,
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      status: 'PAUSED',
      promoted_object: { pixel_id: this.pixelId, custom_event_type: 'PURCHASE' },
      targeting,
    };

    if (config.dsaBeneficiary) params.dsa_beneficiary = config.dsaBeneficiary;
    if (config.dsaPayor) params.dsa_payor = config.dsaPayor;

    console.info(`      Creating ad set: ${config.name}`);
    return rateLimitedCall(() => this.apiCall('POST', `act_${this.adAccountId}/adsets`, params));
  }

  /** Create an ad using an existing creative ID. */
  async createAdFromCreative(config) {
    const params = {
      adset_id: config.adSetId,
      name: config.name,
      status: 'PAUSED',
      creative: { creative_id: config.creativeId },
    };
    return rateLimitedCall(() => this.apiCall('POST', `act_${this.adAccountId}/ads`, params));
  }

  /**
   * Create an ad with a NEW creative from object_story_spec.
   * This avoids pixel permission errors from reusing legacy creative IDs,
   * since the old creatives reference a pixel the account can no longer access.
   */
  async createAdWithNewCreative(config) {
    const spec = MetaClient.sanitizeStorySpec(config.objectStorySpec);
    const creative = { object_story_spec: spec };
    if (config.urlTags) creative.url_tags = config.urlTags;
    const params = {
      adset_id: config.adSetId,
      name: config.name,
      status: 'PAUSED',
      creative,
    };
    return rateLimitedCall(() => this.apiCall('POST', `act_${this.adAccountId}/ads`, params));
  }

  /**
   * Sanitize object_story_spec for re-creation.
   * Meta returns both `picture` (URL) and `image_hash` in link_data,
   * but only one may be specified when creating. Prefer image_hash.
   * Also strip read-only fields that can't be submitted.
   */
  static sanitizeStorySpec(spec) {
    const clean = JSON.parse(JSON.stringify(spec)); // deep clone
    const linkData = clean.link_data;
    if (linkData) {
      // Remove picture when image_hash exists (can only use one)
      if (linkData.image_hash && linkData.picture) {
        delete linkData.picture;
      }
      // Remove read-only fields that Meta returns but rejects on create
      delete linkData.image_crops;
      delete linkData.multi_share_optimized;
      delete linkData.multi_share_end_card;
    }
    // Strip video_data picture/image_hash conflict too
    const videoData = clean.video_data;
    if (videoData) {
      if (videoData.image_hash && videoData.image_url) {
        delete videoData.image_url;
      }
    }
    return clean;
  }

  /** Batch create ads (up to 50 per batch). */
  async batchCreateAds(ads) {
    const batchRequests = ads.map((ad) => ({
      method: 'POST',
      relative_url: `act_${this.adAccountId}/ads`,
      body: `adset_id=${ad.adSetId}&name=${encodeURIComponent(ad.name)}&status=PAUSED&creative=${encodeURIComponent(JSON.stringify({ creative_id: ad.creativeId }))}`,
    }));

    return rateLimitedCall(() => this.apiCall('POST', '', { batch: batchRequests }));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractGeoTargets(campaign) {
  const pd = campaign.proposalData;
  if (pd?.deployedTargeting?.countries) return pd.deployedTargeting.countries;
  if (campaign.geoTargets?.length > 0) return campaign.geoTargets;
  return ['GB'];
}

function getRegion(countries) {
  for (const code of countries) {
    const region = REGION_MAP[code];
    if (region) return region;
  }
  return 'UK & Ireland'; // Default
}

function requiresDsa(countries) {
  return countries.some((c) => EU_COUNTRIES.has(c));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const testMove = args.includes('--test-move');

  console.info('=== Move Legacy Ads into Consolidated Meta Campaigns ===');
  console.info(`Mode: ${testMove ? 'TEST MOVE' : apply ? 'APPLY' : 'DRY RUN'}`);
  console.info('');

  // -------------------------------------------------------------------------
  // Phase 1: Load DB State
  // -------------------------------------------------------------------------
  console.info('Phase 1: Loading DB state...');

  // Load consolidated parents
  const parents = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      parentCampaignId: null,
      proposalData: { path: ['consolidatedCampaign'], equals: true },
    },
    select: {
      id: true,
      name: true,
      status: true,
      campaignGroup: true,
      platformCampaignId: true,
      siteId: true,
    },
  });

  console.info(`  Consolidated parents: ${parents.length}`);
  for (const p of parents) {
    console.info(`    ${p.name} (${p.platformCampaignId}) — ${p.status}`);
  }

  // Load children (ad sets)
  const children = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      parentCampaignId: { in: parents.map((p) => p.id) },
    },
    select: {
      id: true,
      name: true,
      parentCampaignId: true,
      platformAdSetId: true,
      platformAdId: true,
      campaignGroup: true,
      proposalData: true,
    },
  });

  console.info(`  Existing children (ad sets): ${children.length}`);

  // Build map: campaignGroup → { parent, child with platformAdSetId }
  const groupMap = {};
  for (const parent of parents) {
    const child = children.find((c) => c.parentCampaignId === parent.id);
    groupMap[parent.campaignGroup] = {
      parent,
      child,
      platformCampaignId: parent.platformCampaignId,
      platformAdSetId: child?.platformAdSetId,
    };
  }

  // Handle General Tours mapping
  // Legacy campaigns with campaignGroup "General Tours" get assigned to Tier 2
  // (Tier 1 was skipped during creation — 0 qualifying suppliers)
  if (!groupMap['General Tours'] && groupMap['General Tours – Tier 2']) {
    groupMap['General Tours'] = groupMap['General Tours – Tier 2'];
  }

  console.info('\n  Campaign group → Ad set mapping:');
  for (const [group, info] of Object.entries(groupMap)) {
    console.info(`    ${group} → ad set ${info.platformAdSetId || 'NONE'}`);
  }

  // Load legacy campaigns
  // NOTE: Prisma's NOT + JSON path filter is buggy (returns 0 results),
  // so we filter out consolidated campaigns in-memory instead.
  const allLegacyCandidates = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      parentCampaignId: null,
      status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] },
      platformCampaignId: { not: null },
    },
    select: {
      id: true,
      name: true,
      campaignGroup: true,
      platformCampaignId: true,
      geoTargets: true,
      proposalData: true,
      targetUrl: true,
      siteId: true,
      micrositeId: true,
    },
  });
  const legacyCampaigns = allLegacyCandidates.filter(
    (c) => c.proposalData?.consolidatedCampaign !== true
  );

  console.info(`\n  Legacy campaigns with platformCampaignId: ${legacyCampaigns.length}`);

  // Group legacy by campaignGroup
  const legacyByGroup = {};
  for (const c of legacyCampaigns) {
    const group = c.campaignGroup || 'General Tours';
    if (!legacyByGroup[group]) legacyByGroup[group] = [];
    legacyByGroup[group].push(c);
  }

  console.info('  Legacy campaigns by group:');
  for (const [group, campaigns] of Object.entries(legacyByGroup)) {
    console.info(`    ${group}: ${campaigns.length}`);
  }

  if (!apply && !testMove) {
    // -----------------------------------------------------------------------
    // DRY RUN: Skip Meta API calls, just show the plan
    // -----------------------------------------------------------------------
    console.info('\n--- DRY RUN PLAN ---');

    // Build a plan for what would happen
    let totalAds = 0;
    let generalToursAds = 0;

    for (const [group, campaigns] of Object.entries(legacyByGroup)) {
      // Resolve target group
      let targetGroup = group;
      if (group === 'General Tours') targetGroup = 'General Tours – Tier 2';
      if (group === 'General Tours – Tier 1') targetGroup = 'General Tours – Tier 2';

      const target = groupMap[targetGroup];
      if (!target) {
        console.info(`\n  ${group} (${campaigns.length} campaigns) — NO TARGET, would skip`);
        continue;
      }

      console.info(`\n  ${group} (${campaigns.length} campaigns) → ${target.parent.name}`);
      console.info(`    Target ad set: ${target.platformAdSetId}`);

      if (targetGroup.includes('General Tours')) {
        // Show regional breakdown
        const byRegion = {};
        for (const c of campaigns) {
          const countries = extractGeoTargets(c);
          const region = getRegion(countries);
          if (!byRegion[region]) byRegion[region] = 0;
          byRegion[region]++;
        }
        for (const [region, count] of Object.entries(byRegion)) {
          console.info(`      ${region}: ${count} ads`);
        }
        generalToursAds += campaigns.length;
      }

      totalAds += campaigns.length;
    }

    console.info(`\n  Total ads to migrate: ${totalAds}`);
    console.info(`  General Tours ads (need regional split): ${generalToursAds}`);
    console.info(`  Other ads (direct to existing ad set): ${totalAds - generalToursAds}`);
    console.info('\n=== DRY RUN — no changes made ===');
    console.info('Run with --test-move to test cross-objective ad move.');
    console.info('Run with --apply to execute migration.');
    return;
  }

  // -------------------------------------------------------------------------
  // Phase 2: Fetch all ads from Meta
  // -------------------------------------------------------------------------
  console.info('\nPhase 2: Fetching all ads from Meta account...');
  const metaClient = await MetaClient.create();
  const allMetaAds = await metaClient.fetchAllAccountAds();
  console.info(`  Total ads in account: ${allMetaAds.length}`);

  // Build index: Meta campaign ID → ads
  const adsByCampaignId = {};
  for (const ad of allMetaAds) {
    const cid = ad.campaign_id;
    if (!adsByCampaignId[cid]) adsByCampaignId[cid] = [];
    adsByCampaignId[cid].push(ad);
  }

  // Match legacy DB records to Meta ads
  let matchedCount = 0;
  let unmatchedCount = 0;
  const legacyAdsToMigrate = []; // { legacyCampaign, metaAd, targetGroup }

  for (const campaign of legacyCampaigns) {
    const metaAds = adsByCampaignId[campaign.platformCampaignId] || [];
    if (metaAds.length === 0) {
      unmatchedCount++;
      continue;
    }

    // Resolve target group
    let targetGroup = campaign.campaignGroup || 'General Tours';
    if (targetGroup === 'General Tours' || targetGroup === 'General Tours – Tier 1') {
      targetGroup = 'General Tours – Tier 2';
    }

    for (const metaAd of metaAds) {
      legacyAdsToMigrate.push({ legacyCampaign: campaign, metaAd, targetGroup });
      matchedCount++;
    }
  }

  console.info(`  Matched ads: ${matchedCount}`);
  console.info(`  Legacy campaigns with no Meta ads found: ${unmatchedCount}`);

  // Identify which ads/creatives are already in consolidated campaigns
  const consolidatedCampaignIds = new Set(parents.map((p) => p.platformCampaignId));
  const existingConsolidatedAds = allMetaAds.filter((ad) =>
    consolidatedCampaignIds.has(ad.campaign_id)
  );
  console.info(`  Existing ads in consolidated campaigns: ${existingConsolidatedAds.length}`);

  // Build set of ad names already in consolidated campaigns (for dedup on re-run)
  const existingAdNames = new Set(existingConsolidatedAds.map((ad) => ad.name).filter(Boolean));
  console.info(`  Unique ad names already in consolidated: ${existingAdNames.size}`);

  // Filter out legacy ads whose name already exists in a consolidated campaign
  const beforeDedup = legacyAdsToMigrate.length;
  const deduped = legacyAdsToMigrate.filter((item) => {
    const name = item.metaAd.name || `Migrated - ${item.legacyCampaign.name?.slice(0, 40)}`;
    return !existingAdNames.has(name);
  });
  const skippedDedup = beforeDedup - deduped.length;
  if (skippedDedup > 0) {
    console.info(`  Skipping ${skippedDedup} ads (name already in consolidated)`);
  }
  legacyAdsToMigrate.length = 0;
  legacyAdsToMigrate.push(...deduped);

  // -------------------------------------------------------------------------
  // Phase 3: Test cross-objective move (--test-move only)
  // -------------------------------------------------------------------------
  if (testMove) {
    console.info('\nPhase 3: Cross-objective move test (DEPRECATED)');
    console.info('  WARNING: Meta API silently accepts ad moves across objectives but does');
    console.info('  NOT actually move the ad. The API returns success but the ad stays put.');
    console.info('  Use --apply to RECREATE ads using creative IDs instead.');
    return;
  }

  // -------------------------------------------------------------------------
  // Phase 4: Execute migration (--apply)
  // -------------------------------------------------------------------------
  console.info('\nPhase 4: Executing migration...');

  // NOTE: Cross-objective moves appear to succeed (API returns 200) but
  // silently do nothing — the ad stays in its original ad set. This was
  // confirmed after running --apply and verifying 0 ads actually moved.
  // Force RECREATE strategy: create new ads using existing creative IDs.
  const canMove = false;
  const strategy = 'RECREATE';
  console.info(`\n  Strategy: ${strategy}`);

  // Separate General Tours from other groups
  const generalToursAds = legacyAdsToMigrate.filter(
    (a) => a.targetGroup === 'General Tours – Tier 2'
  );
  const otherAds = legacyAdsToMigrate.filter((a) => a.targetGroup !== 'General Tours – Tier 2');

  console.info(`  General Tours ads: ${generalToursAds.length}`);
  console.info(`  Other ads: ${otherAds.length}`);

  const siteName = 'Holibob Experiences';
  let adsProcessed = 0;
  let adsFailed = 0;
  let adSetsCreated = 0;

  // ---- Handle non-General Tours groups (direct to existing ad set) ----
  console.info('\n  Processing non-General Tours ads...');
  const otherByGroup = {};
  for (const item of otherAds) {
    if (!otherByGroup[item.targetGroup]) otherByGroup[item.targetGroup] = [];
    otherByGroup[item.targetGroup].push(item);
  }

  for (const [group, items] of Object.entries(otherByGroup)) {
    const target = groupMap[group];
    if (!target?.platformAdSetId) {
      console.warn(`    ${group}: No target ad set — skipping ${items.length} ads`);
      continue;
    }

    console.info(`\n    ${group}: ${items.length} ads → ad set ${target.platformAdSetId}`);

    for (const item of items) {
      try {
        if (canMove) {
          await metaClient.testMoveAd(item.metaAd.id, target.platformAdSetId);
          console.info(`      MOVED ${item.metaAd.id} (${item.metaAd.name?.slice(0, 40)})`);
        } else {
          // Recreate using object_story_spec (new creative avoids pixel permission errors)
          const creativeId = item.metaAd.creative?.id;
          if (!creativeId) {
            console.warn(`      No creative ID for ad ${item.metaAd.id} — skipping`);
            adsFailed++;
            continue;
          }
          const creative = await metaClient.fetchCreativeDetails(creativeId);
          if (!creative.object_story_spec) {
            console.warn(`      No object_story_spec for creative ${creativeId} — skipping`);
            adsFailed++;
            continue;
          }
          const result = await metaClient.createAdWithNewCreative({
            adSetId: target.platformAdSetId,
            name: item.metaAd.name || `Migrated - ${item.legacyCampaign.name?.slice(0, 40)}`,
            objectStorySpec: creative.object_story_spec,
            urlTags: creative.url_tags,
          });
          console.info(`      CREATED ${result.id} (${item.metaAd.name?.slice(0, 40)})`);
        }
        adsProcessed++;
      } catch (err) {
        console.warn(`      FAILED ${item.metaAd.id}: ${err.message}`);
        adsFailed++;
      }

      if ((adsProcessed + adsFailed) % 50 === 0) {
        console.info(`    Progress: ${adsProcessed} processed, ${adsFailed} failed`);
      }
    }
  }

  // ---- Handle General Tours (split into regional sub-ad-sets) ----
  if (generalToursAds.length > 0) {
    console.info(`\n  Processing General Tours: ${generalToursAds.length} ads`);

    const gtTarget = groupMap['General Tours – Tier 2'];
    if (!gtTarget) {
      console.warn('    No General Tours – Tier 2 target — skipping');
    } else {
      // Group by region
      const byRegion = {};
      for (const item of generalToursAds) {
        const countries = extractGeoTargets(item.legacyCampaign);
        const region = getRegion(countries);
        if (!byRegion[region]) byRegion[region] = { items: [], countries: new Set() };
        byRegion[region].items.push(item);
        for (const c of countries) byRegion[region].countries.add(c);
      }

      console.info('    Regional breakdown:');
      for (const [region, data] of Object.entries(byRegion)) {
        console.info(`      ${region}: ${data.items.length} ads`);
      }

      // For each region, create a new ad set (or use existing for first region)
      const regionAdSets = {}; // region → platformAdSetId

      for (const [region, data] of Object.entries(byRegion)) {
        const adSetName = `General Tours – Tier 2 – ${region} - Ad Set`;
        const countries = [...data.countries];
        const needsDsa = requiresDsa(countries);

        // Check if child already exists for this region
        const existingChild = await prisma.adCampaign.findFirst({
          where: {
            parentCampaignId: gtTarget.parent.id,
            name: { startsWith: `General Tours – Tier 2 – ${region}` },
          },
        });

        if (existingChild?.platformAdSetId) {
          console.info(`      ${region}: Using existing ad set ${existingChild.platformAdSetId}`);
          regionAdSets[region] = existingChild.platformAdSetId;
        } else {
          // Create new ad set on Meta
          const result = await metaClient.createAdSet({
            campaignId: gtTarget.platformCampaignId,
            name: adSetName,
            countries,
            ageMin: 18,
            ageMax: 65,
            dsaBeneficiary: needsDsa ? siteName : undefined,
            dsaPayor: needsDsa ? siteName : undefined,
          });
          regionAdSets[region] = result.id;
          adSetsCreated++;
          console.info(`      ${region}: Created ad set ${result.id}`);

          // Create child DB record
          const bestSource = data.items[0].legacyCampaign;
          await prisma.adCampaign.create({
            data: {
              siteId: bestSource.siteId || gtTarget.parent.siteId,
              micrositeId: bestSource.micrositeId || null,
              platform: 'FACEBOOK',
              parentCampaignId: gtTarget.parent.id,
              platformCampaignId: gtTarget.platformCampaignId,
              platformAdSetId: result.id,
              platformAdId: null,
              campaignGroup: 'General Tours – Tier 2',
              name: `General Tours – Tier 2 – ${region}`,
              status: 'PAUSED',
              dailyBudget: 0,
              maxCpc: 0,
              keywords: [],
              targetUrl: bestSource.targetUrl || 'https://holibob.com',
              geoTargets: countries,
              utmSource: 'facebook_ads',
              utmMedium: 'cpc',
              utmCampaign: `meta_general_tours_tier_2_${region.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
              proposalData: {
                regionalAdSet: true,
                region,
                migratedAdCount: data.items.length,
              },
            },
          });
          console.info(`      ${region}: Created DB child record`);
        }
      }

      // Now migrate ads into their regional ad sets
      console.info('\n    Migrating General Tours ads...');
      for (const item of generalToursAds) {
        const countries = extractGeoTargets(item.legacyCampaign);
        const region = getRegion(countries);
        const targetAdSetId = regionAdSets[region];

        if (!targetAdSetId) {
          console.warn(`      No ad set for region ${region} — skipping ${item.metaAd.id}`);
          adsFailed++;
          continue;
        }

        try {
          if (canMove) {
            await metaClient.testMoveAd(item.metaAd.id, targetAdSetId);
            console.info(`      MOVED ${item.metaAd.id} → ${region}`);
          } else {
            const creativeId = item.metaAd.creative?.id;
            if (!creativeId) {
              console.warn(`      No creative ID for ad ${item.metaAd.id} — skipping`);
              adsFailed++;
              continue;
            }
            const creative = await metaClient.fetchCreativeDetails(creativeId);
            if (!creative.object_story_spec) {
              console.warn(`      No object_story_spec for creative ${creativeId} — skipping`);
              adsFailed++;
              continue;
            }
            const result = await metaClient.createAdWithNewCreative({
              adSetId: targetAdSetId,
              name: item.metaAd.name || `Migrated - ${item.legacyCampaign.name?.slice(0, 40)}`,
              objectStorySpec: creative.object_story_spec,
              urlTags: creative.url_tags,
            });
            console.info(
              `      CREATED ${result.id} → ${region} (${item.metaAd.name?.slice(0, 40)})`
            );
          }
          adsProcessed++;
        } catch (err) {
          console.warn(`      FAILED ${item.metaAd.id}: ${err.message}`);
          adsFailed++;
        }

        if ((adsProcessed + adsFailed) % 50 === 0) {
          console.info(`    Progress: ${adsProcessed} processed, ${adsFailed} failed`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.info('\n=== Migration Complete ===');
  console.info(`  Strategy: ${strategy}`);
  console.info(`  Ads ${canMove ? 'moved' : 'recreated'}: ${adsProcessed}`);
  console.info(`  Ads failed: ${adsFailed}`);
  console.info(`  New ad sets created (GT regions): ${adSetsCreated}`);
  console.info(`  Existing consolidated ads (kept): ${existingConsolidatedAds.length}`);
  console.info(`  All new/moved ads are PAUSED.`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma[String.fromCharCode(36) + 'disconnect']());
