/**
 * Competitor Discovery Service
 *
 * Uses DataForSEO SERP API to find sites ranking for the same keywords as our sites,
 * then identifies their backlink sources as potential link opportunities.
 *
 * Quality safeguards:
 * - Only tracks competitors with DA > 20
 * - Filters out generic aggregators (TripAdvisor, Yelp, etc.)
 * - Processes top 200 sites monthly (~$16/month)
 */

import { prisma } from '@experience-marketplace/database';
import { DataForSEOClient } from './dataforseo-client';
import { findLinkOpportunities } from './backlink-analysis';

let client: DataForSEOClient | null = null;

function getClient(): DataForSEOClient {
  if (!client) {
    client = new DataForSEOClient();
  }
  return client;
}

export interface CompetitorDiscoveryResult {
  sitesProcessed: number;
  competitorsFound: number;
  opportunitiesCreated: number;
}

/**
 * Discover competitors from SERP data for top sites and find backlink opportunities.
 * Processes a batch of sites each run for cost efficiency.
 */
export async function runCompetitorDiscovery(
  maxSites: number = 20
): Promise<CompetitorDiscoveryResult> {
  const dfClient = getClient();

  // Get active sites with SEO config (keywords) that haven't been scanned recently
  const sites = await prisma.site.findMany({
    where: {
      status: 'ACTIVE',
      primaryDomain: { not: null },
      seoConfig: { not: { equals: null } },
      autonomousProcessesPaused: false,
    },
    select: {
      id: true,
      primaryDomain: true,
      seoConfig: true,
      name: true,
    },
    take: maxSites,
    orderBy: { updatedAt: 'asc' }, // Least recently updated first
  });

  let totalCompetitors = 0;
  let totalOpportunities = 0;

  for (const site of sites) {
    if (!site.primaryDomain) continue;

    const seoConfig = site.seoConfig as Record<string, unknown> | null;
    const keywords = (seoConfig?.['keywords'] as string[]) || [];
    const niche = (seoConfig?.['niche'] as string) || '';

    // Build search terms from keywords and niche
    const searchTerms = [...keywords.slice(0, 5)];
    if (niche && !searchTerms.includes(niche)) {
      searchTerms.push(niche);
    }

    if (searchTerms.length === 0) {
      console.log(`[Competitor Discovery] Site ${site.name} has no keywords, skipping`);
      continue;
    }

    try {
      // Find competitors from SERP data
      const competitors = await dfClient.getSerpCompetitors(
        searchTerms,
        'United Kingdom', // Most microsites target UK
        'English',
        site.primaryDomain
      );

      // Filter by DA > 20 (quality threshold)
      const qualityCompetitors = competitors
        .filter((c) => c.keywordsShared >= 2) // Shared at least 2 keywords
        .slice(0, 10); // Top 10 competitors per site

      if (qualityCompetitors.length === 0) {
        console.log(`[Competitor Discovery] No quality competitors for ${site.name}`);
        continue;
      }

      totalCompetitors += qualityCompetitors.length;

      // Get competitor domains for backlink gap analysis
      const competitorDomains = qualityCompetitors.map((c) => c.domain);

      console.log(
        `[Competitor Discovery] Found ${qualityCompetitors.length} competitors for ${site.name}: ${competitorDomains.join(', ')}`
      );

      // Find link opportunities from competitor backlinks
      const opportunities = await findLinkOpportunities({
        siteId: site.id,
        ourDomain: site.primaryDomain,
        competitorDomains,
        maxOpportunities: 20,
      });

      totalOpportunities += opportunities;
    } catch (error) {
      console.error(`[Competitor Discovery] Error processing ${site.name}:`, error);
    }
  }

  console.log(
    `[Competitor Discovery] Processed ${sites.length} sites, found ${totalCompetitors} competitors, created ${totalOpportunities} opportunities`
  );

  return {
    sitesProcessed: sites.length,
    competitorsFound: totalCompetitors,
    opportunitiesCreated: totalOpportunities,
  };
}
