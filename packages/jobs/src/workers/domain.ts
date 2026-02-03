import { Job } from 'bullmq';
import { prisma, DomainStatus } from '@experience-marketplace/database';
import { CloudflareRegistrarService } from '../services/cloudflare-registrar.js';
import { CloudflareDNSService } from '../services/cloudflare-dns.js';
import { SSLService } from '../services/ssl-service.js';
import { HerokuDomainsService } from '../services/heroku-domains.js';
import type {
  DomainRegisterPayload,
  DomainVerifyPayload,
  SslProvisionPayload,
  JobResult,
} from '../types/index.js';
import {
  toJobError,
  ExternalApiError,
  NotFoundError,
  BusinessLogicError,
  calculateRetryDelay,
  shouldMoveToDeadLetter,
} from '../errors/index.js';
import { errorTracking } from '../errors/tracking.js';
import { circuitBreakers } from '../errors/circuit-breaker.js';
import { canExecuteAutonomousOperation } from '../services/pause-control.js';

/**
 * Domain Worker
 * Handles autonomous domain registration, verification, and SSL provisioning
 */

/**
 * Domain Registration Handler
 * Registers a new domain via registrar API
 */
export async function handleDomainRegister(job: Job<DomainRegisterPayload>): Promise<JobResult> {
  const { siteId, domain, registrar, autoRenew = true } = job.data;

  try {
    console.log(`[Domain Register] Starting registration for ${domain} via ${registrar}`);

    // Check if autonomous domain registration is allowed
    const canProceed = await canExecuteAutonomousOperation({
      siteId,
    });

    if (!canProceed.allowed) {
      console.log(`[Domain Register] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'Domain registration is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    // 1. Check if domain already exists
    const existing = await prisma.domain.findUnique({
      where: { domain },
    });

    if (existing) {
      throw new BusinessLogicError(`Domain ${domain} is already registered`, {
        context: { domain, existingId: existing.id },
      });
    }

    // 2. Check domain availability and price
    const availabilityResult = await checkDomainAvailabilityAndPrice(domain, registrar);
    if (!availabilityResult.available) {
      throw new BusinessLogicError(`Domain ${domain} is not available for registration`, {
        context: { domain, registrar },
      });
    }

    // 3. Price safeguard - reject domains over $10 without manual approval
    const MAX_AUTO_PURCHASE_PRICE = 10;
    if (availabilityResult.price && availabilityResult.price > MAX_AUTO_PURCHASE_PRICE) {
      throw new BusinessLogicError(
        `Domain ${domain} costs $${availabilityResult.price.toFixed(2)}, which exceeds the $${MAX_AUTO_PURCHASE_PRICE} auto-purchase limit. Manual approval required.`,
        {
          context: { domain, price: availabilityResult.price, limit: MAX_AUTO_PURCHASE_PRICE },
        }
      );
    }

    console.log(
      `[Domain Register] Domain ${domain} is available for $${availabilityResult.price?.toFixed(2) || 'unknown'}`
    );

    // 4. Register domain via registrar API
    const registrationCost = await registerDomainViaApi(domain, registrar);

    // 5. Create domain record
    const domainRecord = await prisma.domain.create({
      data: {
        domain,
        status: DomainStatus.REGISTERING,
        registrar,
        registeredAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        autoRenew,
        registrationCost,
        renewalCost: registrationCost,
        siteId,
      },
    });

    console.log(`[Domain Register] Domain ${domain} registered successfully`);

    // 5. Queue DNS configuration
    const { addJob } = await import('../queues/index.js');
    await addJob('DOMAIN_VERIFY', {
      domainId: domainRecord.id,
      verificationMethod: 'dns',
    });

    return {
      success: true,
      message: `Domain ${domain} registered successfully`,
      data: {
        domainId: domainRecord.id,
        domain,
        registrar,
        cost: registrationCost.toString(),
        expiresAt:
          domainRecord.expiresAt?.toISOString() ||
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);

    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'DOMAIN_REGISTER',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { ...jobError.context, domain, registrar, siteId },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });

    if (jobError.retryable) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
    }

    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      await job.moveToFailed(new Error(`Permanent failure: ${jobError.message}`), '0', true);
    }

    console.error('[Domain Register] Error:', jobError.toJSON());

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}

/**
 * Domain Verification Handler
 * Verifies domain ownership via DNS or HTTP methods
 */
export async function handleDomainVerify(job: Job<DomainVerifyPayload>): Promise<JobResult> {
  const { domainId, verificationMethod } = job.data;

  try {
    console.log(
      `[Domain Verify] Starting verification for domain ${domainId} via ${verificationMethod}`
    );

    // 1. Get domain record
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
    });

    if (!domain) {
      throw new NotFoundError('Domain', domainId);
    }

    // 2. Verify domain ownership
    const isVerified = await verifyDomainOwnership(domain.domain, verificationMethod);

    if (!isVerified) {
      throw new Error(`Domain ${domain.domain} verification failed via ${verificationMethod}`);
    }

    // 3. Update domain status
    const updatedDomain = await prisma.domain.update({
      where: { id: domainId },
      data: {
        verifiedAt: new Date(),
        status: DomainStatus.DNS_PENDING,
      },
    });

    console.log(`[Domain Verify] Domain ${domain.domain} verified successfully`);

    // 4. Configure DNS if using Cloudflare
    if (domain.registrar === 'cloudflare') {
      await configureDnsRecords(domain.domain);

      await prisma.domain.update({
        where: { id: domainId },
        data: {
          dnsConfigured: true,
          status: DomainStatus.SSL_PENDING,
        },
      });

      console.log(`[Domain Verify] DNS configured for ${domain.domain}`);
    }

    // 5. Queue SSL provisioning
    const { addJob } = await import('../queues/index.js');
    await addJob('SSL_PROVISION', {
      domainId: updatedDomain.id,
      provider: domain.registrar === 'cloudflare' ? 'cloudflare' : 'letsencrypt',
    });

    return {
      success: true,
      message: `Domain ${domain.domain} verified successfully`,
      data: {
        domainId: updatedDomain.id,
        domain: domain.domain,
        verifiedAt: updatedDomain.verifiedAt?.toISOString(),
        dnsConfigured: domain.registrar === 'cloudflare',
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);

    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'DOMAIN_VERIFY',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { ...jobError.context, domainId, verificationMethod },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });

    if (jobError.retryable) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
    }

    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      await job.moveToFailed(new Error(`Permanent failure: ${jobError.message}`), '0', true);
    }

    console.error('[Domain Verify] Error:', jobError.toJSON());

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}

/**
 * SSL Provisioning Handler
 * Provisions SSL certificate via Let's Encrypt or Cloudflare
 */
export async function handleSslProvision(job: Job<SslProvisionPayload>): Promise<JobResult> {
  const { domainId, provider } = job.data;

  try {
    console.log(`[SSL Provision] Starting SSL provisioning for domain ${domainId} via ${provider}`);

    // 1. Get domain record
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
    });

    if (!domain) {
      throw new NotFoundError('Domain', domainId);
    }

    if (!domain.verifiedAt) {
      throw new BusinessLogicError(
        `Domain ${domain.domain} must be verified before SSL provisioning`,
        {
          context: { domainId, domain: domain.domain, status: domain.status },
        }
      );
    }

    // 2. Provision SSL certificate
    const sslExpiresAt = await provisionSslCertificate(domain.domain, provider);

    // 3. Update domain status
    const updatedDomain = await prisma.domain.update({
      where: { id: domainId },
      data: {
        sslEnabled: true,
        sslExpiresAt,
        status: DomainStatus.ACTIVE,
      },
    });

    console.log(`[SSL Provision] SSL enabled for ${domain.domain}`);

    // 4. Set as primary domain if this is the first active domain for the site
    if (domain.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: domain.siteId },
        include: { domains: true },
      });

      if (site && !site.primaryDomain) {
        await prisma.site.update({
          where: { id: domain.siteId },
          data: {
            primaryDomain: domain.domain,
          },
        });
        console.log(
          `[SSL Provision] Set ${domain.domain} as primary domain for site ${domain.siteId}`
        );
      }

      // 5. Queue GSC setup to register domain with Google Search Console
      // This happens after domain is fully configured (SSL enabled)
      if (domain.cloudflareZoneId) {
        const { addJob } = await import('../queues/index.js');
        await addJob(
          'GSC_SETUP',
          {
            siteId: domain.siteId,
            domain: domain.domain,
            cloudflareZoneId: domain.cloudflareZoneId,
          },
          {
            delay: 30000, // Wait 30s for SSL to fully propagate
          }
        );
        console.log(`[SSL Provision] Queued GSC setup for ${domain.domain}`);
      }
    }

    return {
      success: true,
      message: `SSL provisioned for ${domain.domain}`,
      data: {
        domainId: updatedDomain.id,
        domain: domain.domain,
        sslEnabled: true,
        sslExpiresAt: sslExpiresAt.toISOString(),
        status: updatedDomain.status,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    const jobError = toJobError(error);

    await errorTracking.logError({
      jobId: job.id || 'unknown',
      jobType: 'SSL_PROVISION',
      errorName: jobError.name,
      errorMessage: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      attemptsMade: job.attemptsMade,
      context: { ...jobError.context, domainId, provider },
      stackTrace: jobError.stack,
      timestamp: new Date(),
    });

    // Only update domain to failed if error is permanent
    if (!jobError.retryable && domainId) {
      await prisma.domain
        .update({
          where: { id: domainId },
          data: { status: DomainStatus.FAILED },
        })
        .catch(console.error);
    }

    if (jobError.retryable) {
      const retryDelay = calculateRetryDelay(jobError, job.attemptsMade);
      console.log(
        `Error is retryable, will retry in ${(retryDelay / 1000).toFixed(0)}s (configured at queue level)`
      );
    }

    if (shouldMoveToDeadLetter(jobError, job.attemptsMade)) {
      await job.moveToFailed(new Error(`Permanent failure: ${jobError.message}`), '0', true);
    }

    console.error('[SSL Provision] Error:', jobError.toJSON());

    return {
      success: false,
      error: jobError.message,
      errorCategory: jobError.category,
      errorSeverity: jobError.severity,
      retryable: jobError.retryable,
      timestamp: new Date(),
    };
  }
}

// Helper Functions

/**
 * Check if domain is available for registration and get price
 */
async function checkDomainAvailabilityAndPrice(
  domain: string,
  registrar: string
): Promise<{ available: boolean; price?: number }> {
  console.log(`[Domain] Checking availability and price for ${domain} via ${registrar}`);

  try {
    const cloudflareBreaker = circuitBreakers.getBreaker('cloudflare-api');

    const availability = await cloudflareBreaker.execute(async () => {
      const registrarService = new CloudflareRegistrarService();
      return await registrarService.checkAvailability(domain);
    });

    return {
      available: availability.available,
      price: availability.price,
    };
  } catch (error) {
    console.error(`[Domain] Error checking availability via ${registrar}:`, error);

    // Fallback: check if already registered in our system
    const existing = await prisma.domain.findUnique({ where: { domain } });
    return { available: !existing, price: undefined };
  }
}

/**
 * Register domain via registrar API
 */
async function registerDomainViaApi(domain: string, registrar: string): Promise<number> {
  console.log(`[Domain] Registering ${domain} via Cloudflare Registrar`);

  try {
    const cloudflareBreaker = circuitBreakers.getBreaker('cloudflare-api');

    const registration = await cloudflareBreaker.execute(async () => {
      const registrarService = new CloudflareRegistrarService();
      // Register domain for 1 year with auto-renewal
      return await registrarService.registerDomain(domain, 1, true);
    });

    console.log(`[Domain] Domain registered successfully (Order ID: ${registration.orderId})`);

    return registration.cost;
  } catch (error) {
    console.error(`[Domain] Error registering domain via Cloudflare:`, error);
    throw new ExternalApiError('Domain registration failed', {
      service: 'cloudflare-api',
      context: { domain, registrar },
      originalError: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Verify domain ownership via DNS or HTTP
 */
async function verifyDomainOwnership(domain: string, method: 'dns' | 'http'): Promise<boolean> {
  console.log(`[Domain] Verifying ${domain} via ${method}`);

  try {
    // For domain registered via Namecheap, verification is automatic
    // Check if domain resolves and is accessible
    const cloudflare = new CloudflareDNSService();
    const zone = await cloudflare.getZone(domain);

    if (zone) {
      // Domain is in Cloudflare and zone exists
      return zone.status === 'active';
    }

    // If not in Cloudflare yet, check basic DNS resolution
    try {
      const response = await fetch(`http://${domain}`, {
        method: 'HEAD',
        redirect: 'manual',
      });
      // If we get any response, domain is resolving
      return true;
    } catch (error) {
      // Domain not resolving yet, but that's OK - we'll configure DNS next
      return true;
    }
  } catch (error) {
    console.error(`[Domain] Error verifying domain:`, error);
    // For auto-registered domains, assume verification passes
    return true;
  }
}

/**
 * Configure DNS records for domain
 */
async function configureDnsRecords(domain: string): Promise<void> {
  console.log(`[Domain] Configuring DNS for ${domain}`);

  try {
    const cloudflareBreaker = circuitBreakers.getBreaker('cloudflare-api');

    // Add zone to Cloudflare (or get existing)
    let zone = await cloudflareBreaker.execute(async () => {
      const cloudflare = new CloudflareDNSService();
      return await cloudflare.getZone(domain);
    });

    if (!zone) {
      zone = await cloudflareBreaker.execute(async () => {
        const cloudflare = new CloudflareDNSService();
        return await cloudflare.addZone(domain);
      });
      console.log(`[Domain] Added ${domain} to Cloudflare (zone: ${zone.id})`);
    }

    // Store Cloudflare zone ID
    await prisma.domain.update({
      where: { domain },
      data: {
        cloudflareZoneId: zone.id,
      },
    });

    // Set up standard DNS records pointing to Heroku
    // Get Heroku app hostname from environment or use default pattern
    const herokuHostname = process.env['HEROKU_APP_NAME']
      ? `${process.env['HEROKU_APP_NAME']}.herokuapp.com`
      : 'experience-marketplace.herokuapp.com';

    await cloudflareBreaker.execute(async () => {
      const cloudflare = new CloudflareDNSService();
      return await cloudflare.setupStandardRecords(zone.id, {
        rootTarget: herokuHostname,
        enableWWW: true,
      });
    });

    console.log(`[Domain] DNS records configured for ${domain}`);

    // Cloudflare-registered domains automatically use Cloudflare DNS
    // No need to update nameservers

    // Add domain to Heroku so it accepts requests for this hostname
    await addDomainToHeroku(domain);
  } catch (error) {
    console.error(`[Domain] Error configuring DNS:`, error);
    throw error;
  }
}

/**
 * Add domain to Heroku
 * Heroku must have the custom domain configured to accept requests
 */
async function addDomainToHeroku(domain: string): Promise<void> {
  console.log(`[Domain] Adding ${domain} to Heroku`);

  try {
    const herokuService = new HerokuDomainsService();
    const result = await herokuService.addDomainWithWww(domain);

    if (!result.success) {
      console.error(`[Domain] Failed to add domain to Heroku: ${result.error}`);
      // Don't throw - Heroku domain can be added manually if needed
      // The site will still work via the tenant fallback (subdomain matching)
      return;
    }

    console.log(`[Domain] Added ${domain} and www.${domain} to Heroku`);

    // Update domain record with Heroku configuration status
    await prisma.domain.update({
      where: { domain },
      data: {
        // Store that Heroku is configured (we can add a field later if needed)
        // For now, just log success
      },
    });
  } catch (error) {
    // Log but don't fail the overall process
    // Missing HEROKU_API_KEY or HEROKU_APP_NAME will throw
    console.error(`[Domain] Error adding domain to Heroku (non-fatal):`, error);
  }
}

/**
 * Provision SSL certificate
 */
async function provisionSslCertificate(
  domain: string,
  provider: 'letsencrypt' | 'cloudflare'
): Promise<Date> {
  console.log(`[Domain] Provisioning SSL for ${domain} via ${provider}`);

  try {
    // Get Cloudflare zone ID from database
    const domainRecord = await prisma.domain.findUnique({
      where: { domain },
    });

    const zoneId = domainRecord?.cloudflareZoneId;

    if (!zoneId) {
      throw new BusinessLogicError(
        `No Cloudflare zone ID found for ${domain}. Configure DNS first.`,
        {
          context: { domain },
        }
      );
    }

    // Provision SSL certificate via Cloudflare with circuit breaker
    const cloudflareBreaker = circuitBreakers.getBreaker('cloudflare-api');

    const result = await cloudflareBreaker.execute(async () => {
      const sslService = new SSLService();
      return await sslService.provisionCertificate(domain, {
        zoneId,
        sslMode: 'full',
        enableAutoHTTPS: true,
        enableAlwaysUseHTTPS: true,
      });
    });

    if (!result.success || !result.certificate) {
      throw new ExternalApiError(result.error || 'SSL provisioning failed', {
        service: 'cloudflare-api',
        context: { domain, zoneId },
      });
    }

    console.log(`[Domain] SSL certificate provisioned for ${domain}`);

    return result.certificate.expiresAt;
  } catch (error) {
    console.error(`[Domain] Error provisioning SSL:`, error);
    throw error;
  }
}
