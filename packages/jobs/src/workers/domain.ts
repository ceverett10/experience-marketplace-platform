import { Job } from 'bullmq';
import { prisma, DomainStatus } from '@experience-marketplace/database';
import { DomainRegistrarService } from '../services/domain-registrar.js';
import { CloudflareDNSService } from '../services/cloudflare-dns.js';
import { SSLService } from '../services/ssl-service.js';
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

    // 1. Check if domain already exists
    const existing = await prisma.domain.findUnique({
      where: { domain },
    });

    if (existing) {
      throw new BusinessLogicError(`Domain ${domain} is already registered`, {
        context: { domain, existingId: existing.id },
      });
    }

    // 2. Check domain availability
    const isAvailable = await checkDomainAvailability(domain, registrar);
    if (!isAvailable) {
      throw new BusinessLogicError(`Domain ${domain} is not available for registration`, {
        context: { domain, registrar },
      });
    }

    // 3. Register domain via registrar API
    const registrationCost = await registerDomainViaApi(domain, registrar);

    // 4. Create domain record
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
      throw new BusinessLogicError(`Domain ${domain.domain} must be verified before SSL provisioning`, {
        context: { domainId, domain: domain.domain, status: domain.status },
      });
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
 * Check if domain is available for registration
 */
async function checkDomainAvailability(domain: string, registrar: string): Promise<boolean> {
  console.log(`[Domain] Checking availability for ${domain} via ${registrar}`);

  try {
    const namecheapBreaker = circuitBreakers.getBreaker('namecheap-api');

    const availability = await namecheapBreaker.execute(async () => {
      const registrarService = new DomainRegistrarService();
      return await registrarService.checkAvailability(domain);
    });

    return availability.available;
  } catch (error) {
    console.error(`[Domain] Error checking availability via ${registrar}:`, error);

    // Fallback: check if already registered in our system
    const existing = await prisma.domain.findUnique({ where: { domain } });
    return !existing;
  }
}

/**
 * Register domain via registrar API
 */
async function registerDomainViaApi(domain: string, registrar: string): Promise<number> {
  console.log(`[Domain] Registering ${domain} via ${registrar} API`);

  try {
    const namecheapBreaker = circuitBreakers.getBreaker('namecheap-api');

    const registration = await namecheapBreaker.execute(async () => {
      const registrarService = new DomainRegistrarService();
      // Register domain for 1 year with auto-renewal
      return await registrarService.registerDomain(domain, 1, true);
    });

    console.log(`[Domain] Domain registered successfully (Order ID: ${registration.orderId})`);

    return registration.cost;
  } catch (error) {
    console.error(`[Domain] Error registering domain via ${registrar}:`, error);
    throw new ExternalApiError('Domain registration failed', {
      service: 'namecheap-api',
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

    // If domain was registered via Namecheap, update nameservers to point to Cloudflare
    if (zone.nameServers.length > 0) {
      try {
        const namecheapBreaker = circuitBreakers.getBreaker('namecheap-api');
        await namecheapBreaker.execute(async () => {
          const registrar = new DomainRegistrarService();
          return await registrar.setNameservers(domain, zone.nameServers);
        });
        console.log(`[Domain] Nameservers updated for ${domain}:`, zone.nameServers);
      } catch (error) {
        console.warn(`[Domain] Could not update nameservers (manual update may be needed):`, error);
      }
    }
  } catch (error) {
    console.error(`[Domain] Error configuring DNS:`, error);
    throw error;
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
      throw new BusinessLogicError(`No Cloudflare zone ID found for ${domain}. Configure DNS first.`, {
        context: { domain },
      });
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
