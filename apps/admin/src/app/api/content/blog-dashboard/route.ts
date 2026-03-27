import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/content/blog-dashboard
 *
 * Returns blog generation pipeline stats, active jobs, recently published posts,
 * and recent failures. All data from Postgres (no Redis — web dyno can't connect).
 * Designed to be polled every 30s from the admin content page.
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Time window: count completed/failed only from last 24h to keep query fast
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [pipelineCounts, activeJobs, recentlyPublished, recentFailures] = await Promise.all([
      // 1. Pipeline status counts (active statuses = all time, completed/failed = last 24h)
      prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT status, COUNT(*)::bigint as count
        FROM "Job"
        WHERE type = 'CONTENT_GENERATE'
          AND payload->>'contentType' = 'blog'
          AND (
            status NOT IN ('COMPLETED', 'FAILED')
            OR "createdAt" >= ${last24h}
          )
        GROUP BY status
      `,

      // 2. Active jobs (PENDING, SCHEDULED, RUNNING, RETRYING) — most recent 20
      prisma.$queryRaw<
        Array<{
          id: string;
          status: string;
          payload: Record<string, unknown>;
          attempts: number;
          createdAt: Date;
          updatedAt: Date;
        }>
      >`
        SELECT id, status, payload, attempts, "createdAt", "updatedAt"
        FROM "Job"
        WHERE type = 'CONTENT_GENERATE'
          AND payload->>'contentType' = 'blog'
          AND status IN ('RUNNING', 'RETRYING', 'PENDING')
        ORDER BY
          CASE status
            WHEN 'RUNNING' THEN 1
            WHEN 'RETRYING' THEN 2
            WHEN 'PENDING' THEN 3
          END,
          "updatedAt" DESC
        LIMIT 20
      `,

      // 3. Recently published blog pages on microsites (last 7 days)
      prisma.page.findMany({
        where: {
          type: 'BLOG',
          status: 'PUBLISHED',
          micrositeId: { not: null },
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { updatedAt: 'desc' },
        take: 15,
        select: {
          id: true,
          title: true,
          slug: true,
          micrositeId: true,
          updatedAt: true,
          publishedAt: true,
          content: { select: { qualityScore: true } },
        },
      }),

      // 4. Recent failures (last 48h)
      prisma.$queryRaw<
        Array<{
          id: string;
          error: string | null;
          payload: Record<string, unknown>;
          attempts: number;
          maxAttempts: number;
          updatedAt: Date;
        }>
      >`
        SELECT id, error, payload, attempts, "maxAttempts", "updatedAt"
        FROM "Job"
        WHERE type = 'CONTENT_GENERATE'
          AND payload->>'contentType' = 'blog'
          AND status = 'FAILED'
          AND "createdAt" >= ${new Date(Date.now() - 48 * 60 * 60 * 1000)}
        ORDER BY "updatedAt" DESC
        LIMIT 10
      `,
    ]);

    // Build pipeline counts map
    const pipeline: Record<string, number> = {
      PENDING: 0,
      SCHEDULED: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
      RETRYING: 0,
    };
    for (const row of pipelineCounts) {
      pipeline[row.status] = Number(row.count);
    }

    // Resolve microsite and site names for active jobs and failures
    const micrositeIds = new Set<string>();
    const siteIds = new Set<string>();
    for (const job of [...activeJobs, ...recentFailures]) {
      const payload = job.payload as Record<string, unknown>;
      const msId = payload?.['micrositeId'] as string | undefined;
      const sId = payload?.['siteId'] as string | undefined;
      if (msId) micrositeIds.add(msId);
      if (sId) siteIds.add(sId);
    }
    for (const page of recentlyPublished) {
      if (page.micrositeId) micrositeIds.add(page.micrositeId);
    }

    const [microsites, sites] = await Promise.all([
      micrositeIds.size > 0
        ? prisma.micrositeConfig.findMany({
            where: { id: { in: Array.from(micrositeIds) } },
            select: { id: true, siteName: true },
          })
        : [],
      siteIds.size > 0
        ? prisma.site.findMany({
            where: { id: { in: Array.from(siteIds) } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const micrositeMap = new Map<string, string>();
    for (const ms of microsites) {
      micrositeMap.set(ms.id, ms.siteName);
    }
    const siteMap = new Map<string, string>();
    for (const s of sites) {
      siteMap.set(s.id, s.name);
    }

    // Resolve a display name from payload: try micrositeId first, then siteId
    const resolveName = (payload: Record<string, unknown>): string => {
      const msId = payload?.['micrositeId'] as string | undefined;
      const sId = payload?.['siteId'] as string | undefined;
      if (msId && micrositeMap.has(msId)) return micrositeMap.get(msId)!;
      if (sId && siteMap.has(sId)) return siteMap.get(sId)!;
      return 'Unknown';
    };

    // Format active jobs
    const formattedActiveJobs = activeJobs.map((job) => {
      const payload = job.payload as Record<string, unknown>;
      const micrositeId = (payload?.['micrositeId'] as string) || '';
      return {
        id: job.id,
        status: job.status,
        micrositeName: resolveName(payload),
        micrositeId,
        targetKeyword: (payload?.['targetKeyword'] as string) || null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        attempts: job.attempts,
      };
    });

    // Format recently published
    const formattedPublished = recentlyPublished.map((page) => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      micrositeName: micrositeMap.get(page.micrositeId || '') || 'Unknown',
      qualityScore: page.content?.qualityScore || 0,
      publishedAt: page.publishedAt || page.updatedAt,
    }));

    // Format failures
    const formattedFailures = recentFailures.map((job) => {
      const payload = job.payload as Record<string, unknown>;
      const micrositeId = (payload?.['micrositeId'] as string) || '';
      return {
        id: job.id,
        error: job.error || 'Unknown error',
        micrositeName: resolveName(payload),
        micrositeId,
        updatedAt: job.updatedAt,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
      };
    });

    return NextResponse.json({
      pipeline,
      activeJobs: formattedActiveJobs,
      recentlyPublished: formattedPublished,
      recentFailures: formattedFailures,
    });
  } catch (error) {
    console.error('[API] Error fetching blog dashboard:', error);
    return NextResponse.json({ error: 'Failed to fetch blog dashboard' }, { status: 500 });
  }
}
