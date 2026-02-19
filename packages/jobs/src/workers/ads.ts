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
 * - AD_CREATIVE_REFRESH: Re-review and update ad images across all deployed campaigns
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
import { fetchAndPropagateAdPlatformIds } from '../services/ad-platform-ids';
import { MetaAdsClient } from '../services/social/meta-ads-client';
import { refreshTokenIfNeeded } from '../services/social/token-refresh';
import {
  isGoogleAdsConfigured,
  createSearchCampaign,
  createKeywordAdGroup,
  createResponsiveSearchAd,
  getCampaignPerformance as getGoogleCampaignPerformance,
  setCampaignStatus as setGoogleCampaignStatus,
  migrateToSmartBidding,
} from '../services/google-ads-client';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';
import {
  generateAdCreative,
  fetchSiteContext,
  extractDestination,
  toTitleCase,
  stripMarkdownForPrompt,
  type SiteContext,
} from '../services/ad-creative-generator';
import { checkAdCoherence, extractSearchTermsFromContent } from '../services/ad-coherence-checker';
import { reviewImageForCampaign } from '../services/ad-image-reviewer';

// --- Helpers -----------------------------------------------------------------

/** Get a configured MetaAdsClient, or null if not configured. */
async function getMetaAdsClient(): Promise<MetaAdsClient | null> {
  const adAccountId = process.env['META_AD_ACCOUNT_ID'];
  if (!adAccountId) return null;

  // Prefer encrypted tokens (created by our OAuth flow with ads_management scope)
  // over plaintext tokens which may be from a different app (e.g. CAPI tokens).
  const accounts = await prisma.socialAccount.findMany({
    where: { platform: 'FACEBOOK', isActive: true },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      accountId: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Sort: encrypted tokens first (contain ':'), then plaintext
  const sorted = [...accounts].sort((a, b) => {
    const aEnc = a.accessToken?.includes(':') ? 0 : 1;
    const bEnc = b.accessToken?.includes(':') ? 0 : 1;
    return aEnc - bEnc;
  });

  for (const account of sorted) {
    if (!account.accessToken) continue;
    try {
      const { accessToken } = await refreshTokenIfNeeded(account);
      console.log(
        `[Ads Worker] Using Meta token from account ${account.id} (accountId=${account.accountId})`
      );
      return new MetaAdsClient({ accessToken, adAccountId });
    } catch (error) {
      console.warn(
        `[Ads Worker] Skipping account ${account.id} (accountId=${account.accountId}): ${error instanceof Error ? error.message : error}`
      );
    }
  }

  console.error('[Ads Worker] No usable Meta access token found across all Facebook accounts');
  return null;
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

        const metaInsights = await metaClient.getCampaignInsights(campaign.platformCampaignId, {
          since: dateStr,
          until: today,
        });
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

        const googleInsights = await getGoogleCampaignPerformance(campaign.platformCampaignId, {
          startDate: dateStr,
          endDate: dateStr,
        });
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
  const topPerformers: Array<{
    id: string;
    name: string;
    site: string;
    roas: number;
    spend: number;
  }> = [];
  const underPerformers: Array<{
    id: string;
    name: string;
    site: string;
    roas: number;
    spend: number;
    daysActive: number;
  }> = [];
  const opportunities: Array<{
    id: string;
    name: string;
    site: string;
    ctr: number;
    spend: number;
  }> = [];

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

    if (roas >= PAID_TRAFFIC_CONFIG.roasScaleThreshold) {
      topPerformers.push({ id: campaign.id, name: campaign.name, site: siteName, roas, spend });
    } else if (roas < 1.0 && metrics.length >= PAID_TRAFFIC_CONFIG.observationDays && spend > 5) {
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

  const maxBudget = PAID_TRAFFIC_CONFIG.maxDailyBudget;
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - PAID_TRAFFIC_CONFIG.observationDays);

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

    // --- Task 3.4: Fast-fail for zero-conversion campaigns ---
    // If a campaign has spent £25+ over 3+ days with zero conversions, pause immediately
    // instead of waiting the full observation period
    const conversions = metrics.reduce((s, m) => s + Number(m.conversions ?? 0), 0);
    if (metrics.length >= 3 && spend >= 25 && conversions === 0) {
      console.log(
        `[Ads Worker] Fast-fail: pausing "${campaign.name}" — £${spend.toFixed(2)} spent, ` +
          `0 conversions over ${metrics.length} days`
      );

      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: {
          status: 'PAUSED',
          proposalData: {
            ...(typeof (campaign as any).proposalData === 'object'
              ? (campaign as any).proposalData
              : {}),
            pauseReason: 'ZERO_CONVERSION_FAST_FAIL',
            pausedAt: new Date().toISOString(),
          },
        },
      });

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
          console.error(`[Ads Worker] Failed to fast-fail pause on platform: ${err}`);
        }
      }

      paused++;
      continue;
    }

    // --- Pause underperformers ---
    if (
      roas < PAID_TRAFFIC_CONFIG.roasPauseThreshold &&
      metrics.length >= PAID_TRAFFIC_CONFIG.observationDays &&
      spend > 5
    ) {
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

    // --- Task 3.2: Bid adjustment based on ROAS ---
    if (metrics.length >= 7 && spend > 10 && campaign.platformCampaignId) {
      let bidAdjustment: 'increase' | 'decrease' | null = null;
      if (roas >= 2.0) {
        bidAdjustment = 'increase';
      } else if (roas < 0.8 && roas > 0) {
        bidAdjustment = 'decrease';
      }

      if (bidAdjustment) {
        const currentBid = Number(campaign.maxCpc) || Number(campaign.dailyBudget) / 10;
        const factor = bidAdjustment === 'increase' ? 1.1 : 0.9; // ±10%
        const newBid = Math.max(0.01, currentBid * factor);

        try {
          if (campaign.platform === 'FACEBOOK') {
            const metaClient = await getMetaAdsClient();
            if (metaClient) {
              const adSets = await metaClient.getAdSetsForCampaign(campaign.platformCampaignId!);
              for (const adSet of adSets) {
                await metaClient.updateBid(adSet.id, Math.round(newBid * 100));
              }
              console.log(
                `[Ads Worker] Bid ${bidAdjustment}: "${campaign.name}" ` +
                  `£${currentBid.toFixed(2)} → £${newBid.toFixed(2)} (ROAS=${roas.toFixed(2)})`
              );
            }
          }
          // Update local record
          await prisma.adCampaign.update({
            where: { id: campaign.id },
            data: { maxCpc: newBid },
          });
        } catch (err) {
          console.error(`[Ads Worker] Bid adjustment failed for "${campaign.name}": ${err}`);
        }
      }
    }

    // --- Scale up top performers ---
    if (roas >= PAID_TRAFFIC_CONFIG.roasScaleThreshold && metrics.length >= 3) {
      const newBudget = Math.min(
        dailyBudget * (1 + PAID_TRAFFIC_CONFIG.scaleIncrement),
        PAID_TRAFFIC_CONFIG.maxPerCampaignBudget
      );
      const budgetCap = maxBudget;

      // Check portfolio budget cap
      if (totalDailyBudget + newBudget <= budgetCap) {
        await prisma.adCampaign.update({
          where: { id: campaign.id },
          data: { dailyBudget: newBudget },
        });

        // Task 3.3: Sync budget change to platform
        if (campaign.platformCampaignId) {
          try {
            if (campaign.platform === 'FACEBOOK') {
              const metaClient = await getMetaAdsClient();
              if (metaClient) {
                await metaClient.updateCampaignBudget(
                  campaign.platformCampaignId,
                  Math.round(newBudget * 100) // cents
                );
              }
            }
            // Google Ads budget sync handled through API if configured
          } catch (err) {
            console.error(`[Ads Worker] Budget sync failed for "${campaign.name}": ${err}`);
          }
        }

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

    // --- Task 4.9: Google Smart Bidding migration ---
    // Migrate campaigns with 15+ conversions from MANUAL_CPC to TARGET_ROAS
    if (
      campaign.platform === 'GOOGLE_SEARCH' &&
      campaign.platformCampaignId &&
      isGoogleAdsConfigured() &&
      campaign.conversions >= 15
    ) {
      const proposal = campaign.proposalData as Record<string, unknown> | null;
      if (!proposal?.['smartBiddingMigrated']) {
        try {
          const migrated = await migrateToSmartBidding(campaign.platformCampaignId, 2.0);
          if (migrated) {
            await prisma.adCampaign.update({
              where: { id: campaign.id },
              data: {
                proposalData: {
                  ...(typeof proposal === 'object' && proposal ? proposal : {}),
                  smartBiddingMigrated: true,
                  smartBiddingMigratedAt: new Date().toISOString(),
                },
              },
            });
            console.log(
              `[Ads Worker] Migrated "${campaign.name}" to TARGET_ROAS (${campaign.conversions} conversions)`
            );
          }
        } catch (err) {
          console.error(
            `[Ads Worker] Smart Bidding migration failed for "${campaign.name}": ${err}`
          );
        }
      }
    }
  }

  const budgetRemaining = maxBudget - totalDailyBudget;

  console.log(
    `[Ads Worker] Budget optimizer: paused=${paused}, scaled=${scaled}, ` +
      `dailyBudget=£${totalDailyBudget.toFixed(2)}, remaining=£${budgetRemaining.toFixed(2)}`
  );

  // --- Task 3.1: Auto-activate PAUSED campaigns after 24h observation ---
  // Campaigns are deployed PAUSED for safety. After 24 hours, activate them
  // if their coherence score is >= 6 (text matches landing page).
  let activated = 0;
  const activationCutoff = new Date();
  activationCutoff.setHours(activationCutoff.getHours() - 24);

  const pausedCampaigns = await prisma.adCampaign.findMany({
    where: {
      status: 'PAUSED',
      platformCampaignId: { not: null },
      createdAt: { lte: activationCutoff }, // At least 24h old
    },
    select: {
      id: true,
      name: true,
      platform: true,
      platformCampaignId: true,
      proposalData: true,
    },
  });

  for (const camp of pausedCampaigns) {
    // Skip campaigns paused for specific reasons (not just deployment safety)
    const proposal = camp.proposalData as Record<string, unknown> | null;
    if (proposal?.['pauseReason']) continue; // Explicitly paused for a reason

    // Check coherence score from stored metadata
    const coherenceScore = (proposal?.['coherenceScore'] as number) ?? null;
    const shouldActivate = coherenceScore === null || coherenceScore >= 6;

    if (shouldActivate && camp.platformCampaignId) {
      try {
        if (camp.platform === 'FACEBOOK') {
          const metaClient = await getMetaAdsClient();
          if (metaClient) {
            // Activate children first (ad sets + ads may be PAUSED from legacy deployment)
            const children = await metaClient.activateCampaignChildren(camp.platformCampaignId);
            if (children.adSets > 0 || children.ads > 0) {
              console.log(
                `[Ads Worker] Activated ${children.adSets} ad sets, ${children.ads} ads for "${camp.name}"`
              );
            }
            await metaClient.setCampaignStatus(camp.platformCampaignId, 'ACTIVE');
          }
        } else if (camp.platform === 'GOOGLE_SEARCH' && isGoogleAdsConfigured()) {
          await setGoogleCampaignStatus(camp.platformCampaignId, 'ENABLED');
        }

        await prisma.adCampaign.update({
          where: { id: camp.id },
          data: { status: 'ACTIVE' },
        });
        activated++;
        console.log(
          `[Ads Worker] Auto-activated "${camp.name}" (coherence: ${coherenceScore ?? 'not checked'})`
        );
      } catch (err) {
        console.error(`[Ads Worker] Auto-activation failed for "${camp.name}": ${err}`);
      }
    }
  }

  if (activated > 0) {
    console.log(`[Ads Worker] Auto-activated ${activated} campaigns after 24h observation`);
  }

  // --- Landing Page Health Monitoring ---
  // Re-validate product availability for active campaigns with non-homepage landing pages.
  // Pause campaigns where landing page products dropped below 3.
  // Auto-resume campaigns previously paused for LANDING_PAGE_LOW_INVENTORY.
  let lpPaused = 0;
  let lpResumed = 0;

  // 1. Check active campaigns with landing pages
  const activeLpCampaigns = await prisma.adCampaign.findMany({
    where: {
      status: 'ACTIVE',
      landingPageType: { not: 'HOMEPAGE' },
      landingPagePath: { not: null },
    },
    select: {
      id: true,
      name: true,
      siteId: true,
      landingPagePath: true,
      landingPageType: true,
      landingPageProducts: true,
      keywords: true,
    },
  });

  if (activeLpCampaigns.length > 0) {
    // Simple product count re-check: query pages and collections that still exist
    for (const camp of activeLpCampaigns) {
      const path = camp.landingPagePath!;
      let hasProducts = true;

      if (path.startsWith('/collections/')) {
        // Check collection product count
        const slug = path.replace('/collections/', '');
        const productCount = await prisma.productCollection.count({
          where: { collection: { slug } },
        });
        hasProducts = productCount >= 3;
      } else if (path.startsWith('/destinations/') || path.startsWith('/categories/')) {
        // Check that the page still exists and is published
        const slug = path.replace(/^\/(destinations|categories)\//, '');
        const page = await prisma.page.findFirst({
          where: { siteId: camp.siteId, slug, status: 'PUBLISHED' },
          select: { id: true },
        });
        hasProducts = !!page;
      }
      // For /experiences? filtered listings — we can't cheaply re-validate
      // without API calls, so skip (rely on campaign ROAS to detect issues)

      if (!hasProducts) {
        await prisma.adCampaign.update({
          where: { id: camp.id },
          data: {
            status: 'PAUSED',
            proposalData: {
              ...(typeof (camp as any).proposalData === 'object' ? (camp as any).proposalData : {}),
              pauseReason: 'LANDING_PAGE_LOW_INVENTORY',
            },
          },
        });

        await prisma.adAlert.create({
          data: {
            type: 'LANDING_PAGE_LOW_INVENTORY',
            severity: 'WARNING',
            siteId: camp.siteId,
            message: `Paused campaign "${camp.name}": landing page ${path} has insufficient products`,
            details: {
              campaignId: camp.id,
              landingPagePath: path,
              landingPageType: camp.landingPageType,
            },
          },
        });

        lpPaused++;
        console.log(
          `[Ads Worker] Paused campaign "${camp.name}" — landing page low inventory: ${path}`
        );
      }
    }
  }

  // 2. Auto-resume campaigns paused for LANDING_PAGE_LOW_INVENTORY if products returned
  const lpPausedCampaigns = await prisma.adCampaign.findMany({
    where: {
      status: 'PAUSED',
      landingPagePath: { not: null },
      landingPageType: { not: 'HOMEPAGE' },
    },
    select: {
      id: true,
      name: true,
      siteId: true,
      landingPagePath: true,
      landingPageType: true,
      proposalData: true,
    },
  });

  for (const camp of lpPausedCampaigns) {
    const proposal = camp.proposalData as Record<string, unknown> | null;
    if (proposal?.['pauseReason'] !== 'LANDING_PAGE_LOW_INVENTORY') continue;

    const path = camp.landingPagePath!;
    let hasProducts = false;

    if (path.startsWith('/collections/')) {
      const slug = path.replace('/collections/', '');
      const productCount = await prisma.productCollection.count({
        where: { collection: { slug } },
      });
      hasProducts = productCount >= 3;
    } else if (path.startsWith('/destinations/') || path.startsWith('/categories/')) {
      const slug = path.replace(/^\/(destinations|categories)\//, '');
      const page = await prisma.page.findFirst({
        where: { siteId: camp.siteId, slug, status: 'PUBLISHED' },
        select: { id: true },
      });
      hasProducts = !!page;
    }

    if (hasProducts) {
      await prisma.adCampaign.update({
        where: { id: camp.id },
        data: {
          status: 'ACTIVE',
          proposalData: {
            ...(typeof proposal === 'object' && proposal ? proposal : {}),
            pauseReason: null,
          },
        },
      });
      lpResumed++;
      console.log(
        `[Ads Worker] Resumed campaign "${camp.name}" — landing page products restored: ${path}`
      );
    }
  }

  if (lpPaused > 0 || lpResumed > 0) {
    console.log(`[Ads Worker] Landing page health: ${lpPaused} paused, ${lpResumed} resumed`);
  }

  return {
    success: true,
    message: `Optimized: ${paused} paused, ${scaled} scaled, ${activated} activated, ${lpPaused} LP-paused, ${lpResumed} LP-resumed, £${budgetRemaining.toFixed(2)} budget remaining`,
    data: {
      paused,
      scaled,
      landingPagePaused: lpPaused,
      landingPageResumed: lpResumed,
      totalDailyBudget,
      budgetRemaining,
      activated,
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
  audiences?: unknown;
  siteId?: string | null;
  micrositeId?: string | null;
  landingPagePath?: string | null;
  landingPageType?: string | null;
  landingPageProducts?: number | null;
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
 * Extract search terms from keywords and find relevant Meta interests.
 * Long-tail keywords like "things to do in curitiba" return nothing from Meta's
 * interest search API, so we:
 * 1. Extract the destination/activity core (e.g. "curitiba", "phuket wildlife")
 * 2. Search Meta for each extracted term
 * 3. Fall back to broader terms like "travel" + destination if needed
 * 4. Filter out clearly irrelevant interests (shopping, finance, etc.)
 */
/**
 * Task 2.5: Rebuild interest targeting.
 *
 * Improved strategy:
 * 1. Extract BOTH destination and activity from keywords
 * 2. Search for destination-specific interests first (e.g., "Barcelona tourism")
 * 3. Then search for activity-specific interests (e.g., "food tours", "kayaking")
 * 4. Combine for relevant audience: people interested in BOTH the place and the activity
 * 5. Only fall back to "travel" if no destination or activity can be extracted
 */
async function findRelevantInterests(
  metaClient: MetaAdsClient,
  keywords: string[]
): Promise<Array<{ id: string; name: string }>> {
  const allInterests = new Map<string, { id: string; name: string }>();

  // Separate destination and activity terms from keywords
  const destinations = new Set<string>();
  const activities = new Set<string>();
  const FILLER = new Set([
    'in',
    'the',
    'of',
    'and',
    'to',
    'a',
    'an',
    'for',
    'with',
    'from',
    'near',
    'best',
    'top',
    'things',
    'what',
    'do',
    'book',
    'tour',
    'tours',
  ]);

  for (const kw of keywords.slice(0, 5)) {
    // Extract activity phrase (strip destination and modifiers)
    const cleaned = kw
      .replace(/^(things to do in|what to do in|best things to do in|top)\s+/i, '')
      .replace(/^(train|bus|flight|ferry|transfer)\s+/i, '')
      .replace(/\s+(opening hours|opening times|hours|tickets|prices|cost|reviews?|tourism)$/i, '')
      .trim();

    // Split into meaningful words
    const words = cleaned
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !FILLER.has(w));

    // Use location field from campaign data if available
    // Check for known patterns: "activity in city", "activity city"
    const inIndex = cleaned.toLowerCase().indexOf(' in ');
    if (inIndex > 0) {
      const activity = cleaned.substring(0, inIndex).trim();
      const dest = cleaned.substring(inIndex + 4).trim();
      if (activity.length > 2) activities.add(activity.toLowerCase());
      if (dest.length > 2) destinations.add(dest.toLowerCase());
    } else if (words.length >= 2) {
      // Last word is often the city for patterns like "food tours barcelona"
      // Use the full phrase as activity search term
      activities.add(cleaned.toLowerCase());
    }

    // Add individual significant words as backup
    for (const word of words) {
      if (word.length > 4) activities.add(word);
    }
  }

  // Build prioritized search terms:
  // 1. Destination-specific: "Barcelona tourism", "Barcelona travel"
  // 2. Activity-specific: "food tours", "kayaking", "cooking class"
  // 3. Combined: "Barcelona food" (if both available)
  const searchTerms: string[] = [];

  for (const dest of [...destinations].slice(0, 2)) {
    searchTerms.push(dest); // City name alone (Meta often has city interests)
    searchTerms.push(`${dest} tourism`);
  }
  for (const activity of [...activities].slice(0, 3)) {
    searchTerms.push(activity);
  }
  // Cross-product: destination + activity
  for (const dest of [...destinations].slice(0, 1)) {
    for (const activity of [...activities].slice(0, 2)) {
      searchTerms.push(`${activity} ${dest}`);
    }
  }

  // Deduplicate and limit API calls
  const seen = new Set<string>();
  const uniqueTerms = searchTerms
    .filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);

  // If no terms extracted at all, use "travel experiences" as last resort
  if (uniqueTerms.length === 0) uniqueTerms.push('travel experiences');

  // Search Meta for each term
  for (const term of uniqueTerms) {
    try {
      const interests = await metaClient.searchInterests(term);
      for (const i of interests.slice(0, 5)) {
        allInterests.set(i.id, { id: i.id, name: i.name });
      }
    } catch {
      // Continue on search failure
    }
  }

  // Filter out clearly irrelevant interests (Meta's interest search returns false positives)
  const irrelevantPatterns =
    /\b(department store|personal finance|online shopping|fast food|cryptocurrency|real estate|insurance|banking|banks and financial|psychedelic|gangsta rap|subculture|popular culture|american culture|japanese popular culture|video game culture|chinese culture|coffee culture|martha stewart|compact car|toyota|soccer player|german soccer|brazilian soccer|rugby union|french soccer|drama actor|government in|fast food restaurant|supermarket|discount store|convenience store)\b/i;
  const filtered = [...allInterests.values()].filter(
    (interest) => !irrelevantPatterns.test(interest.name)
  );

  // Return at most 10 interests to avoid over-targeting
  return filtered.slice(0, 10);
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
    siteId?: string | null;
    micrositeId?: string | null;
    landingPagePath?: string | null;
    landingPageType?: string | null;
    landingPageProducts?: number | null;
    site?: { name: string; targetMarkets?: string[] } | null;
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
    // Step 1: Create campaign (PAUSED — serves as master switch for activation)
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
    // Site.targetMarkets is always populated via Prisma default (G2 fix)
    const countries = [...(campaign.site?.targetMarkets ?? ['GB', 'US'])];

    // Search for relevant interests using extracted destination/activity terms.
    // Long-tail keywords like "things to do in curitiba" return nothing from Meta's
    // interest search, so we extract the core terms and broaden the search.
    const interestTargeting = await findRelevantInterests(metaClient, campaign.keywords);

    // DSA compliance: required when targeting EU countries (IE is in our SOURCE_MARKETS)
    const siteName = campaign.site?.name || 'Holibob';

    const adSetResult = await metaClient.createAdSet({
      campaignId: campaignResult.campaignId,
      name: `${campaign.name} - Ad Set`,
      // dailyBudget omitted — using Campaign Budget Optimization (CBO) at campaign level
      bidAmount: campaign.maxCpc,
      targeting: {
        countries,
        // Note: location_types is deprecated by Meta — all targeting now automatically
        // reaches "people living in or recently in" selected locations.
        interests: interestTargeting.length > 0 ? interestTargeting : undefined,
        ageMin: 18,
        ageMax: 65,
      },
      optimizationGoal: 'LINK_CLICKS',
      billingEvent: 'IMPRESSIONS',
      status: 'ACTIVE', // ACTIVE so it serves when parent campaign is activated
      dsaBeneficiary: siteName,
      dsaPayor: siteName,
    });

    if (!adSetResult) {
      console.error(
        `[Ads Worker] Failed to create Meta ad set for campaign: ${campaignResult.campaignId}`
      );
      // Clean up the empty campaign shell on Meta to avoid orphaned campaigns
      await metaClient.deleteCampaign(campaignResult.campaignId);
      console.log(`[Ads Worker] Cleaned up empty campaign shell: ${campaignResult.campaignId}`);
      return null;
    }

    // Step 3: Generate ad creative (AI-powered with template fallback)
    const creative = await generateAdCreative({
      keywords: campaign.keywords,
      siteId: campaign.siteId,
      micrositeId: campaign.micrositeId,
      siteName: campaign.site?.name || 'Holibob',
      landingPagePath: campaign.landingPagePath,
      landingPageType: campaign.landingPageType,
      landingPageProducts: campaign.landingPageProducts,
      geoTargets: campaign.geoTargets,
    });

    console.log(
      `[Ads Worker] Creative (${creative.source}): "${creative.headline}" / "${creative.body.substring(0, 60)}..."`
    );

    // Persist generated creative + targeting to proposalData for audit trail
    try {
      const existing = await prisma.adCampaign.findUnique({
        where: { id: campaign.id },
        select: { proposalData: true },
      });
      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: {
          proposalData: {
            ...(typeof existing?.proposalData === 'object' && existing?.proposalData !== null
              ? existing.proposalData
              : {}),
            generatedCreative: {
              headline: creative.headline,
              body: creative.body,
              callToAction: creative.callToAction,
              imageUrl: creative.imageUrl,
              source: creative.source,
              imageSource: creative.imageSource || null,
              imageReviewScore: creative.imageReviewScore || null,
              imageReviewReasoning: creative.imageReviewReasoning || null,
              coherenceScore: creative.coherenceScore ?? null,
              coherencePass: creative.coherencePass ?? null,
              coherenceIssues: creative.coherenceIssues || null,
              coherenceSummary: creative.coherenceSummary || null,
              remediated: creative.remediated || false,
              generatedAt: new Date().toISOString(),
            },
            deployedTargeting: {
              countries,
              interests: interestTargeting.map((i) => i.name),
              interestCount: interestTargeting.length,
            },
          },
        },
      });
    } catch {
      // Don't block deployment if persistence fails
    }

    const adResult = await metaClient.createAd({
      adSetId: adSetResult.adSetId,
      name: `${campaign.name} - Ad`,
      pageId,
      linkUrl: landingUrl,
      headline: creative.headline,
      body: creative.body,
      imageUrl: creative.imageUrl || undefined,
      callToAction: creative.callToAction,
      status: 'ACTIVE', // ACTIVE so it serves when parent campaign is activated
    });

    if (!adResult) {
      console.error(`[Ads Worker] Failed to create Meta ad for ad set: ${adSetResult.adSetId}`);
      // Clean up — delete campaign shell since it has no working ad
      await metaClient.deleteCampaign(campaignResult.campaignId);
      console.log(`[Ads Worker] Cleaned up campaign with no ad: ${campaignResult.campaignId}`);
      return null;
    }

    console.log(
      `[Ads Worker] Deployed Meta campaign ${campaignResult.campaignId}: ` +
        `ad set ${adSetResult.adSetId}, ad ${adResult.adId}: "${campaign.name}"`
    );
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
/** Google RSA creative result with optional coherence metadata. */
interface GoogleRSACreative {
  headlines: string[];
  descriptions: string[];
  source: 'ai' | 'template';
  coherenceScore?: number;
  coherencePass?: boolean;
  coherenceIssues?: string[];
  coherenceSummary?: string;
  remediated?: boolean;
}

/**
 * AI-powered Google RSA generation with full context pipeline.
 *
 * Mirrors the Meta ad creative pipeline:
 * 1. Fetch site/brand/landing page context
 * 2. Generate keyword-specific headlines/descriptions with Claude Haiku
 * 3. Run coherence check against landing page
 * 4. Auto-remediate if coherence fails
 * 5. Fall back to templates if AI unavailable
 *
 * @param keyword Primary keyword for this ad group
 * @param siteName Site display name (used in ad copy)
 * @param siteId Optional site ID for fetching brand/landing page context
 * @param landingPagePath Optional landing page path for coherence validation
 */
async function generateGoogleRSA(
  keyword: string,
  siteName: string,
  siteId?: string | null,
  landingPagePath?: string | null
): Promise<GoogleRSACreative> {
  const apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '';

  // Fetch site context (same as Meta pipeline) for richer prompts
  const context = siteId ? await fetchSiteContext(siteId, landingPagePath) : null;

  if (!apiKey) {
    return generateGoogleRSATemplate(keyword, siteName, context);
  }

  // Step 1: AI generation with full context
  let creative: GoogleRSACreative | null = null;
  try {
    creative = await generateGoogleRSAWithAI(keyword, siteName, apiKey, context);
  } catch (error) {
    console.warn(
      `[GoogleRSA] AI generation failed, using template: ${error instanceof Error ? error.message : error}`
    );
  }
  if (!creative) {
    creative = generateGoogleRSATemplate(keyword, siteName, context);
  }

  // Step 2: Coherence check (same checker as Meta)
  if (context?.pageTitle || context?.pageBody) {
    try {
      // Build a combined text from RSA headlines + descriptions for coherence check
      const headlineText = creative.headlines.slice(0, 3).join('. ');
      const descriptionText = creative.descriptions.join(' ');
      const coherence = await checkAdCoherence({
        headline: headlineText,
        body: descriptionText,
        callToAction: 'BOOK_TRAVEL',
        imageUrl: null,
        imageSource: undefined,
        keywords: [keyword],
        landingPage: {
          title: context.pageTitle,
          description: context.pageDescription,
          bodyExcerpt: context.pageBody,
          type: context.pageType,
          productCount: null,
        },
      });

      if (coherence) {
        creative.coherenceScore = coherence.score;
        creative.coherencePass = coherence.pass;
        creative.coherenceIssues = coherence.issues;
        creative.coherenceSummary = coherence.summary;

        console.log(
          `[GoogleRSA] Coherence: ${coherence.score}/10 ${coherence.pass ? 'PASS' : 'FAIL'} — ${coherence.summary}`
        );

        // Step 3: Remediation — regenerate with issues as constraints
        if (!coherence.pass && coherence.issues.length > 0 && apiKey) {
          console.log(`[GoogleRSA] Remediating: issues = ${coherence.issues.join('; ')}`);
          try {
            const remediated = await generateGoogleRSAWithAI(
              keyword,
              siteName,
              apiKey,
              context,
              coherence.issues
            );
            if (remediated) {
              remediated.remediated = true;
              // Re-check coherence (accept result, no further looping)
              const recheck = await checkAdCoherence({
                headline: remediated.headlines.slice(0, 3).join('. '),
                body: remediated.descriptions.join(' '),
                callToAction: 'BOOK_TRAVEL',
                imageUrl: null,
                imageSource: undefined,
                keywords: [keyword],
                landingPage: {
                  title: context.pageTitle,
                  description: context.pageDescription,
                  bodyExcerpt: context.pageBody,
                  type: context.pageType,
                  productCount: null,
                },
              });
              if (recheck) {
                remediated.coherenceScore = recheck.score;
                remediated.coherencePass = recheck.pass;
                remediated.coherenceIssues = recheck.issues;
                remediated.coherenceSummary = recheck.summary;
                console.log(
                  `[GoogleRSA] Post-remediation: ${recheck.score}/10 ${recheck.pass ? 'PASS' : 'FAIL'}`
                );
              }
              creative = remediated;
            }
          } catch (err) {
            console.warn(
              `[GoogleRSA] Remediation failed, keeping original: ${err instanceof Error ? err.message : err}`
            );
          }
        }
      }
    } catch (err) {
      console.warn(
        `[GoogleRSA] Coherence check failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  return creative;
}

/**
 * Generate Google RSA copy using Claude Haiku with full brand/landing page context.
 * Prompt mirrors the Meta ad-creative-generator prompt structure for consistent messaging.
 */
async function generateGoogleRSAWithAI(
  keyword: string,
  siteName: string,
  apiKey: string,
  context: SiteContext | null,
  coherenceIssues?: string[]
): Promise<GoogleRSACreative | null> {
  const brand = context?.brandName || siteName;
  const tone = context?.tonePersonality.length
    ? context.tonePersonality.join(', ')
    : 'friendly, enthusiastic';
  const destination = toTitleCase(extractDestination(keyword));

  // Build context lines (same structure as Meta prompt)
  const contextLines: string[] = [];
  if (context?.pageType) {
    const parts = [`Landing page type: ${context.pageType}`];
    if (context.pageTitle) parts.push(`"${context.pageTitle}"`);
    contextLines.push(parts.join(' — '));
  }
  if (context?.pageDescription) {
    contextLines.push(`Page description: ${context.pageDescription.substring(0, 150)}`);
  }
  if (context?.pageBody) {
    contextLines.push(`Landing page content: "${context.pageBody.substring(0, 200)}..."`);
  }

  const remediationBlock = coherenceIssues?.length
    ? `\nCOHERENCE ISSUES TO FIX (from previous review):
${coherenceIssues.map((issue) => `- ${issue}`).join('\n')}
You MUST address each issue above. Ensure the ad copy aligns with the landing page content.\n`
    : '';

  const prompt = `You are a performance marketing copywriter for a travel experiences platform.
Brand: "${brand}". Tone: ${tone}.
Target keyword: ${keyword}
Destination/activity: ${destination}
${contextLines.length > 0 ? contextLines.join('\n') : ''}
${remediationBlock}
Write a Google Responsive Search Ad for "${destination}" experiences.

CRITICAL RULES:
- The ad MUST be specifically about "${destination}". Do NOT mention unrelated activities or locations.
- 6 headlines, each MAX 30 characters (hard limit — Google rejects longer)
- 2 descriptions, each MAX 90 characters (hard limit)
- First 3 headlines MUST include "${destination}" or a recognisable short form
- Do NOT use pipe character | in any headline or description
- Do NOT use "Free cancellation" (cannot guarantee for all products)
- Do NOT invent prices, discounts, star ratings, or review counts
- Focus on booking intent: "Book Now", "Instant Confirmation", "Top-Rated"
- Include "${brand}" in at most one headline

Good headlines: "Tours in ${destination}", "Book ${destination} Today", "${destination} Experiences"
Bad headlines: "Best Prices Guaranteed", "Amazing Travel Deals", "${destination} | ${brand}"

Return JSON only:
{"headlines":["..."],"descriptions":["..."]}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
  }

  const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const text = data.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]) as { headlines: string[]; descriptions: string[] };
  const headlines = (parsed.headlines || []).map((h: string) => h.substring(0, 30)).slice(0, 6);
  const descriptions = (parsed.descriptions || [])
    .map((d: string) => d.substring(0, 90))
    .slice(0, 2);

  if (headlines.length < 3 || descriptions.length < 1) return null;

  return { headlines, descriptions, source: 'ai' };
}

/** Template fallback for Google RSA when AI is unavailable. */
function generateGoogleRSATemplate(
  keyword: string,
  siteName: string,
  context?: SiteContext | null
): GoogleRSACreative {
  const destination = toTitleCase(extractDestination(keyword));
  const brand = context?.brandName || siteName;

  return {
    headlines: [
      destination.substring(0, 30),
      `Book ${destination}`.substring(0, 30),
      `${destination} - ${brand}`.substring(0, 30),
      `Best ${destination} Deals`.substring(0, 30),
      'Instant Confirmation',
      'Book Online Today',
    ],
    descriptions: [
      `Discover and book ${destination} experiences. Instant confirmation, top-rated providers.`.substring(
        0,
        90
      ),
      `Compare and book the best ${destination}. Trusted by thousands of travellers.`.substring(
        0,
        90
      ),
    ],
    source: 'template',
  };
}

async function deployToGoogle(
  campaign: {
    id: string;
    name: string;
    dailyBudget: number;
    maxCpc: number;
    keywords: string[];
    audiences?: unknown;
    siteId?: string | null;
    landingPagePath?: string | null;
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

    const siteName = campaign.site?.name || 'Holibob';

    // Step 2: Create ad groups — one per landing page path if audiences.adGroups exists
    const adGroupConfigs = (
      campaign.audiences as {
        adGroups?: Array<{
          primaryKeyword: string;
          keywords: string[];
          maxBid: number;
          targetUrl: string;
        }>;
      }
    )?.adGroups;

    if (adGroupConfigs && adGroupConfigs.length > 0) {
      for (const agConfig of adGroupConfigs) {
        const keywords = agConfig.keywords.flatMap((kw) => [
          { text: kw, matchType: 'PHRASE' as const },
          { text: kw, matchType: 'EXACT' as const },
        ]);

        const adGroupResult = await createKeywordAdGroup({
          campaignId: campaignResult.campaignId,
          name: `${campaign.name} - ${agConfig.primaryKeyword}`.substring(0, 100),
          cpcBidMicros: Math.round(agConfig.maxBid * 1_000_000),
          keywords,
        });

        if (!adGroupResult) continue;

        // Build per-ad-group landing URL with UTMs
        const agUrl = new URL(agConfig.targetUrl);
        const baseUrl = new URL(landingUrl);
        // Copy UTM params from the campaign-level landing URL
        for (const [key, val] of baseUrl.searchParams) {
          if (key.startsWith('utm_')) agUrl.searchParams.set(key, val);
        }

        // AI-powered RSA generation with full context pipeline
        const rsa = await generateGoogleRSA(
          agConfig.primaryKeyword,
          siteName,
          campaign.siteId,
          campaign.landingPagePath
        );
        await createResponsiveSearchAd({
          adGroupId: adGroupResult.adGroupId,
          headlines: rsa.headlines,
          descriptions: rsa.descriptions,
          finalUrl: agUrl.toString(),
          path1: 'experiences',
          path2: agConfig.primaryKeyword.split(' ')[0]?.substring(0, 15),
        });
      }
    } else {
      // Fallback: single ad group (backward compat with old campaigns)
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

      if (adGroupResult) {
        const keyword = campaign.keywords[0] || 'experiences';
        // AI-powered RSA generation with full context pipeline
        const rsa = await generateGoogleRSA(
          keyword,
          siteName,
          campaign.siteId,
          campaign.landingPagePath
        );
        await createResponsiveSearchAd({
          adGroupId: adGroupResult.adGroupId,
          headlines: rsa.headlines,
          descriptions: rsa.descriptions,
          finalUrl: landingUrl,
          path1: 'experiences',
          path2: keyword.split(' ')[0]?.substring(0, 15),
        });
      }
    }

    console.log(
      `[Ads Worker] Deployed Google campaign ${campaignResult.campaignId}: "${campaign.name}"`
    );
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
export async function deployDraftCampaigns(
  job?: Job,
  options?: {
    platform?:
      | 'FACEBOOK'
      | 'GOOGLE_SEARCH'
      | 'GOOGLE_DISPLAY'
      | 'PINTEREST'
      | 'BING'
      | 'OUTBRAIN'
      | 'REDDIT';
  }
): Promise<{
  deployed: number;
  failed: number;
  skipped: number;
}> {
  const drafts = await prisma.adCampaign.findMany({
    where: {
      status: 'DRAFT',
      ...(options?.platform ? { platform: options.platform } : {}),
    },
    include: {
      site: { select: { name: true, primaryDomain: true, targetMarkets: true } },
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

  // Track consecutive failures per platform to fail-fast on platform-wide issues
  // (e.g. Google token not approved, API version deprecated)
  const consecutiveFailures: Record<string, number> = {};
  const FAIL_FAST_THRESHOLD = 10;
  const failedPlatforms = new Set<string>();

  for (const draft of drafts) {
    // Skip platform entirely after repeated failures (avoids hours of rate-limited retries)
    if (failedPlatforms.has(draft.platform)) {
      skipped++;
      continue;
    }

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
      audiences: draft.audiences,
      siteId: draft.siteId,
      micrositeId: draft.micrositeId,
      landingPagePath: draft.landingPagePath,
      landingPageType: draft.landingPageType,
      landingPageProducts: draft.landingPageProducts,
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
      consecutiveFailures[draft.platform] = 0;
      // Report progress to keep BullMQ lock alive during long deployment runs
      if (job) {
        await job.updateProgress({ deployed, failed, skipped, total: drafts.length });
      }
      console.log(
        `[Ads Worker] Campaign "${draft.name}" deployed → ${platformCampaignId} (${deployed}/${drafts.length})`
      );
    } else {
      // Platform not configured or deployment failed — skip but don't fail
      const isConfigured =
        draft.platform === 'FACEBOOK'
          ? !!process.env['META_AD_ACCOUNT_ID']
          : isGoogleAdsConfigured();

      if (!isConfigured) {
        skipped++;
      } else {
        failed++;
        consecutiveFailures[draft.platform] = (consecutiveFailures[draft.platform] || 0) + 1;
        console.error(`[Ads Worker] Failed to deploy "${draft.name}" to ${draft.platform}`);

        if (consecutiveFailures[draft.platform]! >= FAIL_FAST_THRESHOLD) {
          const remaining = drafts.filter(
            (d) => d.platform === draft.platform && d.status === 'DRAFT'
          ).length;
          console.warn(
            `[Ads Worker] ${FAIL_FAST_THRESHOLD} consecutive failures on ${draft.platform} — skipping remaining ${remaining} campaigns for this platform`
          );
          failedPlatforms.add(draft.platform);
        }
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
 *   deploy_only — Skip bidding engine, just deploy existing DRAFT campaigns to platforms
 *   optimize_only — Only optimize existing campaigns (no new creation)
 *   report_only — Only calculate profitability and report
 */
export async function handleBiddingEngineRun(job: Job): Promise<JobResult> {
  const { mode, maxDailyBudget } = job.data as {
    mode?: 'full' | 'deploy_only' | 'optimize_only' | 'report_only';
    maxDailyBudget?: number;
  };

  console.log(`[Ads Worker] Starting bidding engine run (mode=${mode || 'full'})`);

  // deploy_only: skip bidding engine entirely, just deploy existing DRAFT campaigns
  if (mode === 'deploy_only') {
    console.log('[Ads Worker] Deploy-only mode: deploying existing DRAFT campaigns...');
    const deployResult = await deployDraftCampaigns(job);
    console.log(
      `[Ads Worker] Deploy-only complete: ${deployResult.deployed} deployed, ` +
        `${deployResult.failed} failed, ${deployResult.skipped} skipped`
    );
    return {
      success: true,
      message: `Deploy-only: ${deployResult.deployed} deployed, ${deployResult.failed} failed, ${deployResult.skipped} skipped`,
      timestamp: new Date(),
    };
  }

  const result = await runBiddingEngine({ mode, maxDailyBudget });

  // In full mode, create AdCampaign records for grouped candidates (per-microsite)
  let campaignsCreated = 0;
  const { minDailyBudget, maxPerCampaignBudget } = PAID_TRAFFIC_CONFIG;

  if ((mode || 'full') === 'full' && result.groups.length > 0) {
    for (const group of result.groups) {
      // Skip if campaign already exists for this microsite+platform+landingPage
      // (or site+platform+landingPage if no microsite)
      const lpPath = group.adGroups[0]?.landingPagePath || null;
      const existing = await prisma.adCampaign.findFirst({
        where: {
          ...(group.micrositeId
            ? { micrositeId: group.micrositeId }
            : { siteId: group.siteId, micrositeId: null }),
          platform: group.platform as any,
          landingPagePath: lpPath,
          status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] },
        },
      });
      if (existing) continue;

      const campaignName = group.isMicrosite
        ? `${group.siteName} - ${group.platform === 'GOOGLE_SEARCH' ? 'Google' : 'Meta'}`
        : `${group.siteName} - ${group.primaryKeyword} - ${group.platform === 'GOOGLE_SEARCH' ? 'Google' : 'Meta'}`;

      const clampedBudget = Math.min(
        Math.max(group.totalExpectedDailyCost, minDailyBudget),
        maxPerCampaignBudget
      );

      await prisma.adCampaign.create({
        data: {
          siteId: group.siteId,
          micrositeId: group.micrositeId || null,
          platform: group.platform as any,
          name: campaignName.substring(0, 100),
          status: 'DRAFT',
          dailyBudget: clampedBudget,
          maxCpc: group.maxBid,
          keywords: group.candidates.map((c) => c.keyword),
          targetUrl: group.primaryTargetUrl,
          geoTargets: ['GB', 'US', 'CA', 'AU', 'IE', 'NZ'],
          utmSource: group.platform === 'FACEBOOK' ? 'facebook_ads' : 'google_ads',
          utmMedium: 'cpc',
          utmCampaign: `auto_${(group.micrositeDomain || group.siteName).replace(/[.\s]+/g, '_').substring(0, 50)}`,
          landingPagePath: group.adGroups[0]?.landingPagePath,
          landingPageType: group.adGroups[0]?.landingPageType,
          audiences: JSON.parse(JSON.stringify({ adGroups: group.adGroups })),
          proposalData: {
            keywordCount: group.candidates.length,
            adGroupCount: group.adGroups.length,
            totalExpectedDailyCost: group.totalExpectedDailyCost,
            totalExpectedDailyRevenue: group.totalExpectedDailyRevenue,
            avgProfitabilityScore: group.avgProfitabilityScore,
            weightedRoas:
              group.totalExpectedDailyCost > 0
                ? group.totalExpectedDailyRevenue / group.totalExpectedDailyCost
                : 0,
            keywords: group.candidates.map((c) => ({
              keyword: c.keyword,
              opportunityId: c.opportunityId,
              searchVolume: c.searchVolume,
              estimatedCpc: c.estimatedCpc,
              expectedDailyCost: c.expectedDailyCost,
              expectedDailyRevenue: c.expectedDailyRevenue,
              profitabilityScore: c.profitabilityScore,
              intent: c.intent,
              landingPagePath: c.landingPagePath,
            })),
          },
        },
      });

      campaignsCreated++;
    }

    console.log(
      `[Ads Worker] Created ${campaignsCreated} draft campaigns from ${result.groups.length} groups`
    );

    // Auto-deploy new drafts to platforms (as PAUSED — no money spent until manually activated)
    console.log('[Ads Worker] Auto-deploying draft campaigns to platforms...');
    const deployResult = await deployDraftCampaigns(job);
    console.log(
      `[Ads Worker] Auto-deploy complete: ${deployResult.deployed} deployed, ` +
        `${deployResult.failed} failed, ${deployResult.skipped} skipped`
    );
  }

  // Clean up old COMPLETED campaigns that were never deployed (superseded by new DRAFTs)
  const staleCleanup = await prisma.adCampaign.deleteMany({
    where: {
      status: 'COMPLETED',
      platformCampaignId: null,
      totalSpend: { lte: 0 },
    },
  });
  if (staleCleanup.count > 0) {
    console.log(
      `[Ads Worker] Cleaned up ${staleCleanup.count} stale COMPLETED campaigns (never deployed, no spend)`
    );
  }

  // Count final campaign states
  const finalCounts = await prisma.adCampaign.groupBy({
    by: ['status'],
    _count: true,
  });
  const statusSummary = Object.fromEntries(finalCounts.map((c) => [c.status, c._count]));

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
  console.log(
    '[Ads Worker] Starting conversion upload',
    bookingId ? `for booking ${bookingId}` : '(sweep)'
  );

  // Query bookings with click IDs from the last 24 hours (or specific booking)
  const lookback = new Date();
  lookback.setHours(lookback.getHours() - 24);

  const where: Record<string, unknown> = {
    status: { in: ['CONFIRMED', 'COMPLETED'] },
    OR: [{ gclid: { not: null } }, { fbclid: { not: null } }],
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
      select: {
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
        id: true,
        platform: true,
        accountId: true,
      },
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

// --- AD_PLATFORM_IDS_SYNC ---------------------------------------------------

/**
 * Fetch Meta Pixel ID and Google Ads Conversion Action ID from their APIs,
 * then propagate to all active sites and microsites' seoConfig.
 */
export async function handleAdPlatformIdsSync(_job: Job): Promise<JobResult> {
  console.log('[Ads Worker] Starting ad platform IDs sync');

  const result = await fetchAndPropagateAdPlatformIds();

  return {
    success: result.errors === 0,
    message: `Synced IDs: Meta Pixel=${result.fetchedIds.metaPixelId || 'N/A'}, Google Ads=${result.fetchedIds.googleAdsId || 'N/A'}. Updated ${result.sitesUpdated} sites, ${result.micrositesUpdated} microsites`,
    data: {
      metaPixelId: result.fetchedIds.metaPixelId,
      metaPixelName: result.fetchedIds.metaPixelName,
      googleAdsId: result.fetchedIds.googleAdsId,
      googleAdsConversionActionId: result.fetchedIds.googleAdsConversionActionId,
      googleAdsConversionActionName: result.fetchedIds.googleAdsConversionActionName,
      sitesUpdated: result.sitesUpdated,
      sitesSkipped: result.sitesSkipped,
      micrositesUpdated: result.micrositesUpdated,
      micrositesSkipped: result.micrositesSkipped,
      errors: result.errors,
    },
    timestamp: new Date(),
  };
}

// --- AD_CREATIVE_REFRESH ----------------------------------------------------

/**
 * Re-review and update ad creatives for all deployed Meta campaigns.
 *
 * Full remediation pipeline:
 * 1. Check coherence of existing creative against landing page
 * 2. If coherent (score >= 6): image-only review + update
 * 3. If incoherent (score < 6): regenerate text + image + retarget ad set
 */
export async function handleAdCreativeRefresh(_job: Job): Promise<JobResult> {
  console.log('[Ads Worker] Starting ad creative refresh with coherence check');

  const metaClient = await getMetaAdsClient();
  if (!metaClient) {
    return {
      success: false,
      message: 'Meta Ads not configured',
      timestamp: new Date(),
    };
  }

  const pageId = process.env['META_PAGE_ID'];
  if (!pageId) {
    return {
      success: false,
      message: 'META_PAGE_ID not set',
      timestamp: new Date(),
    };
  }

  // Get all deployed Facebook campaigns
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platformCampaignId: { not: null },
      platform: 'FACEBOOK',
    },
    select: {
      id: true,
      name: true,
      keywords: true,
      platformCampaignId: true,
      targetUrl: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      siteId: true,
      micrositeId: true,
      landingPagePath: true,
      landingPageType: true,
      landingPageProducts: true,
      geoTargets: true,
      proposalData: true,
      site: { select: { name: true, targetMarkets: true } },
    },
  });

  console.log(`[Ads Worker] Found ${campaigns.length} deployed Meta campaigns to refresh`);

  let imageOnly = 0;
  let remediated = 0;
  let skipped = 0;
  let failed = 0;

  for (const campaign of campaigns) {
    try {
      const proposalData = campaign.proposalData as Record<string, unknown> | null;
      const existingCreative = proposalData?.['generatedCreative'] as Record<
        string,
        unknown
      > | null;
      const existingImageUrl = existingCreative?.['imageUrl'] as string | null;
      const headline = (existingCreative?.['headline'] as string) || campaign.name;
      const body = (existingCreative?.['body'] as string) || '';
      const callToAction = (existingCreative?.['callToAction'] as string) || 'BOOK_TRAVEL';

      // Build landing URL
      const url = new URL(campaign.targetUrl);
      if (campaign.utmSource) url.searchParams.set('utm_source', campaign.utmSource);
      if (campaign.utmMedium) url.searchParams.set('utm_medium', campaign.utmMedium);
      if (campaign.utmCampaign) url.searchParams.set('utm_campaign', campaign.utmCampaign);
      const landingUrl = url.toString();

      // Step 1: Fetch landing page content for coherence check
      let pageTitle: string | null = null;
      let pageDescription: string | null = null;
      let pageBody: string | null = null;
      let pageType: string | null = null;

      if (campaign.landingPagePath && campaign.siteId) {
        const pageSelect = {
          title: true,
          metaDescription: true,
          type: true,
          content: { select: { body: true } },
        } as const;

        type PageResult = {
          title: string | null;
          metaDescription: string | null;
          type: string;
          content: { body: string | null } | null;
        } | null;

        let page: PageResult = null;
        const lpp = campaign.landingPagePath;

        if (lpp === '/' || lpp === '') {
          page = await prisma.page.findFirst({
            where: { siteId: campaign.siteId, type: 'HOMEPAGE', status: 'PUBLISHED' },
            select: pageSelect,
          });
        } else if (lpp.startsWith('/experiences?categories=')) {
          const category = decodeURIComponent(
            lpp.replace('/experiences?categories=', '').replace(/\+/g, ' ')
          );
          page = await prisma.page.findFirst({
            where: {
              siteId: campaign.siteId,
              type: 'CATEGORY',
              status: 'PUBLISHED',
              title: { contains: category, mode: 'insensitive' },
            },
            select: pageSelect,
          });
        } else if (lpp.startsWith('/experiences?cities=')) {
          const city = decodeURIComponent(
            lpp.replace('/experiences?cities=', '').replace(/\+/g, ' ')
          );
          page = await prisma.page.findFirst({
            where: {
              siteId: campaign.siteId,
              type: 'LANDING',
              status: 'PUBLISHED',
              title: { contains: city, mode: 'insensitive' },
            },
            select: pageSelect,
          });
        } else {
          const slug = lpp.startsWith('/') ? lpp.substring(1) : lpp;
          page = await prisma.page.findFirst({
            where: { siteId: campaign.siteId, slug, status: 'PUBLISHED' },
            select: pageSelect,
          });
        }

        if (page) {
          pageTitle = page.title;
          pageDescription = page.metaDescription;
          pageType = page.type;
          if (page.content?.body) {
            pageBody = stripMarkdownForPrompt(page.content.body, 600);
          }
        }
      }

      // Step 2: Check coherence of existing creative
      const landingPage =
        pageTitle || pageBody
          ? {
              title: pageTitle,
              description: pageDescription,
              bodyExcerpt: pageBody,
              type: pageType || campaign.landingPageType,
              productCount: campaign.landingPageProducts,
            }
          : null;

      const coherence = await checkAdCoherence({
        headline,
        body,
        callToAction,
        imageUrl: existingImageUrl,
        imageSource: (existingCreative?.['imageSource'] as string) || undefined,
        keywords: campaign.keywords,
        landingPage,
      });

      const coherenceScore = coherence?.score ?? null;
      const coherencePass = coherence?.pass ?? true; // Default to pass if check unavailable

      // Step 3: Decide action based on coherence
      if (!coherencePass && coherence) {
        // --- FULL REMEDIATION: text + image + targeting ---
        console.log(
          `[Ads Worker] Remediating "${campaign.name}" (coherence: ${coherenceScore}/10): ${coherence.issues.join('; ')}`
        );

        // Regenerate the full creative (text + image) with landing page context
        const creative = await generateAdCreative({
          keywords: campaign.keywords,
          siteId: campaign.siteId,
          micrositeId: campaign.micrositeId,
          siteName: campaign.site?.name || 'Holibob',
          landingPagePath: campaign.landingPagePath,
          landingPageType: campaign.landingPageType,
          landingPageProducts: campaign.landingPageProducts,
          geoTargets: campaign.geoTargets,
        });

        // Update ad creative on Meta (text + image)
        const ads = await metaClient.getAdsForCampaign(campaign.platformCampaignId!);
        let adUpdated = false;
        for (const ad of ads) {
          const success = await metaClient.updateAdCreative(ad.id, {
            pageId,
            linkUrl: landingUrl,
            headline: creative.headline,
            body: creative.body,
            imageUrl: creative.imageUrl || existingImageUrl || '',
            callToAction: creative.callToAction,
          });
          if (success) adUpdated = true;
        }

        // Re-derive interest targeting from landing page content
        let targetingUpdated = false;
        if (pageTitle || pageBody) {
          try {
            const pageTerms = extractSearchTermsFromContent(pageTitle, pageBody);
            if (pageTerms.length > 0) {
              const newInterests = await findRelevantInterests(metaClient, pageTerms);
              if (newInterests.length > 0) {
                const adSets = await metaClient.getAdSetsForCampaign(campaign.platformCampaignId!);
                for (const adSet of adSets) {
                  const markets = [...(campaign.site?.targetMarkets ?? ['GB', 'US'])];
                  const success = await metaClient.updateAdSetTargeting(adSet.id, {
                    countries: markets,
                    interests: newInterests,
                    ageMin: 18,
                    ageMax: 65,
                  });
                  if (success) targetingUpdated = true;
                }
              }
            }
          } catch (err) {
            console.warn(
              `[Ads Worker] Targeting update failed for "${campaign.name}": ${err instanceof Error ? err.message : err}`
            );
          }
        }

        // Persist all updated metadata
        await prisma.adCampaign.update({
          where: { id: campaign.id },
          data: {
            proposalData: {
              ...(typeof proposalData === 'object' && proposalData !== null ? proposalData : {}),
              generatedCreative: {
                headline: creative.headline,
                body: creative.body,
                callToAction: creative.callToAction,
                imageUrl: creative.imageUrl,
                source: creative.source,
                imageSource: creative.imageSource || null,
                imageReviewScore: creative.imageReviewScore || null,
                imageReviewReasoning: creative.imageReviewReasoning || null,
                coherenceScore: creative.coherenceScore ?? coherenceScore,
                coherencePass: creative.coherencePass ?? false,
                coherenceIssues: creative.coherenceIssues || coherence.issues,
                coherenceSummary: creative.coherenceSummary || coherence.summary,
                remediated: true,
                targetingUpdated,
                remediatedAt: new Date().toISOString(),
              },
            },
          },
        });

        if (adUpdated) {
          remediated++;
          console.log(
            `[Ads Worker] Remediated "${campaign.name}": new text + image + ${targetingUpdated ? 'targeting' : 'no targeting change'} (coherence: ${creative.coherenceScore ?? coherenceScore}/10)`
          );
        } else {
          failed++;
        }
      } else {
        // --- IMAGE-ONLY REFRESH (existing behavior) ---
        const reviewed = await reviewImageForCampaign({
          keywords: campaign.keywords,
          micrositeId: campaign.micrositeId,
          siteId: campaign.siteId,
          headline,
          body,
          brandName: campaign.site?.name || campaign.name,
        });

        if (!reviewed || reviewed.selectedUrl === existingImageUrl) {
          // Persist coherence score even if image didn't change
          if (coherence) {
            await prisma.adCampaign.update({
              where: { id: campaign.id },
              data: {
                proposalData: {
                  ...(typeof proposalData === 'object' && proposalData !== null
                    ? proposalData
                    : {}),
                  generatedCreative: {
                    ...(typeof existingCreative === 'object' && existingCreative !== null
                      ? existingCreative
                      : {}),
                    coherenceScore: coherence.score,
                    coherencePass: coherence.pass,
                    coherenceIssues: coherence.issues,
                    coherenceSummary: coherence.summary,
                    coherenceCheckedAt: new Date().toISOString(),
                  },
                },
              },
            });
          }
          skipped++;
          continue;
        }

        // Get ads and update image
        const ads = await metaClient.getAdsForCampaign(campaign.platformCampaignId!);
        if (ads.length === 0) {
          skipped++;
          continue;
        }

        let adUpdated = false;
        for (const ad of ads) {
          const success = await metaClient.updateAdCreative(ad.id, {
            pageId,
            linkUrl: landingUrl,
            headline,
            body,
            imageUrl: reviewed.selectedUrl,
            callToAction,
          });
          if (success) adUpdated = true;
        }

        if (!adUpdated) {
          failed++;
          continue;
        }

        // Persist image review + coherence metadata
        await prisma.adCampaign.update({
          where: { id: campaign.id },
          data: {
            proposalData: {
              ...(typeof proposalData === 'object' && proposalData !== null ? proposalData : {}),
              generatedCreative: {
                ...(typeof existingCreative === 'object' && existingCreative !== null
                  ? existingCreative
                  : {}),
                imageUrl: reviewed.selectedUrl,
                imageSource: reviewed.selectedSource,
                imageReviewScore: reviewed.score,
                imageReviewReasoning: reviewed.reasoning,
                coherenceScore: coherence?.score ?? null,
                coherencePass: coherence?.pass ?? null,
                coherenceIssues: coherence?.issues || null,
                coherenceSummary: coherence?.summary || null,
                imageRefreshedAt: new Date().toISOString(),
              },
            },
          },
        });

        imageOnly++;
        console.log(
          `[Ads Worker] Updated "${campaign.name}" image: ${reviewed.selectedSource} (score: ${reviewed.score}/10, coherence: ${coherenceScore ?? 'N/A'}/10)`
        );
      }
    } catch (err) {
      console.error(
        `[Ads Worker] Failed to refresh campaign "${campaign.name}": ${err instanceof Error ? err.message : err}`
      );
      failed++;
    }
  }

  const message = `Creative refresh complete: ${remediated} remediated, ${imageOnly} image-only, ${skipped} skipped, ${failed} failed`;
  console.log(`[Ads Worker] ${message}`);

  return {
    success: failed === 0,
    message,
    data: { total: campaigns.length, remediated, imageOnly, skipped, failed },
    timestamp: new Date(),
  };
}
