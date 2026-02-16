/**
 * Ad Campaign Alerting Service
 *
 * Creates AdAlert records when campaign performance thresholds are breached.
 * Called after AD_CAMPAIGN_SYNC completes to detect issues in real-time.
 *
 * Alert types:
 * - BUDGET_OVERSPEND: Daily spend exceeds 110% of budget cap
 * - ROAS_DROP: Campaign ROAS below 0.5 for 3+ consecutive days
 * - PORTFOLIO_ROAS_DROP: Portfolio-wide ROAS below 1.0
 * - CAMPAIGN_ERROR: Platform API error during sync
 * - SYNC_FAILURE: AD_CAMPAIGN_SYNC fails entirely
 * - HIGH_CPC: Campaign CPC exceeds 2x max profitable CPC
 * - NO_IMPRESSIONS: Active campaign with 0 impressions for 48+ hours
 */

import { prisma } from '@experience-marketplace/database';
import { PAID_TRAFFIC_CONFIG } from '../config/paid-traffic';

type AlertType =
  | 'BUDGET_OVERSPEND'
  | 'ROAS_DROP'
  | 'PORTFOLIO_ROAS_DROP'
  | 'CAMPAIGN_ERROR'
  | 'SYNC_FAILURE'
  | 'HIGH_CPC'
  | 'NO_IMPRESSIONS';

type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

interface CreateAlertParams {
  type: AlertType;
  severity: AlertSeverity;
  campaignId?: string;
  siteId?: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Create an alert, deduplicating against existing unacknowledged alerts
 * of the same type for the same campaign.
 */
async function createAlert(params: CreateAlertParams): Promise<void> {
  // Check for existing unacknowledged alert of same type + campaign
  const existing = await (prisma as any).adAlert.findFirst({
    where: {
      type: params.type,
      campaignId: params.campaignId ?? null,
      acknowledged: false,
    },
  });

  if (existing) {
    // Don't create duplicate alerts
    return;
  }

  await (prisma as any).adAlert.create({
    data: {
      type: params.type,
      severity: params.severity,
      campaignId: params.campaignId ?? null,
      siteId: params.siteId ?? null,
      message: params.message,
      details: params.details ?? null,
    },
  });

  console.log(`[Ad Alerting] Created ${params.severity} alert: ${params.type} — ${params.message}`);
}

/**
 * Run all alert checks after a campaign sync.
 * Call this from the AD_CAMPAIGN_SYNC handler after metrics are updated.
 */
export async function runAlertChecks(): Promise<{
  alertsCreated: number;
  checksRun: number;
}> {
  let alertsCreated = 0;
  let checksRun = 0;

  const MAX_DAILY_BUDGET = PAID_TRAFFIC_CONFIG.maxDailyBudget;

  // ── Check 1: Budget Overspend ────────────────────────────────────────────

  checksRun++;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailySpendResult = await (prisma as any).adDailyMetric.aggregate({
      where: { date: { gte: today } },
      _sum: { spend: true },
    });

    const todaySpend = Number(dailySpendResult._sum?.spend || 0);
    if (todaySpend > MAX_DAILY_BUDGET * 1.1) {
      await createAlert({
        type: 'BUDGET_OVERSPEND',
        severity: 'CRITICAL',
        message: `Daily spend £${todaySpend.toFixed(2)} exceeds budget cap £${MAX_DAILY_BUDGET.toFixed(2)} by ${((todaySpend / MAX_DAILY_BUDGET - 1) * 100).toFixed(0)}%`,
        details: { todaySpend, budgetCap: MAX_DAILY_BUDGET },
      });
      alertsCreated++;
    }
  } catch (err) {
    console.error('[Ad Alerting] Budget check failed:', err);
  }

  // ── Check 2: Campaign ROAS Drop ──────────────────────────────────────────

  checksRun++;
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const activeCampaigns = await (prisma as any).adCampaign.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        siteId: true,
        dailyMetrics: {
          where: { date: { gte: threeDaysAgo } },
          orderBy: { date: 'desc' as const },
          take: 3,
        },
      },
    });

    for (const campaign of activeCampaigns) {
      if (campaign.dailyMetrics.length < 3) continue;

      // Check if all 3 days have ROAS < 0.5
      const allBelowThreshold = campaign.dailyMetrics.every((m: any) => {
        const spend = Number(m.spend);
        const revenue = Number(m.revenue);
        if (spend < 1) return false; // Skip days with negligible spend
        return revenue / spend < 0.5;
      });

      if (allBelowThreshold) {
        const totalSpend = campaign.dailyMetrics.reduce((s: number, m: any) => s + Number(m.spend), 0);
        const totalRevenue = campaign.dailyMetrics.reduce((s: number, m: any) => s + Number(m.revenue), 0);
        const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

        await createAlert({
          type: 'ROAS_DROP',
          severity: 'WARNING',
          campaignId: campaign.id,
          siteId: campaign.siteId,
          message: `Campaign "${campaign.name}" ROAS ${roas.toFixed(2)}x for 3 consecutive days (£${totalSpend.toFixed(2)} spent)`,
          details: { roas, totalSpend, totalRevenue, days: 3 },
        });
        alertsCreated++;
      }
    }
  } catch (err) {
    console.error('[Ad Alerting] ROAS check failed:', err);
  }

  // ── Check 3: Portfolio ROAS Drop ─────────────────────────────────────────

  checksRun++;
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const portfolioMetrics = await (prisma as any).adDailyMetric.aggregate({
      where: { date: { gte: sevenDaysAgo } },
      _sum: { spend: true, revenue: true },
    });

    const totalSpend = Number(portfolioMetrics._sum?.spend || 0);
    const totalRevenue = Number(portfolioMetrics._sum?.revenue || 0);

    if (totalSpend > 10) {
      // Only alert if meaningful spend
      const portfolioRoas = totalRevenue / totalSpend;
      if (portfolioRoas < 1.0) {
        await createAlert({
          type: 'PORTFOLIO_ROAS_DROP',
          severity: 'CRITICAL',
          message: `Portfolio ROAS ${portfolioRoas.toFixed(2)}x over last 7 days (£${totalSpend.toFixed(2)} spent, £${totalRevenue.toFixed(2)} revenue)`,
          details: { portfolioRoas, totalSpend, totalRevenue },
        });
        alertsCreated++;
      }
    }
  } catch (err) {
    console.error('[Ad Alerting] Portfolio ROAS check failed:', err);
  }

  // ── Check 4: High CPC ───────────────────────────────────────────────────

  checksRun++;
  try {
    const activeCampaigns = await (prisma as any).adCampaign.findMany({
      where: { status: 'ACTIVE', avgCpc: { not: null } },
      select: {
        id: true,
        name: true,
        siteId: true,
        avgCpc: true,
        maxCpc: true,
      },
    });

    for (const campaign of activeCampaigns) {
      const avgCpc = Number(campaign.avgCpc);
      const maxCpc = Number(campaign.maxCpc);
      if (avgCpc > maxCpc * 2 && avgCpc > 0.05) {
        await createAlert({
          type: 'HIGH_CPC',
          severity: 'WARNING',
          campaignId: campaign.id,
          siteId: campaign.siteId,
          message: `Campaign "${campaign.name}" avg CPC £${avgCpc.toFixed(2)} is ${(avgCpc / maxCpc).toFixed(1)}x the max bid £${maxCpc.toFixed(2)}`,
          details: { avgCpc, maxCpc },
        });
        alertsCreated++;
      }
    }
  } catch (err) {
    console.error('[Ad Alerting] High CPC check failed:', err);
  }

  // ── Check 5: No Impressions ──────────────────────────────────────────────

  checksRun++;
  try {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const activeCampaigns = await (prisma as any).adCampaign.findMany({
      where: {
        status: 'ACTIVE',
        createdAt: { lte: twoDaysAgo }, // Must be at least 48h old
      },
      select: {
        id: true,
        name: true,
        siteId: true,
        dailyMetrics: {
          where: { date: { gte: twoDaysAgo } },
          select: { impressions: true },
        },
      },
    });

    for (const campaign of activeCampaigns) {
      const totalImpressions = campaign.dailyMetrics.reduce(
        (s: number, m: any) => s + m.impressions,
        0
      );

      if (totalImpressions === 0) {
        await createAlert({
          type: 'NO_IMPRESSIONS',
          severity: 'WARNING',
          campaignId: campaign.id,
          siteId: campaign.siteId,
          message: `Campaign "${campaign.name}" has had 0 impressions for 48+ hours`,
        });
        alertsCreated++;
      }
    }
  } catch (err) {
    console.error('[Ad Alerting] No impressions check failed:', err);
  }

  console.log(
    `[Ad Alerting] Checks complete: ${checksRun} checks run, ${alertsCreated} alerts created`
  );

  return { alertsCreated, checksRun };
}

/**
 * Create a sync failure alert. Called when AD_CAMPAIGN_SYNC encounters an error.
 */
export async function createSyncFailureAlert(errorMessage: string): Promise<void> {
  await createAlert({
    type: 'SYNC_FAILURE',
    severity: 'CRITICAL',
    message: `Ad campaign sync failed: ${errorMessage}`,
    details: { error: errorMessage },
  });
}

/**
 * Create a campaign error alert. Called when a platform API returns an error.
 */
export async function createCampaignErrorAlert(
  campaignId: string,
  platform: string,
  errorMessage: string
): Promise<void> {
  await createAlert({
    type: 'CAMPAIGN_ERROR',
    severity: 'WARNING',
    campaignId,
    message: `${platform} API error for campaign: ${errorMessage}`,
    details: { platform, error: errorMessage },
  });
}
