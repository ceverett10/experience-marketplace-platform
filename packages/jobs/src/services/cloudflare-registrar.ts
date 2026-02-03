/**
 * Cloudflare Registrar Service
 * Handles domain registration via Cloudflare Registrar API
 *
 * API Documentation: https://developers.cloudflare.com/registrar/
 * Benefits:
 * - No IP whitelisting required (unlike Namecheap)
 * - At-cost domain pricing
 * - Automatic DNS/SSL integration
 * - WHOIS privacy included free
 */

interface CloudflareRegistrarCredentials {
  apiToken?: string;
  apiKey?: string;
  email?: string;
  accountId: string;
}

interface DomainAvailability {
  domain: string;
  available: boolean;
  premium: boolean;
  price?: number;
  currency?: string;
}

interface DomainRegistration {
  domain: string;
  orderId: string;
  transactionId: string;
  cost: number;
  registeredAt: Date;
  expiresAt: Date;
  autoRenew: boolean;
}

interface RegistrarDomain {
  id: string;
  name: string;
  status: string;
  expiresAt: Date;
  autoRenew: boolean;
  locked: boolean;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: T;
}

// Standard TLD pricing at Cloudflare (at-cost pricing)
const CLOUDFLARE_TLD_PRICING: Record<string, number> = {
  com: 9.77,
  net: 10.77,
  org: 9.77,
  co: 11.77,
  io: 33.77,
  dev: 12.77,
  app: 14.77,
  xyz: 9.77,
  info: 9.77,
  biz: 12.77,
  us: 9.77,
  me: 9.77,
  tv: 32.77,
  uk: 9.77,
  de: 9.77,
  fr: 9.77,
  nl: 9.77,
  eu: 9.77,
  ca: 12.77,
  au: 15.77,
};

export class CloudflareRegistrarService {
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';
  private readonly apiToken?: string;
  private readonly apiKey?: string;
  private readonly email?: string;
  private readonly accountId: string;

  constructor(credentials?: CloudflareRegistrarCredentials) {
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

    if (!accountId) {
      throw new Error(
        'Cloudflare Account ID not found. Set CLOUDFLARE_ACCOUNT_ID environment variable.'
      );
    }

    this.apiToken = apiToken;
    this.apiKey = apiKey;
    this.email = email;
    this.accountId = accountId;
  }

  /**
   * Check if a domain is available for registration
   * Uses DNS lookup to check if domain is already registered
   */
  async checkAvailability(domain: string): Promise<DomainAvailability> {
    try {
      console.log(`[Cloudflare Registrar] Checking availability for ${domain}`);

      // Check if TLD is supported by Cloudflare Registrar
      const tld = domain.split('.').slice(1).join('.').toLowerCase();
      const isSupportedTLD = CLOUDFLARE_TLD_PRICING[tld] !== undefined;

      if (!isSupportedTLD) {
        console.log(`[Cloudflare Registrar] TLD .${tld} is not supported by Cloudflare Registrar`);
        return {
          domain,
          available: false,
          premium: false,
          price: this.getStandardTLDPrice(domain),
        };
      }

      // Check if domain already exists in our Cloudflare account
      try {
        const existingDomain = await this.getDomainInfo(domain);
        if (existingDomain) {
          console.log(`[Cloudflare Registrar] ${domain} is already in our account`);
          return {
            domain,
            available: false,
            premium: false,
            price: this.getStandardTLDPrice(domain),
          };
        }
      } catch (e) {
        // Domain not in our account - this is expected for available domains
      }

      // Use DNS lookup to check if domain is registered anywhere
      // If DNS resolves, domain is taken; if it doesn't resolve, it might be available
      let dnsResolved = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`https://dns.google/resolve?name=${domain}&type=A`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = (await response.json()) as {
          Answer?: Array<{ type: number; name: string; data: string }>;
          Authority?: Array<{ type: number; name: string }>;
        };
        // If we get Answer records, domain is registered
        dnsResolved = !!(data.Answer && data.Answer.length > 0);

        // Also check if there's an authority section (domain exists but no A record)
        if (!dnsResolved && data.Authority && data.Authority.length > 0) {
          // Check if it's a real authority or NXDOMAIN
          const authority = data.Authority[0];
          if (authority && authority.type !== 6) {
            // 6 = SOA (indicates domain doesn't exist)
            dnsResolved = true;
          }
        }
      } catch (e) {
        // DNS lookup failed - assume domain might be available
        console.log(
          `[Cloudflare Registrar] DNS lookup failed for ${domain}, assuming potentially available`
        );
      }

      const available = !dnsResolved;
      const price = this.getStandardTLDPrice(domain);

      console.log(`[Cloudflare Registrar] ${domain}: available=${available}, price=$${price}`);

      return {
        domain,
        available,
        premium: false,
        price,
        currency: 'USD',
      };
    } catch (error: any) {
      console.error('[Cloudflare Registrar] Error checking availability:', error);

      // If the check fails, return unavailable with estimated price
      return {
        domain,
        available: false,
        premium: false,
        price: this.getStandardTLDPrice(domain),
      };
    }
  }

  /**
   * Get standard pricing for TLDs
   * Cloudflare offers at-cost pricing
   */
  private getStandardTLDPrice(domain: string): number {
    const tld = domain.split('.').slice(1).join('.').toLowerCase();
    return CLOUDFLARE_TLD_PRICING[tld] ?? 12.0; // Default to $12 for unknown TLDs
  }

  /**
   * Check availability for multiple domains at once
   */
  async checkBulkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    console.log(`[Cloudflare Registrar] Checking bulk availability for ${domains.length} domains`);

    // Check each domain individually
    const results: DomainAvailability[] = [];
    for (const domain of domains) {
      const availability = await this.checkAvailability(domain);
      results.push(availability);
    }
    return results;
  }

  /**
   * Register a new domain
   */
  async registerDomain(
    domain: string,
    years: number = 1,
    autoRenew: boolean = true
  ): Promise<DomainRegistration> {
    try {
      console.log(`[Cloudflare Registrar] Registering ${domain} for ${years} year(s)`);

      // First check if available
      const availability = await this.checkAvailability(domain);
      if (!availability.available) {
        throw new Error(`Domain ${domain} is not available for registration`);
      }

      // Register the domain using the correct Cloudflare API endpoint
      // POST /accounts/{account_id}/registrar/domains/{domain_name}/register
      const response = await this.makeRequest<{
        id: string;
        name: string;
        status: string;
        expires_at: string;
        auto_renew: boolean;
        registrant_contact: any;
      }>(`/accounts/${this.accountId}/registrar/domains/${domain}/register`, 'POST', {
        auto_renew: autoRenew,
        locked: true, // Enable registrar lock by default
        privacy: true, // Enable WHOIS privacy (free with Cloudflare)
      });

      const registeredAt = new Date();
      const expiresAt = response.expires_at
        ? new Date(response.expires_at)
        : new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000);

      const cost = availability.price || this.getStandardTLDPrice(domain);

      console.log(`[Cloudflare Registrar] Domain ${domain} registered successfully`);

      return {
        domain,
        orderId: response.id || `cf-${Date.now()}`,
        transactionId: response.id || `cf-tx-${Date.now()}`,
        cost,
        registeredAt,
        expiresAt,
        autoRenew,
      };
    } catch (error: any) {
      console.error('[Cloudflare Registrar] Error registering domain:', error);
      throw error;
    }
  }

  /**
   * Get domain information
   * Note: Cloudflare returns basic info (name, supported_tld) for ANY domain,
   * but only returns id, status, expires_at for domains actually registered
   */
  async getDomainInfo(domain: string): Promise<RegistrarDomain | null> {
    try {
      const response = await this.makeRequest<{
        id?: string;
        name: string;
        status?: string;
        expires_at?: string;
        auto_renew?: boolean;
        locked?: boolean;
        supported_tld?: boolean;
      }>(`/accounts/${this.accountId}/registrar/domains/${domain}`, 'GET');

      // Check if the domain is actually registered (has an id and status)
      // Cloudflare returns {name, supported_tld} for any valid domain name
      if (!response.id || !response.status) {
        return null;
      }

      return {
        id: response.id,
        name: response.name,
        status: response.status,
        expiresAt: response.expires_at ? new Date(response.expires_at) : new Date(),
        autoRenew: response.auto_renew ?? false,
        locked: response.locked ?? false,
      };
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        return null;
      }
      console.error('[Cloudflare Registrar] Error getting domain info:', error);
      throw error;
    }
  }

  /**
   * List all domains registered with Cloudflare Registrar
   */
  async listDomains(): Promise<RegistrarDomain[]> {
    try {
      const response = await this.makeRequest<
        Array<{
          id: string;
          name: string;
          status: string;
          expires_at: string;
          auto_renew: boolean;
          locked: boolean;
        }>
      >(`/accounts/${this.accountId}/registrar/domains`, 'GET');

      return response.map((domain) => ({
        id: domain.id,
        name: domain.name,
        status: domain.status,
        expiresAt: new Date(domain.expires_at),
        autoRenew: domain.auto_renew,
        locked: domain.locked,
      }));
    } catch (error) {
      console.error('[Cloudflare Registrar] Error listing domains:', error);
      throw error;
    }
  }

  /**
   * Update domain settings (auto-renew, lock status)
   */
  async updateDomain(
    domain: string,
    settings: {
      autoRenew?: boolean;
      locked?: boolean;
    }
  ): Promise<void> {
    try {
      const updates: Record<string, any> = {};
      if (settings.autoRenew !== undefined) updates['auto_renew'] = settings.autoRenew;
      if (settings.locked !== undefined) updates['locked'] = settings.locked;

      await this.makeRequest(
        `/accounts/${this.accountId}/registrar/domains/${domain}`,
        'PUT',
        updates
      );

      console.log(`[Cloudflare Registrar] Domain ${domain} updated:`, settings);
    } catch (error) {
      console.error('[Cloudflare Registrar] Error updating domain:', error);
      throw error;
    }
  }

  /**
   * Enable auto-renewal for a domain
   */
  async enableAutoRenew(domain: string): Promise<void> {
    await this.updateDomain(domain, { autoRenew: true });
  }

  /**
   * Get renewal price for a domain
   */
  async getRenewalPrice(domain: string): Promise<number> {
    // Cloudflare offers at-cost pricing for renewals too
    return this.getStandardTLDPrice(domain);
  }

  /**
   * Make authenticated request to Cloudflare API
   * Supports both API Token and Global API Key authentication
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Build headers based on authentication method
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey && this.email) {
      // Use Global API Key authentication (required for Registrar API)
      headers['X-Auth-Email'] = this.email;
      headers['X-Auth-Key'] = this.apiKey;
    } else if (this.apiToken) {
      // Use API Token authentication
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as CloudflareResponse<T>;

    if (!response.ok || !data.success) {
      const errorMessage =
        data.errors?.map((e) => `[${e.code}] ${e.message}`).join(', ') ||
        `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`Cloudflare Registrar API error: ${errorMessage}`);
    }

    return data.result;
  }
}
