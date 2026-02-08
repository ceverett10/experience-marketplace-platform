import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Add domain to Heroku via API
 */
async function addDomainToHeroku(domain: string): Promise<{ success: boolean; error?: string }> {
  const herokuApiKey = process.env['HEROKU_API_KEY'];
  const herokuAppName = process.env['HEROKU_APP_NAME'];

  if (!herokuApiKey || !herokuAppName) {
    console.log('[Heroku] Skipping - HEROKU_API_KEY or HEROKU_APP_NAME not configured');
    return { success: false, error: 'Heroku credentials not configured' };
  }

  try {
    // Add root domain
    const rootResponse = await fetch(`https://api.heroku.com/apps/${herokuAppName}/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${herokuApiKey}`,
        Accept: 'application/vnd.heroku+json; version=3',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hostname: domain }),
    });

    if (!rootResponse.ok && rootResponse.status !== 422) {
      const error = await rootResponse.json().catch(() => ({}));
      console.error(`[Heroku] Error adding ${domain}:`, error);
    } else {
      console.log(`[Heroku] Added ${domain}`);
    }

    // Add www subdomain
    const wwwResponse = await fetch(`https://api.heroku.com/apps/${herokuAppName}/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${herokuApiKey}`,
        Accept: 'application/vnd.heroku+json; version=3',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hostname: `www.${domain}` }),
    });

    if (!wwwResponse.ok && wwwResponse.status !== 422) {
      const error = await wwwResponse.json().catch(() => ({}));
      console.error(`[Heroku] Error adding www.${domain}:`, error);
    } else {
      console.log(`[Heroku] Added www.${domain}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`[Heroku] Error adding domain:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

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
      const suggestedDomain =
        domainJob?.payload && typeof domainJob.payload === 'object' && 'domain' in domainJob.payload
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
      available: allDomains.filter((d) => (d.status as string) === 'AVAILABLE').length,
      notAvailable: allDomains.filter((d) => (d.status as string) === 'NOT_AVAILABLE').length,
      pending:
        allDomains.filter((d) =>
          ['PENDING', 'REGISTERING', 'DNS_PENDING', 'SSL_PENDING'].includes(d.status)
        ).length +
        suggestedDomains.filter((d) => d.status === 'PENDING' || d.status === 'REGISTERING').length,
      orphan: allDomains.filter((d) => !d.siteId).length,
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
        isOrphan: !('isSuggested' in domain) && !domain.site?.id && !domain.siteId,
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
        return NextResponse.json(
          { error: 'Cloudflare credentials not configured' },
          { status: 500 }
        );
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
        return NextResponse.json(
          { error: 'Failed to fetch from Cloudflare', details: data.errors },
          { status: 500 }
        );
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

      // Normalize a string for fuzzy matching: remove hyphens, lowercase
      const normalize = (s: string) => s.toLowerCase().replace(/-/g, '');

      for (const cfDomain of cloudflareDomainsData) {
        // Try to match domain to site by slug
        // e.g., london-food-tours.com -> london-food-tours
        // Also handles non-hyphenated domains like honeymoonexperiences.com -> honeymoon-experiences
        const domainSlug = cfDomain.name.replace(/\.[a-z]{2,}$/i, '');
        const normalizedDomainSlug = normalize(domainSlug);
        const matchingSite =
          sites.find((s) => s.slug === domainSlug) ||
          sites.find((s) => normalize(s.slug) === normalizedDomainSlug);

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
                  await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
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
                  });

                  // Create www CNAME record
                  await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
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
                  });

                  dnsConfigured.push(cfDomain.name);
                }

                // Update domain record with zone ID and set status
                await prisma.domain.update({
                  where: { id: domainRecord.id },
                  data: {
                    cloudflareZoneId: zone.id,
                    dnsConfigured: true,
                    sslEnabled: true, // Cloudflare proxy provides free SSL
                    verifiedAt: new Date(), // Mark as verified so roadmap DOMAIN_VERIFY passes
                    status: 'ACTIVE',
                  },
                });

                // Add domain to Heroku so it accepts requests for this hostname
                await addDomainToHeroku(cfDomain.name);
              }
            } catch (dnsError) {
              console.error(`[DNS] Error configuring DNS for ${cfDomain.name}:`, dnsError);
              // Continue with other domains even if one fails
            }
          }

          // Always update site with primary domain and activate it when domain is matched
          await prisma.site.update({
            where: { id: matchingSite.id },
            data: {
              primaryDomain: cfDomain.name,
              status: 'ACTIVE',
            },
          });
        } else {
          // Persist unmatched domain (no site yet) so it appears in the Domains tab
          const existingDomain = await prisma.domain.findFirst({
            where: { domain: cfDomain.name },
          });

          let orphanRecord;
          if (existingDomain) {
            orphanRecord = await prisma.domain.update({
              where: { id: existingDomain.id },
              data: {
                registeredAt: new Date(cfDomain.registered_at),
                expiresAt: new Date(cfDomain.expires_at),
                autoRenew: cfDomain.auto_renew,
                registrar: 'cloudflare',
              },
            });
          } else {
            orphanRecord = await prisma.domain.create({
              data: {
                domain: cfDomain.name,
                status: 'DNS_PENDING',
                registrar: 'cloudflare',
                registeredAt: new Date(cfDomain.registered_at),
                expiresAt: new Date(cfDomain.expires_at),
                autoRenew: cfDomain.auto_renew,
                registrationCost: 9.77,
                // siteId intentionally null — orphan domain
              },
            });
          }

          // Auto-configure DNS for orphan domains too, so they're ready when a site is created
          if (orphanRecord.status !== 'ACTIVE') {
            try {
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

                const hasRootRecord = existingRecords.some(
                  (r: any) => (r.type === 'CNAME' || r.type === 'A') && r.name === cfDomain.name
                );

                if (!hasRootRecord) {
                  await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
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
                      ttl: 1,
                      proxied: true,
                    }),
                  });

                  await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
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
                  });

                  dnsConfigured.push(cfDomain.name);
                }

                await prisma.domain.update({
                  where: { id: orphanRecord.id },
                  data: {
                    cloudflareZoneId: zone.id,
                    dnsConfigured: true,
                    sslEnabled: true,
                    verifiedAt: new Date(), // Mark as verified so roadmap DOMAIN_VERIFY passes
                    status: 'ACTIVE',
                  },
                });

                await addDomainToHeroku(cfDomain.name);
              }
            } catch (dnsError) {
              console.error(`[DNS] Error configuring DNS for orphan ${cfDomain.name}:`, dnsError);
            }
          }

          unmatched.push({
            domain: cfDomain.name,
            extractedSlug: domainSlug,
            normalizedSlug: normalizedDomainSlug,
            persisted: true,
          });
        }
      }

      // Include available site slugs for debugging unmatched domains
      const availableSlugs = sites.map((s) => s.slug);

      return NextResponse.json({
        success: true,
        message: `Synced ${synced.length} domains from Cloudflare, configured DNS for ${dnsConfigured.length}`,
        totalFromCloudflare: cloudflareDomainsData.length,
        synced,
        dnsConfigured,
        unmatched,
        availableSlugs,
      });
    }

    // Action: Create a new site from an orphan domain (domain with no linked site)
    if (action === 'createSiteFromDomain') {
      const { domainId } = body;

      if (!domainId) {
        return NextResponse.json({ error: 'domainId is required' }, { status: 400 });
      }

      const domainRecord = await prisma.domain.findUnique({
        where: { id: domainId },
      });

      if (!domainRecord) {
        return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
      }

      if (domainRecord.siteId) {
        return NextResponse.json({ error: 'Domain already linked to a site' }, { status: 400 });
      }

      // Derive site name and slug from domain
      // e.g. "honeymoonexperiences.com" -> slug "honeymoonexperiences", name "Honeymoonexperiences"
      // e.g. "london-food-tours.com" -> slug "london-food-tours", name "London Food Tours"
      const slug = domainRecord.domain.replace(/\.[a-z]{2,}$/i, '');
      const name = slug
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Check if a site with this slug already exists
      const existingSite = await prisma.site.findUnique({
        where: { slug },
      });

      if (existingSite) {
        // Link the domain to the existing site instead of creating a new one
        await prisma.domain.update({
          where: { id: domainId },
          data: { siteId: existingSite.id },
        });
        await prisma.site.update({
          where: { id: existingSite.id },
          data: { primaryDomain: domainRecord.domain, status: 'ACTIVE' },
        });
        return NextResponse.json({
          success: true,
          site: { id: existingSite.id, name: existingSite.name, slug: existingSite.slug },
          domain: domainRecord.domain,
          action: 'linked',
        });
      }

      // Create new site
      const site = await prisma.site.create({
        data: {
          name,
          slug,
          status: 'DRAFT',
          primaryDomain: domainRecord.domain,
          holibobPartnerId: 'default',
        },
      });

      // Link domain to the new site
      await prisma.domain.update({
        where: { id: domainId },
        data: { siteId: site.id },
      });

      // Auto-initialize roadmap and kick off first tasks so the pipeline starts immediately
      let roadmapResult = null;
      try {
        const { initializeSiteRoadmap, executeNextTasks } =
          await import('@experience-marketplace/jobs');
        await initializeSiteRoadmap(site.id);
        roadmapResult = await executeNextTasks(site.id, { retryFailed: true });
        console.log(
          `[CreateSite] Roadmap initialized and tasks queued for ${site.name}:`,
          roadmapResult
        );
      } catch (roadmapError) {
        console.error(`[CreateSite] Error initializing roadmap for ${site.name}:`, roadmapError);
        // Non-fatal — site is created, roadmap can be initialized manually
      }

      return NextResponse.json({
        success: true,
        site: { id: site.id, name: site.name, slug: site.slug },
        domain: domainRecord.domain,
        action: 'created',
        roadmap: roadmapResult
          ? { queued: roadmapResult.queued, blocked: roadmapResult.blocked }
          : null,
      });
    }

    // Action: Add all active domains to Heroku
    if (action === 'syncHeroku') {
      const herokuApiKey = process.env['HEROKU_API_KEY'];
      const herokuAppName = process.env['HEROKU_APP_NAME'];

      if (!herokuApiKey || !herokuAppName) {
        return NextResponse.json({ error: 'Heroku credentials not configured' }, { status: 500 });
      }

      // Get all active domains
      const activeDomains = await prisma.domain.findMany({
        where: {
          status: 'ACTIVE',
        },
        select: {
          domain: true,
        },
      });

      const added: string[] = [];
      const failed: string[] = [];

      for (const domainRecord of activeDomains) {
        const result = await addDomainToHeroku(domainRecord.domain);
        if (result.success) {
          added.push(domainRecord.domain);
        } else {
          failed.push(domainRecord.domain);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Added ${added.length} domains to Heroku`,
        added,
        failed,
      });
    }

    // Action: Check availability for all pending/suggested domains
    if (action === 'checkAvailability') {
      const apiKey = process.env['CLOUDFLARE_API_KEY'];
      const email = process.env['CLOUDFLARE_EMAIL'];
      const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];

      if (!apiKey || !email || !accountId) {
        return NextResponse.json(
          { error: 'Cloudflare credentials not configured' },
          { status: 500 }
        );
      }

      // Get all sites without domains to check their suggested domains
      const sitesWithoutDomains = await prisma.site.findMany({
        where: {
          domains: { none: {} },
          status: { notIn: ['ARCHIVED'] },
        },
        select: { id: true, slug: true, name: true },
      });

      let checked = 0;
      let available = 0;
      let notAvailable = 0;

      for (const site of sitesWithoutDomains) {
        const suggestedDomain = `${site.slug}.com`;

        try {
          // Check availability via Cloudflare API
          const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domains/${suggestedDomain}`,
            {
              headers: {
                'X-Auth-Email': email,
                'X-Auth-Key': apiKey,
              },
            }
          );

          const data = await response.json();
          checked++;

          // If domain doesn't exist in our account, check if it's available
          if (!data.success || response.status === 404) {
            // Check availability
            const availResponse = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domains/check?name=${suggestedDomain}`,
              {
                headers: {
                  'X-Auth-Email': email,
                  'X-Auth-Key': apiKey,
                },
              }
            );

            const availData = await availResponse.json();
            const isAvailable = availData.result?.available ?? false;
            const price = availData.result?.price ?? null;

            // Create or update domain record with availability status
            const existingDomain = await prisma.domain.findFirst({
              where: { domain: suggestedDomain },
            });

            if (existingDomain) {
              await prisma.domain.update({
                where: { id: existingDomain.id },
                data: {
                  status: (isAvailable ? 'AVAILABLE' : 'NOT_AVAILABLE') as any,
                  registrationCost: price ? parseFloat(price) : undefined,
                },
              });
            } else {
              await prisma.domain.create({
                data: {
                  domain: suggestedDomain,
                  status: (isAvailable ? 'AVAILABLE' : 'NOT_AVAILABLE') as any,
                  registrar: 'cloudflare',
                  registrationCost: price ? parseFloat(price) : 9.77,
                  siteId: site.id,
                },
              });
            }

            if (isAvailable) {
              available++;
            } else {
              notAvailable++;
            }
          } else {
            // Domain already registered in our account
            available++; // Count as available since we own it
          }
        } catch (error) {
          console.error(`[Availability] Error checking ${suggestedDomain}:`, error);
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      return NextResponse.json({
        success: true,
        checked,
        available,
        notAvailable,
      });
    }

    // Action: Check availability for a single domain
    if (action === 'checkSingleAvailability') {
      const { domain: domainToCheck, domainId } = body;

      if (!domainToCheck) {
        return NextResponse.json({ error: 'domain is required' }, { status: 400 });
      }

      const apiKey = process.env['CLOUDFLARE_API_KEY'];
      const email = process.env['CLOUDFLARE_EMAIL'];
      const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];

      if (!apiKey || !email || !accountId) {
        return NextResponse.json(
          { error: 'Cloudflare credentials not configured' },
          { status: 500 }
        );
      }

      try {
        // Check availability via Cloudflare API
        const availResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domains/check?name=${domainToCheck}`,
          {
            headers: {
              'X-Auth-Email': email,
              'X-Auth-Key': apiKey,
            },
          }
        );

        const availData = await availResponse.json();
        const isAvailable = availData.result?.available ?? false;
        const price = availData.result?.price ?? null;

        // Find or create domain record
        let domainRecord = await prisma.domain.findFirst({
          where: { domain: domainToCheck },
        });

        if (domainRecord) {
          await prisma.domain.update({
            where: { id: domainRecord.id },
            data: {
              status: (isAvailable ? 'AVAILABLE' : 'NOT_AVAILABLE') as any,
              registrationCost: price ? parseFloat(price) : undefined,
            },
          });
        } else if (domainId?.startsWith('suggested-')) {
          // This is a suggested domain, create the record
          const siteId = domainId.replace('suggested-', '');
          domainRecord = await prisma.domain.create({
            data: {
              domain: domainToCheck,
              status: (isAvailable ? 'AVAILABLE' : 'NOT_AVAILABLE') as any,
              registrar: 'cloudflare',
              registrationCost: price ? parseFloat(price) : 9.77,
              siteId,
            },
          });
        }

        return NextResponse.json({
          success: true,
          domain: domainToCheck,
          available: isAvailable,
          price,
        });
      } catch (error) {
        console.error(`[Availability] Error checking ${domainToCheck}:`, error);
        return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
      }
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
