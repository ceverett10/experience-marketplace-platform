/**
 * Move ~911 Legacy Ads into Consolidated Meta Campaigns
 *
 * Phase 3 migration created 8 consolidated campaigns (PAUSED) with 1 ad set
 * each containing 6 fresh ads (48 total). This script moves/recreates the
 * remaining ~911 legacy ads into those consolidated campaigns.
 *
 * Key constraint: Legacy campaigns use OUTCOME_TRAFFIC, new use OUTCOME_SALES.
 * Ads likely CANNOT be moved between different objectives — script tests first,
 * then falls back to recreating ads using creative data fetched from Meta.
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
    let url = `act_${this.adAccountId}/ads`;
    const fields = 'id,name,status,campaign_id,adset_id,creative{id,object_story_spec}';
    let page = 1;

    while (url) {
      console.info(`    Fetching ads page ${page}...`);
      const data = await rateLimitedCall(
        () => this.apiCall('GET', url, page === 1 ? { fields, limit: 500 } : {}),
        true
      );
      const ads = data.data || [];
      allAds.push(...ads);
      console.info(`    Got ${ads.length} ads (total: ${allAds.length})`);

      // Handle pagination
      const nextUrl = data.paging?.next;
      if (nextUrl) {
        // Extract the path after the API version for the next call
        const parsed = new URL(nextUrl);
        url = parsed.pathname.replace(`/${this.apiVersion}/`, '') + parsed.search;
        // For paginated calls, pass the full URL directly
        page++;
        // Use raw fetch for pagination URLs (they include access_token)
        const nextData = await rateLimitedCall(async () => {
          const response = await fetch(nextUrl, { signal: AbortSignal.timeout(30_000) });
          return response.json();
        }, true);
        if (nextData.error) {
          console.warn(`    Pagination error: ${nextData.error.message}`);
          break;
        }
        const nextAds = nextData.data || [];
        allAds.push(...nextAds);
        console.info(`    Got ${nextAds.length} more ads (total: ${allAds.length})`);
        // Check for further pages
        url = nextData.paging?.next ? 'HAS_MORE' : null;
        if (url === 'HAS_MORE') {
          // Continue with the next pagination URL
          const furtherUrl = nextData.paging.next;
          url = null; // Will be handled in next iteration logic below
          // Recursively handle remaining pages
          let currentUrl = furtherUrl;
          while (currentUrl) {
            page++;
            console.info(`    Fetching ads page ${page}...`);
            const pageData = await rateLimitedCall(async () => {
              const response = await fetch(currentUrl, { signal: AbortSignal.timeout(30_000) });
              return response.json();
            }, true);
            if (pageData.error) {
              console.warn(`    Pagination error: ${pageData.error.message}`);
              break;
            }
            const pageAds = pageData.data || [];
            allAds.push(...pageAds);
            console.info(`    Got ${pageAds.length} more ads (total: ${allAds.length})`);
            currentUrl = pageData.paging?.next || null;
          }
        }
        url = null; // Done with pagination
      } else {
        url = null;
      }
    }

    return allAds;
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
  const legacyCampaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'FACEBOOK',
      parentCampaignId: null,
      status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] },
      platformCampaignId: { not: null },
      NOT: {
        proposalData: { path: ['consolidatedCampaign'], equals: true },
      },
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

  // Also identify which ads are already in consolidated campaigns (the 48 fresh ones)
  const consolidatedCampaignIds = new Set(parents.map((p) => p.platformCampaignId));
  const existingConsolidatedAds = allMetaAds.filter((ad) =>
    consolidatedCampaignIds.has(ad.campaign_id)
  );
  console.info(`  Existing ads in consolidated campaigns: ${existingConsolidatedAds.length}`);

  // -------------------------------------------------------------------------
  // Phase 3: Test cross-objective move (--test-move only)
  // -------------------------------------------------------------------------
  if (testMove) {
    console.info('\nPhase 3: Testing cross-objective ad move...');

    if (legacyAdsToMigrate.length === 0) {
      console.info('  No legacy ads found to test with.');
      return;
    }

    const testAd = legacyAdsToMigrate[0];
    const target = groupMap[testAd.targetGroup];
    if (!target?.platformAdSetId) {
      console.info(`  No target ad set for group ${testAd.targetGroup}`);
      return;
    }

    console.info(`  Test ad: ${testAd.metaAd.id} (${testAd.metaAd.name})`);
    console.info(`  From campaign: ${testAd.metaAd.campaign_id}`);
    console.info(`  Original ad set: ${testAd.metaAd.adset_id}`);
    console.info(`  Target ad set: ${target.platformAdSetId}`);

    try {
      await metaClient.testMoveAd(testAd.metaAd.id, target.platformAdSetId);
      console.info('  SUCCESS — Cross-objective move works!');
      console.info('  Moving ad back to original ad set...');
      try {
        await metaClient.moveAdBack(testAd.metaAd.id, testAd.metaAd.adset_id);
        console.info('  Moved back successfully.');
      } catch (err) {
        console.warn(`  Could not move back: ${err.message}`);
        console.warn('  Ad remains in consolidated ad set (PAUSED).');
      }
      console.info('\n  RESULT: Use --apply to move all ads (fast path).');
    } catch (err) {
      console.info(`  FAILED — ${err.message}`);
      console.info('  Cross-objective move not supported.');
      console.info('  Will recreate ads using creative IDs (expected path).');
      console.info('\n  RESULT: Use --apply to recreate all ads in consolidated campaigns.');
    }
    return;
  }

  // -------------------------------------------------------------------------
  // Phase 4: Execute migration (--apply)
  // -------------------------------------------------------------------------
  console.info('\nPhase 4: Executing migration...');

  // First, test if move works with 1 ad
  let canMove = false;
  if (legacyAdsToMigrate.length > 0) {
    const testAd = legacyAdsToMigrate[0];
    const target = groupMap[testAd.targetGroup];
    if (target?.platformAdSetId) {
      console.info('  Testing cross-objective move with 1 ad...');
      try {
        await metaClient.testMoveAd(testAd.metaAd.id, target.platformAdSetId);
        canMove = true;
        console.info('  Move works! Will move all ads.');
        // Move it back — we'll process it properly below
        try {
          await metaClient.moveAdBack(testAd.metaAd.id, testAd.metaAd.adset_id);
        } catch (_err) {
          // If can't move back, mark as already processed
          console.info('  (Test ad stays in consolidated — will skip in main loop)');
        }
      } catch (err) {
        console.info(`  Move failed: ${err.message}`);
        console.info('  Will recreate ads using creative IDs.');
      }
    }
  }

  const strategy = canMove ? 'MOVE' : 'RECREATE';
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
          // Recreate using creative ID
          const creativeId = item.metaAd.creative?.id;
          if (!creativeId) {
            console.warn(`      No creative for ad ${item.metaAd.id} — skipping`);
            adsFailed++;
            continue;
          }
          const result = await metaClient.createAdFromCreative({
            adSetId: target.platformAdSetId,
            name: item.metaAd.name || `Migrated - ${item.legacyCampaign.name?.slice(0, 40)}`,
            creativeId,
          });
          console.info(
            `      CREATED ${result.id} from creative ${creativeId} (${item.metaAd.name?.slice(0, 40)})`
          );
        }
        adsProcessed++;
      } catch (err) {
        console.warn(`      FAILED ${item.metaAd.id}: ${err.message}`);
        adsFailed++;
      }

      if (adsProcessed % 50 === 0) {
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
              console.warn(`      No creative for ad ${item.metaAd.id} — skipping`);
              adsFailed++;
              continue;
            }
            const result = await metaClient.createAdFromCreative({
              adSetId: targetAdSetId,
              name: item.metaAd.name || `Migrated - ${item.legacyCampaign.name?.slice(0, 40)}`,
              creativeId,
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

        if (adsProcessed % 50 === 0) {
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
