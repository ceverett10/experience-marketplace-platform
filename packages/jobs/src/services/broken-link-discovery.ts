/**
 * Broken Link Discovery Service
 *
 * Finds broken outbound links on travel/tourism sites where we have replacement content.
 * High-value because site owners actively want to fix broken links.
 *
 * Strategy:
 * 1. Use competitor domains discovered by competitor-discovery service
 * 2. Check those domains for broken outbound links via DataForSEO
 * 3. Match broken link targets against our content for replacement suggestions
 * 4. Store as LinkOpportunity with type BROKEN_LINK
 *
 * Cost: ~$0.003 per domain checked (~$0.30/month for 100 domains)
 */

import { prisma } from '@experience-marketplace/database';
import { DataForSEOClient } from './dataforseo-client';

let client: DataForSEOClient | null = null;

function getClient(): DataForSEOClient {
  if (!client) {
    client = new DataForSEOClient();
  }
  return client;
}

export interface BrokenLinkDiscoveryResult {
  domainsScanned: number;
  brokenLinksFound: number;
  opportunitiesCreated: number;
}

/**
 * Scan competitor/related domains for broken backlinks and create link opportunities.
 */
export async function runBrokenLinkDiscovery(
  maxDomains: number = 20
): Promise<BrokenLinkDiscoveryResult> {
  const dfClient = getClient();

  // Get existing link opportunity domains that have been identified as competitors
  // These are the domains most likely to have broken links relevant to us
  const opportunities = await prisma.linkOpportunity.findMany({
    where: {
      opportunityType: 'COMPETITOR_BACKLINK',
      domainAuthority: { gte: 20 },
    },
    select: {
      siteId: true,
      targetDomain: true,
      domainAuthority: true,
    },
    distinct: ['targetDomain'],
    orderBy: { domainAuthority: 'desc' },
    take: maxDomains,
  });

  if (opportunities.length === 0) {
    console.log(
      '[Broken Link Discovery] No competitor domains to scan. Run competitor discovery first.'
    );
    return { domainsScanned: 0, brokenLinksFound: 0, opportunitiesCreated: 0 };
  }

  let totalBrokenLinks = 0;
  let totalOpportunities = 0;

  // Get our sites' primary domains and page titles for matching
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE', primaryDomain: { not: null } },
    select: { id: true, primaryDomain: true },
  });

  // Get a sample of our page titles for matching against broken link anchors
  const ourPages = await prisma.page.findMany({
    where: {
      status: 'PUBLISHED',
      type: { in: ['BLOG', 'LANDING'] },
    },
    select: { title: true, slug: true, siteId: true },
    take: 500,
    orderBy: { publishedAt: 'desc' },
  });

  const scannedDomains = new Set<string>();

  for (const opp of opportunities) {
    if (scannedDomains.has(opp.targetDomain)) continue;
    scannedDomains.add(opp.targetDomain);

    try {
      const brokenLinks = await dfClient.getBrokenBacklinks(opp.targetDomain, 50);

      if (brokenLinks.length === 0) continue;

      totalBrokenLinks += brokenLinks.length;

      // For each broken link, check if we have relevant replacement content
      for (const broken of brokenLinks) {
        // Skip low-DA sources
        if (broken.domainAuthority < 20) continue;

        // Check if the broken link's anchor text or target URL matches any of our content
        const anchorLower = broken.anchorText.toLowerCase();
        const matchingPage = ourPages.find((page) => {
          const titleLower = page.title.toLowerCase();
          // Match if anchor text has significant overlap with our page title
          const titleWords = titleLower.split(/\s+/).filter((w) => w.length > 3);
          const matchedWords = titleWords.filter((w) => anchorLower.includes(w));
          return matchedWords.length >= 2; // At least 2 significant words match
        });

        if (!matchingPage) continue;

        // Find the site this page belongs to
        const site = sites.find((s) => s.id === matchingPage.siteId);
        if (!site) continue;

        // Create a broken link opportunity
        try {
          await prisma.linkOpportunity.upsert({
            where: {
              siteId_targetUrl: { siteId: site.id, targetUrl: broken.sourceUrl },
            },
            create: {
              siteId: site.id,
              targetDomain: broken.sourceDomain,
              targetUrl: broken.sourceUrl,
              domainAuthority: broken.domainAuthority,
              relevanceScore: 0.7, // Broken link replacement is high-relevance
              priorityScore: (broken.domainAuthority / 100) * 0.9, // Slightly boost priority
              opportunityType: 'BROKEN_LINK',
              competitorUrl: broken.targetUrl, // The broken target URL
              status: 'IDENTIFIED',
            },
            update: {
              domainAuthority: broken.domainAuthority,
            },
          });
          totalOpportunities++;
        } catch (error) {
          // Skip duplicate constraint violations
        }
      }
    } catch (error) {
      console.warn(`[Broken Link Discovery] Error scanning ${opp.targetDomain}:`, error);
    }
  }

  console.log(
    `[Broken Link Discovery] Scanned ${scannedDomains.size} domains, found ${totalBrokenLinks} broken links, created ${totalOpportunities} opportunities`
  );

  return {
    domainsScanned: scannedDomains.size,
    brokenLinksFound: totalBrokenLinks,
    opportunitiesCreated: totalOpportunities,
  };
}
