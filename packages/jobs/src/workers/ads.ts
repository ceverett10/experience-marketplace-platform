/**
 * Ads Queue Worker Handlers
 *
 * Handles paid traffic acquisition jobs:
 * - PAID_KEYWORD_SCAN: Discover low-CPC keyword opportunities
 * - AD_CAMPAIGN_SYNC: Sync ad platform campaign data into AdCampaign/AdDailyMetric
 * - AD_PERFORMANCE_REPORT: Generate cross-platform performance reports
 * - AD_BUDGET_OPTIMIZER: Auto-reallocate budget based on ROAS
 * - BIDDING_ENGINE_RUN: Full profitability-driven campaign orchestration
 * - KEYWORD_ENRICHMENT: Bulk keyword extraction from product data
 * - AD_CONVERSION_UPLOAD: Upload conversions to Meta/Google via server-side CAPI
 */

import type { Job } from 'bullmq';
import type {
  JobResult,
  AdCampaignSyncPayload,
  AdPerformanceReportPayload,
  AdBudgetOptimizerPayload,
} from '../types';
import { prisma } from '@experience-marketplace/database';
import { runPaidKeywordScan } from '../services/paid-keyword-scanner';
import { runBiddingEngine } from '../services/bidding-engine';
import { runBulkEnrichment, type EnrichmentResult } from '../services/keyword-enrichment';
import { uploadMetaConversion, uploadGoogleConversion } from '../services/conversions-api';
import { runAlertChecks, createSyncFailureAlert } from '../services/ad-alerting';
import { MetaAdsClient } from '../services/social/meta-ads-client';
import { refreshTokenIfNeeded } from '../services/social/token-refresh';
import {
  isGoogleAdsConfigured,
  createSearchCampaign,
  createKeywordAdGroup,
  createResponsiveSearchAd,
  getCampaignPerformance as getGoogleCampaignPerformance,
  setCampaignStatus as setGoogleCampaignStatus,
} from '../services/google-ads-client';

// --- Helpers -----------------------------------------------------------------

const OBSERVATION_DAYS = 7; // Minimum days before pausing underperformers
const ROAS_PAUSE_THRESHOLD = 0.5; // Pause campaigns below this ROAS after observation
const ROAS_SCALE_THRESHOLD = 2.0; // Scale up campaigns above this ROAS
const SCALE_INCREMENT = 0.15; // Scale budget up by 15%
const MAX_DAILY_BUDGET = parseFloat(process.env['BIDDING_MAX_DAILY_BUDGET'] || '200');

/** Get a configured MetaAdsClient, or null if not configured. */
async function getMetaAdsClient(): Promise<MetaAdsClient | null> {
  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) return null;

  const account = await prisma.socialAccount.findFirst({
    where: { platform: 'FACEBOOK', isActive: true },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      accountId: true,
    },
  });
  if (!account?.accessToken) return null;

  const { accessToken } = await refreshTokenIfNeeded(account);
  return new MetaAdsClient({ accessToken, adAccountId });
}

/** Format a date as YYYY-MM-DD. */
function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

// --- PAID_KEYWORD_SCAN -------------------------------------------------------

export async function handlePaidKeywordScan(job: Job): Promise<JobResult> {
  const { siteId, maxCpc, minVolume, modes } = job.data as {
    siteId?: string;
    maxCpc?: number;
    minVolume?: number;
    modes?: ('gsc' | 'expansion' | 'discovery' | 'pinterest' | 'meta')[];
  };

  console.log('[Ads Worker] Starting paid keyword scan');
  const result = await runPaidKeywordScan({ siteId, maxCpc, minVolume, modes });

  return {
    success: true,
    message: `Discovered ${result.totalKeywordsStored} new paid keyword opportunities`,
    data: result as unknown as Record<string, unknown>,
    timestamp: new Date(),
  };
}

// --- AD_CAMPAIGN_SYNC --------------------------------------------------------

/**
 * Syncs campaign performance from Meta + Google APIs into AdCampaign and AdDailyMetric.
 * Matches conversions by joining bookings via UTM campaign attribution.
 */
export async function handleAdCampaignSync(job: Job): Promise<JobResult> {
  const payload = job.data as AdCampaignSyncPayload;
  console.log('[Ads Worker] Starting ad campaign sync');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = formatDate(yesterday);
  const today = formatDate(new Date());

  // Get all active campaigns (or filter by platform/campaignId)
  const where: Record<string, unknown> = { status: { in: ['ACTIVE', 'PAUSED'] } };
  if (payload.campaignId) where['id'] = payload.campaignId;
  if (payload.platform) where['platform'] = payload.platform;

  const campaigns = await prisma.adCampaign.findMany({
    where: where as any,
    select: {
      id: true,
      platform: true,
      platformCampaignId: true,
      utmCampaign: true,
      siteId: true,
    },
  });

  if (campaigns.length === 0) {
    return {
      success: true,
      message: 'No active campaigns to sync',
      timestamp: new Date(),
    };
  }

  let metaClient: MetaAdsClient | null = null;
  let synced = 0;
  let errors = 0;

  for (const campaign of campaigns) {
    if (!campaign.platformCampaignId) continue;

    try {
      let insights: {
        spend: number;
        clicks: number;
        impressions: number;
        cpc: number;
        conversions: number;
      } | null = null;

      // Fetch platform-specific insights
      if (campaign.platform === 'FACEBOOK') {
        if (!metaClient) metaClient = await getMetaAdsClient();
        if (!metaClient) continue;

        const metaInsights = await metaClient.getCampaignInsights(
          campaign.platformCampaignId,
          { since: dateStr, until: today }
        );
        if (metaInsights) {
          insights = {
            spend: metaInsights.spend,
            clicks: metaInsights.clicks,
            impressions: metaInsights.impressions,
            cpc: metaInsights.cpc,
            conversions: 0, // Will be calculated from bookings below
          };
        }
      } else if (campaign.platform === 'GOOGLE_SEARCH') {
        if (!isGoogleAdsConfigured()) continue;

        const googleInsights = await getGoogleCampaignPerformance(
          campaign.platformCampaignId,
          { startDate: dateStr, endDate: dateStr }
        );
        if (googleInsights) {
          insights = {
            spend: googleInsights.spend,
            clicks: googleInsights.clicks,
            impressions: googleInsights.impressions,
            cpc: googleInsights.avgCpc,
            conversions: googleInsights.conversions,
          };
        }
      }

      if (!insights) continue;

      // Match conversions via UTM campaign attribution
      const bookingRevenue = await prisma.booking.aggregate({
        where: {
          siteId: campaign.siteId,
          utmCampaign: campaign.utmCampaign,
          status: { in: ['CONFIRMED', 'COMPLETED'] },
          createdAt: { gte: yesterday, lte: new Date() },
        },
        _sum: { commissionAmount: true },
        _count: true,
      });

      const dailyRevenue = Number(bookingRevenue._sum.commissionAmount || 0);
      const dailyConversions = bookingRevenue._count;

      // Upsert daily metric
      await prisma.adDailyMetric.upsert({
        where: {
          campaignId_date: { campaignId: campaign.id, date: yesterday },
        },
        create: {
          campaignId: campaign.id,
          date: yesterday,
          spend: insights.spend,
          clicks: insights.clicks,
          impressions: insights.impressions,
          cpc: insights.cpc || 0,
          conversions: dailyConversions,
          revenue: dailyRevenue,
        },
        update: {
          spend: insights.spend,
          clicks: insights.clicks,
          impressions: insights.impressions,
          cpc: insights.cpc || 0,
          conversions: dailyConversions,
          revenue: dailyRevenue,
        },
      });

      // Update aggregate totals on campaign
      const allTimeMetrics = await prisma.adDailyMetric.aggregate({
        where: { campaignId: campaign.id },
        _sum: { spend: true, clicks: true, impressions: true, conversions: true, revenue: true },
      });

      const totalSpend = Number(allTimeMetrics._sum.spend || 0);
      const totalClicks = Number(allTimeMetrics._sum.clicks || 0);
      const totalRevenue = Number(allTimeMetrics._sum.revenue || 0);
      const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;

      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: {
          totalSpend,
          totalClicks,
          totalImpressions: Number(allTimeMetrics._sum.impressions || 0),
          avgCpc: totalClicks > 0 ? totalSpend / totalClicks : null,
          conversions: Number(allTimeMetrics._sum.conversions || 0),
          revenue: totalRevenue,
          roas,
        },
      });

      synced++;
      console.log(
        `[Ads Worker] Synced ${campaign.platform} campaign ${campaign.id}: ` +
          `spend=£${insights.spend.toFixed(2)}, clicks=${insights.clicks}, ` +
          `conversions=${dailyConversions}, ROAS=${roas?.toFixed(2) ?? 'N/A'}`
      );
    } catch (error) {
      errors++;
      console.error(`[Ads Worker] Failed to sync campaign ${campaign.id}:`, error);
    }
  }

  // Run alert checks after sync completes
  let alertsCreated = 0;
  try {
    const alertResult = await runAlertChecks();
    alertsCreated = alertResult.alertsCreated;
  } catch (alertError) {
    console.error('[Ads Worker] Alert checks failed:', alertError);
  }

  // Create a sync failure alert if there were errors
  if (errors > 0) {
    try {
      await createSyncFailureAlert(`${errors} of ${campaigns.length} campaigns failed to sync`);
    } catch {
      // Don't fail the sync just because alerting failed
    }
  }

  return {
    success: errors === 0,
    message: `Synced ${synced}/${campaigns.length} campaigns (${errors} errors, ${alertsCreated} alerts)`,
    data: { synced, total: campaigns.length, errors, alertsCreated },
    timestamp: new Date(),
  };
}

// --- AD_PERFORMANCE_REPORT ---------------------------------------------------

/**
 * Generates portfolio-wide performance report.
 * Identifies top performers, underperformers, and opportunities.
 */
export async function handleAdPerformanceReport(job: Job): Promise<JobResult> {
  const payload = job.data as AdPerformanceReportPayload;
  console.log('[Ads Worker] Generating ad performance report');

  const startDate = payload.dateRange?.start
    ? new Date(payload.dateRange.start)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
  const endDate = payload.dateRange?.end ? new Date(payload.dateRange.end) : new Date();

  const where: Record<string, unknown> = {
    status: { in: ['ACTIVE', 'PAUSED'] },
  };
  if (payload.siteId) where['siteId'] = payload.siteId;

  const campaigns = await prisma.adCampaign.findMany({
    where: where as any,
    include: {
      site: { select: { name: true } },
      dailyMetrics: {
        where: { date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'desc' },
      },
    },
  });

  // Categorize campaigns
  const topPerformers: Array<{ id: string; name: string; site: string; roas: number; spend: number }> = [];
  const underPerformers: Array<{ id: string; name: string; site: string; roas: number; spend: number; daysActive: number }> = [];
  const opportunities: Array<{ id: string; name: string; site: string; ctr: number; spend: number }> = [];

  let totalSpend = 0;
  let totalRevenue = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalConversions = 0;

  for (const campaign of campaigns) {
    const metrics = campaign.dailyMetrics;
    if (metrics.length === 0) continue;

    const spend = metrics.reduce((s, m) => s + Number(m.spend), 0);
    const revenue = metrics.reduce((s, m) => s + Number(m.revenue), 0);
    const clicks = metrics.reduce((s, m) => s + m.clicks, 0);
    const impressions = metrics.reduce((s, m) => s + m.impressions, 0);
    const conversions = metrics.reduce((s, m) => s + m.conversions, 0);
    const roas = spend > 0 ? revenue / spend : 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;

    totalSpend += spend;
    totalRevenue += revenue;
    totalClicks += clicks;
    totalImpressions += impressions;
    totalConversions += conversions;

    const siteName = campaign.site?.name || 'Unknown';

    if (roas >= ROAS_SCALE_THRESHOLD) {
      topPerformers.push({ id: campaign.id, name: campaign.name, site: siteName, roas, spend });
    } else if (roas < 1.0 && metrics.length >= OBSERVATION_DAYS && spend > 5) {
      underPerformers.push({
        id: campaign.id,
        name: campaign.name,
        site: siteName,
        roas,
        spend,
        daysActive: metrics.length,
      });
    } else if (ctr > 0.03 && spend < 10) {
      // High CTR but low spend — opportunity to scale
      opportunities.push({ id: campaign.id, name: campaign.name, site: siteName, ctr, spend });
    }
  }

  const portfolioRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  console.log(
    `[Ads Worker] Performance report: ${campaigns.length} campaigns, ` +
      `spend=£${totalSpend.toFixed(2)}, revenue=£${totalRevenue.toFixed(2)}, ` +
      `ROAS=${portfolioRoas.toFixed(2)}, ` +
      `top=${topPerformers.length}, under=${underPerformers.length}, opps=${opportunities.length}`
  );

  return {
    success: true,
    message: `Report: ${campaigns.length} campaigns, portfolio ROAS ${portfolioRoas.toFixed(2)}x`,
    data: {
      period: { start: formatDate(startDate), end: formatDate(endDate) },
      portfolio: {
        totalCampaigns: campaigns.length,
        totalSpend,
        totalRevenue,
        totalClicks,
        totalImpressions,
        totalConversions,
        roas: portfolioRoas,
        avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      },
      topPerformers: topPerformers.slice(0, 10),
      underPerformers: underPerformers.slice(0, 10),
      opportunities: opportunities.slice(0, 10),
    },
    timestamp: new Date(),
  };
}

// --- AD_BUDGET_OPTIMIZER -----------------------------------------------------

/**
 * Auto-reallocates budget based on ROAS:
 * - Pauses campaigns with ROAS < 0.5 after 7-day observation
 * - Scales up campaigns with ROAS > target by 15% daily
 * - Creates new campaigns from top-scored PAID_CANDIDATE opportunities
 * - Respects portfolio-wide budget cap
 */
export async function handleAdBudgetOptimizer(job: Job): Promise<JobResult> {
  const payload = job.data as AdBudgetOptimizerPayload;
  console.log('[Ads Worker] Starting budget optimizer');

  const maxBudget = payload.maxCpc ? undefined : MAX_DAILY_BUDGET;
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - OBSERVATION_DAYS);

  const where: Record<string, unknown> = { status: 'ACTIVE' };
  if (payload.siteId) where['siteId'] = payload.siteId;

  const campaigns = await prisma.adCampaign.findMany({
    where: where as any,
    include: {
      site: { select: { name: true } },
      dailyMetrics: {
        where: { date: { gte: lookback } },
        orderBy: { date: 'desc' },
      },
    },
  });

  let paused = 0;
  let scaled = 0;
  let totalDailyBudget = 0;

  for (const campaign of campaigns) {
    const metrics = campaign.dailyMetrics;
    const spend = metrics.reduce((s, m) => s + Number(m.spend), 0);
    const revenue = metrics.reduce((s, m) => s + Number(m.revenue), 0);
    const roas = spend > 0 ? revenue / spend : 0;
    const dailyBudget = Number(campaign.dailyBudget);

    // --- Pause underperformers ---
    if (roas < ROAS_PAUSE_THRESHOLD && metrics.length >= OBSERVATION_DAYS && spend > 5) {
      console.log(
        `[Ads Worker] Pausing campaign "${campaign.name}" (ROAS=${roas.toFixed(2)}, ` +
          `spend=£${spend.toFixed(2)} over ${metrics.length} days)`
      );

      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: { status: 'PAUSED' },
      });

      // Also pause on the ad platform
      if (campaign.platformCampaignId) {
        try {
          if (campaign.platform === 'FACEBOOK') {
            const metaClient = await getMetaAdsClient();
            if (metaClient) {
              await metaClient.setCampaignStatus(campaign.platformCampaignId, 'PAUSED');
            }
          } else if (campaign.platform === 'GOOGLE_SEARCH' && isGoogleAdsConfigured()) {
            await setGoogleCampaignStatus(campaign.platformCampaignId, 'PAUSED');
          }
        } catch (err) {
          console.error(`[Ads Worker] Failed to pause platform campaign: ${err}`);
        }
      }

      paused++;
      continue; // Don't count paused campaigns in budget
    }

    // --- Scale up top performers ---
    if (roas >= ROAS_SCALE_THRESHOLD && metrics.length >= 3) {
      const newBudget = Math.min(dailyBudget * (1 + SCALE_INCREMENT), 50); // Cap at £50/day per campaign
      const budgetCap = maxBudget || MAX_DAILY_BUDGET;

      // Check portfolio budget cap
      if (totalDailyBudget + newBudget <= budgetCap) {
        await prisma.adCampaign.update({
          where: { id: campaign.id },
          data: { dailyBudget: newBudget },
        });

        console.log(
          `[Ads Worker] Scaling campaign "${campaign.name}" from £${dailyBudget.toFixed(2)} → £${newBudget.toFixed(2)} ` +
            `(ROAS=${roas.toFixed(2)})`
        );
        scaled++;
        totalDailyBudget += newBudget;
      } else {
        totalDailyBudget += dailyBudget;
      }
    } else {
      totalDailyBudget += dailyBudget;
    }
  }

  const budgetRemaining = (maxBudget || MAX_DAILY_BUDGET) - totalDailyBudget;

  console.log(
    `[Ads Worker] Budget optimizer: paused=${paused}, scaled=${scaled}, ` +
      `dailyBudget=£${totalDailyBudget.toFixed(2)}, remaining=£${budgetRemaining.toFixed(2)}`
  );

  return {
    success: true,
    message: `Optimized: ${paused} paused, ${scaled} scaled, £${budgetRemaining.toFixed(2)} budget remaining`,
    data: {
      paused,
      scaled,
      totalDailyBudget,
      budgetRemaining,
      activeCampaigns: campaigns.length - paused,
    },
    timestamp: new Date(),
  };
}

// --- Campaign Deployment to Platforms -----------------------------------------

/**
 * Deploy a DRAFT AdCampaign to its target platform (Meta or Google Ads).
 * Creates the campaign, ad set/ad group, and ad creative on the platform,
 * then updates the DB record with the platform campaign ID.
 *
 * Returns the platform campaign ID, or null if deployment failed.
 */
async function deployCampaignToPlatform(campaign: {
  id: string;
  platform: string;
  name: string;
  dailyBudget: number;
  maxCpc: number;
  keywords: string[];
  targetUrl: string;
  geoTargets: string[];
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  site?: { name: string; primaryDomain: string | null } | null;
}): Promise<string | null> {
  const landingUrl = buildLandingUrl(campaign);

  if (campaign.platform === 'FACEBOOK') {
    return deployToMeta(campaign, landingUrl);
  } else if (campaign.platform === 'GOOGLE_SEARCH') {
    return deployToGoogle(campaign, landingUrl);
  }

  console.log(`[Ads Worker] Unsupported platform: ${campaign.platform}`);
  return null;
}

function buildLandingUrl(campaign: {
  targetUrl: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}): string {
  const url = new URL(campaign.targetUrl);
  if (campaign.utmSource) url.searchParams.set('utm_source', campaign.utmSource);
  if (campaign.utmMedium) url.searchParams.set('utm_medium', campaign.utmMedium);
  if (campaign.utmCampaign) url.searchParams.set('utm_campaign', campaign.utmCampaign);
  return url.toString();
}

/**
 * Deploy campaign to Meta (Facebook) Ads:
 * 1. Create campaign shell
 * 2. Create ad set with interest targeting + CPC bid
 * 3. Create ad with landing page link
 */
async function deployToMeta(
  campaign: {
    id: string;
    name: string;
    dailyBudget: number;
    maxCpc: number;
    keywords: string[];
    geoTargets: string[];
    site?: { name: string } | null;
  },
  landingUrl: string
): Promise<string | null> {
  const metaClient = await getMetaAdsClient();
  if (!metaClient) {
    console.log('[Ads Worker] Meta Ads not configured, skipping deployment');
    return null;
  }

  const pageId = process.env['META_PAGE_ID'];
  if (!pageId) {
    console.log('[Ads Worker] META_PAGE_ID not set, cannot create Meta ads');
    return null;
  }

  try {
    // Step 1: Create campaign (PAUSED for safety — activate manually or via optimizer)
    const campaignResult = await metaClient.createCampaign({
      name: campaign.name,
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: campaign.dailyBudget,
      status: 'PAUSED',
    });

    if (!campaignResult) {
      console.error(`[Ads Worker] Failed to create Meta campaign: ${campaign.name}`);
      return null;
    }

    // Step 2: Create ad set with geo + interest targeting
    // Map geoTargets to country codes (simplified — expand as needed)
    const countryMap: Record<string, string> = {
      'United Kingdom': 'GB', 'United States': 'US', 'UK': 'GB', 'US': 'US',
      'Canada': 'CA', 'Australia': 'AU', 'Germany': 'DE', 'France': 'FR',
      'Spain': 'ES', 'Italy': 'IT', 'Netherlands': 'NL', 'Portugal': 'PT',
      'Greece': 'GR', 'Croatia': 'HR', 'Thailand': 'TH', 'Japan': 'JP',
      'Mexico': 'MX', 'Brazil': 'BR', 'India': 'IN', 'UAE': 'AE',
    };
    const countries = campaign.geoTargets
      .map((g) => countryMap[g] || null)
      .filter((c): c is string => c !== null);
    if (countries.length === 0) countries.push('GB', 'US'); // Default markets

    // Search for relevant interests based on the keyword
    const keyword = campaign.keywords[0] || 'travel';
    const interests = await metaClient.searchInterests(keyword);
    const interestTargeting = interests.map((i) => ({ id: i.id, name: i.name }));

    const adSetResult = await metaClient.createAdSet({
      campaignId: campaignResult.campaignId,
      name: `${campaign.name} - Ad Set`,
      dailyBudget: campaign.dailyBudget,
      bidAmount: campaign.maxCpc,
      targeting: {
        countries,
        interests: interestTargeting.length > 0 ? interestTargeting : undefined,
        ageMin: 18,
        ageMax: 65,
      },
      optimizationGoal: 'LINK_CLICKS',
      billingEvent: 'LINK_CLICKS',
      status: 'PAUSED',
    });

    if (!adSetResult) {
      console.error(`[Ads Worker] Failed to create Meta ad set for campaign: ${campaignResult.campaignId}`);
      return campaignResult.campaignId; // Still return — campaign was created
    }

    // Step 3: Create ad creative
    const siteName = campaign.site?.name || 'Holibob';
    const headline = `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} | ${siteName}`.substring(0, 40);
    const body = `Discover and book amazing ${keyword} experiences. Best prices, instant confirmation.`;

    await metaClient.createAd({
      adSetId: adSetResult.adSetId,
      name: `${campaign.name} - Ad`,
      pageId,
      linkUrl: landingUrl,
      headline,
      body,
      callToAction: 'BOOK_TRAVEL',
      status: 'PAUSED',
    });

    console.log(`[Ads Worker] Deployed Meta campaign ${campaignResult.campaignId}: "${campaign.name}"`);
    return campaignResult.campaignId;
  } catch (err) {
    console.error(`[Ads Worker] Meta deployment failed for "${campaign.name}":`, err);
    return null;
  }
}

/**
 * Deploy campaign to Google Search Ads:
 * 1. Create search campaign with budget
 * 2. Create ad group with keywords
 * 3. Create responsive search ad
 */
async function deployToGoogle(
  campaign: {
    id: string;
    name: string;
    dailyBudget: number;
    maxCpc: number;
    keywords: string[];
    site?: { name: string } | null;
  },
  landingUrl: string
): Promise<string | null> {
  if (!isGoogleAdsConfigured()) {
    console.log('[Ads Worker] Google Ads not configured, skipping deployment');
    return null;
  }

  try {
    // Step 1: Create campaign (PAUSED for safety)
    const dailyBudgetMicros = Math.round(campaign.dailyBudget * 1_000_000);
    const campaignResult = await createSearchCampaign({
      name: campaign.name,
      dailyBudgetMicros,
      status: 'PAUSED',
    });

    if (!campaignResult) {
      console.error(`[Ads Worker] Failed to create Google campaign: ${campaign.name}`);
      return null;
    }

    // Step 2: Create ad group with keywords (exact + phrase match)
    const cpcBidMicros = Math.round(campaign.maxCpc * 1_000_000);
    const keywords = campaign.keywords.flatMap((kw) => [
      { text: kw, matchType: 'PHRASE' as const },
      { text: kw, matchType: 'EXACT' as const },
    ]);

    const adGroupResult = await createKeywordAdGroup({
      campaignId: campaignResult.campaignId,
      name: `${campaign.name} - Ad Group`,
      cpcBidMicros,
      keywords,
    });

    if (!adGroupResult) {
      console.error(`[Ads Worker] Failed to create Google ad group for: ${campaignResult.campaignId}`);
      return campaignResult.campaignId;
    }

    // Step 3: Create responsive search ad
    const keyword = campaign.keywords[0] || 'experiences';
    const siteName = campaign.site?.name || 'Holibob';
    const kwTitle = keyword.charAt(0).toUpperCase() + keyword.slice(1);

    await createResponsiveSearchAd({
      adGroupId: adGroupResult.adGroupId,
      headlines: [
        `${kwTitle}`.substring(0, 30),
        `Book ${kwTitle}`.substring(0, 30),
        `${kwTitle} | ${siteName}`.substring(0, 30),
        'Best Prices Guaranteed',
        'Instant Confirmation',
        'Book Online Today',
      ],
      descriptions: [
        `Discover and book amazing ${keyword} experiences. Best prices, instant confirmation.`.substring(0, 90),
        `Browse ${keyword} from top-rated local providers. Free cancellation available.`.substring(0, 90),
      ],
      finalUrl: landingUrl,
      path1: 'experiences',
      path2: keyword.split(' ')[0]?.substring(0, 15),
    });

    console.log(`[Ads Worker] Deployed Google campaign ${campaignResult.campaignId}: "${campaign.name}"`);
    return campaignResult.campaignId;
  } catch (err) {
    console.error(`[Ads Worker] Google deployment failed for "${campaign.name}":`, err);
    return null;
  }
}

/**
 * Deploy all DRAFT campaigns to their respective platforms.
 * Called after the bidding engine creates campaign records.
 * Campaigns are created as PAUSED for safety — use the budget optimizer
 * or dashboard to activate them after review.
 */
export async function deployDraftCampaigns(): Promise<{
  deployed: number;
  failed: number;
  skipped: number;
}> {
  const drafts = await prisma.adCampaign.findMany({
    where: { status: 'DRAFT' },
    include: {
      site: { select: { name: true, primaryDomain: true } },
    },
  });

  if (drafts.length === 0) {
    console.log('[Ads Worker] No DRAFT campaigns to deploy');
    return { deployed: 0, failed: 0, skipped: 0 };
  }

  console.log(`[Ads Worker] Deploying ${drafts.length} DRAFT campaigns to ad platforms`);

  let deployed = 0;
  let failed = 0;
  let skipped = 0;

  for (const draft of drafts) {
    const platformCampaignId = await deployCampaignToPlatform({
      id: draft.id,
      platform: draft.platform,
      name: draft.name,
      dailyBudget: Number(draft.dailyBudget),
      maxCpc: Number(draft.maxCpc),
      keywords: draft.keywords,
      targetUrl: draft.targetUrl || `https://${draft.site?.primaryDomain || 'holibob.com'}`,
      geoTargets: draft.geoTargets,
      utmSource: draft.utmSource,
      utmMedium: draft.utmMedium,
      utmCampaign: draft.utmCampaign,
      site: draft.site,
    });

    if (platformCampaignId) {
      // Update DB with platform ID and set to PAUSED (ready for activation)
      await prisma.adCampaign.update({
        where: { id: draft.id },
        data: {
          platformCampaignId,
          status: 'PAUSED', // Created as PAUSED — activate via dashboard or optimizer
        },
      });
      deployed++;
      console.log(`[Ads Worker] Campaign "${draft.name}" deployed → ${platformCampaignId}`);
    } else {
      // Platform not configured or deployment failed — skip but don't fail
      const isConfigured = draft.platform === 'FACEBOOK'
        ? !!process.env['META_AD_ACCOUNT_ID']
        : isGoogleAdsConfigured();

      if (!isConfigured) {
        skipped++;
      } else {
        failed++;
        console.error(`[Ads Worker] Failed to deploy "${draft.name}" to ${draft.platform}`);
      }
    }
  }

  console.log(
    `[Ads Worker] Deployment complete: ${deployed} deployed, ${failed} failed, ${skipped} skipped (platform not configured)`
  );

  return { deployed, failed, skipped };
}

// --- BIDDING_ENGINE_RUN ------------------------------------------------------

/**
 * Full bidding engine orchestration: profitability → scoring → campaign creation → deployment.
 * Modes:
 *   full — Calculate profitability, score opportunities, create/update campaigns, deploy to platforms
 *   optimize_only — Only optimize existing campaigns (no new creation)
 *   report_only — Only calculate profitability and report
 */
export async function handleBiddingEngineRun(job: Job): Promise<JobResult> {
  const { mode, maxDailyBudget } = job.data as {
    mode?: 'full' | 'optimize_only' | 'report_only';
    maxDailyBudget?: number;
  };

  console.log(`[Ads Worker] Starting bidding engine run (mode=${mode || 'full'})`);

  const result = await runBiddingEngine({ mode, maxDailyBudget });

  // In full mode, create AdCampaign records for selected candidates
  let campaignsCreated = 0;
  if ((mode || 'full') === 'full' && result.candidates.length > 0) {
    for (const candidate of result.candidates) {
      // Check if campaign already exists for this opportunity+platform
      const existing = await prisma.adCampaign.findFirst({
        where: {
          opportunityId: candidate.opportunityId,
          platform: candidate.platform as any,
          status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
        },
      });
      if (existing) continue;

      // Create campaign record as DRAFT with proposal estimates for user review
      const campaignName = `${candidate.siteName} - ${candidate.keyword}`;
      const profile = result.profiles.find((p) => p.siteId === candidate.siteId);
      await prisma.adCampaign.create({
        data: {
          siteId: candidate.siteId,
          micrositeId: candidate.micrositeId || null,
          platform: candidate.platform as any,
          name: campaignName.substring(0, 100),
          status: 'DRAFT',
          dailyBudget: Math.max(5, candidate.expectedDailyCost),
          maxCpc: candidate.maxBid,
          keywords: [candidate.keyword],
          targetUrl: candidate.targetUrl,
          geoTargets: candidate.location ? [candidate.location] : [],
          utmSource: candidate.utmParams.source,
          utmMedium: candidate.utmParams.medium,
          utmCampaign: candidate.utmParams.campaign,
          opportunityId: candidate.opportunityId,
          proposalData: {
            estimatedCpc: candidate.estimatedCpc,
            maxBid: candidate.maxBid,
            searchVolume: candidate.searchVolume,
            expectedClicksPerDay: candidate.expectedClicksPerDay,
            expectedDailyCost: candidate.expectedDailyCost,
            expectedDailyRevenue: candidate.expectedDailyRevenue,
            profitabilityScore: candidate.profitabilityScore,
            intent: candidate.intent,
            isMicrosite: candidate.isMicrosite,
            micrositeDomain: candidate.micrositeDomain || null,
            assumptions: {
              avgOrderValue: profile?.avgOrderValue ?? 60,
              commissionRate: profile?.avgCommissionRate ?? 18,
              conversionRate: profile?.conversionRate ?? 0.015,
              targetRoas: 3.0,
              revenuePerClick: profile?.revenuePerClick ?? 0,
            },
          },
        },
      });

      campaignsCreated++;
    }

    console.log(`[Ads Worker] Created ${campaignsCreated} draft campaigns (awaiting user approval)`)
  }

  // Count final campaign states
  const finalCounts = await prisma.adCampaign.groupBy({
    by: ['status'],
    _count: true,
  });
  const statusSummary = Object.fromEntries(
    finalCounts.map((c) => [c.status, c._count])
  );

  return {
    success: true,
    message: `Bidding engine: ${result.sitesAnalyzed} sites, ${result.candidates.length} candidates, ${campaignsCreated} campaigns created, £${result.budgetAllocated.toFixed(2)} allocated`,
    data: {
      mode: mode || 'full',
      sitesAnalyzed: result.sitesAnalyzed,
      candidatesSelected: result.candidates.length,
      campaignsCreated,
      budgetAllocated: result.budgetAllocated,
      budgetRemaining: result.budgetRemaining,
      campaignStatuses: statusSummary,
      profiles: result.profiles.map((p) => ({
        site: p.siteName,
        aov: p.avgOrderValue,
        commission: p.avgCommissionRate,
        cvr: p.conversionRate,
        maxCpc: p.maxProfitableCpc,
      })),
    },
    timestamp: new Date(),
  };
}

// --- KEYWORD_ENRICHMENT ------------------------------------------------------

/**
 * Bulk keyword extraction from Holibob product data.
 * Extracts keyword seeds → validates via DataForSEO → stores as PAID_CANDIDATE.
 */
export async function handleKeywordEnrichment(job: Job): Promise<JobResult> {
  const payload = job.data as {
    supplierIds?: string[];
    maxSuppliersPerRun?: number;
    maxProductsPerSupplier?: number;
    skipDataForSeo?: boolean;
    dryRun?: boolean;
    location?: string;
  };

  console.log('[Ads Worker] Starting bulk keyword enrichment');

  const result: EnrichmentResult = await runBulkEnrichment(payload);

  return {
    success: result.errors.length === 0,
    message: `Enrichment: ${result.suppliersProcessed} suppliers, ${result.keywordsStored} keywords stored, $${result.estimatedCost.toFixed(2)} cost`,
    data: result as unknown as Record<string, unknown>,
    timestamp: new Date(),
  };
}

// --- AD_CONVERSION_UPLOAD ---------------------------------------------------

/**
 * Upload conversion events to Meta and Google Ads via server-side CAPI.
 * Queries recent bookings with gclid/fbclid and uploads conversions
 * that haven't been uploaded yet.
 */
export async function handleAdConversionUpload(job: Job): Promise<JobResult> {
  const { bookingId } = job.data as { bookingId?: string };
  console.log('[Ads Worker] Starting conversion upload', bookingId ? `for booking ${bookingId}` : '(sweep)');

  // Query bookings with click IDs from the last 24 hours (or specific booking)
  const lookback = new Date();
  lookback.setHours(lookback.getHours() - 24);

  const where: Record<string, unknown> = {
    status: { in: ['CONFIRMED', 'COMPLETED'] },
    OR: [
      { gclid: { not: null } },
      { fbclid: { not: null } },
    ],
  };

  if (bookingId) {
    where['id'] = bookingId;
  } else {
    where['createdAt'] = { gte: lookback };
  }

  const bookings = await (prisma as any).booking.findMany({
    where,
    select: {
      id: true,
      holibobBookingId: true,
      gclid: true,
      fbclid: true,
      totalAmount: true,
      commissionAmount: true,
      currency: true,
      customerEmail: true,
      landingPage: true,
      createdAt: true,
      site: { select: { primaryDomain: true } },
    },
    take: 100,
  });

  if (bookings.length === 0) {
    return {
      success: true,
      message: 'No bookings with click IDs to upload',
      timestamp: new Date(),
    };
  }

  let metaUploaded = 0;
  let googleUploaded = 0;
  let errors = 0;

  // Get Meta access token once
  let metaAccessToken: string | null = null;
  if (bookings.some((b: any) => b.fbclid)) {
    const account = await prisma.socialAccount.findFirst({
      where: { platform: 'FACEBOOK', isActive: true },
      select: { accessToken: true, refreshToken: true, tokenExpiresAt: true, id: true, platform: true, accountId: true },
    });
    if (account?.accessToken) {
      const refreshed = await refreshTokenIfNeeded(account as any);
      metaAccessToken = refreshed.accessToken;
    }
  }

  for (const booking of bookings) {
    const value = Number((booking as any).commissionAmount || (booking as any).totalAmount || 0);
    const currency = (booking as any).currency || 'GBP';

    // Upload to Meta if fbclid present
    if ((booking as any).fbclid && metaAccessToken) {
      const result = await uploadMetaConversion(
        {
          bookingId: (booking as any).id,
          fbclid: (booking as any).fbclid,
          email: (booking as any).customerEmail || undefined,
          value,
          currency,
          eventTime: new Date((booking as any).createdAt),
          sourceUrl: (booking as any).site?.primaryDomain
            ? `https://${(booking as any).site.primaryDomain}${(booking as any).landingPage || ''}`
            : undefined,
        },
        metaAccessToken
      );
      if (result.success) metaUploaded++;
      else errors++;
    }

    // Upload to Google if gclid present
    if ((booking as any).gclid) {
      const result = await uploadGoogleConversion({
        bookingId: (booking as any).id,
        gclid: (booking as any).gclid,
        value,
        currency,
        conversionTime: new Date((booking as any).createdAt),
      });
      if (result.success) googleUploaded++;
      else errors++;
    }
  }

  console.log(
    `[Ads Worker] Conversion upload complete: ${metaUploaded} Meta, ${googleUploaded} Google, ${errors} errors`
  );

  return {
    success: errors === 0,
    message: `Uploaded ${metaUploaded} Meta + ${googleUploaded} Google conversions (${errors} errors)`,
    data: { metaUploaded, googleUploaded, errors, bookingsProcessed: bookings.length },
    timestamp: new Date(),
  };
}
