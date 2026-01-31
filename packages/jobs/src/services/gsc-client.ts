import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

/**
 * Google Search Console Client
 * Handles authentication and API calls to GSC
 */
export class GSCClient {
  private auth: GoogleAuth;
  private searchConsole: ReturnType<typeof google.searchconsole>;

  constructor() {
    // Initialize auth with service account credentials
    this.auth = new GoogleAuth({
      credentials: {
        client_email: process.env['GSC_CLIENT_EMAIL'],
        private_key: process.env['GSC_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });

    this.searchConsole = google.searchconsole({
      version: 'v1',
      auth: this.auth,
    });
  }

  /**
   * Query search analytics data for a site
   */
  async querySearchAnalytics(params: {
    siteUrl: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    dimensions?: ('query' | 'page' | 'country' | 'device')[];
    rowLimit?: number;
  }): Promise<{
    rows: Array<{
      keys?: string[];
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
  }> {
    try {
      const response = await this.searchConsole.searchanalytics.query({
        siteUrl: params.siteUrl,
        requestBody: {
          startDate: params.startDate,
          endDate: params.endDate,
          dimensions: params.dimensions || ['query', 'page'],
          rowLimit: params.rowLimit || 25000, // GSC max is 25,000
          startRow: 0,
        },
      });

      return {
        rows: (response.data.rows || []).map((row) => ({
          keys: row.keys || undefined,
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
        })),
      };
    } catch (error) {
      console.error('[GSC Client] Error querying search analytics:', error);
      throw error;
    }
  }

  /**
   * Get list of sites in GSC account
   */
  async listSites(): Promise<
    Array<{
      siteUrl: string;
      permissionLevel: string;
    }>
  > {
    try {
      const response = await this.searchConsole.sites.list();
      return (response.data.siteEntry || [])
        .filter(
          (site): site is { siteUrl: string; permissionLevel: string } =>
            !!site.siteUrl && !!site.permissionLevel
        )
        .map((site) => ({
          siteUrl: site.siteUrl,
          permissionLevel: site.permissionLevel,
        }));
    } catch (error) {
      console.error('[GSC Client] Error listing sites:', error);
      throw error;
    }
  }

  /**
   * Get sitemap information
   */
  async getSitemaps(siteUrl: string): Promise<
    Array<{
      path: string;
      lastSubmitted?: string;
      lastDownloaded?: string;
      contents?: Array<{
        type: string;
        submitted: string;
        indexed: string;
      }>;
    }>
  > {
    try {
      const response = await this.searchConsole.sitemaps.list({
        siteUrl,
      });
      return (response.data.sitemap || [])
        .filter((sitemap) => !!sitemap.path)
        .map((sitemap) => ({
          path: sitemap.path!,
          lastSubmitted: sitemap.lastSubmitted || undefined,
          lastDownloaded: sitemap.lastDownloaded || undefined,
          contents: sitemap.contents?.map((content) => ({
            type: content.type || '',
            submitted: content.submitted || '',
            indexed: content.indexed || '',
          })),
        }));
    } catch (error) {
      console.error('[GSC Client] Error getting sitemaps:', error);
      throw error;
    }
  }

  /**
   * Submit sitemap to GSC
   */
  async submitSitemap(siteUrl: string, feedpath: string): Promise<void> {
    try {
      await this.searchConsole.sitemaps.submit({
        siteUrl,
        feedpath,
      });
      console.log(`[GSC Client] Sitemap submitted: ${feedpath}`);
    } catch (error) {
      console.error('[GSC Client] Error submitting sitemap:', error);
      throw error;
    }
  }

  /**
   * Get URL inspection data
   */
  async inspectUrl(
    siteUrl: string,
    inspectionUrl: string
  ): Promise<{
    indexStatusResult?: {
      verdict: string;
      coverageState: string;
      indexingState: string;
      lastCrawlTime?: string;
    };
  }> {
    try {
      const response = await this.searchConsole.urlInspection.index.inspect({
        requestBody: {
          siteUrl,
          inspectionUrl,
        },
      });
      const result = response.data.inspectionResult;
      if (!result?.indexStatusResult) {
        return {};
      }

      const indexStatus = result.indexStatusResult;
      return {
        indexStatusResult: {
          verdict: indexStatus.verdict || '',
          coverageState: indexStatus.coverageState || '',
          indexingState: indexStatus.indexingState || '',
          lastCrawlTime: indexStatus.lastCrawlTime || undefined,
        },
      };
    } catch (error) {
      console.error('[GSC Client] Error inspecting URL:', error);
      throw error;
    }
  }
}

/**
 * Create GSC client instance (singleton)
 */
let gscClientInstance: GSCClient | null = null;

export function getGSCClient(): GSCClient {
  if (!gscClientInstance) {
    gscClientInstance = new GSCClient();
  }
  return gscClientInstance;
}

/**
 * Check if GSC is configured
 */
export function isGSCConfigured(): boolean {
  return !!(process.env['GSC_CLIENT_EMAIL'] && process.env['GSC_PRIVATE_KEY']);
}
