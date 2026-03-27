/**
 * Trend Collector — Daily Google Trends data collection via DataForSEO
 *
 * Scans top tour/experience categories across key tourism markets using
 * Google Trends explore API, then stores daily snapshots in TrendSnapshot.
 *
 * Cost: ~20 categories × 10 locations × 2 calls = ~400 API calls
 *       @ $0.006/call avg = ~$2.40/day
 */

import { prisma } from '@experience-marketplace/database';
import { DataForSEOClient } from './dataforseo-client';

const TRACKED_CATEGORIES: Array<{ name: string; keywords: string[] }> = [
  { name: 'Food Tours', keywords: ['food tours', 'food tour', 'street food tour'] },
  { name: 'Walking Tours', keywords: ['walking tours', 'walking tour', 'guided walk'] },
  { name: 'Cooking Classes', keywords: ['cooking class', 'cooking classes', 'cooking experience'] },
  { name: 'Wine Tasting', keywords: ['wine tasting', 'wine tour', 'vineyard tour'] },
  { name: 'Boat Tours', keywords: ['boat tour', 'boat tours', 'boat trip'] },
  { name: 'City Tours', keywords: ['city tour', 'city tours', 'sightseeing tour'] },
  { name: 'Hiking Tours', keywords: ['hiking tour', 'hiking tours', 'trekking tour'] },
  { name: 'Museum Tours', keywords: ['museum tour', 'museum tickets', 'gallery tour'] },
  { name: 'Snorkeling', keywords: ['snorkeling tour', 'snorkeling', 'snorkel trip'] },
  { name: 'Kayaking', keywords: ['kayaking tour', 'kayaking', 'kayak trip'] },
  { name: 'Safari', keywords: ['safari tour', 'safari', 'wildlife safari'] },
  { name: 'Cycling Tours', keywords: ['cycling tour', 'bike tour', 'bicycle tour'] },
  { name: 'Cultural Tours', keywords: ['cultural tour', 'heritage tour', 'history tour'] },
  {
    name: 'Adventure Tours',
    keywords: ['adventure tour', 'adventure activities', 'outdoor adventure'],
  },
  { name: 'Day Trips', keywords: ['day trip', 'day tours', 'day excursion'] },
  { name: 'Sunset Cruise', keywords: ['sunset cruise', 'sunset boat tour', 'evening cruise'] },
  { name: 'Pub Crawl', keywords: ['pub crawl', 'bar crawl', 'nightlife tour'] },
  { name: 'Photography Tours', keywords: ['photography tour', 'photo tour', 'instagram tour'] },
  { name: 'Scuba Diving', keywords: ['scuba diving', 'diving tour', 'dive trip'] },
  { name: 'Spa & Wellness', keywords: ['spa experience', 'wellness retreat', 'yoga retreat'] },
];

const TRACKED_LOCATIONS = [
  'United States',
  'United Kingdom',
  'Australia',
  'Canada',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'India',
];

export interface TrendCollectionResult {
  snapshotsCreated: number;
  snapshotsUpdated: number;
  apiCallsMade: number;
  errors: string[];
  costEstimate: number;
}

export async function collectTrendData(): Promise<TrendCollectionResult> {
  const client = new DataForSEOClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let snapshotsCreated = 0;
  let snapshotsUpdated = 0;
  let apiCallsMade = 0;
  const errors: string[] = [];

  console.info(
    `[TrendCollector] Starting collection for ${TRACKED_CATEGORIES.length} categories x ${TRACKED_LOCATIONS.length} locations`
  );

  for (const location of TRACKED_LOCATIONS) {
    for (const category of TRACKED_CATEGORIES) {
      try {
        const trendsData = await client.getGoogleTrendsExplore(
          category.keywords.slice(0, 5),
          location,
          'past_12_months'
        );
        apiCallsMade++;

        let trendScore = 0;
        let trendDirection: 'rising' | 'stable' | 'declining' | 'breakout' = 'stable';
        const relatedRegions: Array<{ city: string; score: number }> = [];

        if (trendsData.length > 0) {
          const data = trendsData[0]!;
          const timeline = data.interestOverTime;
          if (timeline.length > 0) {
            const recent = timeline.slice(-3);
            const older = timeline.slice(-6, -3);
            const recentAvg =
              recent.reduce((s, t) => s + (t.values[0] || 0), 0) / Math.max(recent.length, 1);
            const olderAvg =
              older.length > 0
                ? older.reduce((s, t) => s + (t.values[0] || 0), 0) / Math.max(older.length, 1)
                : recentAvg;

            trendScore = Math.round(recentAvg);

            if (olderAvg > 0) {
              const change = ((recentAvg - olderAvg) / olderAvg) * 100;
              if (change > 50) trendDirection = 'breakout';
              else if (change > 15) trendDirection = 'rising';
              else if (change < -15) trendDirection = 'declining';
              else trendDirection = 'stable';
            }
          }

          for (const region of data.interestByRegion.slice(0, 10)) {
            relatedRegions.push({ city: region.region, score: region.values[0] || 0 });
          }
        }

        let searchVolume = 0;
        let cpc = 0;
        try {
          const volumeData = await client.getSearchVolume(category.keywords[0]!, location);
          apiCallsMade++;
          searchVolume = volumeData.searchVolume;
          cpc = volumeData.cpc;
        } catch {
          // Volume lookup is non-critical
        }

        const demandScore = Math.round(
          trendScore * 0.4 +
            Math.min(40, (Math.log10(Math.max(searchVolume, 1)) / 5) * 40) +
            (trendDirection === 'breakout'
              ? 20
              : trendDirection === 'rising'
                ? 15
                : trendDirection === 'stable'
                  ? 10
                  : 5)
        );

        const existing = await prisma.trendSnapshot.findUnique({
          where: { date_location_category: { date: today, location, category: category.name } },
        });

        if (existing) {
          await prisma.trendSnapshot.update({
            where: { id: existing.id },
            data: {
              trendScore,
              trendDirection,
              searchVolume,
              cpc,
              relatedQueries: category.keywords,
              topCities: relatedRegions,
              demandScore,
            },
          });
          snapshotsUpdated++;
        } else {
          await prisma.trendSnapshot.create({
            data: {
              date: today,
              location,
              category: category.name,
              trendScore,
              trendDirection,
              searchVolume,
              cpc,
              relatedQueries: category.keywords,
              topCities: relatedRegions,
              demandScore,
            },
          });
          snapshotsCreated++;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        const msg = `Failed ${category.name} in ${location}: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[TrendCollector] ${msg}`);
        errors.push(msg);
      }
    }

    console.info(
      `[TrendCollector] Completed ${location}: ${snapshotsCreated + snapshotsUpdated} snapshots so far`
    );
  }

  const costEstimate = apiCallsMade * 0.006;
  console.info(
    `[TrendCollector] Done: ${snapshotsCreated} created, ${snapshotsUpdated} updated, ` +
      `${apiCallsMade} API calls (~$${costEstimate.toFixed(2)}), ${errors.length} errors`
  );

  return { snapshotsCreated, snapshotsUpdated, apiCallsMade, errors, costEstimate };
}
