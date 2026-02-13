/**
 * Ads Queue Worker Handlers
 *
 * Handles paid traffic acquisition jobs:
 * - PAID_KEYWORD_SCAN: Discover low-CPC keyword opportunities
 * - AD_CAMPAIGN_SYNC: Sync ad platform campaign data into AdCampaign/AdDailyMetric
 * - AD_PERFORMANCE_REPORT: Generate cross-platform performance reports
 * - AD_BUDGET_OPTIMIZER: Auto-reallocate budget based on ROAS
 * - BIDDING_ENGINE_RUN: Full profitability-driven campaign orchestration
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
import { MetaAdsClient } from '../services/social/meta-ads-client';
import { refreshTokenIfNeeded } from '../services/social/token-refresh';
import {
  isGoogleAdsConfigured,
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

  return {
    success: errors === 0,
    message: `Synced ${synced}/${campaigns.length} campaigns (${errors} errors)`,
    data: { synced, total: campaigns.length, errors },
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

// --- BIDDING_ENGINE_RUN ------------------------------------------------------

/**
 * Full bidding engine orchestration: profitability → scoring → campaign creation.
 * Modes:
 *   full — Calculate profitability, score opportunities, create/update campaigns
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

      // Create campaign record (DRAFT — actual platform creation happens on first sync)
      const campaignName = `${candidate.siteName} - ${candidate.keyword}`;
      await prisma.adCampaign.create({
        data: {
          siteId: candidate.siteId,
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
        },
      });

      campaignsCreated++;
    }

    console.log(`[Ads Worker] Created ${campaignsCreated} new campaign records`);
  }

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
