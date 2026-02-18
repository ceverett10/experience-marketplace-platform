/**
 * Export Google Ads campaigns to CSV for Google Ads Editor bulk upload.
 *
 * Generates 3 CSV files:
 * 1. campaigns.csv — Campaign + Ad Group rows
 * 2. keywords.csv — Keyword rows (EXACT + PHRASE match)
 * 3. ads.csv — Responsive Search Ad rows with headlines/descriptions
 *
 * Usage: npx ts-node packages/jobs/src/scripts/export-google-ads-csv.ts
 * Then import all 3 files into Google Ads Editor.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface AdGroup {
  primaryKeyword: string;
  keywords: string[];
  maxBid: number;
  targetUrl: string;
  landingPagePath?: string;
  landingPageType?: string;
}

function generateHeadlines(keyword: string, siteName: string): string[] {
  const kwTitle = keyword.charAt(0).toUpperCase() + keyword.slice(1);
  return [
    kwTitle.substring(0, 30),
    `Book ${kwTitle}`.substring(0, 30),
    `${kwTitle} | ${siteName}`.substring(0, 30),
    'Best Prices Guaranteed',
    'Instant Confirmation',
    'Book Online Today',
  ];
}

function generateDescriptions(keyword: string): string[] {
  return [
    `Discover and book amazing ${keyword} experiences. Best prices, instant confirmation.`.substring(0, 90),
    `Browse ${keyword} from top-rated local providers. Free cancellation available.`.substring(0, 90),
  ];
}

function buildLandingUrl(targetUrl: string, utmSource: string | null, utmMedium: string | null, utmCampaign: string | null): string {
  const url = new URL(targetUrl);
  if (utmSource) url.searchParams.set('utm_source', utmSource);
  if (utmMedium) url.searchParams.set('utm_medium', utmMedium);
  if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign);
  return url.toString();
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function main() {
  console.log('Fetching Google Ads campaigns...');

  const campaigns = await prisma.adCampaign.findMany({
    where: {
      platform: 'GOOGLE_SEARCH',
      status: { in: ['DRAFT', 'PAUSED'] },
    },
    include: {
      microsite: { select: { siteName: true, fullDomain: true } },
      site: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Found ${campaigns.length} Google Search campaigns to export.`);

  if (campaigns.length === 0) {
    console.log('No campaigns to export.');
    return;
  }

  // --- 1. Campaigns & Ad Groups CSV ---
  const campaignRows: string[] = [];
  campaignRows.push([
    'Campaign',
    'Campaign Status',
    'Budget',
    'Budget type',
    'Bid Strategy Type',
    'Ad Group',
    'Ad Group Status',
    'Max CPC',
    'Ad Group Type',
  ].join(','));

  // --- 2. Keywords CSV ---
  const keywordRows: string[] = [];
  keywordRows.push([
    'Campaign',
    'Ad Group',
    'Keyword',
    'Match Type',
    'Status',
    'Max CPC',
    'Final URL',
  ].join(','));

  // --- 3. Ads CSV (Responsive Search Ads) ---
  const adHeaders = [
    'Campaign',
    'Ad Group',
    'Ad type',
    'Status',
    'Headline 1',
    'Headline 2',
    'Headline 3',
    'Headline 4',
    'Headline 5',
    'Headline 6',
    'Description 1',
    'Description 2',
    'Final URL',
    'Path 1',
    'Path 2',
  ];
  const adRows: string[] = [];
  adRows.push(adHeaders.join(','));

  for (const campaign of campaigns) {
    const siteName = campaign.microsite?.siteName || campaign.site?.name || 'Experiences';
    const audiences = campaign.audiences as { adGroups?: AdGroup[] } | null;
    const adGroups = audiences?.adGroups || [];

    // If no ad groups defined, create one from the campaign-level data
    const effectiveAdGroups: AdGroup[] = adGroups.length > 0
      ? adGroups
      : [{
          primaryKeyword: campaign.keywords[0] || 'experiences',
          keywords: campaign.keywords,
          maxBid: Number(campaign.maxCpc) || 0.10,
          targetUrl: campaign.targetUrl || '',
        }];

    const dailyBudget = Number(campaign.dailyBudget) || 1;
    const campaignStatus = 'Paused'; // Safe default — enable manually after review

    for (let i = 0; i < effectiveAdGroups.length; i++) {
      const ag = effectiveAdGroups[i]!;
      const adGroupName = effectiveAdGroups.length === 1
        ? `${campaign.name} - Ad Group`
        : `${campaign.name} - ${ag.primaryKeyword}`;

      // Campaign row (only on first ad group)
      campaignRows.push([
        escapeCsv(campaign.name),
        campaignStatus,
        dailyBudget.toFixed(2),
        'Daily',
        'Manual CPC',
        escapeCsv(adGroupName),
        'Enabled',
        ag.maxBid.toFixed(2),
        'Standard',
      ].join(','));

      // Landing URL with UTMs
      const landingUrl = buildLandingUrl(
        ag.targetUrl || campaign.targetUrl || '',
        campaign.utmSource,
        campaign.utmMedium,
        campaign.utmCampaign
      );

      // Keywords — EXACT + PHRASE match for each keyword
      const keywords = ag.keywords.length > 0 ? ag.keywords : campaign.keywords;
      for (const kw of keywords) {
        // Exact match
        keywordRows.push([
          escapeCsv(campaign.name),
          escapeCsv(adGroupName),
          escapeCsv(`[${kw}]`),
          'Exact',
          'Enabled',
          ag.maxBid.toFixed(2),
          escapeCsv(landingUrl),
        ].join(','));

        // Phrase match
        keywordRows.push([
          escapeCsv(campaign.name),
          escapeCsv(adGroupName),
          escapeCsv(`"${kw}"`),
          'Phrase',
          'Enabled',
          ag.maxBid.toFixed(2),
          escapeCsv(landingUrl),
        ].join(','));
      }

      // Responsive Search Ad
      const headlines = generateHeadlines(ag.primaryKeyword, siteName);
      const descriptions = generateDescriptions(ag.primaryKeyword);

      // Path from keyword (max 15 chars each)
      const pathParts = ag.primaryKeyword.split(' ').filter(Boolean);
      const path1 = 'experiences';
      const path2 = (pathParts[0] || '').substring(0, 15).toLowerCase();

      const adRow = [
        escapeCsv(campaign.name),
        escapeCsv(adGroupName),
        'Responsive search ad',
        'Enabled',
        ...Array.from({ length: 6 }, (_, j) => escapeCsv(headlines[j] || '')),
        escapeCsv(descriptions[0] || ''),
        escapeCsv(descriptions[1] || ''),
        escapeCsv(landingUrl),
        escapeCsv(path1),
        escapeCsv(path2),
      ];
      adRows.push(adRow.join(','));
    }
  }

  // Write CSV files
  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const campaignFile = path.join(outDir, 'google-ads-campaigns.csv');
  const keywordFile = path.join(outDir, 'google-ads-keywords.csv');
  const adFile = path.join(outDir, 'google-ads-ads.csv');

  fs.writeFileSync(campaignFile, campaignRows.join('\n'), 'utf-8');
  fs.writeFileSync(keywordFile, keywordRows.join('\n'), 'utf-8');
  fs.writeFileSync(adFile, adRows.join('\n'), 'utf-8');

  console.log(`\nExported to ${outDir}/:`);
  console.log(`  google-ads-campaigns.csv — ${campaigns.length} campaigns, ${campaignRows.length - 1} ad groups`);
  console.log(`  google-ads-keywords.csv  — ${keywordRows.length - 1} keyword entries (exact + phrase)`);
  console.log(`  google-ads-ads.csv       — ${adRows.length - 1} responsive search ads`);
  console.log(`\nImport order in Google Ads Editor:`);
  console.log(`  1. Import google-ads-campaigns.csv first (creates campaigns + ad groups)`);
  console.log(`  2. Import google-ads-keywords.csv (adds keywords to ad groups)`);
  console.log(`  3. Import google-ads-ads.csv (adds responsive search ads)`);
  console.log(`  4. Review everything, then Post to Google Ads`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
