import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';

/**
 * Debug endpoint to check GSC verification and indexing readiness for all active sites.
 * Reports which sites have completed each step in the indexing pipeline:
 *   1. Domain registered and active
 *   2. Cloudflare zone ID configured
 *   3. GSC verification code set
 *   4. GSC verified
 *   5. Sitemap accessible
 *   6. Primary domain configured
 *
 * Usage: /admin/api/debug/gsc-status
 *        /admin/api/debug/gsc-status?siteId=xxx  (single site)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteIdParam = searchParams.get('siteId');

    const whereClause = siteIdParam
      ? { id: siteIdParam }
      : { status: { not: 'ARCHIVED' as const } };

    const sites = await prisma.site.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        primaryDomain: true,
        gscVerified: true,
        gscVerifiedAt: true,
        gscVerificationCode: true,
        gscPropertyUrl: true,
        gscLastSyncedAt: true,
        domains: {
          select: {
            id: true,
            domain: true,
            status: true,
            cloudflareZoneId: true,
            sslEnabled: true,
          },
        },
        jobs: {
          where: {
            type: { in: ['GSC_SETUP', 'GSC_VERIFY', 'GSC_SYNC'] },
          },
          orderBy: { createdAt: 'desc' as const },
          take: 5,
          select: {
            id: true,
            type: true,
            status: true,
            error: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const diagnostics = sites.map((site) => {
      const activeDomain = site.domains.find((d) => d.status === 'ACTIVE');
      const anyDomain = site.domains[0];
      const domain = activeDomain || anyDomain;

      // Check each step in the pipeline
      const checks = {
        hasDomain: !!domain,
        domainActive: domain?.status === 'ACTIVE',
        hasCloudflareZone: !!domain?.cloudflareZoneId,
        sslReady: !!domain?.sslEnabled,
        hasPrimaryDomain: !!site.primaryDomain,
        hasVerificationCode: !!site.gscVerificationCode,
        gscVerified: !!site.gscVerified,
        gscSynced: !!site.gscLastSyncedAt,
      };

      // Determine overall status
      let overallStatus: 'ready' | 'partial' | 'blocked' | 'not_started';
      if (checks.gscVerified && checks.hasPrimaryDomain) {
        overallStatus = 'ready';
      } else if (checks.hasDomain && checks.hasCloudflareZone) {
        overallStatus = 'partial';
      } else if (!checks.hasDomain) {
        overallStatus = 'not_started';
      } else {
        overallStatus = 'blocked';
      }

      // Identify the specific blocker
      let blocker: string | null = null;
      if (!checks.hasDomain) {
        blocker = 'No domain record exists — DOMAIN_REGISTER has not run';
      } else if (!checks.domainActive) {
        blocker = `Domain ${domain?.domain} status is "${domain?.status}" — needs to be ACTIVE`;
      } else if (!checks.hasCloudflareZone) {
        blocker = `Domain ${domain?.domain} has no cloudflareZoneId — DNS setup incomplete`;
      } else if (!checks.sslReady) {
        blocker = `SSL not enabled on domain — SSL_PROVISION needs to complete`;
      } else if (!checks.hasVerificationCode) {
        blocker = 'No GSC verification code — GSC_SETUP has not run or failed before getting token';
      } else if (!checks.gscVerified) {
        blocker =
          'GSC verification code exists but verification failed — DNS TXT record may not have propagated';
      } else if (!checks.hasPrimaryDomain) {
        blocker = 'No primaryDomain set on site — sitemaps and canonicals will use wrong hostname';
      }

      // Get latest job status for each GSC job type
      const latestJobs: Record<string, { status: string; error: string | null; date: Date }> = {};
      for (const job of site.jobs) {
        if (!latestJobs[job.type]) {
          latestJobs[job.type] = {
            status: job.status,
            error: job.error,
            date: job.completedAt || job.createdAt,
          };
        }
      }

      return {
        site: {
          id: site.id,
          name: site.name,
          slug: site.slug,
          status: site.status,
        },
        domain: domain
          ? {
              domain: domain.domain,
              status: domain.status,
              hasCloudflareZone: !!domain.cloudflareZoneId,
              sslEnabled: domain.sslEnabled,
            }
          : null,
        gsc: {
          primaryDomain: site.primaryDomain,
          verified: site.gscVerified,
          verifiedAt: site.gscVerifiedAt,
          propertyUrl: site.gscPropertyUrl,
          lastSyncedAt: site.gscLastSyncedAt,
          verificationCode: site.gscVerificationCode ? '(set)' : null,
        },
        checks,
        overallStatus,
        blocker,
        recentJobs: latestJobs,
      };
    });

    // Summary counts
    const summary = {
      total: diagnostics.length,
      ready: diagnostics.filter((d) => d.overallStatus === 'ready').length,
      partial: diagnostics.filter((d) => d.overallStatus === 'partial').length,
      blocked: diagnostics.filter((d) => d.overallStatus === 'blocked').length,
      notStarted: diagnostics.filter((d) => d.overallStatus === 'not_started').length,
    };

    return NextResponse.json({
      summary,
      sites: diagnostics,
    });
  } catch (error) {
    console.error('[GSC Status] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
