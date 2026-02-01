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
  apiToken: string;
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
  private readonly apiToken: string;
  private readonly accountId: string;

  constructor(credentials?: CloudflareRegistrarCredentials) {
    const apiToken = credentials?.apiToken || process.env['CLOUDFLARE_API_TOKEN'];
    const accountId = credentials?.accountId || process.env['CLOUDFLARE_ACCOUNT_ID'];

    if (!apiToken) {
      throw new Error(
        'Cloudflare API token not found. Set CLOUDFLARE_API_TOKEN environment variable.'
      );
    }

    if (!accountId) {
      throw new Error(
        'Cloudflare Account ID not found. Set CLOUDFLARE_ACCOUNT_ID environment variable.'
      );
    }

    this.apiToken = apiToken;
    this.accountId = accountId;
  }

  /**
   * Check if a domain is available for registration
   */
  async checkAvailability(domain: string): Promise<DomainAvailability> {
    try {
      console.log(`[Cloudflare Registrar] Checking availability for ${domain}`);

      // Use the domains check endpoint
      const response = await this.makeRequest<{
        domains: Array<{
          name: string;
          available: boolean;
          can_register: boolean;
          premium: boolean;
          supported_tld: boolean;
        }>;
      }>(
        `/accounts/${this.accountId}/registrar/domains/check`,
        'POST',
        { domains: [domain] }
      );

      const domainResult = response.domains?.[0];

      if (!domainResult) {
        // If no result, try to get the price from our pricing table
        const tld = domain.split('.').slice(1).join('.').toLowerCase();
        const isSupportedTLD = CLOUDFLARE_TLD_PRICING[tld] !== undefined;

        return {
          domain,
          available: false,
          premium: false,
          price: this.getStandardTLDPrice(domain),
        };
      }

      const available = domainResult.available && domainResult.can_register;
      const premium = domainResult.premium || false;
      const price = this.getStandardTLDPrice(domain);

      console.log(
        `[Cloudflare Registrar] ${domain}: available=${available}, premium=${premium}, price=$${price}`
      );

      return {
        domain,
        available,
        premium,
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
    try {
      console.log(`[Cloudflare Registrar] Checking bulk availability for ${domains.length} domains`);

      const response = await this.makeRequest<{
        domains: Array<{
          name: string;
          available: boolean;
          can_register: boolean;
          premium: boolean;
          supported_tld: boolean;
        }>;
      }>(
        `/accounts/${this.accountId}/registrar/domains/check`,
        'POST',
        { domains }
      );

      return (response.domains || []).map((result) => ({
        domain: result.name,
        available: result.available && result.can_register,
        premium: result.premium || false,
        price: this.getStandardTLDPrice(result.name),
        currency: 'USD',
      }));
    } catch (error) {
      console.error('[Cloudflare Registrar] Error checking bulk availability:', error);
      // Return all as unavailable on error
      return domains.map((domain) => ({
        domain,
        available: false,
        premium: false,
        price: this.getStandardTLDPrice(domain),
      }));
    }
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

      // Register the domain
      const response = await this.makeRequest<{
        id: string;
        name: string;
        status: string;
        expires_at: string;
        auto_renew: boolean;
        registrant_contact: any;
      }>(
        `/accounts/${this.accountId}/registrar/domains`,
        'POST',
        {
          name: domain,
          auto_renew: autoRenew,
          locked: true, // Enable registrar lock by default
          privacy: true, // Enable WHOIS privacy (free with Cloudflare)
        }
      );

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
   */
  async getDomainInfo(domain: string): Promise<RegistrarDomain | null> {
    try {
      const response = await this.makeRequest<{
        id: string;
        name: string;
        status: string;
        expires_at: string;
        auto_renew: boolean;
        locked: boolean;
      }>(
        `/accounts/${this.accountId}/registrar/domains/${domain}`,
        'GET'
      );

      return {
        id: response.id,
        name: response.name,
        status: response.status,
        expiresAt: new Date(response.expires_at),
        autoRenew: response.auto_renew,
        locked: response.locked,
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
      >(
        `/accounts/${this.accountId}/registrar/domains`,
        'GET'
      );

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
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
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
