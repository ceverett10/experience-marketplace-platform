/**
 * Pause Control Service
 *
 * Provides utilities for checking if autonomous processes are allowed to run.
 * All workers should use these functions before executing operations.
 */

import { prisma } from '@experience-marketplace/database';

interface PauseCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if autonomous processing is allowed for a given operation
 *
 * @param siteId - Optional site ID to check site-specific pause status
 * @returns Promise<PauseCheckResult> - Whether processing is allowed and reason if not
 */
export async function isProcessingAllowed(siteId?: string): Promise<PauseCheckResult> {
  try {
    // 1. Check global platform pause
    const platformSettings = await prisma.platformSettings.findFirst({
      where: { id: 'platform_settings_singleton' },
    });

    if (platformSettings?.allAutonomousProcessesPaused) {
      console.log('[Pause Check] ❌ Global platform pause is active');
      return {
        allowed: false,
        reason: 'Global platform pause is active',
      };
    }

    // 2. Check per-site pause (if siteId provided)
    if (siteId) {
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { autonomousProcessesPaused: true },
      });

      if (site?.autonomousProcessesPaused) {
        console.log(`[Pause Check] ❌ Site ${siteId} autonomous processes are paused`);
        return {
          allowed: false,
          reason: `Site ${siteId} autonomous processes are paused`,
        };
      }
    }

    console.log('[Pause Check] ✅ Processing allowed');
    return { allowed: true };
  } catch (error) {
    console.error('[Pause Check] Error checking pause status:', error);
    // Fail open - allow processing if we can't check the status
    return { allowed: true };
  }
}

/**
 * Check if a specific feature is enabled
 *
 * @param feature - Feature name to check
 * @returns Promise<boolean> - Whether the feature is enabled
 */
export async function isFeatureEnabled(
  feature:
    | 'enableSiteCreation'
    | 'enableContentGeneration'
    | 'enableGSCVerification'
    | 'enableContentOptimization'
    | 'enableABTesting'
): Promise<boolean> {
  try {
    const platformSettings = await prisma.platformSettings.findFirst({
      where: { id: 'platform_settings_singleton' },
      select: { [feature]: true },
    });

    const enabled = platformSettings?.[feature] ?? true;
    console.log(`[Feature Check] ${feature}: ${enabled ? '✅ enabled' : '❌ disabled'}`);
    return enabled;
  } catch (error) {
    console.error(`[Feature Check] Error checking feature ${feature}:`, error);
    // Fail open - allow feature if we can't check the status
    return true;
  }
}

/**
 * Check if rate limit allows this operation
 *
 * @param operationType - Type of operation to check
 * @returns Promise<PauseCheckResult> - Whether operation is within rate limits
 */
export async function checkRateLimit(
  operationType: 'SITE_CREATE' | 'CONTENT_GENERATE' | 'GSC_REQUEST' | 'OPPORTUNITY_SCAN'
): Promise<PauseCheckResult> {
  try {
    const settings = await prisma.platformSettings.findFirst({
      where: { id: 'platform_settings_singleton' },
    });

    if (!settings) {
      return { allowed: true };
    }

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    switch (operationType) {
      case 'SITE_CREATE': {
        // Check total sites limit
        const totalSites = await prisma.site.count();
        if (totalSites >= settings.maxTotalSites) {
          console.log(
            `[Rate Limit] ❌ Max total sites reached (${totalSites}/${settings.maxTotalSites})`
          );
          return {
            allowed: false,
            reason: `Maximum total sites limit reached (${settings.maxTotalSites})`,
          };
        }

        // Check sites per hour
        const recentSites = await prisma.site.count({
          where: { createdAt: { gte: hourAgo } },
        });

        if (recentSites >= settings.maxSitesPerHour) {
          console.log(
            `[Rate Limit] ❌ Max sites per hour reached (${recentSites}/${settings.maxSitesPerHour})`
          );
          return {
            allowed: false,
            reason: `Maximum sites per hour limit reached (${settings.maxSitesPerHour})`,
          };
        }
        break;
      }

      case 'CONTENT_GENERATE': {
        const recentPages = await prisma.page.count({
          where: { createdAt: { gte: hourAgo } },
        });

        if (recentPages >= settings.maxContentPagesPerHour) {
          console.log(
            `[Rate Limit] ❌ Max content pages per hour reached (${recentPages}/${settings.maxContentPagesPerHour})`
          );
          return {
            allowed: false,
            reason: `Maximum content pages per hour limit reached (${settings.maxContentPagesPerHour})`,
          };
        }
        break;
      }

      case 'GSC_REQUEST': {
        // Check GSC sync jobs in the last hour
        const recentGSCJobs = await prisma.job.count({
          where: {
            type: 'GSC_SYNC',
            createdAt: { gte: hourAgo },
          },
        });

        if (recentGSCJobs >= settings.maxGSCRequestsPerHour) {
          console.log(
            `[Rate Limit] ❌ Max GSC requests per hour reached (${recentGSCJobs}/${settings.maxGSCRequestsPerHour})`
          );
          return {
            allowed: false,
            reason: `Maximum GSC requests per hour limit reached (${settings.maxGSCRequestsPerHour})`,
          };
        }
        break;
      }

      case 'OPPORTUNITY_SCAN': {
        const recentScans = await prisma.job.count({
          where: {
            type: 'SEO_OPPORTUNITY_SCAN',
            createdAt: { gte: dayAgo },
          },
        });

        if (recentScans >= settings.maxOpportunityScansPerDay) {
          console.log(
            `[Rate Limit] ❌ Max opportunity scans per day reached (${recentScans}/${settings.maxOpportunityScansPerDay})`
          );
          return {
            allowed: false,
            reason: `Maximum opportunity scans per day limit reached (${settings.maxOpportunityScansPerDay})`,
          };
        }
        break;
      }
    }

    console.log(`[Rate Limit] ✅ ${operationType} within limits`);
    return { allowed: true };
  } catch (error) {
    console.error(`[Rate Limit] Error checking rate limit for ${operationType}:`, error);
    // Fail open - allow operation if we can't check the rate limit
    return { allowed: true };
  }
}

/**
 * Comprehensive check for autonomous operations
 * Checks pause status, feature flags, and rate limits
 *
 * @param options - Check options
 * @returns Promise<PauseCheckResult> - Whether operation is allowed
 */
export async function canExecuteAutonomousOperation(options: {
  siteId?: string;
  feature?:
    | 'enableSiteCreation'
    | 'enableContentGeneration'
    | 'enableGSCVerification'
    | 'enableContentOptimization'
    | 'enableABTesting';
  rateLimitType?: 'SITE_CREATE' | 'CONTENT_GENERATE' | 'GSC_REQUEST' | 'OPPORTUNITY_SCAN';
}): Promise<PauseCheckResult> {
  // 1. Check pause status
  const pauseCheck = await isProcessingAllowed(options.siteId);
  if (!pauseCheck.allowed) {
    return pauseCheck;
  }

  // 2. Check feature flag
  if (options.feature) {
    const featureEnabled = await isFeatureEnabled(options.feature);
    if (!featureEnabled) {
      return {
        allowed: false,
        reason: `Feature ${options.feature} is disabled`,
      };
    }
  }

  // 3. Check rate limit
  if (options.rateLimitType) {
    const rateLimitCheck = await checkRateLimit(options.rateLimitType);
    if (!rateLimitCheck.allowed) {
      return rateLimitCheck;
    }
  }

  return { allowed: true };
}
