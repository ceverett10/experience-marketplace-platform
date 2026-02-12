/**
 * Heroku Domains Service
 * Manages custom domain configuration on Heroku
 */

interface HerokuDomainResponse {
  id: string;
  hostname: string;
  kind: string;
  cname: string | null;
  status: string;
  acm_status: string | null;
  acm_status_reason: string;
  sni_endpoint: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
}

interface AddDomainResult {
  success: boolean;
  hostname?: string;
  dnsTarget?: string;
  error?: string;
}

interface ListDomainsResult {
  success: boolean;
  domains?: HerokuDomainResponse[];
  error?: string;
}

export class HerokuDomainsService {
  private apiKey: string;
  private appName: string;
  private baseUrl = 'https://api.heroku.com';
  private cachedSniEndpointId: string | null | undefined = undefined;

  constructor() {
    const apiKey = process.env['HEROKU_API_KEY'];
    const appName = process.env['HEROKU_APP_NAME'];

    if (!apiKey) {
      throw new Error('HEROKU_API_KEY environment variable is required');
    }
    if (!appName) {
      throw new Error('HEROKU_APP_NAME environment variable is required');
    }

    this.apiKey = apiKey;
    this.appName = appName;
  }

  /**
   * Get an existing SNI endpoint from the app.
   * Heroku requires sni_endpoint when the app already has endpoints.
   * Since we use Cloudflare for SSL, domains can share any existing endpoint.
   */
  async getExistingSniEndpoint(): Promise<string | null> {
    if (this.cachedSniEndpointId !== undefined) return this.cachedSniEndpointId;

    try {
      const result = await this.listDomains();
      if (!result.success || !result.domains) {
        this.cachedSniEndpointId = null;
        return null;
      }

      for (const domain of result.domains) {
        if (domain.sni_endpoint) {
          console.log(`[Heroku] Using existing SNI endpoint: ${domain.sni_endpoint.name}`);
          this.cachedSniEndpointId = domain.sni_endpoint.id;
          return domain.sni_endpoint.id;
        }
      }
      this.cachedSniEndpointId = null;
      return null;
    } catch {
      this.cachedSniEndpointId = null;
      return null;
    }
  }

  /**
   * Add a custom domain to Heroku.
   * Automatically uses an existing SNI endpoint if the app has one,
   * since SSL is handled by Cloudflare (not Heroku ACM).
   */
  async addDomain(hostname: string): Promise<AddDomainResult> {
    try {
      console.log(`[Heroku] Adding domain ${hostname} to app ${this.appName}`);

      // Get an existing SNI endpoint — Heroku requires this parameter
      // when the app already has endpoints configured.
      const sniEndpointId = await this.getExistingSniEndpoint();

      const body: Record<string, unknown> = { hostname };
      if (sniEndpointId) {
        body['sni_endpoint'] = sniEndpointId;
      }

      const response = await fetch(`${this.baseUrl}/apps/${this.appName}/domains`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/vnd.heroku+json; version=3',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };

        // If domain already exists, that's fine
        if (response.status === 422 && errorData.message?.includes('already been taken')) {
          console.log(`[Heroku] Domain ${hostname} already exists`);
          return {
            success: true,
            hostname,
            dnsTarget: undefined, // Already configured
          };
        }

        throw new Error(errorData.message || `Heroku API error: ${response.status}`);
      }

      const data = (await response.json()) as HerokuDomainResponse;

      console.log(`[Heroku] Domain ${hostname} added successfully`);
      console.log(`[Heroku] DNS Target: ${data.cname}`);

      return {
        success: true,
        hostname: data.hostname,
        dnsTarget: data.cname || undefined,
      };
    } catch (error) {
      console.error(`[Heroku] Error adding domain ${hostname}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Remove a custom domain from Heroku
   */
  async removeDomain(hostname: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[Heroku] Removing domain ${hostname} from app ${this.appName}`);

      const response = await fetch(
        `${this.baseUrl}/apps/${this.appName}/domains/${encodeURIComponent(hostname)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/vnd.heroku+json; version=3',
          },
        }
      );

      if (!response.ok && response.status !== 404) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorData.message || `Heroku API error: ${response.status}`);
      }

      console.log(`[Heroku] Domain ${hostname} removed successfully`);
      return { success: true };
    } catch (error) {
      console.error(`[Heroku] Error removing domain ${hostname}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * List all custom domains for the app
   */
  async listDomains(): Promise<ListDomainsResult> {
    try {
      const response = await fetch(`${this.baseUrl}/apps/${this.appName}/domains`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/vnd.heroku+json; version=3',
        },
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorData.message || `Heroku API error: ${response.status}`);
      }

      const data = (await response.json()) as HerokuDomainResponse[];
      return {
        success: true,
        domains: data,
      };
    } catch (error) {
      console.error('[Heroku] Error listing domains:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if a domain is configured on Heroku
   */
  async isDomainConfigured(hostname: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/apps/${this.appName}/domains/${encodeURIComponent(hostname)}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/vnd.heroku+json; version=3',
          },
        }
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get detailed status for a single domain
   */
  async getDomainStatus(hostname: string): Promise<HerokuDomainResponse | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/apps/${this.appName}/domains/${encodeURIComponent(hostname)}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/vnd.heroku+json; version=3',
          },
        }
      );

      if (!response.ok) return null;
      return (await response.json()) as HerokuDomainResponse;
    } catch {
      return null;
    }
  }

  /**
   * Add domain and www subdomain to Heroku
   * This is the typical pattern for custom domains
   */
  async addDomainWithWww(baseDomain: string): Promise<{
    success: boolean;
    rootResult?: AddDomainResult;
    wwwResult?: AddDomainResult;
    error?: string;
  }> {
    try {
      // Add root domain
      const rootResult = await this.addDomain(baseDomain);

      // Add www subdomain
      const wwwResult = await this.addDomain(`www.${baseDomain}`);

      return {
        success: rootResult.success && wwwResult.success,
        rootResult,
        wwwResult,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
