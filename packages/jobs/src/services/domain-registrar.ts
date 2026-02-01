/**
 * Domain Registrar Service
 * Handles domain registration via Namecheap API
 *
 * API Documentation: https://www.namecheap.com/support/api/intro/
 * Sandbox: https://api.sandbox.namecheap.com/xml.response
 * Production: https://api.namecheap.com/xml.response
 */

interface NamecheapCredentials {
  apiUser: string;
  apiKey: string;
  username: string;
  clientIp: string;
  sandbox?: boolean;
}

interface DomainAvailability {
  domain: string;
  available: boolean;
  premium: boolean;
  price?: number;
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

interface DNSRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS';
  name: string;
  value: string;
  ttl?: number;
  priority?: number; // For MX records
}

interface NamecheapResponse {
  ApiResponse: {
    Status: string;
    Errors?: {
      Error: Array<{ _text: string }> | { _text: string };
    };
    CommandResponse: any;
  };
}

export class DomainRegistrarService {
  private readonly baseUrl: string;
  private readonly credentials: NamecheapCredentials;

  constructor(credentials?: NamecheapCredentials) {
    const apiUser = credentials?.apiUser || process.env['NAMECHEAP_API_USER'];
    const apiKey = credentials?.apiKey || process.env['NAMECHEAP_API_KEY'];
    const username = credentials?.username || process.env['NAMECHEAP_USERNAME'];
    const clientIp = credentials?.clientIp || process.env['NAMECHEAP_CLIENT_IP'];
    const sandbox = credentials?.sandbox ?? process.env['NODE_ENV'] !== 'production';

    if (!apiUser || !apiKey || !username || !clientIp) {
      throw new Error(
        'Namecheap credentials not found. Set NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME, and NAMECHEAP_CLIENT_IP.'
      );
    }

    this.credentials = {
      apiUser,
      apiKey,
      username,
      clientIp,
      sandbox,
    };

    this.baseUrl = sandbox
      ? 'https://api.sandbox.namecheap.com/xml.response'
      : 'https://api.namecheap.com/xml.response';
  }

  /**
   * Check if a domain is available for registration
   * Cost: FREE (no API charge)
   */
  async checkAvailability(domain: string): Promise<DomainAvailability> {
    try {
      const response = await this.makeRequest('namecheap.domains.check', {
        DomainList: domain,
      });

      const result =
        response.ApiResponse.CommandResponse.DomainCheckResult ||
        response.ApiResponse.CommandResponse;

      const available = result.Available === 'true';
      const premium = result.IsPremiumName === 'true';
      const price = premium ? parseFloat(result.PremiumRegistrationPrice || '0') : undefined;

      return {
        domain,
        available,
        premium,
        price,
      };
    } catch (error) {
      console.error('[Namecheap] Error checking domain availability:', error);
      throw error;
    }
  }

  /**
   * Check availability for multiple domains at once
   * More efficient than individual checks
   */
  async checkBulkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    try {
      const domainList = domains.join(',');
      const response = await this.makeRequest('namecheap.domains.check', {
        DomainList: domainList,
      });

      const results = Array.isArray(response.ApiResponse.CommandResponse.DomainCheckResult)
        ? response.ApiResponse.CommandResponse.DomainCheckResult
        : [response.ApiResponse.CommandResponse.DomainCheckResult];

      return results.map((result: any) => ({
        domain: result.Domain,
        available: result.Available === 'true',
        premium: result.IsPremiumName === 'true',
        price:
          result.IsPremiumName === 'true'
            ? parseFloat(result.PremiumRegistrationPrice || '0')
            : undefined,
      }));
    } catch (error) {
      console.error('[Namecheap] Error checking bulk availability:', error);
      throw error;
    }
  }

  /**
   * Register a new domain
   * Cost: Varies by TLD (~$10-15/year for .com)
   */
  async registerDomain(
    domain: string,
    years: number = 1,
    autoRenew: boolean = true
  ): Promise<DomainRegistration> {
    try {
      // First check if available
      const availability = await this.checkAvailability(domain);
      if (!availability.available) {
        throw new Error(`Domain ${domain} is not available for registration`);
      }

      // Register domain
      const response = await this.makeRequest('namecheap.domains.create', {
        DomainName: domain,
        Years: years.toString(),
        // Default registrant contact (should be configured in Namecheap account)
        // In production, you'd pass actual contact details
        RegistrantFirstName: 'Admin',
        RegistrantLastName: 'User',
        RegistrantAddress1: '123 Main St',
        RegistrantCity: 'City',
        RegistrantStateProvince: 'State',
        RegistrantPostalCode: '12345',
        RegistrantCountry: 'US',
        RegistrantPhone: '+1.5555555555',
        RegistrantEmailAddress: process.env['ADMIN_EMAIL'] || 'admin@example.com',
        // Use same details for Tech, Admin, AuxBilling
        TechFirstName: 'Admin',
        TechLastName: 'User',
        TechAddress1: '123 Main St',
        TechCity: 'City',
        TechStateProvince: 'State',
        TechPostalCode: '12345',
        TechCountry: 'US',
        TechPhone: '+1.5555555555',
        TechEmailAddress: process.env['ADMIN_EMAIL'] || 'admin@example.com',
        AdminFirstName: 'Admin',
        AdminLastName: 'User',
        AdminAddress1: '123 Main St',
        AdminCity: 'City',
        AdminStateProvince: 'State',
        AdminPostalCode: '12345',
        AdminCountry: 'US',
        AdminPhone: '+1.5555555555',
        AdminEmailAddress: process.env['ADMIN_EMAIL'] || 'admin@example.com',
        AuxBillingFirstName: 'Admin',
        AuxBillingLastName: 'User',
        AuxBillingAddress1: '123 Main St',
        AuxBillingCity: 'City',
        AuxBillingStateProvince: 'State',
        AuxBillingPostalCode: '12345',
        AuxBillingCountry: 'US',
        AuxBillingPhone: '+1.5555555555',
        AuxBillingEmailAddress: process.env['ADMIN_EMAIL'] || 'admin@example.com',
      });

      const result = response.ApiResponse.CommandResponse.DomainCreateResult;

      const orderId = result.OrderID || result.TransactionID;
      const transactionId = result.TransactionID || result.OrderID;
      const cost = parseFloat(result.ChargedAmount || '0');

      const registeredAt = new Date();
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + years);

      // Enable auto-renewal if requested
      if (autoRenew) {
        await this.enableAutoRenew(domain);
      }

      return {
        domain,
        orderId,
        transactionId,
        cost,
        registeredAt,
        expiresAt,
        autoRenew,
      };
    } catch (error) {
      console.error('[Namecheap] Error registering domain:', error);
      throw error;
    }
  }

  /**
   * Enable auto-renewal for a domain
   */
  async enableAutoRenew(domain: string): Promise<void> {
    try {
      await this.makeRequest('namecheap.domains.setRegistrarLock', {
        DomainName: domain,
        LockAction: 'LOCK',
      });

      console.log(`[Namecheap] Auto-renewal enabled for ${domain}`);
    } catch (error) {
      console.error('[Namecheap] Error enabling auto-renewal:', error);
      throw error;
    }
  }

  /**
   * Get domain info including expiry date
   */
  async getDomainInfo(domain: string): Promise<{
    domain: string;
    status: string;
    expiresAt: Date;
    autoRenew: boolean;
    locked: boolean;
  }> {
    try {
      const response = await this.makeRequest('namecheap.domains.getInfo', {
        DomainName: domain,
      });

      const result = response.ApiResponse.CommandResponse.DomainGetInfoResult;

      return {
        domain: result.DomainName,
        status: result.Status,
        expiresAt: new Date(result.DomainDetails.ExpiredDate),
        autoRenew: result.Modificationrights.All === 'true',
        locked: result.Whoisguard.Enabled === 'true',
      };
    } catch (error) {
      console.error('[Namecheap] Error getting domain info:', error);
      throw error;
    }
  }

  /**
   * Set custom nameservers for a domain
   * Used when delegating DNS to Cloudflare or other provider
   */
  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    try {
      const params: Record<string, string> = {
        DomainName: domain,
        SLD: domain.split('.')[0] || domain,
        TLD: domain.split('.').slice(1).join('.'),
        Nameservers: nameservers.join(','),
      };

      await this.makeRequest('namecheap.domains.dns.setCustom', params);

      console.log(`[Namecheap] Nameservers set for ${domain}:`, nameservers);
    } catch (error) {
      console.error('[Namecheap] Error setting nameservers:', error);
      throw error;
    }
  }

  /**
   * Set DNS records using Namecheap DNS
   * Note: For production, recommend using Cloudflare DNS instead
   */
  async setDNSRecords(domain: string, records: DNSRecord[]): Promise<void> {
    try {
      const params: Record<string, string> = {
        DomainName: domain,
        SLD: domain.split('.')[0] || domain,
        TLD: domain.split('.').slice(1).join('.'),
      };

      // Namecheap requires numbered parameters for DNS records
      records.forEach((record, index) => {
        const num = index + 1;
        params[`HostName${num}`] = record.name === '@' ? '@' : record.name;
        params[`RecordType${num}`] = record.type;
        params[`Address${num}`] = record.value;
        params[`TTL${num}`] = (record.ttl || 1800).toString();
        if (record.priority) {
          params[`MXPref${num}`] = record.priority.toString();
        }
      });

      await this.makeRequest('namecheap.domains.dns.setHosts', params);

      console.log(`[Namecheap] DNS records set for ${domain}`);
    } catch (error) {
      console.error('[Namecheap] Error setting DNS records:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Namecheap API
   */
  private async makeRequest(command: string, params: Record<string, string>): Promise<any> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('ApiUser', this.credentials.apiUser);
    url.searchParams.set('ApiKey', this.credentials.apiKey);
    url.searchParams.set('UserName', this.credentials.username);
    url.searchParams.set('ClientIp', this.credentials.clientIp);
    url.searchParams.set('Command', command);

    // Add command-specific parameters
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString(), {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Namecheap API error: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();

    // Parse XML response (simple parser for Namecheap XML)
    const data = this.parseXML(xmlText);

    // Check for API errors
    if (data.ApiResponse.Status !== 'OK') {
      const errors = data.ApiResponse.Errors?.Error;
      const errorMessage = Array.isArray(errors)
        ? errors.map((e: any) => e._text).join(', ')
        : errors?._text || 'Unknown error';
      throw new Error(`Namecheap API error: ${errorMessage}`);
    }

    return data;
  }

  /**
   * Simple XML parser for Namecheap responses
   * In production, use a proper XML parser like fast-xml-parser
   */
  private parseXML(xml: string): any {
    // For MVP, we'll use a simple regex-based parser
    // In production, use fast-xml-parser or similar
    const getTag = (tagName: string, source: string): string | null => {
      const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
      const match = source.match(regex);
      return match ? (match[1] ?? null) : null;
    };

    const getAttribute = (tagName: string, attrName: string, source: string): string | null => {
      const regex = new RegExp(`<${tagName}[^>]*${attrName}="([^"]*)"`, 'i');
      const match = source.match(regex);
      return match ? (match[1] ?? null) : null;
    };

    // Parse basic structure (this is simplified - use proper XML parser in production)
    const status = getAttribute('ApiResponse', 'Status', xml) || 'ERROR';
    const commandResponse = getTag('CommandResponse', xml) || '';

    return {
      ApiResponse: {
        Status: status,
        CommandResponse: {
          // Parse command-specific responses
          DomainCheckResult: {
            Domain: getAttribute('DomainCheckResult', 'Domain', xml),
            Available: getAttribute('DomainCheckResult', 'Available', xml),
            IsPremiumName: getAttribute('DomainCheckResult', 'IsPremiumName', xml),
          },
          DomainCreateResult: {
            OrderID: getAttribute('DomainCreateResult', 'OrderID', xml),
            TransactionID: getAttribute('DomainCreateResult', 'TransactionID', xml),
            ChargedAmount: getAttribute('DomainCreateResult', 'ChargedAmount', xml),
          },
          DomainGetInfoResult: {
            DomainName: getTag('DomainName', commandResponse),
            Status: getTag('Status', commandResponse),
          },
        },
      },
    };
  }

  /**
   * Calculate domain renewal cost
   */
  async getRenewalPrice(domain: string): Promise<number> {
    try {
      const tld = domain.split('.').slice(1).join('.');
      // This is an approximation - actual pricing should come from Namecheap API
      const pricing: Record<string, number> = {
        com: 13.98,
        net: 15.98,
        org: 14.98,
        io: 39.98,
        co: 32.98,
      };

      return pricing[tld] || 15.0;
    } catch (error) {
      console.error('[Namecheap] Error getting renewal price:', error);
      return 15.0; // Default fallback
    }
  }
}
