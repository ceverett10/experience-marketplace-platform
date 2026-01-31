import { Job } from 'bullmq';
import { prisma, DomainStatus } from '@experience-marketplace/database';
import type {
  DomainRegisterPayload,
  DomainVerifyPayload,
  SslProvisionPayload,
  JobResult,
} from '../types/index.js';

/**
 * Domain Worker
 * Handles autonomous domain registration, verification, and SSL provisioning
 */

/**
 * Domain Registration Handler
 * Registers a new domain via registrar API
 */
export async function handleDomainRegister(
  job: Job<DomainRegisterPayload>
): Promise<JobResult> {
  const { siteId, domain, registrar, autoRenew = true } = job.data;

  try {
    console.log(
      `[Domain Register] Starting registration for ${domain} via ${registrar}`
    );

    // 1. Check if domain already exists
    const existing = await prisma.domain.findUnique({
      where: { domain },
    });

    if (existing) {
      throw new Error(`Domain ${domain} is already registered`);
    }

    // 2. Check domain availability (mock for MVP)
    const isAvailable = await checkDomainAvailability(domain, registrar);
    if (!isAvailable) {
      throw new Error(`Domain ${domain} is not available for registration`);
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
        expiresAt: domainRecord.expiresAt?.toISOString() || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Domain Register] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Domain Verification Handler
 * Verifies domain ownership via DNS or HTTP methods
 */
export async function handleDomainVerify(
  job: Job<DomainVerifyPayload>
): Promise<JobResult> {
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
      throw new Error(`Domain ${domainId} not found`);
    }

    // 2. Verify domain ownership
    const isVerified = await verifyDomainOwnership(
      domain.domain,
      verificationMethod
    );

    if (!isVerified) {
      throw new Error(
        `Domain ${domain.domain} verification failed via ${verificationMethod}`
      );
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
    console.error('[Domain Verify] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * SSL Provisioning Handler
 * Provisions SSL certificate via Let's Encrypt or Cloudflare
 */
export async function handleSslProvision(
  job: Job<SslProvisionPayload>
): Promise<JobResult> {
  const { domainId, provider } = job.data;

  try {
    console.log(
      `[SSL Provision] Starting SSL provisioning for domain ${domainId} via ${provider}`
    );

    // 1. Get domain record
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
    });

    if (!domain) {
      throw new Error(`Domain ${domainId} not found`);
    }

    if (!domain.verifiedAt) {
      throw new Error(`Domain ${domain.domain} must be verified before SSL provisioning`);
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
        console.log(`[SSL Provision] Set ${domain.domain} as primary domain for site ${domain.siteId}`);
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
    console.error('[SSL Provision] Error:', error);

    // Update domain to failed status
    if (domainId) {
      await prisma.domain.update({
        where: { id: domainId },
        data: { status: DomainStatus.FAILED },
      }).catch(console.error);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

// Helper Functions

/**
 * Check if domain is available for registration
 * TODO: Implement actual registrar API calls
 */
async function checkDomainAvailability(
  domain: string,
  registrar: string
): Promise<boolean> {
  console.log(`[Domain] Checking availability for ${domain} via ${registrar}`);

  // For MVP, mock implementation
  // In production, call registrar API (Namecheap, Cloudflare, etc.)

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // For demo, assume domain is available if it doesn't exist in our DB
  const existing = await prisma.domain.findUnique({ where: { domain } });
  return !existing;
}

/**
 * Register domain via registrar API
 * TODO: Implement actual registrar API integration
 */
async function registerDomainViaApi(
  domain: string,
  registrar: string
): Promise<number> {
  console.log(`[Domain] Registering ${domain} via ${registrar} API`);

  // For MVP, mock implementation
  // In production:
  // - Namecheap: Use Namecheap API
  // - Cloudflare: Use Cloudflare Registrar API
  // - Google Domains: Use Google Domains API

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Mock cost based on TLD
  const tld = domain.split('.').pop() || 'com';
  const costs: Record<string, number> = {
    com: 12.99,
    net: 12.99,
    org: 14.99,
    io: 39.99,
    dev: 12.99,
    app: 14.99,
  };

  return costs[tld] || 15.99;
}

/**
 * Verify domain ownership via DNS or HTTP
 * TODO: Implement actual verification checks
 */
async function verifyDomainOwnership(
  domain: string,
  method: 'dns' | 'http'
): Promise<boolean> {
  console.log(`[Domain] Verifying ${domain} via ${method}`);

  // For MVP, mock implementation
  // In production:
  // - DNS: Check for TXT record with verification token
  // - HTTP: Check for verification file at /.well-known/

  // Simulate verification check
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // For demo, always return true after delay
  return true;
}

/**
 * Configure DNS records for domain
 * TODO: Implement Cloudflare API integration
 */
async function configureDnsRecords(domain: string): Promise<void> {
  console.log(`[Domain] Configuring DNS for ${domain}`);

  // For MVP, mock implementation
  // In production: Use Cloudflare API to create DNS records
  // - A record pointing to Heroku app IP
  // - CNAME for www subdomain
  // - MX records if needed

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

/**
 * Provision SSL certificate
 * TODO: Implement Let's Encrypt / Cloudflare integration
 */
async function provisionSslCertificate(
  domain: string,
  provider: 'letsencrypt' | 'cloudflare'
): Promise<Date> {
  console.log(`[Domain] Provisioning SSL for ${domain} via ${provider}`);

  // For MVP, mock implementation
  // In production:
  // - Let's Encrypt: Use certbot or ACME protocol
  // - Cloudflare: Use Cloudflare Universal SSL

  await new Promise((resolve) => setTimeout(resolve, 1500));

  // SSL certificate valid for 90 days (Let's Encrypt) or 1 year (Cloudflare)
  const validityDays = provider === 'letsencrypt' ? 90 : 365;
  return new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
}
