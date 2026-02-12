/**
 * Cloudflare DNS Service
 * Handles DNS zone management and configuration via Cloudflare API
 *
 * API Documentation: https://developers.cloudflare.com/api/
 * Benefits:
 * - Free SSL certificates
 * - CDN/proxy capabilities
 * - DDoS protection
 * - Fast DNS propagation
 */

interface CloudflareCredentials {
  apiToken?: string;
  apiKey?: string;
  email?: string;
  accountId?: string;
}

interface DNSRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV';
  name: string;
  content: string;
  ttl?: number; // 1 = auto, 120-86400 manual
  priority?: number; // For MX/SRV records
  proxied?: boolean; // Enable Cloudflare proxy/CDN
}

interface Zone {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted';
  nameServers: string[];
  createdAt: Date;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: T;
}

export class CloudflareDNSService {
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';
  private readonly apiToken?: string;
  private readonly apiKey?: string;
  private readonly email?: string;
  private readonly accountId?: string;

  constructor(credentials?: CloudflareCredentials) {
    const apiToken = credentials?.apiToken || process.env['CLOUDFLARE_API_TOKEN'];
    const apiKey = credentials?.apiKey || process.env['CLOUDFLARE_API_KEY'];
    const email = credentials?.email || process.env['CLOUDFLARE_EMAIL'];
    const accountId = credentials?.accountId || process.env['CLOUDFLARE_ACCOUNT_ID'];

    // Support both API Token and Global API Key authentication
    if (!apiToken && !apiKey) {
      throw new Error(
        'Cloudflare credentials not found. Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL.'
      );
    }

    if (apiKey && !email) {
      throw new Error(
        'CLOUDFLARE_EMAIL is required when using CLOUDFLARE_API_KEY (Global API Key).'
      );
    }

    this.apiToken = apiToken;
    this.apiKey = apiKey;
    this.email = email;
    this.accountId = accountId;
  }

  /**
   * Add a new zone (domain) to Cloudflare
   * The domain must be registered elsewhere first
   */
  async addZone(domain: string): Promise<Zone> {
    try {
      const response = await this.makeRequest<any>('/zones', 'POST', {
        name: domain,
        account: this.accountId ? { id: this.accountId } : undefined,
        jump_start: true, // Auto-scan existing DNS records
      });

      return {
        id: response.id,
        name: response.name,
        status: response.status,
        nameServers: response.name_servers || [],
        createdAt: new Date(response.created_on),
      };
    } catch (error) {
      console.error('[Cloudflare] Error adding zone:', error);
      throw error;
    }
  }

  /**
   * Get zone information
   */
  async getZone(domain: string): Promise<Zone | null> {
    try {
      const zones = await this.makeRequest<any[]>('/zones', 'GET', undefined, {
        name: domain,
      });

      if (zones.length === 0) {
        return null;
      }

      const zone = zones[0];
      return {
        id: zone.id,
        name: zone.name,
        status: zone.status,
        nameServers: zone.name_servers || [],
        createdAt: new Date(zone.created_on),
      };
    } catch (error) {
      console.error('[Cloudflare] Error getting zone:', error);
      throw error;
    }
  }

  /**
   * Get zone by ID
   */
  async getZoneById(zoneId: string): Promise<Zone> {
    try {
      const zone = await this.makeRequest<any>(`/zones/${zoneId}`, 'GET');

      return {
        id: zone.id,
        name: zone.name,
        status: zone.status,
        nameServers: zone.name_servers || [],
        createdAt: new Date(zone.created_on),
      };
    } catch (error) {
      console.error('[Cloudflare] Error getting zone by ID:', error);
      throw error;
    }
  }

  /**
   * Delete a zone from Cloudflare
   */
  async deleteZone(zoneId: string): Promise<void> {
    try {
      await this.makeRequest(`/zones/${zoneId}`, 'DELETE');
      console.log(`[Cloudflare] Zone ${zoneId} deleted`);
    } catch (error) {
      console.error('[Cloudflare] Error deleting zone:', error);
      throw error;
    }
  }

  /**
   * Create a DNS record
   */
  async createDNSRecord(zoneId: string, record: DNSRecord): Promise<{ id: string }> {
    try {
      const result = await this.makeRequest<any>(`/zones/${zoneId}/dns_records`, 'POST', {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl || 1, // 1 = auto
        priority: record.priority,
        proxied: record.proxied ?? false,
      });

      console.log(
        `[Cloudflare] DNS record created: ${record.type} ${record.name} -> ${record.content}`
      );

      return { id: result.id };
    } catch (error) {
      console.error('[Cloudflare] Error creating DNS record:', error);
      throw error;
    }
  }

  /**
   * Update existing DNS record
   */
  async updateDNSRecord(zoneId: string, recordId: string, record: DNSRecord): Promise<void> {
    try {
      await this.makeRequest(`/zones/${zoneId}/dns_records/${recordId}`, 'PATCH', {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl || 1,
        priority: record.priority,
        proxied: record.proxied ?? false,
      });

      console.log(`[Cloudflare] DNS record updated: ${record.type} ${record.name}`);
    } catch (error) {
      console.error('[Cloudflare] Error updating DNS record:', error);
      throw error;
    }
  }

  /**
   * List all DNS records for a zone
   */
  async listDNSRecords(zoneId: string): Promise<Array<DNSRecord & { id: string }>> {
    try {
      const records = await this.makeRequest<any[]>(`/zones/${zoneId}/dns_records`, 'GET');

      return records.map((record) => ({
        id: record.id,
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl,
        priority: record.priority,
        proxied: record.proxied,
      }));
    } catch (error) {
      console.error('[Cloudflare] Error listing DNS records:', error);
      throw error;
    }
  }

  /**
   * Delete a DNS record
   */
  async deleteDNSRecord(zoneId: string, recordId: string): Promise<void> {
    try {
      await this.makeRequest(`/zones/${zoneId}/dns_records/${recordId}`, 'DELETE');
      console.log(`[Cloudflare] DNS record ${recordId} deleted`);
    } catch (error) {
      console.error('[Cloudflare] Error deleting DNS record:', error);
      throw error;
    }
  }

  /**
   * Bulk update DNS records
   * Efficiently replaces all DNS records for a zone
   */
  async updateDNSRecords(zoneId: string, records: DNSRecord[]): Promise<void> {
    try {
      // Get existing records
      const existing = await this.listDNSRecords(zoneId);

      // Delete all existing records (except NS records)
      for (const record of existing) {
        if (record.type !== 'NS') {
          await this.deleteDNSRecord(zoneId, record.id);
        }
      }

      // Create new records
      for (const record of records) {
        await this.createDNSRecord(zoneId, record);
      }

      console.log(`[Cloudflare] Updated ${records.length} DNS records for zone ${zoneId}`);
    } catch (error) {
      console.error('[Cloudflare] Error updating DNS records:', error);
      throw error;
    }
  }

  /**
   * Enable Cloudflare proxy (CDN + security) for a domain
   * Sets up the site to be proxied through Cloudflare's network
   */
  async enableProxy(zoneId: string): Promise<void> {
    try {
      // Get all A and CNAME records
      const records = await this.listDNSRecords(zoneId);
      const proxyableRecords = records.filter(
        (r) => (r.type === 'A' || r.type === 'CNAME') && !r.proxied
      );

      // Enable proxy for each record
      for (const record of proxyableRecords) {
        await this.updateDNSRecord(zoneId, record.id, {
          ...record,
          proxied: true,
        });
      }

      console.log(
        `[Cloudflare] Proxy enabled for ${proxyableRecords.length} records in zone ${zoneId}`
      );
    } catch (error) {
      console.error('[Cloudflare] Error enabling proxy:', error);
      throw error;
    }
  }

  /**
   * Configure SSL/TLS settings for a zone
   * Cloudflare provides free SSL certificates automatically
   */
  async configureSSL(
    zoneId: string,
    mode: 'off' | 'flexible' | 'full' | 'strict' = 'full'
  ): Promise<void> {
    try {
      await this.makeRequest(`/zones/${zoneId}/settings/ssl`, 'PATCH', {
        value: mode,
      });

      console.log(`[Cloudflare] SSL mode set to ${mode} for zone ${zoneId}`);
    } catch (error) {
      console.error('[Cloudflare] Error configuring SSL:', error);
      throw error;
    }
  }

  /**
   * Enable automatic HTTPS rewrites
   * Rewrites HTTP URLs to HTTPS
   */
  async enableAutoHTTPS(zoneId: string): Promise<void> {
    try {
      await this.makeRequest(`/zones/${zoneId}/settings/automatic_https_rewrites`, 'PATCH', {
        value: 'on',
      });

      console.log(`[Cloudflare] Automatic HTTPS enabled for zone ${zoneId}`);
    } catch (error) {
      console.error('[Cloudflare] Error enabling automatic HTTPS:', error);
      throw error;
    }
  }

  /**
   * Enable Always Use HTTPS
   * Redirects all HTTP requests to HTTPS
   */
  async enableAlwaysUseHTTPS(zoneId: string): Promise<void> {
    try {
      await this.makeRequest(`/zones/${zoneId}/settings/always_use_https`, 'PATCH', {
        value: 'on',
      });

      console.log(`[Cloudflare] Always Use HTTPS enabled for zone ${zoneId}`);
    } catch (error) {
      console.error('[Cloudflare] Error enabling Always Use HTTPS:', error);
      throw error;
    }
  }

  /**
   * Set up standard DNS records for a new site
   * Points domain to Heroku or other hosting provider
   */
  async setupStandardRecords(
    zoneId: string,
    options: {
      rootTarget: string; // Where @ should point (e.g., Heroku hostname)
      wwwTarget?: string; // Where www should point (defaults to rootTarget)
      enableWWW?: boolean; // Create www CNAME
      proxied?: boolean; // Whether to enable Cloudflare proxy (default: true)
    }
  ): Promise<void> {
    try {
      const proxied = options.proxied !== false;
      const records: DNSRecord[] = [];

      // Root domain - use CNAME if possible, otherwise A record
      if (options.rootTarget.includes('.')) {
        // CNAME for root (some hosts support this via ALIAS/ANAME)
        records.push({
          type: 'CNAME',
          name: '@',
          content: options.rootTarget,
          proxied,
        });
      } else {
        // A record (IP address)
        records.push({
          type: 'A',
          name: '@',
          content: options.rootTarget,
          proxied,
        });
      }

      // WWW subdomain
      if (options.enableWWW !== false) {
        records.push({
          type: 'CNAME',
          name: 'www',
          content: options.wwwTarget || options.rootTarget,
          proxied,
        });
      }

      for (const record of records) {
        await this.createDNSRecord(zoneId, record);
      }

      console.log(`[Cloudflare] Standard DNS records created for zone ${zoneId}`);
    } catch (error) {
      console.error('[Cloudflare] Error setting up standard records:', error);
      throw error;
    }
  }

  /**
   * Get SSL certificate status
   */
  async getSSLStatus(zoneId: string): Promise<{
    status: string;
    certificates: Array<{
      id: string;
      hosts: string[];
      expires: Date;
    }>;
  }> {
    try {
      const certs = await this.makeRequest<any[]>(`/zones/${zoneId}/ssl/certificate_packs`, 'GET');

      return {
        status: certs.length > 0 ? 'active' : 'pending',
        certificates: certs.map((cert) => ({
          id: cert.id,
          hosts: cert.hosts || [],
          expires: new Date(cert.expires_on),
        })),
      };
    } catch (error) {
      console.error('[Cloudflare] Error getting SSL status:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Cloudflare API
   * Supports both API Token and Global API Key authentication
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body?: any,
    queryParams?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    // Build headers based on authentication method
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey && this.email) {
      // Use Global API Key authentication
      headers['X-Auth-Email'] = this.email;
      headers['X-Auth-Key'] = this.apiKey;
    } else if (this.apiToken) {
      // Use API Token authentication
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as CloudflareResponse<T>;

    if (!response.ok) {
      // Extract detailed error from response body
      const errorMessage =
        data.errors?.map((e) => `[${e.code}] ${e.message}`).join(', ') ||
        `${response.status} ${response.statusText}`;
      throw new Error(`Cloudflare API error: ${errorMessage}`);
    }

    if (!data.success) {
      const errorMessage =
        data.errors.map((e) => `[${e.code}] ${e.message}`).join(', ') || 'Unknown error';
      throw new Error(`Cloudflare API error: ${errorMessage}`);
    }

    return data.result;
  }

  /**
   * Add Google Site Verification TXT record
   * Used for verifying domain ownership in Google Search Console
   * @param zoneId - Cloudflare zone ID
   * @param verificationToken - Token from Google Site Verification API
   */
  async addGoogleVerificationRecord(
    zoneId: string,
    verificationToken: string
  ): Promise<{ id: string }> {
    try {
      // First get the zone to know the domain name
      const zone = await this.getZoneById(zoneId);
      const domainName = zone.name;

      // Check if a Google verification record already exists
      // Cloudflare returns full domain name for root records, not '@'
      const existingRecords = await this.listDNSRecords(zoneId);

      // Debug logging
      const txtRecords = existingRecords.filter((r) => r.type === 'TXT');
      console.log(`[Cloudflare] Found ${txtRecords.length} TXT records for zone ${domainName}`);
      txtRecords.forEach((r) => {
        console.log(
          `[Cloudflare] TXT: name="${r.name}" content="${r.content.substring(0, 50)}..."`
        );
      });

      const existingGoogleTxt = existingRecords.find(
        (r) =>
          r.type === 'TXT' &&
          (r.name === domainName || r.name === '@' || r.name === '') &&
          r.content.startsWith('google-site-verification=')
      );

      console.log(`[Cloudflare] existingGoogleTxt found: ${!!existingGoogleTxt}`);

      // Google returns the full verification string, so don't add the prefix again
      const txtContent = verificationToken.startsWith('google-site-verification=')
        ? verificationToken
        : `google-site-verification=${verificationToken}`;

      if (existingGoogleTxt) {
        // Check if content is the same - if so, no update needed
        if (existingGoogleTxt.content === txtContent) {
          console.log(
            `[Cloudflare] Google verification TXT record already exists with correct token`
          );
          return { id: existingGoogleTxt.id };
        }
        // Update existing record with new token
        await this.updateDNSRecord(zoneId, existingGoogleTxt.id, {
          type: 'TXT',
          name: '@',
          content: txtContent,
          ttl: 1, // Auto
        });
        console.log(`[Cloudflare] Updated Google verification TXT record`);
        return { id: existingGoogleTxt.id };
      }

      // Create new TXT record
      const result = await this.createDNSRecord(zoneId, {
        type: 'TXT',
        name: '@',
        content: txtContent,
        ttl: 1, // Auto (fastest propagation)
      });

      console.log(`[Cloudflare] Added Google verification TXT record: ${verificationToken}`);
      return result;
    } catch (error) {
      console.error('[Cloudflare] Error adding Google verification record:', error);
      throw error;
    }
  }

  /**
   * Wait for DNS propagation
   * Polls until the DNS records are live
   */
  async waitForDNSPropagation(
    domain: string,
    maxWaitMs: number = 300000 // 5 minutes
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Simple check: can we resolve the domain?
        const response = await fetch(`https://${domain}`, {
          method: 'HEAD',
          redirect: 'manual',
        });

        if (response.ok || response.status === 301 || response.status === 302) {
          console.log(`[Cloudflare] DNS propagated for ${domain}`);
          return true;
        }
      } catch (error) {
        // Expected during propagation
      }

      // Wait 10 seconds before next check
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    console.warn(`[Cloudflare] DNS propagation timeout for ${domain}`);
    return false;
  }
}
