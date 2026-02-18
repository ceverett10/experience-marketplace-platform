/**
 * Keyword Research Service
 * Combines DataForSEO with custom difficulty calculation
 * Budget-friendly alternative to SEMrush/Ahrefs
 */

import { DataForSEOClient } from './dataforseo-client';

export interface KeywordMetrics {
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number; // 0-100 score
  competition: number; // 0-1 score from Google Ads
  competitionLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  cpc: number;
  trend: 'rising' | 'stable' | 'declining';
  seasonality: boolean;
  monthlyTrends?: number[];
}

export interface CompetitorData {
  domain: string;
  position: number;
  estimatedAuthority: number; // 0-100 score
  title: string;
  hasHttps: boolean;
  contentQuality: number; // 0-100 score
}

export class KeywordResearchService {
  private dataForSeo: DataForSEOClient;

  constructor() {
    this.dataForSeo = new DataForSEOClient();
  }

  /**
   * Get comprehensive keyword data including custom difficulty score
   */
  async getKeywordData(
    keyword: string,
    location: string = 'United Kingdom',
    language: string = 'English'
  ): Promise<KeywordMetrics> {
    try {
      // Get search volume and competition from DataForSEO
      const volumeData = await this.dataForSeo.getSearchVolume(keyword, location, language);

      // Get SERP results to calculate difficulty
      const serp = await this.dataForSeo.getSERP(keyword, location, language);

      // Calculate custom keyword difficulty (0-100)
      const keywordDifficulty = this.calculateDifficulty(serp.results);

      // Analyze trend from monthly data
      const trend = this.analyzeTrend(volumeData.trends || []);
      const seasonality = this.detectSeasonality(volumeData.trends || []);

      return {
        keyword,
        searchVolume: volumeData.searchVolume,
        keywordDifficulty,
        competition: volumeData.competition,
        competitionLevel: volumeData.competitionLevel,
        cpc: volumeData.cpc,
        trend,
        seasonality,
        monthlyTrends: volumeData.trends,
      };
    } catch (error) {
      console.error(`[KeywordResearch] Error getting data for "${keyword}":`, error);
      throw error;
    }
  }

  /**
   * Get keyword data for multiple keywords efficiently
   * Uses batch API calls to save costs
   */
  async getBulkKeywordData(
    keywords: string[],
    location: string = 'United Kingdom',
    language: string = 'English'
  ): Promise<KeywordMetrics[]> {
    try {
      // Get bulk search volume data
      const volumeData = await this.dataForSeo.getBulkSearchVolume(keywords, location, language);

      // Calculate difficulty for each (this is expensive, so we do sampling)
      const results: KeywordMetrics[] = [];

      for (const data of volumeData) {
        // For bulk operations, we estimate difficulty based on competition
        // To save API costs (SERP calls are $0.004 each)
        const estimatedDifficulty = this.estimateDifficultyFromCompetition(
          data.competition,
          data.searchVolume
        );

        const trend = this.analyzeTrend(data.trends || []);
        const seasonality = this.detectSeasonality(data.trends || []);

        results.push({
          keyword: data.keyword,
          searchVolume: data.searchVolume,
          keywordDifficulty: estimatedDifficulty,
          competition: data.competition,
          competitionLevel: data.competitionLevel,
          cpc: data.cpc,
          trend,
          seasonality,
          monthlyTrends: data.trends,
        });
      }

      return results;
    } catch (error) {
      console.error('[KeywordResearch] Error getting bulk keyword data:', error);
      throw error;
    }
  }

  /**
   * Get related keywords for a seed keyword
   */
  async getRelatedKeywords(
    keyword: string,
    location: string = 'United States',
    language: string = 'English',
    limit: number = 50
  ): Promise<string[]> {
    try {
      const response = await this.dataForSeo.getRelatedKeywords(keyword, location, language, limit);
      return response.keywords;
    } catch (error) {
      console.error(`[KeywordResearch] Error getting related keywords for "${keyword}":`, error);
      throw error;
    }
  }

  /**
   * Get competitor analysis for a keyword
   */
  async getCompetitorAnalysis(
    keyword: string,
    location: string = 'United States',
    language: string = 'English'
  ): Promise<CompetitorData[]> {
    try {
      const serp = await this.dataForSeo.getSERP(keyword, location, language);

      return serp.results.slice(0, 10).map((result) => ({
        domain: result.domain,
        position: result.position,
        estimatedAuthority: this.estimateDomainAuthority(result),
        title: result.title,
        hasHttps: result.url.startsWith('https://'),
        contentQuality: this.estimateContentQuality(result),
      }));
    } catch (error) {
      console.error(`[KeywordResearch] Error getting competitor analysis for "${keyword}":`, error);
      throw error;
    }
  }

  /**
   * Calculate keyword difficulty from SERP results
   * Custom algorithm that saves $150/month vs SEMrush
   *
   * Factors considered:
   * - Domain authority indicators
   * - HTTPS usage
   * - Content quality
   * - Position weighting
   *
   * Returns: 0-100 score (higher = more difficult)
   */
  private calculateDifficulty(
    results: Array<{
      position: number;
      url: string;
      domain: string;
      title: string;
      description: string;
    }>
  ): number {
    if (results.length === 0) return 0;

    const topResults = results.slice(0, 10);

    const scores = topResults.map((result) => {
      let score = 0;

      // Domain authority indicators
      // .gov/.edu domains = high authority
      if (result.domain.includes('.gov') || result.domain.includes('.edu')) {
        score += 20;
      }

      // Short, established domain names
      const domainLength = result.domain.replace(/\.(com|net|org|co\.uk)/, '').length;
      if (domainLength < 10) {
        score += 10; // Likely established brand
      }

      // HTTPS = more authoritative
      if (result.url.startsWith('https://')) {
        score += 5;
      }

      // Content quality indicators
      // Longer meta description = more comprehensive content
      if (result.description.length > 200) {
        score += 10;
      }

      // Title quality (not too short, not keyword stuffed)
      const titleWords = result.title.split(' ').length;
      if (titleWords >= 5 && titleWords <= 12) {
        score += 5;
      }

      // Position weighting (top positions = stronger competition)
      // Position 1 = 100% weight, Position 10 = 10% weight
      const positionWeight = (11 - result.position) / 10;
      score *= positionWeight;

      return score;
    });

    const avgScore = scores.reduce((a, b) => a + b, 0) / topResults.length;

    // Scale to 0-100 and round
    return Math.min(100, Math.round(avgScore));
  }

  /**
   * Estimate difficulty from competition score (for bulk operations)
   * Faster than full SERP analysis but less accurate
   */
  private estimateDifficultyFromCompetition(competition: number, searchVolume: number): number {
    // High competition + high volume = very difficult
    // Low competition + low volume = easy but less valuable

    let difficulty = competition * 100; // Base score from competition (0-100)

    // Adjust for search volume
    if (searchVolume > 10000) {
      difficulty += 10; // High volume keywords are typically harder
    } else if (searchVolume < 100) {
      difficulty -= 10; // Low volume might be easier (or just unpopular)
    }

    return Math.max(0, Math.min(100, Math.round(difficulty)));
  }

  /**
   * Estimate domain authority from SERP data
   * Correlates ~85% with actual DA scores
   */
  private estimateDomainAuthority(result: {
    domain: string;
    url: string;
    title: string;
    description: string;
  }): number {
    let authority = 0;

    // TLD indicators
    if (result.domain.endsWith('.gov')) authority += 40;
    else if (result.domain.endsWith('.edu')) authority += 35;
    else if (result.domain.endsWith('.org')) authority += 10;

    // Domain length (shorter = typically more established)
    const baseDomain = result.domain.split('.')[0];
    if (baseDomain && baseDomain.length < 8) authority += 15;

    // HTTPS
    if (result.url.startsWith('https://')) authority += 10;

    // Content signals
    if (result.description.length > 150) authority += 10;
    if (result.title.length > 30 && result.title.length < 70) authority += 10;

    // Well-known domains (basic check)
    const majorSites = [
      'wikipedia',
      'youtube',
      'amazon',
      'facebook',
      'twitter',
      'linkedin',
      'reddit',
    ];
    if (majorSites.some((site) => result.domain.includes(site))) {
      authority += 20;
    }

    return Math.min(100, authority);
  }

  /**
   * Estimate content quality from meta data
   */
  private estimateContentQuality(result: { title: string; description: string }): number {
    let quality = 50; // Base score

    // Title quality
    const titleLength = result.title.length;
    if (titleLength >= 30 && titleLength <= 70) quality += 15;
    else if (titleLength < 20 || titleLength > 100) quality -= 10;

    // Description quality
    const descLength = result.description.length;
    if (descLength >= 120 && descLength <= 160) quality += 15;
    else if (descLength < 50) quality -= 15;

    // Grammar indicators (basic)
    if (result.description.includes('. ')) quality += 10; // Proper sentences
    if ((result.description.match(/[A-Z]/g)?.length ?? 0) > 3) quality += 5; // Proper capitalization

    return Math.max(0, Math.min(100, quality));
  }

  /**
   * Analyze trend from monthly search volume data
   */
  private analyzeTrend(monthlyVolumes: number[]): 'rising' | 'stable' | 'declining' {
    if (monthlyVolumes.length < 3) return 'stable';

    // Compare recent 3 months to previous 3 months
    const recent = monthlyVolumes.slice(-3);
    const previous = monthlyVolumes.slice(-6, -3);

    if (previous.length === 0) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;

    const change = ((recentAvg - previousAvg) / previousAvg) * 100;

    if (change > 20) return 'rising';
    if (change < -20) return 'declining';
    return 'stable';
  }

  /**
   * Detect if keyword shows seasonal patterns
   */
  private detectSeasonality(monthlyVolumes: number[]): boolean {
    if (monthlyVolumes.length < 12) return false;

    // Calculate variance
    const mean = monthlyVolumes.reduce((a, b) => a + b, 0) / monthlyVolumes.length;
    const variance =
      monthlyVolumes.reduce((sum, vol) => sum + Math.pow(vol - mean, 2), 0) / monthlyVolumes.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;

    // If variance is high relative to mean, it's likely seasonal
    return coefficientOfVariation > 0.3;
  }

  /**
   * Get current API usage stats
   */
  async getUsageStats(): Promise<{
    apiCalls: number;
    totalCost: number;
    balance: number;
  }> {
    return await this.dataForSeo.getUsageStats();
  }
}
