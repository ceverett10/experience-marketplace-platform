import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // Build query filters
    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    // Fetch registered domains from database
    const registeredDomains = await prisma.domain.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Fetch sites without domains to show suggested domains
    const sitesWithoutDomains = await prisma.site.findMany({
      where: {
        domains: {
          none: {},
        },
        status: {
          notIn: ['ARCHIVED'],
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        jobs: {
          where: {
            type: 'DOMAIN_REGISTER',
          },
          select: {
            id: true,
            status: true,
            payload: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Create domain entries for sites without registered domains
    const suggestedDomains = sitesWithoutDomains.map((site) => {
      const domainJob = site.jobs[0];
      const suggestedDomain = domainJob?.payload && typeof domainJob.payload === 'object' && 'domain' in domainJob.payload
        ? (domainJob.payload as any).domain
        : `${site.slug}.com`;

      // Determine status based on job status
      let domainStatus: any = 'PENDING';
      if (domainJob) {
        if (domainJob.status === 'RUNNING') {
          domainStatus = 'REGISTERING';
        } else if (domainJob.status === 'FAILED') {
          domainStatus = 'FAILED';
        }
      }

      return {
        id: `suggested-${site.id}`,
        domain: suggestedDomain,
        status: domainStatus,
        registrar: 'cloudflare',
        registeredAt: null,
        expiresAt: null,
        sslEnabled: false,
        sslExpiresAt: null,
        dnsConfigured: false,
        cloudflareZoneId: null,
        autoRenew: true,
        registrationCost: 0,
        siteName: site.name,
        siteId: site.id,
        isSuggested: true,
      };
    });

    // Combine registered and suggested domains
    const allDomainRecords = [...registeredDomains, ...suggestedDomains];

    // Filter by status if requested
    let filteredDomains = allDomainRecords;
    if (status && status !== 'all') {
      filteredDomains = allDomainRecords.filter((d) => d.status === status);
    }

    // Calculate stats
    const allDomains = await prisma.domain.findMany();
    const stats = {
      total: allDomains.length + suggestedDomains.length,
      active: allDomains.filter((d) => d.status === 'ACTIVE').length,
      pending: allDomains.filter((d) =>
        ['PENDING', 'REGISTERING', 'DNS_PENDING', 'SSL_PENDING'].includes(d.status)
      ).length + suggestedDomains.filter((d) => d.status === 'PENDING' || d.status === 'REGISTERING').length,
      sslEnabled: allDomains.filter((d) => d.sslEnabled).length,
      expiringBoon: allDomains.filter((d) => {
        if (!d.expiresAt) return false;
        const daysUntilExpiry = Math.floor(
          (d.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        return daysUntilExpiry < 30;
      }).length,
    };

    return NextResponse.json({
      domains: filteredDomains.map((domain: any) => ({
        id: domain.id,
        domain: 'isSuggested' in domain ? domain.domain : domain.domain,
        status: domain.status,
        registrar: domain.registrar,
        registeredAt: domain.registeredAt?.toISOString?.() || null,
        expiresAt: domain.expiresAt?.toISOString?.() || null,
        sslEnabled: domain.sslEnabled,
        sslExpiresAt: domain.sslExpiresAt?.toISOString?.() || null,
        dnsConfigured: domain.dnsConfigured,
        cloudflareZoneId: domain.cloudflareZoneId,
        autoRenew: domain.autoRenew,
        registrationCost: domain.registrationCost?.toNumber?.() || domain.registrationCost || 0,
        siteName: domain.site?.name || domain.siteName || null,
        siteId: domain.site?.id || domain.siteId || null,
        isSuggested: 'isSuggested' in domain ? domain.isSuggested : false,
      })),
      stats,
    });
  } catch (error) {
    console.error('[API] Error fetching domains:', error);
    return NextResponse.json({ error: 'Failed to fetch domains' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, domain, siteId, registrar = 'cloudflare', autoRenew = true } = body;

    const { addJob } = await import('@experience-marketplace/jobs');

    // Action: Sync domains from Cloudflare Registrar
    if (action === 'syncFromCloudflare') {
      const apiKey = process.env['CLOUDFLARE_API_KEY'];
      const email = process.env['CLOUDFLARE_EMAIL'];
      const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];

      if (!apiKey || !email || !accountId) {
        return NextResponse.json({ error: 'Cloudflare credentials not configured' }, { status: 500 });
      }

      // Fetch domains from Cloudflare Registrar
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domains`,
        {
          headers: {
            'X-Auth-Email': email,
            'X-Auth-Key': apiKey,
          },
        }
      );

      const data = await response.json();
      if (!data.success) {
        return NextResponse.json({ error: 'Failed to fetch from Cloudflare', details: data.errors }, { status: 500 });
      }

      const cloudflareDomainsData = data.result as Array<{
        name: string;
        registered_at: string;
        expires_at: string;
        auto_renew: boolean;
        locked: boolean;
      }>;

      // Get all sites to match domains
      const sites = await prisma.site.findMany({
        select: { id: true, slug: true, name: true },
      });

      const synced = [];
      const unmatched = [];
      const dnsConfigured = [];

      // Heroku app hostname for DNS configuration
      const herokuHostname = process.env['HEROKU_APP_NAME']
        ? `${process.env['HEROKU_APP_NAME']}.herokuapp.com`
        : 'holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com';

      for (const cfDomain of cloudflareDomainsData) {
        // Try to match domain to site by slug
        // e.g., london-food-tours.com -> london-food-tours
        const domainSlug = cfDomain.name.replace(/\.(com|net|org|co|io|dev|app)$/i, '');
        const matchingSite = sites.find(s => s.slug === domainSlug);

        if (matchingSite) {
          // Check if domain already exists in DB
          const existingDomain = await prisma.domain.findFirst({
            where: { domain: cfDomain.name },
          });

          let domainRecord;
          if (existingDomain) {
            // Update existing domain
            domainRecord = await prisma.domain.update({
              where: { id: existingDomain.id },
              data: {
                registeredAt: new Date(cfDomain.registered_at),
                expiresAt: new Date(cfDomain.expires_at),
                autoRenew: cfDomain.auto_renew,
                siteId: matchingSite.id,
              },
            });
            synced.push({ domain: cfDomain.name, site: matchingSite.name, action: 'updated' });
          } else {
            // Create new domain record
            domainRecord = await prisma.domain.create({
              data: {
                domain: cfDomain.name,
                status: 'DNS_PENDING',
                registrar: 'cloudflare',
                registeredAt: new Date(cfDomain.registered_at),
                expiresAt: new Date(cfDomain.expires_at),
                autoRenew: cfDomain.auto_renew,
                registrationCost: 9.77, // Cloudflare at-cost .com pricing
                siteId: matchingSite.id,
              },
            });
            synced.push({ domain: cfDomain.name, site: matchingSite.name, action: 'created' });
          }

          // Auto-configure DNS if not already active
          if (domainRecord.status !== 'ACTIVE') {
            try {
              // Get zone for this domain (Cloudflare Registrar domains auto-create zones)
              const zoneResponse = await fetch(
                `https://api.cloudflare.com/client/v4/zones?name=${cfDomain.name}`,
                {
                  headers: {
                    'X-Auth-Email': email,
                    'X-Auth-Key': apiKey,
                  },
                }
              );
              const zoneData = await zoneResponse.json();

              if (zoneData.success && zoneData.result.length > 0) {
                const zone = zoneData.result[0];

                // Check if DNS records already exist
                const recordsResponse = await fetch(
                  `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`,
                  {
                    headers: {
                      'X-Auth-Email': email,
                      'X-Auth-Key': apiKey,
                    },
                  }
                );
                const recordsData = await recordsResponse.json();
                const existingRecords = recordsData.success ? recordsData.result : [];

                // Check if we already have the correct records pointing to Heroku
                const hasRootRecord = existingRecords.some(
                  (r: any) => (r.type === 'CNAME' || r.type === 'A') && r.name === cfDomain.name
                );

                if (!hasRootRecord) {
                  // Create root CNAME record pointing to Heroku (Cloudflare supports CNAME flattening)
                  await fetch(
                    `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`,
                    {
                      method: 'POST',
                      headers: {
                        'X-Auth-Email': email,
                        'X-Auth-Key': apiKey,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        type: 'CNAME',
                        name: '@',
                        content: herokuHostname,
                        ttl: 1, // Auto
                        proxied: true, // Enable Cloudflare proxy for SSL
                      }),
                    }
                  );

                  // Create www CNAME record
                  await fetch(
                    `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`,
                    {
                      method: 'POST',
                      headers: {
                        'X-Auth-Email': email,
                        'X-Auth-Key': apiKey,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        type: 'CNAME',
                        name: 'www',
                        content: herokuHostname,
                        ttl: 1,
                        proxied: true,
                      }),
                    }
                  );

                  dnsConfigured.push(cfDomain.name);
                }

                // Update domain record with zone ID and set status
                await prisma.domain.update({
                  where: { id: domainRecord.id },
                  data: {
                    cloudflareZoneId: zone.id,
                    dnsConfigured: true,
                    sslEnabled: true, // Cloudflare proxy provides free SSL
                    status: 'ACTIVE',
                  },
                });

                // Update site with primary domain and activate it
                await prisma.site.update({
                  where: { id: matchingSite.id },
                  data: {
                    primaryDomain: cfDomain.name,
                    status: 'ACTIVE',
                  },
                });
              }
            } catch (dnsError) {
              console.error(`[DNS] Error configuring DNS for ${cfDomain.name}:`, dnsError);
              // Continue with other domains even if one fails
            }
          }
        } else {
          unmatched.push({ domain: cfDomain.name, suggestedSlug: domainSlug });
        }
      }

      return NextResponse.json({
        success: true,
        message: `Synced ${synced.length} domains from Cloudflare, configured DNS for ${dnsConfigured.length}`,
        synced,
        dnsConfigured,
        unmatched,
      });
    }

    // Action: Queue domain registrations for all sites without domains
    if (action === 'queueMissing') {
      const sitesWithoutDomains = await prisma.site.findMany({
        where: {
          domains: {
            none: {},
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      });

      const queued = [];
      for (const site of sitesWithoutDomains) {
        const suggestedDomain = `${site.slug}.com`;
        await addJob('DOMAIN_REGISTER', {
          siteId: site.id,
          domain: suggestedDomain,
          registrar: 'cloudflare',
          autoRenew: true,
        });
        queued.push({ siteId: site.id, siteName: site.name, domain: suggestedDomain });
      }

      return NextResponse.json({
        success: true,
        message: `Queued domain registration for ${queued.length} sites`,
        queued,
      });
    }

    // Default action: Queue single domain registration
    if (!domain || !siteId) {
      return NextResponse.json({ error: 'domain and siteId are required' }, { status: 400 });
    }

    await addJob('DOMAIN_REGISTER', {
      siteId,
      domain,
      registrar,
      autoRenew,
    });

    return NextResponse.json({
      success: true,
      message: `Domain registration queued for ${domain}`,
    });
  } catch (error) {
    console.error('[API] Error registering domain:', error);
    return NextResponse.json({ error: 'Failed to register domain' }, { status: 500 });
  }
}
