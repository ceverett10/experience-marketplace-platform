/**
 * DataForSEO API Client
 * Budget-friendly keyword research and SEO data
 *
 * API Documentation: https://docs.dataforseo.com/v3/
 * Pricing: ~$50/month pay-as-you-go ($0.002-0.005 per API call)
 */

interface DataForSEOCredentials {
  login: string;
  password: string;
}

interface KeywordData {
  keyword: string;
  searchVolume: number;
  competition: number;
  competitionLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  cpc: number;
  trends?: number[];
}

interface RelatedKeywordsResponse {
  keywords: string[];
  totalCount: number;
}

interface TaskInfo {
  id: string;
  status: 'completed' | 'pending' | 'error';
  cost: number;
}

export class DataForSEOClient {
  private readonly baseUrl = 'https://api.dataforseo.com/v3';
  private readonly auth: string;

  constructor(credentials?: DataForSEOCredentials) {
    const login = credentials?.login || process.env['DATAFORSEO_API_LOGIN'];
    const password = credentials?.password || process.env['DATAFORSEO_API_PASSWORD'];

    if (!login || !password) {
      throw new Error(
        'DataForSEO credentials not found. Set DATAFORSEO_API_LOGIN and DATAFORSEO_API_PASSWORD environment variables.'
      );
    }

    // Basic auth encoding
    this.auth = Buffer.from(`${login}:${password}`).toString('base64');
  }

  /**
   * Get search volume and keyword metrics
   *
   * Uses: Google Ads > Keywords Data > Google Ads > Search Volume
   * Cost: ~$0.002 per keyword
   */
  async getSearchVolume(
    keyword: string,
    location: string = 'United States',
    language: string = 'English'
  ): Promise<KeywordData> {
    try {
      const locationCode = await this.getLocationCode(location);
      const languageCode = await this.getLanguageCode(language);

      const response = await this.makeRequest('/keywords_data/google_ads/search_volume/live', {
        method: 'POST',
        body: JSON.stringify([
          {
            keywords: [keyword],
            location_code: locationCode,
            language_code: languageCode,
          },
        ]),
      });

      const data = response.tasks?.[0]?.result?.[0];

      if (!data) {
        throw new Error(`No data returned for keyword: ${keyword}`);
      }

      return {
        keyword,
        searchVolume: data.search_volume || 0,
        competition: data.competition || 0,
        competitionLevel: data.competition_level as 'LOW' | 'MEDIUM' | 'HIGH',
        cpc: data.cpc || 0,
        trends: data.monthly_searches?.map((m: { search_volume: number }) => m.search_volume) || [],
      };
    } catch (error) {
      console.error('[DataForSEO] Error getting search volume:', error);
      throw error;
    }
  }

  /**
   * Get related keywords and suggestions
   *
   * Uses: Keywords Data > Google > Keywords For Keywords
   * Cost: ~$0.003 per request
   */
  async getRelatedKeywords(
    keyword: string,
    location: string = 'United States',
    language: string = 'English',
    limit: number = 50
  ): Promise<RelatedKeywordsResponse> {
    try {
      const locationCode = await this.getLocationCode(location);
      const languageCode = await this.getLanguageCode(language);

      const response = await this.makeRequest('/keywords_data/google/keywords_for_keywords/live', {
        method: 'POST',
        body: JSON.stringify([
          {
            keywords: [keyword],
            location_code: locationCode,
            language_code: languageCode,
            limit,
          },
        ]),
      });

      const results = response.tasks?.[0]?.result || [];
      const keywords = results.map((r: { keyword: string }) => r.keyword);

      return {
        keywords,
        totalCount: results.length,
      };
    } catch (error) {
      console.error('[DataForSEO] Error getting related keywords:', error);
      throw error;
    }
  }

  /**
   * Get bulk keyword metrics for multiple keywords at once
   * More efficient than calling getSearchVolume multiple times
   *
   * Cost: ~$0.002 per keyword
   */
  async getBulkSearchVolume(
    keywords: string[],
    location: string = 'United States',
    language: string = 'English'
  ): Promise<KeywordData[]> {
    try {
      const locationCode = await this.getLocationCode(location);
      const languageCode = await this.getLanguageCode(language);

      // DataForSEO allows up to 1000 keywords per request
      const batchSize = 1000;
      const batches: string[][] = [];

      for (let i = 0; i < keywords.length; i += batchSize) {
        batches.push(keywords.slice(i, i + batchSize));
      }

      const allResults: KeywordData[] = [];

      for (const batch of batches) {
        const response = await this.makeRequest('/keywords_data/google_ads/search_volume/live', {
          method: 'POST',
          body: JSON.stringify([
            {
              keywords: batch,
              location_code: locationCode,
              language_code: languageCode,
            },
          ]),
        });

        const results = response.tasks?.[0]?.result || [];

        results.forEach(
          (data: {
            keyword: string;
            search_volume: number;
            competition: number;
            competition_level: string;
            cpc: number;
            monthly_searches?: Array<{ search_volume: number }>;
          }) => {
            allResults.push({
              keyword: data.keyword,
              searchVolume: data.search_volume || 0,
              competition: data.competition || 0,
              competitionLevel: data.competition_level as 'LOW' | 'MEDIUM' | 'HIGH',
              cpc: data.cpc || 0,
              trends: data.monthly_searches?.map((m) => m.search_volume) || [],
            });
          }
        );
      }

      return allResults;
    } catch (error) {
      console.error('[DataForSEO] Error getting bulk search volume:', error);
      throw error;
    }
  }

  /**
   * Get SERP results for keyword analysis
   * Useful for calculating keyword difficulty
   *
   * Uses: SERP > Google > Organic
   * Cost: ~$0.004 per request
   */
  async getSERP(
    keyword: string,
    location: string = 'United States',
    language: string = 'English'
  ): Promise<{
    results: Array<{
      position: number;
      url: string;
      domain: string;
      title: string;
      description: string;
    }>;
  }> {
    try {
      const locationCode = await this.getLocationCode(location);
      const languageCode = await this.getLanguageCode(language);

      const response = await this.makeRequest('/serp/google/organic/live/advanced', {
        method: 'POST',
        body: JSON.stringify([
          {
            keyword,
            location_code: locationCode,
            language_code: languageCode,
            device: 'desktop',
            os: 'windows',
          },
        ]),
      });

      const items = response.tasks?.[0]?.result?.[0]?.items || [];

      return {
        results: items.map(
          (item: {
            rank_absolute: number;
            url: string;
            domain: string;
            title: string;
            description: string;
          }) => ({
            position: item.rank_absolute,
            url: item.url,
            domain: item.domain,
            title: item.title,
            description: item.description,
          })
        ),
      };
    } catch (error) {
      console.error('[DataForSEO] Error getting SERP results:', error);
      throw error;
    }
  }

  /**
   * Get location code for a location name
   * Example: "United States" -> 2840
   */
  private async getLocationCode(location: string): Promise<number> {
    // Cache common locations to avoid API calls
    const commonLocations: Record<string, number> = {
      'United States': 2840,
      'United Kingdom': 2826,
      Canada: 2124,
      Australia: 2036,
      Germany: 2276,
      France: 2250,
      Spain: 2724,
      Italy: 2380,
      Netherlands: 2528,
      Belgium: 2056,
    };

    if (commonLocations[location]) {
      return commonLocations[location];
    }

    // For other locations, query the API
    const response = await this.makeRequest('/keywords_data/google_ads/locations', {
      method: 'GET',
    });

    const found = response.find(
      (l: { location_name: string; location_code: number }) =>
        l.location_name.toLowerCase() === location.toLowerCase()
    );

    return found?.location_code || 2840; // Default to US
  }

  /**
   * Get language code for a language name
   * Example: "English" -> "en"
   */
  private async getLanguageCode(language: string): Promise<string> {
    // Cache common languages
    const commonLanguages: Record<string, string> = {
      English: 'en',
      Spanish: 'es',
      French: 'fr',
      German: 'de',
      Italian: 'it',
      Portuguese: 'pt',
      Dutch: 'nl',
      Russian: 'ru',
      Chinese: 'zh',
      Japanese: 'ja',
    };

    return commonLanguages[language] || 'en';
  }

  /**
   * Make authenticated request to DataForSEO API
   */
  private async makeRequest(
    endpoint: string,
    options: {
      method: 'GET' | 'POST';
      body?: string;
    }
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json',
      },
      body: options.body,
    });

    if (!response.ok) {
      throw new Error(`DataForSEO API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    // Check for API errors
    if (data.status_code !== 20000) {
      throw new Error(`DataForSEO API error: ${data.status_message || 'Unknown error'}`);
    }

    return data;
  }

  /**
   * Get current API usage and cost
   * Useful for monitoring spend
   */
  async getUsageStats(): Promise<{
    apiCalls: number;
    totalCost: number;
    balance: number;
  }> {
    try {
      const response = await this.makeRequest('/appendix/user_data', {
        method: 'GET',
      });

      return {
        apiCalls: response.tasks_count || 0,
        totalCost: response.money?.total || 0,
        balance: response.money?.balance || 0,
      };
    } catch (error) {
      console.error('[DataForSEO] Error getting usage stats:', error);
      throw error;
    }
  }
}
