/**
 * Debug script: test the Keyword Planner API response format.
 */
import { getConfig, apiRequest } from '../services/google-ads-client';

async function main() {
  const config = getConfig();
  if (config === null) {
    console.error('No config');
    process.exit(1);
  }

  const testKeywords = [
    'food tours london',
    'wine tasting paris',
    'boat tours rome',
    'yoga retreat bali',
    'harry potter london',
  ];

  console.info('Testing Keyword Planner API with:', testKeywords);

  const response = await apiRequest(config, 'POST', ':generateKeywordHistoricalMetrics', {
    keywords: testKeywords,
    geoTargetConstants: ['geoTargetConstants/2826'],
    language: 'languageConstants/1000',
    keywordPlanNetwork: 'GOOGLE_SEARCH',
  });

  const str = JSON.stringify(response, null, 2);
  console.info('RESPONSE TYPE:', typeof response);
  console.info('RESPONSE KEYS:', Object.keys(response as Record<string, unknown>));
  // Print in chunks to avoid truncation
  for (let i = 0; i < str.length; i += 2000) {
    console.info(str.substring(i, i + 2000));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('ERR:', e.message || e);
  process.exit(1);
});
