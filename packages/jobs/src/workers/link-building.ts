/**
 * Link Building Worker
 *
 * Handles automated link building tasks:
 * - Competitor backlink analysis and opportunity discovery
 * - Backlink monitoring (verify existing, discover new)
 * - Outreach email generation
 * - Linkable asset content generation
 */

import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import type {
  LinkOpportunityScanPayload,
  LinkBacklinkMonitorPayload,
  LinkOutreachGeneratePayload,
  LinkAssetGeneratePayload,
  JobResult,
} from '../types';
import {
  findLinkOpportunities,
  getBacklinkProfile,
  verifyBacklinks,
  discoverNewBacklinks,
} from '../services/backlink-analysis';
import { generateOutreachForOpportunity } from '../services/outreach-templates';
import {
  generateStatisticsRoundup,
  generateComprehensiveGuide,
  generateInfographicData,
} from '../services/linkable-assets';
import { runCrossSiteLinkEnrichment } from '../services/cross-site-link-enrichment';
import { runCompetitorDiscovery } from '../services/competitor-discovery';
import { runBrokenLinkDiscovery } from '../services/broken-link-discovery';
import { runContentGapAnalysis } from '../services/content-gap-analysis';
import { circuitBreakers } from '../errors/circuit-breaker';
import { toJobError } from '../errors';
import { errorTracking } from '../errors/tracking';

/**
 * Handle LINK_OPPORTUNITY_SCAN jobs
 * Analyzes competitor backlinks to find link gap opportunities
 */
export async function handleLinkOpportunityScan(
  job: Job<LinkOpportunityScanPayload>
): Promise<JobResult> {
  const { siteId, competitorDomains = [], maxOpportunities } = job.data;

  console.log(`[Link Building] Starting opportunity scan for site ${siteId}`);

  try {
    // Get our site's domain
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { primaryDomain: true, name: true },
    });

    if (!site?.primaryDomain) {
      return {
        success: false,
        message: 'Site has no primary domain configured',
        timestamp: new Date(),
      };
    }

    // Get our backlink profile first (protected by circuit breaker)
    const backlinkBreaker = circuitBreakers.getBreaker('backlink-api', {
      failureThreshold: 3,
      timeout: 120_000,
    });
    const profile = await backlinkBreaker.execute(() => getBacklinkProfile(site.primaryDomain!));
    console.log(
      `[Link Building] Our profile: ${profile.totalBacklinks} backlinks, DA: ${profile.domainAuthority}`
    );

    // If no competitor domains provided, we can't do a gap analysis
    if (competitorDomains.length === 0) {
      return {
        success: true,
        message:
          'No competitor domains provided for gap analysis. Provide competitor domains to find opportunities.',
        data: { profile },
        timestamp: new Date(),
      };
    }

    // Find link opportunities from competitor analysis
    const opportunitiesCreated = await findLinkOpportunities({
      siteId,
      ourDomain: site.primaryDomain,
      competitorDomains,
      maxOpportunities,
    });

    // Create manual tasks for high-priority opportunities
    const highPriorityOpps = await prisma.linkOpportunity.findMany({
      where: {
        siteId,
        status: 'IDENTIFIED',
        domainAuthority: { gte: 40 },
      },
      orderBy: { domainAuthority: 'desc' },
      take: 5,
    });

    for (const opp of highPriorityOpps) {
      // Idempotency: skip if a task already exists for this opportunity's domain
      const existingTask = await prisma.manualTask.findFirst({
        where: {
          siteId,
          category: 'SEO_OPTIMIZATION',
          title: { contains: opp.targetDomain },
        },
      });
      if (existingTask) continue;

      await prisma.manualTask.create({
        data: {
          siteId,
          title: `High-DA link opportunity: ${opp.targetDomain} (DA ${opp.domainAuthority})`,
          description: `Link opportunity found on ${opp.targetUrl}. Competitor ${opp.competitorUrl ?? 'unknown'} has a link from this domain. Consider outreach.`,
          category: 'SEO_OPTIMIZATION',
          priority: opp.domainAuthority >= 60 ? 'HIGH' : 'MEDIUM',
          status: 'PENDING',
        },
      });
    }

    return {
      success: true,
      message: `Found ${opportunitiesCreated} link opportunities from ${competitorDomains.length} competitors`,
      data: {
        profile,
        opportunitiesCreated,
        highPriorityCount: highPriorityOpps.length,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);
    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'LINK_OPPORTUNITY_SCAN',
      siteId,
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { competitorDomains },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });
    console.error(`[Link Building] Opportunity scan failed for site ${siteId}:`, jobError.message);

    if (jobError.retryable) {
      throw new Error(jobError.message);
    }

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}

/**
 * Handle LINK_BACKLINK_MONITOR jobs
 * Verifies existing backlinks and discovers new ones
 */
export async function handleLinkBacklinkMonitor(
  job: Job<LinkBacklinkMonitorPayload>
): Promise<JobResult> {
  const { siteId, checkExisting = true, discoverNew: shouldDiscoverNew = true } = job.data;

  console.log(`[Link Building] Starting backlink monitor for site ${siteId}`);

  try {
    let checked = 0;
    let lost = 0;
    let discovered = 0;

    if (checkExisting) {
      const result = await verifyBacklinks(siteId);
      checked = result.checked;
      lost = result.lost;
    }

    if (shouldDiscoverNew) {
      discovered = await discoverNewBacklinks(siteId);
    }

    return {
      success: true,
      message: `Monitored backlinks: ${checked} checked, ${lost} lost, ${discovered} new discovered`,
      data: { checked, lost, discovered },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);
    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'LINK_BACKLINK_MONITOR',
      siteId,
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });
    console.error(`[Link Building] Backlink monitor failed for site ${siteId}:`, jobError.message);

    if (jobError.retryable) {
      throw new Error(jobError.message);
    }

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}

/**
 * Handle LINK_OUTREACH_GENERATE jobs
 * Generates personalized outreach email for a specific opportunity
 */
export async function handleLinkOutreachGenerate(
  job: Job<LinkOutreachGeneratePayload>
): Promise<JobResult> {
  const { siteId, opportunityId, templateType } = job.data;

  console.log(
    `[Link Building] Generating ${templateType} outreach for opportunity ${opportunityId}`
  );

  try {
    const template = await generateOutreachForOpportunity({
      siteId,
      opportunityId,
      templateType,
    });

    return {
      success: true,
      message: `Generated ${templateType} outreach template`,
      data: {
        subject: template.subject,
        templateType: template.templateType,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Link Building] Outreach generation failed:`, error);
    return {
      success: false,
      error: message,
      retryable: false,
      timestamp: new Date(),
    };
  }
}

/**
 * Handle LINK_ASSET_GENERATE jobs
 * Generates linkable asset content (statistics pages, guides, infographics)
 */
export async function handleLinkAssetGenerate(
  job: Job<LinkAssetGeneratePayload>
): Promise<JobResult> {
  const { siteId, assetType, targetKeyword, destination } = job.data;

  console.log(`[Link Building] Generating ${assetType} asset for "${targetKeyword}"`);

  try {
    let result: { assetId: string; pageId: string };

    switch (assetType) {
      case 'statistics_roundup':
        result = await generateStatisticsRoundup({ siteId, targetKeyword, destination });
        break;
      case 'comprehensive_guide':
        result = await generateComprehensiveGuide({ siteId, targetKeyword, destination });
        break;
      case 'infographic_data':
        result = await generateInfographicData({ siteId, targetKeyword });
        break;
      case 'original_research':
        // Original research uses the same pattern as statistics roundup
        result = await generateStatisticsRoundup({ siteId, targetKeyword, destination });
        break;
      default:
        return {
          success: false,
          error: `Unknown asset type: ${assetType}`,
          timestamp: new Date(),
        };
    }

    return {
      success: true,
      message: `Generated ${assetType} asset: "${targetKeyword}"`,
      data: result,
      timestamp: new Date(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Link Building] Asset generation failed:`, error);
    return {
      success: false,
      error: message,
      retryable: true,
      timestamp: new Date(),
    };
  }
}

/**
 * Handle CROSS_SITE_LINK_ENRICHMENT jobs
 * Batch-processes existing blog posts to inject cross-site links where missing
 */
export async function handleCrossSiteLinkEnrichment(
  job: Job<{ percentagePerRun?: number }>
): Promise<JobResult> {
  const { percentagePerRun = 5 } = job.data;

  console.log(`[Link Building] Starting cross-site link enrichment (${percentagePerRun}% batch)`);

  try {
    const result = await runCrossSiteLinkEnrichment(percentagePerRun);

    return {
      success: true,
      message: `Enriched ${result.blogsEnriched} blogs with ${result.linksAdded} cross-site links (${result.micrositesProcessed} microsites processed)`,
      data: { ...result } as Record<string, unknown>,
      timestamp: new Date(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Link Building] Cross-site enrichment failed:', error);
    return {
      success: false,
      error: message,
      retryable: true,
      timestamp: new Date(),
    };
  }
}

/**
 * Handle LINK_COMPETITOR_DISCOVERY jobs
 * Uses SERP data to find competitors and their backlink sources
 */
export async function handleLinkCompetitorDiscovery(
  job: Job<{ maxSites?: number }>
): Promise<JobResult> {
  const { maxSites = 20 } = job.data;

  console.log(`[Link Building] Starting competitor discovery (max ${maxSites} sites)`);

  try {
    const result = await runCompetitorDiscovery(maxSites);

    return {
      success: true,
      message: `Discovered ${result.competitorsFound} competitors across ${result.sitesProcessed} sites, created ${result.opportunitiesCreated} opportunities`,
      data: { ...result } as Record<string, unknown>,
      timestamp: new Date(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Link Building] Competitor discovery failed:', error);
    return {
      success: false,
      error: message,
      retryable: true,
      timestamp: new Date(),
    };
  }
}

/**
 * Handle LINK_BROKEN_LINK_SCAN jobs
 * Scans competitor domains for broken links that we can replace
 */
export async function handleLinkBrokenLinkScan(
  job: Job<{ maxDomains?: number }>
): Promise<JobResult> {
  const { maxDomains = 20 } = job.data;

  console.log(`[Link Building] Starting broken link scan (max ${maxDomains} domains)`);

  try {
    const result = await runBrokenLinkDiscovery(maxDomains);

    return {
      success: true,
      message: `Scanned ${result.domainsScanned} domains, found ${result.brokenLinksFound} broken links, created ${result.opportunitiesCreated} opportunities`,
      data: { ...result } as Record<string, unknown>,
      timestamp: new Date(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Link Building] Broken link scan failed:', error);
    return {
      success: false,
      error: message,
      retryable: true,
      timestamp: new Date(),
    };
  }
}

/**
 * Handle LINK_CONTENT_GAP_ANALYSIS jobs
 * Identifies keyword gaps where we can create linkable assets
 */
export async function handleLinkContentGapAnalysis(
  job: Job<{ maxSites?: number }>
): Promise<JobResult> {
  const { maxSites = 10 } = job.data;

  console.log(`[Link Building] Starting content gap analysis (max ${maxSites} sites)`);

  try {
    const result = await runContentGapAnalysis(maxSites);

    return {
      success: true,
      message: `Analyzed ${result.sitesAnalyzed} sites, identified ${result.gapsIdentified} gaps, created ${result.assetsCreated} asset suggestions`,
      data: { ...result } as Record<string, unknown>,
      timestamp: new Date(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Link Building] Content gap analysis failed:', error);
    return {
      success: false,
      error: message,
      retryable: true,
      timestamp: new Date(),
    };
  }
}
