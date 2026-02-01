/**
 * SSL Certificate Service
 * Handles SSL provisioning via Cloudflare's automatic SSL
 *
 * Cloudflare provides free SSL certificates automatically when:
 * 1. Domain is added to Cloudflare
 * 2. DNS is proxied through Cloudflare
 * 3. SSL/TLS mode is configured
 *
 * This eliminates the need for manual Let's Encrypt ACME protocol implementation
 */

import { CloudflareDNSService } from './cloudflare-dns';

interface SSLCertificate {
  id: string;
  domain: string;
  hosts: string[];
  issuer: string;
  status: 'active' | 'pending' | 'expired' | 'failed';
  issuedAt: Date;
  expiresAt: Date;
  autoRenew: boolean;
}

interface SSLProvisionResult {
  success: boolean;
  certificate?: SSLCertificate;
  error?: string;
  provisionedAt: Date;
}

export class SSLService {
  private cloudflare: CloudflareDNSService;

  constructor(cloudflare?: CloudflareDNSService) {
    this.cloudflare = cloudflare || new CloudflareDNSService();
  }

  /**
   * Provision SSL certificate for a domain
   * Uses Cloudflare's automatic SSL - no manual ACME protocol needed
   *
   * Process:
   * 1. Ensure domain is in Cloudflare
   * 2. Configure SSL/TLS settings
   * 3. Enable proxy (triggers automatic certificate issuance)
   * 4. Wait for certificate to be active
   */
  async provisionCertificate(
    domain: string,
    options: {
      zoneId?: string;
      sslMode?: 'off' | 'flexible' | 'full' | 'strict';
      enableAutoHTTPS?: boolean;
      enableAlwaysUseHTTPS?: boolean;
    } = {}
  ): Promise<SSLProvisionResult> {
    try {
      console.log(`[SSL] Provisioning certificate for ${domain}...`);

      // 1. Get or validate zone
      const zone = options.zoneId
        ? await this.cloudflare.getZoneById(options.zoneId)
        : await this.cloudflare.getZone(domain);

      if (!zone) {
        throw new Error(`Domain ${domain} not found in Cloudflare. Add it first.`);
      }

      console.log(`[SSL] Domain ${domain} found in Cloudflare (zone: ${zone.id})`);

      // 2. Configure SSL/TLS mode
      const sslMode = options.sslMode || 'full';
      await this.cloudflare.configureSSL(zone.id, sslMode);
      console.log(`[SSL] SSL mode set to ${sslMode}`);

      // 3. Enable automatic HTTPS features
      if (options.enableAutoHTTPS !== false) {
        await this.cloudflare.enableAutoHTTPS(zone.id);
        console.log('[SSL] Automatic HTTPS rewrites enabled');
      }

      if (options.enableAlwaysUseHTTPS !== false) {
        await this.cloudflare.enableAlwaysUseHTTPS(zone.id);
        console.log('[SSL] Always Use HTTPS enabled');
      }

      // 4. Enable proxy to trigger certificate issuance
      await this.cloudflare.enableProxy(zone.id);
      console.log('[SSL] Cloudflare proxy enabled, certificate issuance triggered');

      // 5. Wait for certificate to be issued (usually < 5 minutes)
      const certificate = await this.waitForCertificate(zone.id, domain);

      if (!certificate) {
        return {
          success: false,
          error: 'Certificate issuance timeout (>15 minutes)',
          provisionedAt: new Date(),
        };
      }

      console.log(`[SSL] Certificate issued for ${domain} (expires: ${certificate.expiresAt})`);

      return {
        success: true,
        certificate,
        provisionedAt: new Date(),
      };
    } catch (error) {
      console.error('[SSL] Error provisioning certificate:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provisionedAt: new Date(),
      };
    }
  }

  /**
   * Get certificate status for a domain
   */
  async getCertificateStatus(domain: string, zoneId?: string): Promise<SSLCertificate | null> {
    try {
      const zone = zoneId
        ? await this.cloudflare.getZoneById(zoneId)
        : await this.cloudflare.getZone(domain);

      if (!zone) {
        return null;
      }

      const sslStatus = await this.cloudflare.getSSLStatus(zone.id);

      if (sslStatus.certificates.length === 0) {
        return null;
      }

      // Get the most recent certificate
      const cert = sslStatus.certificates.reduce((latest, current) =>
        current.expires > latest.expires ? current : latest
      );

      return {
        id: cert.id,
        domain,
        hosts: cert.hosts,
        issuer: 'Cloudflare',
        status: sslStatus.status === 'active' ? 'active' : 'pending',
        issuedAt: new Date(), // Cloudflare doesn't provide issue date
        expiresAt: cert.expires,
        autoRenew: true, // Cloudflare auto-renews
      };
    } catch (error) {
      console.error('[SSL] Error getting certificate status:', error);
      return null;
    }
  }

  /**
   * Check if certificate is expiring soon (< 30 days)
   */
  async isCertificateExpiringSoon(domain: string, zoneId?: string): Promise<boolean> {
    try {
      const cert = await this.getCertificateStatus(domain, zoneId);

      if (!cert) {
        return true; // No certificate = needs renewal
      }

      const daysUntilExpiry = Math.floor(
        (cert.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      return daysUntilExpiry < 30;
    } catch (error) {
      console.error('[SSL] Error checking expiry:', error);
      return true; // Assume needs renewal on error
    }
  }

  /**
   * Renew certificate
   * With Cloudflare, certificates auto-renew, but this can be used to force a refresh
   */
  async renewCertificate(domain: string, zoneId?: string): Promise<SSLProvisionResult> {
    try {
      console.log(`[SSL] Renewing certificate for ${domain}...`);

      // Cloudflare automatically renews certificates
      // This method just verifies the certificate is still valid
      const cert = await this.getCertificateStatus(domain, zoneId);

      if (!cert) {
        // No certificate found, provision a new one
        return await this.provisionCertificate(domain, { zoneId });
      }

      if (cert.status !== 'active') {
        // Certificate not active, try to re-provision
        return await this.provisionCertificate(domain, { zoneId });
      }

      console.log(`[SSL] Certificate for ${domain} is active and auto-renewing`);

      return {
        success: true,
        certificate: cert,
        provisionedAt: new Date(),
      };
    } catch (error) {
      console.error('[SSL] Error renewing certificate:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provisionedAt: new Date(),
      };
    }
  }

  /**
   * Get all certificates that need renewal
   * Useful for scheduled renewal jobs
   */
  async getCertificatesNeedingRenewal(domains: Array<{
    domain: string;
    zoneId: string;
  }>): Promise<
    Array<{
      domain: string;
      zoneId: string;
      expiresAt: Date;
      daysUntilExpiry: number;
    }>
  > {
    const needsRenewal: Array<{
      domain: string;
      zoneId: string;
      expiresAt: Date;
      daysUntilExpiry: number;
    }> = [];

    for (const { domain, zoneId } of domains) {
      try {
        const cert = await this.getCertificateStatus(domain, zoneId);

        if (!cert) {
          needsRenewal.push({
            domain,
            zoneId,
            expiresAt: new Date(), // Already expired/missing
            daysUntilExpiry: 0,
          });
          continue;
        }

        const daysUntilExpiry = Math.floor(
          (cert.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilExpiry < 30) {
          needsRenewal.push({
            domain,
            zoneId,
            expiresAt: cert.expiresAt,
            daysUntilExpiry,
          });
        }
      } catch (error) {
        console.error(`[SSL] Error checking ${domain}:`, error);
        // Add to renewal list on error (safer to try than ignore)
        needsRenewal.push({
          domain,
          zoneId,
          expiresAt: new Date(),
          daysUntilExpiry: 0,
        });
      }
    }

    return needsRenewal;
  }

  /**
   * Validate SSL certificate is properly installed and serving traffic
   */
  async validateCertificate(domain: string): Promise<{
    valid: boolean;
    httpsWorking: boolean;
    certificateValid: boolean;
    redirectsToHTTPS: boolean;
  }> {
    try {
      // Check HTTPS connection
      let httpsWorking = false;
      let certificateValid = false;

      try {
        const httpsResponse = await fetch(`https://${domain}`, {
          method: 'HEAD',
          redirect: 'manual',
        });
        httpsWorking = httpsResponse.ok || httpsResponse.status === 301 || httpsResponse.status === 302;
        certificateValid = true; // If fetch succeeds, certificate is valid
      } catch (error) {
        console.warn(`[SSL] HTTPS check failed for ${domain}:`, error);
      }

      // Check HTTP -> HTTPS redirect
      let redirectsToHTTPS = false;
      try {
        const httpResponse = await fetch(`http://${domain}`, {
          method: 'HEAD',
          redirect: 'manual',
        });
        const location = httpResponse.headers.get('location');
        redirectsToHTTPS = location?.startsWith('https://') ?? false;
      } catch (error) {
        console.warn(`[SSL] HTTP redirect check failed for ${domain}:`, error);
      }

      const valid = httpsWorking && certificateValid;

      return {
        valid,
        httpsWorking,
        certificateValid,
        redirectsToHTTPS,
      };
    } catch (error) {
      console.error('[SSL] Error validating certificate:', error);
      return {
        valid: false,
        httpsWorking: false,
        certificateValid: false,
        redirectsToHTTPS: false,
      };
    }
  }

  /**
   * Wait for certificate to be issued
   * Polls Cloudflare until certificate is active or timeout
   */
  private async waitForCertificate(
    zoneId: string,
    domain: string,
    maxWaitMs: number = 900000 // 15 minutes
  ): Promise<SSLCertificate | null> {
    const startTime = Date.now();
    const pollInterval = 30000; // 30 seconds

    console.log(`[SSL] Waiting for certificate issuance (max ${maxWaitMs / 60000} minutes)...`);

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const cert = await this.getCertificateStatus(domain, zoneId);

        if (cert && cert.status === 'active') {
          return cert;
        }

        // Log progress every 2 minutes
        if ((Date.now() - startTime) % 120000 < pollInterval) {
          const elapsed = Math.floor((Date.now() - startTime) / 60000);
          console.log(`[SSL] Still waiting for certificate (${elapsed} minutes elapsed)...`);
        }
      } catch (error) {
        console.warn('[SSL] Error checking certificate status:', error);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    console.warn(`[SSL] Certificate issuance timeout for ${domain}`);
    return null;
  }
}
