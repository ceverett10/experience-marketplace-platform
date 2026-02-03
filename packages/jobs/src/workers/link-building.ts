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

    // Get our backlink profile first
    const profile = await getBacklinkProfile(site.primaryDomain);
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Link Building] Opportunity scan failed for site ${siteId}:`, error);
    return {
      success: false,
      error: message,
      retryable: true,
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Link Building] Backlink monitor failed for site ${siteId}:`, error);
    return {
      success: false,
      error: message,
      retryable: true,
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
