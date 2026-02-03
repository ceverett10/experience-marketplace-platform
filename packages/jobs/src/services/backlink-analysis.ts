/**
 * Backlink Analysis Service
 *
 * Analyzes competitor backlinks, finds link gap opportunities,
 * monitors existing backlinks, and discovers new ones.
 *
 * Uses DataForSEO Backlinks API for data.
 */

import { prisma } from '@experience-marketplace/database';
import { DataForSEOClient } from './dataforseo-client';

let dataForSEOClient: DataForSEOClient | null = null;

function getClient(): DataForSEOClient {
  if (!dataForSEOClient) {
    dataForSEOClient = new DataForSEOClient();
  }
  return dataForSEOClient;
}

/**
 * Get backlink profile summary for a domain
 */
export async function getBacklinkProfile(domain: string) {
  const client = getClient();
  const summary = await client.getBacklinkSummary(domain);

  console.log(`[Backlink Analysis] Profile for ${domain}: ${summary.totalBacklinks} backlinks from ${summary.referringDomains} domains (DA: ${summary.domainAuthority})`);

  return summary;
}

/**
 * Get individual backlinks for a competitor domain
 */
export async function getCompetitorBacklinks(competitorDomain: string, limit: number = 100) {
  const client = getClient();
  const backlinks = await client.getBacklinks(competitorDomain, limit);

  console.log(`[Backlink Analysis] Found ${backlinks.length} backlinks for competitor ${competitorDomain}`);

  return backlinks;
}

/**
 * Find link opportunities by analyzing competitor backlinks
 * Identifies domains linking to competitors but not to us
 */
export async function findLinkOpportunities(params: {
  siteId: string;
  ourDomain: string;
  competitorDomains: string[];
  maxOpportunities?: number;
}): Promise<number> {
  const { siteId, ourDomain, competitorDomains, maxOpportunities = 50 } = params;
  const client = getClient();

  console.log(`[Backlink Analysis] Scanning ${competitorDomains.length} competitors for link opportunities`);

  // Get our existing backlink sources
  const ourBacklinks = await client.getBacklinks(ourDomain, 500);
  const ourSourceDomains = new Set(ourBacklinks.map((b) => b.sourceDomain));

  // Collect competitor backlinks that we don't have
  const opportunities: Array<{
    sourceDomain: string;
    sourceUrl: string;
    competitorUrl: string;
    domainAuthority: number;
    anchorText: string;
  }> = [];

  for (const competitor of competitorDomains) {
    const competitorLinks = await client.getBacklinks(competitor, 200);

    for (const link of competitorLinks) {
      // Skip if we already have a link from this domain
      if (ourSourceDomains.has(link.sourceDomain)) continue;
      // Skip low-DA sources
      if (link.domainAuthority < 10) continue;

      opportunities.push({
        sourceDomain: link.sourceDomain,
        sourceUrl: link.sourceUrl,
        competitorUrl: link.targetUrl,
        domainAuthority: link.domainAuthority,
        anchorText: link.anchorText,
      });
    }
  }

  // Deduplicate by source domain, keep highest DA
  const domainMap = new Map<string, (typeof opportunities)[0]>();
  for (const opp of opportunities) {
    const existing = domainMap.get(opp.sourceDomain);
    if (!existing || opp.domainAuthority > existing.domainAuthority) {
      domainMap.set(opp.sourceDomain, opp);
    }
  }

  // Sort by DA and limit
  const sorted = [...domainMap.values()]
    .sort((a, b) => b.domainAuthority - a.domainAuthority)
    .slice(0, maxOpportunities);

  // Store as LinkOpportunity records
  let created = 0;
  for (const opp of sorted) {
    try {
      await prisma.linkOpportunity.upsert({
        where: {
          siteId_targetUrl: { siteId, targetUrl: opp.sourceUrl },
        },
        create: {
          siteId,
          targetDomain: opp.sourceDomain,
          targetUrl: opp.sourceUrl,
          domainAuthority: opp.domainAuthority,
          relevanceScore: 0.5, // Default, can be refined later
          priorityScore: opp.domainAuthority / 100,
          opportunityType: 'COMPETITOR_BACKLINK',
          competitorUrl: opp.competitorUrl,
          status: 'IDENTIFIED',
        },
        update: {
          domainAuthority: opp.domainAuthority,
          competitorUrl: opp.competitorUrl,
        },
      });
      created++;
    } catch (error) {
      // Skip unique constraint violations
      console.error(`[Backlink Analysis] Error upserting opportunity for ${opp.sourceDomain}:`, error);
    }
  }

  console.log(`[Backlink Analysis] Created/updated ${created} link opportunities for site ${siteId}`);
  return created;
}

/**
 * Verify existing backlinks are still active
 * Updates status of lost links
 */
export async function verifyBacklinks(siteId: string): Promise<{ checked: number; lost: number }> {
  const client = getClient();

  // Get the site's domain
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { primaryDomain: true },
  });

  if (!site?.primaryDomain) {
    console.log(`[Backlink Analysis] No primary domain for site ${siteId}, skipping verification`);
    return { checked: 0, lost: 0 };
  }

  // Get current live backlinks from DataForSEO
  const liveBacklinks = await client.getBacklinks(site.primaryDomain, 500);
  const liveSourceUrls = new Set(liveBacklinks.map((b) => b.sourceUrl));

  // Get our stored active backlinks
  const storedBacklinks = await prisma.backlink.findMany({
    where: { siteId, isActive: true },
  });

  let lost = 0;
  for (const stored of storedBacklinks) {
    if (!liveSourceUrls.has(stored.sourceUrl)) {
      // Mark as lost
      await prisma.backlink.update({
        where: { id: stored.id },
        data: {
          isActive: false,
          lostAt: new Date(),
          lastCheckedAt: new Date(),
        },
      });
      lost++;
    } else {
      // Update last checked
      await prisma.backlink.update({
        where: { id: stored.id },
        data: { lastCheckedAt: new Date() },
      });
    }
  }

  console.log(`[Backlink Analysis] Verified ${storedBacklinks.length} backlinks, ${lost} lost`);
  return { checked: storedBacklinks.length, lost };
}

/**
 * Discover new backlinks since last check
 */
export async function discoverNewBacklinks(siteId: string): Promise<number> {
  const client = getClient();

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { primaryDomain: true },
  });

  if (!site?.primaryDomain) {
    return 0;
  }

  // Get the most recent backlink check date
  const lastBacklink = await prisma.backlink.findFirst({
    where: { siteId },
    orderBy: { firstSeenAt: 'desc' },
    select: { firstSeenAt: true },
  });

  const sinceDate = lastBacklink?.firstSeenAt
    ? lastBacklink.firstSeenAt.toISOString().split('T')[0]!
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

  const newBacklinks = await client.getNewBacklinks(site.primaryDomain, sinceDate);

  let created = 0;
  for (const link of newBacklinks) {
    try {
      await prisma.backlink.upsert({
        where: {
          siteId_sourceUrl_targetUrl: {
            siteId,
            sourceUrl: link.sourceUrl,
            targetUrl: link.targetUrl,
          },
        },
        create: {
          siteId,
          sourceUrl: link.sourceUrl,
          sourceDomain: link.sourceDomain,
          targetUrl: link.targetUrl,
          anchorText: link.anchorText,
          domainAuthority: link.domainAuthority,
          isDoFollow: link.isDoFollow,
          isActive: true,
          acquisitionMethod: 'ORGANIC',
          firstSeenAt: new Date(link.firstSeen),
          lastCheckedAt: new Date(),
        },
        update: {
          lastCheckedAt: new Date(),
          isActive: true,
          lostAt: null,
        },
      });
      created++;
    } catch (error) {
      console.error(`[Backlink Analysis] Error storing new backlink from ${link.sourceDomain}:`, error);
    }
  }

  console.log(`[Backlink Analysis] Discovered ${created} new backlinks for ${site.primaryDomain}`);
  return created;
}
