import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

/**
 * GA4 Data Report Types
 */
export interface GA4TrafficReport {
  totalUsers: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
  engagementRate: number;
  dateRange: { startDate: string; endDate: string };
}

export interface GA4PageReport {
  pagePath: string;
  pageTitle: string;
  pageviews: number;
  uniquePageviews: number;
  avgTimeOnPage: number;
  bounceRate: number;
  entrances: number;
  exits: number;
}

export interface GA4SourceReport {
  source: string;
  medium: string;
  users: number;
  sessions: number;
  bounceRate: number;
  conversions: number;
}

export interface GA4DeviceReport {
  deviceCategory: string;
  users: number;
  sessions: number;
  bounceRate: number;
  screenPageViews: number;
}

/**
 * Google Analytics 4 Client
 *
 * Handles both Admin API (creating properties) and Data API (retrieving reports)
 *
 * Supports:
 * - Creating GA4 properties and data streams
 * - Retrieving traffic reports (users, sessions, pageviews)
 * - Page-level performance analysis
 * - Traffic source breakdown
 * - Device and geographic reports
 */
export class GA4Client {
  private auth: GoogleAuth;
  private analyticsAdmin: ReturnType<typeof google.analyticsadmin>;
  private dataClient: BetaAnalyticsDataClient | null = null;

  constructor() {
    // Initialize auth with service account credentials
    // Reusing the same service account as GSC
    this.auth = new GoogleAuth({
      credentials: {
        client_email: process.env['GSC_CLIENT_EMAIL'],
        private_key: process.env['GSC_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/analytics.edit', // Create/edit properties
        'https://www.googleapis.com/auth/analytics.readonly', // Read properties
      ],
    });

    this.analyticsAdmin = google.analyticsadmin({
      version: 'v1beta',
      auth: this.auth,
    });

    // Initialize Data API client for retrieving reports
    try {
      this.dataClient = new BetaAnalyticsDataClient({
        credentials: {
          client_email: process.env['GSC_CLIENT_EMAIL'],
          private_key: process.env['GSC_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
        },
      });
    } catch (error) {
      console.warn('[GA4 Client] Data API client initialization failed - data retrieval will be unavailable');
      this.dataClient = null;
    }
  }

  // ==========================================================================
  // ACCOUNT MANAGEMENT
  // ==========================================================================

  /**
   * List all GA4 accounts accessible to the service account
   */
  async listAccounts(): Promise<
    Array<{
      name: string;
      displayName: string;
      createTime?: string;
    }>
  > {
    try {
      const response = await this.analyticsAdmin.accounts.list();
      return (response.data.accounts || []).map((account) => ({
        name: account.name || '',
        displayName: account.displayName || '',
        createTime: account.createTime || undefined,
      }));
    } catch (error) {
      console.error('[GA4 Client] Error listing accounts:', error);
      throw error;
    }
  }

  // ==========================================================================
  // PROPERTY MANAGEMENT
  // ==========================================================================

  /**
   * Create a new GA4 property under an account
   * @param accountId - The account ID (e.g., "accounts/123456789")
   * @param displayName - Display name for the property (e.g., "Paris Food Tours")
   * @param timeZone - Reporting time zone (e.g., "Europe/London")
   * @param currencyCode - Currency code (e.g., "GBP", "EUR", "USD")
   */
  async createProperty(params: {
    accountId: string;
    displayName: string;
    timeZone?: string;
    currencyCode?: string;
    industryCategory?: string;
  }): Promise<{
    name: string;
    propertyId: string;
    displayName: string;
    createTime?: string;
  }> {
    try {
      const response = await this.analyticsAdmin.properties.create({
        requestBody: {
          parent: params.accountId,
          displayName: params.displayName,
          timeZone: params.timeZone || 'Europe/London',
          currencyCode: params.currencyCode || 'GBP',
          industryCategory: params.industryCategory || 'TRAVEL',
        },
      });

      const propertyName = response.data.name || '';
      const propertyId = propertyName.split('/').pop() || '';

      console.log(`[GA4 Client] Property created: ${params.displayName} (${propertyId})`);

      return {
        name: propertyName,
        propertyId,
        displayName: response.data.displayName || params.displayName,
        createTime: response.data.createTime || undefined,
      };
    } catch (error) {
      console.error('[GA4 Client] Error creating property:', error);
      throw error;
    }
  }

  /**
   * List all GA4 properties under an account
   */
  async listProperties(accountId: string): Promise<
    Array<{
      name: string;
      propertyId: string;
      displayName: string;
      timeZone?: string;
      currencyCode?: string;
    }>
  > {
    try {
      const response = await this.analyticsAdmin.properties.list({
        filter: `parent:${accountId}`,
      });

      return (response.data.properties || []).map((property) => {
        const propertyName = property.name || '';
        return {
          name: propertyName,
          propertyId: propertyName.split('/').pop() || '',
          displayName: property.displayName || '',
          timeZone: property.timeZone || undefined,
          currencyCode: property.currencyCode || undefined,
        };
      });
    } catch (error) {
      console.error('[GA4 Client] Error listing properties:', error);
      throw error;
    }
  }

  /**
   * Get a specific property by ID
   */
  async getProperty(propertyId: string): Promise<{
    name: string;
    displayName: string;
    timeZone?: string;
    currencyCode?: string;
  } | null> {
    try {
      const response = await this.analyticsAdmin.properties.get({
        name: `properties/${propertyId}`,
      });

      return {
        name: response.data.name || '',
        displayName: response.data.displayName || '',
        timeZone: response.data.timeZone || undefined,
        currencyCode: response.data.currencyCode || undefined,
      };
    } catch (error: any) {
      if (error?.code === 404) {
        return null;
      }
      console.error('[GA4 Client] Error getting property:', error);
      throw error;
    }
  }

  // ==========================================================================
  // DATA STREAM MANAGEMENT
  // ==========================================================================

  /**
   * Create a web data stream for a property
   * This generates the measurement ID (G-XXXXXXXXXX)
   *
   * @param propertyId - The property ID (numeric, e.g., "123456789")
   * @param websiteUrl - The website URL (e.g., "https://parisfoodtours.com")
   * @param displayName - Display name for the stream
   */
  async createWebDataStream(params: {
    propertyId: string;
    websiteUrl: string;
    displayName: string;
  }): Promise<{
    name: string;
    streamId: string;
    measurementId: string;
    websiteUrl: string;
    displayName: string;
  }> {
    try {
      const response = await this.analyticsAdmin.properties.dataStreams.create({
        parent: `properties/${params.propertyId}`,
        requestBody: {
          type: 'WEB_DATA_STREAM',
          displayName: params.displayName,
          webStreamData: {
            defaultUri: params.websiteUrl,
          },
        },
      });

      const streamName = response.data.name || '';
      const streamId = streamName.split('/').pop() || '';
      const measurementId = response.data.webStreamData?.measurementId || '';

      console.log(
        `[GA4 Client] Web data stream created: ${params.displayName} - Measurement ID: ${measurementId}`
      );

      return {
        name: streamName,
        streamId,
        measurementId,
        websiteUrl: response.data.webStreamData?.defaultUri || params.websiteUrl,
        displayName: response.data.displayName || params.displayName,
      };
    } catch (error) {
      console.error('[GA4 Client] Error creating web data stream:', error);
      throw error;
    }
  }

  /**
   * List all data streams for a property
   */
  async listDataStreams(propertyId: string): Promise<
    Array<{
      name: string;
      streamId: string;
      type: string;
      displayName: string;
      measurementId?: string;
      websiteUrl?: string;
    }>
  > {
    try {
      const response = await this.analyticsAdmin.properties.dataStreams.list({
        parent: `properties/${propertyId}`,
      });

      return (response.data.dataStreams || []).map((stream) => {
        const streamName = stream.name || '';
        return {
          name: streamName,
          streamId: streamName.split('/').pop() || '',
          type: stream.type || '',
          displayName: stream.displayName || '',
          measurementId: stream.webStreamData?.measurementId || undefined,
          websiteUrl: stream.webStreamData?.defaultUri || undefined,
        };
      });
    } catch (error) {
      console.error('[GA4 Client] Error listing data streams:', error);
      throw error;
    }
  }

  /**
   * Get measurement ID for an existing data stream
   */
  async getMeasurementId(propertyId: string, streamId: string): Promise<string | null> {
    try {
      const response = await this.analyticsAdmin.properties.dataStreams.get({
        name: `properties/${propertyId}/dataStreams/${streamId}`,
      });

      return response.data.webStreamData?.measurementId || null;
    } catch (error: any) {
      if (error?.code === 404) {
        return null;
      }
      console.error('[GA4 Client] Error getting measurement ID:', error);
      throw error;
    }
  }

  // ==========================================================================
  // COMPLETE SETUP FLOW
  // ==========================================================================

  /**
   * Complete GA4 setup flow for a site:
   * 1. Create a GA4 property
   * 2. Create a web data stream
   * 3. Return the measurement ID
   *
   * @param accountId - The GA4 account ID (e.g., "accounts/123456789")
   * @param siteName - Display name for the site
   * @param websiteUrl - The website URL
   * @param options - Additional options (timeZone, currencyCode)
   */
  async setupSiteAnalytics(params: {
    accountId: string;
    siteName: string;
    websiteUrl: string;
    timeZone?: string;
    currencyCode?: string;
  }): Promise<{
    success: boolean;
    propertyId?: string;
    measurementId?: string;
    error?: string;
  }> {
    try {
      // Step 1: Create GA4 property
      console.log(`[GA4 Client] Setting up analytics for: ${params.siteName}`);

      const property = await this.createProperty({
        accountId: params.accountId,
        displayName: params.siteName,
        timeZone: params.timeZone,
        currencyCode: params.currencyCode,
        industryCategory: 'TRAVEL',
      });

      // Step 2: Create web data stream
      const dataStream = await this.createWebDataStream({
        propertyId: property.propertyId,
        websiteUrl: params.websiteUrl,
        displayName: `${params.siteName} - Web`,
      });

      console.log(
        `[GA4 Client] Setup complete for ${params.siteName}: Property ${property.propertyId}, Measurement ID ${dataStream.measurementId}`
      );

      return {
        success: true,
        propertyId: property.propertyId,
        measurementId: dataStream.measurementId,
      };
    } catch (error) {
      console.error(`[GA4 Client] Error setting up analytics for ${params.siteName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // DATA API - REPORT RETRIEVAL
  // ==========================================================================

  /**
   * Check if Data API is available
   */
  isDataApiAvailable(): boolean {
    return this.dataClient !== null;
  }

  /**
   * Get overall traffic report for a property
   * @param propertyId - The GA4 property ID (numeric)
   * @param startDate - Start date (YYYY-MM-DD or relative like "7daysAgo")
   * @param endDate - End date (YYYY-MM-DD or relative like "today")
   */
  async getTrafficReport(
    propertyId: string,
    startDate = '7daysAgo',
    endDate = 'today'
  ): Promise<GA4TrafficReport | null> {
    if (!this.dataClient) {
      console.warn('[GA4 Client] Data API not available');
      return null;
    }

    try {
      const [response] = await this.dataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'engagementRate' },
        ],
      });

      const row = response.rows?.[0];
      if (!row?.metricValues) {
        return null;
      }

      return {
        totalUsers: parseInt(row.metricValues[0]?.value || '0', 10),
        newUsers: parseInt(row.metricValues[1]?.value || '0', 10),
        sessions: parseInt(row.metricValues[2]?.value || '0', 10),
        pageviews: parseInt(row.metricValues[3]?.value || '0', 10),
        bounceRate: parseFloat(row.metricValues[4]?.value || '0'),
        avgSessionDuration: parseFloat(row.metricValues[5]?.value || '0'),
        engagementRate: parseFloat(row.metricValues[6]?.value || '0'),
        dateRange: { startDate, endDate },
      };
    } catch (error) {
      console.error('[GA4 Client] Error getting traffic report:', error);
      return null;
    }
  }

  /**
   * Get page-level performance report
   * @param propertyId - The GA4 property ID
   * @param startDate - Start date
   * @param endDate - End date
   * @param limit - Maximum number of pages to return
   */
  async getPageReport(
    propertyId: string,
    startDate = '7daysAgo',
    endDate = 'today',
    limit = 50
  ): Promise<GA4PageReport[]> {
    if (!this.dataClient) {
      console.warn('[GA4 Client] Data API not available');
      return [];
    }

    try {
      const [response] = await this.dataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'pagePath' },
          { name: 'pageTitle' },
        ],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'userEngagementDuration' },
          { name: 'bounceRate' },
          { name: 'entrances' },
          { name: 'exits' },
        ],
        orderBys: [
          { metric: { metricName: 'screenPageViews' }, desc: true },
        ],
        limit,
      });

      return (response.rows || []).map((row) => ({
        pagePath: row.dimensionValues?.[0]?.value || '',
        pageTitle: row.dimensionValues?.[1]?.value || '',
        pageviews: parseInt(row.metricValues?.[0]?.value || '0', 10),
        uniquePageviews: parseInt(row.metricValues?.[0]?.value || '0', 10), // GA4 counts are unique by default
        avgTimeOnPage: parseFloat(row.metricValues?.[1]?.value || '0'),
        bounceRate: parseFloat(row.metricValues?.[2]?.value || '0'),
        entrances: parseInt(row.metricValues?.[3]?.value || '0', 10),
        exits: parseInt(row.metricValues?.[4]?.value || '0', 10),
      }));
    } catch (error) {
      console.error('[GA4 Client] Error getting page report:', error);
      return [];
    }
  }

  /**
   * Get traffic sources report
   * @param propertyId - The GA4 property ID
   * @param startDate - Start date
   * @param endDate - End date
   */
  async getSourceReport(
    propertyId: string,
    startDate = '7daysAgo',
    endDate = 'today'
  ): Promise<GA4SourceReport[]> {
    if (!this.dataClient) {
      console.warn('[GA4 Client] Data API not available');
      return [];
    }

    try {
      const [response] = await this.dataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'sessionSource' },
          { name: 'sessionMedium' },
        ],
        metrics: [
          { name: 'totalUsers' },
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'conversions' },
        ],
        orderBys: [
          { metric: { metricName: 'sessions' }, desc: true },
        ],
        limit: 20,
      });

      return (response.rows || []).map((row) => ({
        source: row.dimensionValues?.[0]?.value || '(direct)',
        medium: row.dimensionValues?.[1]?.value || '(none)',
        users: parseInt(row.metricValues?.[0]?.value || '0', 10),
        sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
        bounceRate: parseFloat(row.metricValues?.[2]?.value || '0'),
        conversions: parseInt(row.metricValues?.[3]?.value || '0', 10),
      }));
    } catch (error) {
      console.error('[GA4 Client] Error getting source report:', error);
      return [];
    }
  }

  /**
   * Get device breakdown report
   * @param propertyId - The GA4 property ID
   * @param startDate - Start date
   * @param endDate - End date
   */
  async getDeviceReport(
    propertyId: string,
    startDate = '7daysAgo',
    endDate = 'today'
  ): Promise<GA4DeviceReport[]> {
    if (!this.dataClient) {
      console.warn('[GA4 Client] Data API not available');
      return [];
    }

    try {
      const [response] = await this.dataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'deviceCategory' },
        ],
        metrics: [
          { name: 'totalUsers' },
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'screenPageViews' },
        ],
        orderBys: [
          { metric: { metricName: 'sessions' }, desc: true },
        ],
      });

      return (response.rows || []).map((row) => ({
        deviceCategory: row.dimensionValues?.[0]?.value || 'unknown',
        users: parseInt(row.metricValues?.[0]?.value || '0', 10),
        sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
        bounceRate: parseFloat(row.metricValues?.[2]?.value || '0'),
        screenPageViews: parseInt(row.metricValues?.[3]?.value || '0', 10),
      }));
    } catch (error) {
      console.error('[GA4 Client] Error getting device report:', error);
      return [];
    }
  }

  /**
   * Compare traffic between two periods
   * Useful for tracking SEO impact over time
   */
  async compareTraffic(
    propertyId: string,
    currentPeriod: { start: string; end: string },
    previousPeriod: { start: string; end: string }
  ): Promise<{
    current: GA4TrafficReport | null;
    previous: GA4TrafficReport | null;
    changes: {
      usersChange: number;
      sessionsChange: number;
      pageviewsChange: number;
      bounceRateChange: number;
    } | null;
  }> {
    const [current, previous] = await Promise.all([
      this.getTrafficReport(propertyId, currentPeriod.start, currentPeriod.end),
      this.getTrafficReport(propertyId, previousPeriod.start, previousPeriod.end),
    ]);

    if (!current || !previous) {
      return { current, previous, changes: null };
    }

    const calcChange = (curr: number, prev: number) =>
      prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;

    return {
      current,
      previous,
      changes: {
        usersChange: calcChange(current.totalUsers, previous.totalUsers),
        sessionsChange: calcChange(current.sessions, previous.sessions),
        pageviewsChange: calcChange(current.pageviews, previous.pageviews),
        bounceRateChange: calcChange(current.bounceRate, previous.bounceRate),
      },
    };
  }

  /**
   * Get organic search traffic specifically
   * Critical for SEO monitoring
   */
  async getOrganicSearchReport(
    propertyId: string,
    startDate = '7daysAgo',
    endDate = 'today'
  ): Promise<{
    users: number;
    sessions: number;
    pageviews: number;
    bounceRate: number;
    avgSessionDuration: number;
    landingPages: Array<{ path: string; sessions: number }>;
  } | null> {
    if (!this.dataClient) {
      console.warn('[GA4 Client] Data API not available');
      return null;
    }

    try {
      // Get overall organic search metrics
      const [overallResponse] = await this.dataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionMedium',
            stringFilter: { matchType: 'EXACT', value: 'organic' },
          },
        },
        metrics: [
          { name: 'totalUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      });

      // Get top landing pages from organic
      const [landingResponse] = await this.dataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'landingPage' }],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionMedium',
            stringFilter: { matchType: 'EXACT', value: 'organic' },
          },
        },
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 20,
      });

      const row = overallResponse.rows?.[0];
      if (!row?.metricValues) {
        return {
          users: 0,
          sessions: 0,
          pageviews: 0,
          bounceRate: 0,
          avgSessionDuration: 0,
          landingPages: [],
        };
      }

      return {
        users: parseInt(row.metricValues[0]?.value || '0', 10),
        sessions: parseInt(row.metricValues[1]?.value || '0', 10),
        pageviews: parseInt(row.metricValues[2]?.value || '0', 10),
        bounceRate: parseFloat(row.metricValues[3]?.value || '0'),
        avgSessionDuration: parseFloat(row.metricValues[4]?.value || '0'),
        landingPages: (landingResponse.rows || []).map((r) => ({
          path: r.dimensionValues?.[0]?.value || '',
          sessions: parseInt(r.metricValues?.[0]?.value || '0', 10),
        })),
      };
    } catch (error) {
      console.error('[GA4 Client] Error getting organic search report:', error);
      return null;
    }
  }
}

/**
 * Create GA4 client instance (singleton)
 */
let ga4ClientInstance: GA4Client | null = null;

export function getGA4Client(): GA4Client {
  if (!ga4ClientInstance) {
    ga4ClientInstance = new GA4Client();
  }
  return ga4ClientInstance;
}

/**
 * Check if GA4 Admin API is configured
 * Uses the same credentials as GSC
 */
export function isGA4Configured(): boolean {
  return !!(process.env['GSC_CLIENT_EMAIL'] && process.env['GSC_PRIVATE_KEY']);
}
