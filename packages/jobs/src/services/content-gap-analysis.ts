/**
 * Content Gap Analysis Service
 *
 * Identifies high-volume keywords where no authoritative guide/statistics page exists,
 * creating opportunities for linkable asset content.
 *
 * Strategy:
 * 1. For each site's target keywords, check SERP results
 * 2. Identify keywords where top results are thin/generic content
 * 3. Suggest creating comprehensive guides or data-driven content
 * 4. Create LinkableAsset entries for content team to produce
 *
 * Cost: ~$0.004 per keyword SERP check + ~$0.002 per keyword volume check (~$5/month)
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

export interface ContentGapResult {
  sitesAnalyzed: number;
  gapsIdentified: number;
  assetsCreated: number;
}

/**
 * Analyze keyword data to find content gaps and create linkable asset suggestions.
 */
export async function runContentGapAnalysis(maxSites: number = 10): Promise<ContentGapResult> {
  const dfClient = getClient();

  // Get sites with keyword data
  const sites = await prisma.site.findMany({
    where: {
      status: 'ACTIVE',
      primaryDomain: { not: null },
      seoConfig: { not: { equals: null } },
      autonomousProcessesPaused: false,
    },
    select: {
      id: true,
      name: true,
      primaryDomain: true,
      seoConfig: true,
    },
    take: maxSites,
    orderBy: { updatedAt: 'asc' },
  });

  let totalGaps = 0;
  let totalAssets = 0;

  for (const site of sites) {
    const seoConfig = site.seoConfig as Record<string, unknown> | null;
    const keywords = (seoConfig?.['keywords'] as string[]) || [];
    const niche = (seoConfig?.['niche'] as string) || '';
    const destination = (seoConfig?.['primaryDestination'] as string) || '';

    if (keywords.length === 0) continue;

    try {
      // Build gap-finding keyword variants (statistics, guide, best, tips)
      const gapKeywords: string[] = [];
      for (const kw of keywords.slice(0, 3)) {
        gapKeywords.push(`${kw} statistics`);
        gapKeywords.push(`${kw} guide`);
        if (destination) {
          gapKeywords.push(`${destination} ${kw} tips`);
        }
      }

      // Get search volume for gap keywords
      const volumeData = await dfClient.getBulkSearchVolume(
        gapKeywords,
        'United Kingdom',
        'English'
      );

      // Filter for keywords with decent volume (>100/month) and low competition
      const highPotential = volumeData.filter(
        (kw) => kw.searchVolume >= 100 && kw.competition < 0.5
      );

      if (highPotential.length === 0) continue;

      // Check SERP for top candidates to see if good content exists
      for (const kw of highPotential.slice(0, 3)) {
        try {
          const serp = await dfClient.getSERP(kw.keyword, 'United Kingdom', 'English');

          // Analyze top 5 results — if dominated by generic/thin content, it's a gap
          const topResults = serp.results.slice(0, 5);
          const hasAuthoritativeContent = topResults.some((r) => {
            // Check if top results have authoritative/comprehensive content indicators
            const title = r.title.toLowerCase();
            return (
              title.includes('ultimate guide') ||
              title.includes('complete guide') ||
              title.includes('statistics') ||
              title.includes('research') ||
              title.includes('data')
            );
          });

          // If no authoritative content exists, this is a content gap
          if (!hasAuthoritativeContent) {
            totalGaps++;

            // Determine asset type based on keyword
            const isStats = kw.keyword.includes('statistics');
            const assetType = isStats ? 'STATISTICS_ROUNDUP' : 'COMPREHENSIVE_GUIDE';

            // Check if we already have an asset for this keyword
            const existingAsset = await prisma.linkableAsset.findFirst({
              where: {
                siteId: site.id,
                title: { contains: kw.keyword, mode: 'insensitive' },
              },
            });

            if (!existingAsset) {
              await prisma.linkableAsset.create({
                data: {
                  siteId: site.id,
                  title: `${kw.keyword.charAt(0).toUpperCase() + kw.keyword.slice(1)}: Comprehensive ${isStats ? 'Statistics' : 'Guide'}`,
                  slug: kw.keyword
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, ''),
                  assetType,
                  targetKeywords: [kw.keyword],
                  metaDescription: `Volume: ${kw.searchVolume}/mo, Competition: ${kw.competition}. Content gap opportunity identified by automated analysis.`,
                },
              });
              totalAssets++;
              console.log(
                `[Content Gap] Found gap for "${kw.keyword}" (vol: ${kw.searchVolume}, comp: ${kw.competition}) — created ${assetType} suggestion for ${site.name}`
              );
            }
          }
        } catch (error) {
          console.warn(`[Content Gap] SERP check failed for "${kw.keyword}":`, error);
        }
      }
    } catch (error) {
      console.error(`[Content Gap] Error analyzing ${site.name}:`, error);
    }
  }

  console.log(
    `[Content Gap] Analyzed ${sites.length} sites, identified ${totalGaps} gaps, created ${totalAssets} asset suggestions`
  );

  return {
    sitesAnalyzed: sites.length,
    gapsIdentified: totalGaps,
    assetsCreated: totalAssets,
  };
}
