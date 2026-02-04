import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

/**
 * Google Search Console Client
 * Handles authentication and API calls to GSC
 *
 * Supports:
 * - Search analytics queries
 * - Site management (add, list, delete)
 * - Sitemap submission
 * - URL inspection
 * - Site verification via DNS TXT record
 */
export class GSCClient {
  private auth: GoogleAuth;
  private searchConsole: ReturnType<typeof google.searchconsole>;
  private siteVerification: ReturnType<typeof google.siteVerification>;

  constructor() {
    // Initialize auth with service account credentials
    // Using full webmasters scope for read/write operations
    this.auth = new GoogleAuth({
      credentials: {
        client_email: process.env['GSC_CLIENT_EMAIL'],
        private_key: process.env['GSC_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/webmasters', // Full GSC access (read/write)
        'https://www.googleapis.com/auth/siteverification', // Site verification
      ],
    });

    this.searchConsole = google.searchconsole({
      version: 'v1',
      auth: this.auth,
    });

    this.siteVerification = google.siteVerification({
      version: 'v1',
      auth: this.auth,
    });
  }

  // ==========================================================================
  // SITE MANAGEMENT
  // ==========================================================================

  /**
   * Add a site to Google Search Console
   * The site must be verified first using getVerificationToken + verifySite
   * @param siteUrl - Full URL (https://example.com) or domain property (sc-domain:example.com)
   */
  async addSite(siteUrl: string): Promise<void> {
    try {
      await this.searchConsole.sites.add({
        siteUrl,
      });
      console.log(`[GSC Client] Site added: ${siteUrl}`);
    } catch (error) {
      console.error('[GSC Client] Error adding site:', error);
      throw error;
    }
  }

  /**
   * Delete a site from Google Search Console
   */
  async deleteSite(siteUrl: string): Promise<void> {
    try {
      await this.searchConsole.sites.delete({
        siteUrl,
      });
      console.log(`[GSC Client] Site deleted: ${siteUrl}`);
    } catch (error) {
      console.error('[GSC Client] Error deleting site:', error);
      throw error;
    }
  }

  /**
   * Get site details from GSC
   */
  async getSite(siteUrl: string): Promise<{
    siteUrl: string;
    permissionLevel: string;
  } | null> {
    try {
      const response = await this.searchConsole.sites.get({
        siteUrl,
      });

      if (!response.data.siteUrl) {
        return null;
      }

      return {
        siteUrl: response.data.siteUrl,
        permissionLevel: response.data.permissionLevel || 'siteUnverifiedUser',
      };
    } catch (error: any) {
      // 404 means site not found, which is a valid response
      if (error?.code === 404 || error?.status === 404) {
        return null;
      }
      console.error('[GSC Client] Error getting site:', error);
      throw error;
    }
  }

  // ==========================================================================
  // SITE VERIFICATION
  // ==========================================================================

  /**
   * Get DNS TXT verification token for a domain
   * This token must be added as a TXT record at the domain root
   * @param domain - Domain name (e.g., example.com)
   * @returns The TXT record value to add to DNS
   */
  async getVerificationToken(domain: string): Promise<{
    token: string;
    method: 'DNS_TXT';
  }> {
    try {
      const response = await this.siteVerification.webResource.getToken({
        requestBody: {
          site: {
            type: 'INET_DOMAIN',
            identifier: domain,
          },
          verificationMethod: 'DNS_TXT',
        },
      });

      if (!response.data.token) {
        throw new Error('No verification token received from Google');
      }

      console.log(`[GSC Client] Got verification token for ${domain}`);

      return {
        token: response.data.token,
        method: 'DNS_TXT',
      };
    } catch (error) {
      console.error('[GSC Client] Error getting verification token:', error);
      throw error;
    }
  }

  /**
   * Verify a domain using DNS TXT record
   * The TXT record must already be in place before calling this
   * @param domain - Domain name (e.g., example.com)
   */
  async verifySite(domain: string): Promise<{
    verified: boolean;
    owners: string[];
  }> {
    try {
      const response = await this.siteVerification.webResource.insert({
        verificationMethod: 'DNS_TXT',
        requestBody: {
          site: {
            type: 'INET_DOMAIN',
            identifier: domain,
          },
        },
      });

      console.log(`[GSC Client] Site verified: ${domain}`);

      return {
        verified: true,
        owners: response.data.owners || [],
      };
    } catch (error: any) {
      // Check for specific verification failure
      if (error?.message?.includes('verification')) {
        console.error(
          `[GSC Client] Verification failed for ${domain} - DNS record may not have propagated yet`
        );
        return {
          verified: false,
          owners: [],
        };
      }
      console.error('[GSC Client] Error verifying site:', error);
      throw error;
    }
  }

  /**
   * Add a co-owner to a verified domain property.
   * Uses the Site Verification API to grant owner-level access.
   * @param domain - Domain name (e.g., example.com)
   * @param ownerEmail - Email address to add as owner
   */
  async addOwner(domain: string, ownerEmail: string): Promise<boolean> {
    try {
      // The resource ID for INET_DOMAIN is dns://<domain>
      const resourceId = `dns://${domain}`;

      // Get current owners
      const existing = await this.siteVerification.webResource.get({
        id: resourceId,
      });
      const currentOwners = existing.data.owners || [];

      if (currentOwners.includes(ownerEmail)) {
        console.log(`[GSC Client] ${ownerEmail} is already an owner of ${domain}`);
        return true;
      }

      // Update with new owner
      await this.siteVerification.webResource.update({
        id: resourceId,
        requestBody: {
          site: {
            type: 'INET_DOMAIN',
            identifier: domain,
          },
          owners: [...currentOwners, ownerEmail],
        },
      });

      console.log(`[GSC Client] Added ${ownerEmail} as owner of ${domain}`);
      return true;
    } catch (error) {
      console.error(`[GSC Client] Error adding owner ${ownerEmail} to ${domain}:`, error);
      return false;
    }
  }

  /**
   * Check if a domain is already verified
   * @param domain - Domain name (e.g., example.com)
   */
  async isVerified(domain: string): Promise<boolean> {
    try {
      const response = await this.siteVerification.webResource.get({
        id: domain,
      });
      return !!response.data.id;
    } catch (error: any) {
      // 404 means not verified, 403 "not owner" also means not verified
      const errorCode = error?.code || error?.status;
      const errorMessage = error?.message || '';
      if (errorCode === 404 || errorCode === 403 || errorMessage.includes('not an owner')) {
        console.log(`[GSC Client] Domain ${domain} not yet verified (${errorCode || 'unknown'})`);
        return false;
      }
      console.error('[GSC Client] Error checking verification status:', error);
      throw error;
    }
  }

  /**
   * Complete site registration flow:
   * 1. Get verification token
   * 2. Verify the site (DNS record must be in place)
   * 3. Add site to GSC
   * 4. Submit sitemap
   *
   * @param domain - Domain name (e.g., example.com)
   * @param onTokenReceived - Callback to add DNS TXT record before verification
   */
  async registerSite(
    domain: string,
    onTokenReceived: (token: string) => Promise<void>
  ): Promise<{
    success: boolean;
    siteUrl: string;
    error?: string;
  }> {
    const siteUrl = `sc-domain:${domain}`;

    try {
      // Step 1: Check if already verified
      const alreadyVerified = await this.isVerified(domain);
      if (alreadyVerified) {
        console.log(`[GSC Client] Domain ${domain} already verified`);
      } else {
        // Step 2: Get verification token
        const { token } = await this.getVerificationToken(domain);

        // Step 3: Callback to add DNS record
        await onTokenReceived(token);

        // Step 4: Wait a moment for DNS propagation (Google checks quickly)
        console.log(`[GSC Client] Waiting for DNS propagation...`);
        await this.delay(5000);

        // Step 5: Verify the site
        const verification = await this.verifySite(domain);
        if (!verification.verified) {
          return {
            success: false,
            siteUrl,
            error: 'DNS verification failed - record may not have propagated',
          };
        }
      }

      // Step 6: Add site to GSC (as domain property)
      await this.addSite(siteUrl);

      // Step 7: Submit sitemap
      const sitemapUrl = `https://${domain}/sitemap.xml`;
      await this.submitSitemap(siteUrl, sitemapUrl);

      // Step 8: Add co-owner if configured (so admin can access GSC UI)
      const ownerEmail = process.env['GSC_OWNER_EMAIL'];
      if (ownerEmail) {
        await this.addOwner(domain, ownerEmail);
      }

      console.log(`[GSC Client] Site ${domain} fully registered in GSC`);

      return {
        success: true,
        siteUrl,
      };
    } catch (error) {
      console.error(`[GSC Client] Error registering site ${domain}:`, error);
      return {
        success: false,
        siteUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
