/**
 * SEO Issue Tracking Service
 * Manages detection, tracking, and resolution of SEO issues
 * that require human review or cannot be fully automated
 */

import { prisma, Prisma } from '@experience-marketplace/database';

export type IssueCategory = 'CONTENT' | 'TECHNICAL' | 'PERFORMANCE' | 'COMPETITOR_GAP';
export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WONT_FIX';

export interface CreateIssueParams {
  siteId: string;
  pageId?: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  estimatedImpact: string;
  detectedBy: string;
  metadata?: Record<string, unknown>;
}

export interface SEOIssueFilters {
  siteId?: string;
  pageId?: string;
  category?: IssueCategory;
  severity?: IssueSeverity;
  status?: IssueStatus;
  limit?: number;
  offset?: number;
}

/**
 * Create a new SEO issue (with duplicate detection)
 */
export async function createSEOIssue(params: CreateIssueParams): Promise<string> {
  // Check for duplicate (same site/page + title + category that's still open)
  const existing = await prisma.sEOIssue.findFirst({
    where: {
      siteId: params.siteId,
      pageId: params.pageId ?? null,
      title: params.title,
      category: params.category,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    },
  });

  if (existing) {
    // Update the existing issue's detection time if it's a repeat
    await prisma.sEOIssue.update({
      where: { id: existing.id },
      data: { detectedAt: new Date() },
    });
    return existing.id;
  }

  const issue = await prisma.sEOIssue.create({
    data: {
      siteId: params.siteId,
      pageId: params.pageId,
      category: params.category,
      severity: params.severity,
      title: params.title,
      description: params.description,
      recommendation: params.recommendation,
      estimatedImpact: params.estimatedImpact,
      detectedBy: params.detectedBy,
      ...(params.metadata && { metadata: params.metadata as Prisma.InputJsonValue }),
    },
  });

  return issue.id;
}

/**
 * Get paginated list of SEO issues with filters
 */
export async function getSEOIssues(filters: SEOIssueFilters) {
  const where: Record<string, unknown> = {};

  if (filters.siteId) where['siteId'] = filters.siteId;
  if (filters.pageId) where['pageId'] = filters.pageId;
  if (filters.category) where['category'] = filters.category;
  if (filters.severity) where['severity'] = filters.severity;
  if (filters.status) where['status'] = filters.status;

  const [issues, total] = await Promise.all([
    prisma.sEOIssue.findMany({
      where,
      include: {
        site: { select: { name: true, primaryDomain: true } },
        page: { select: { title: true, slug: true } },
      },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
      take: filters.limit || 50,
      skip: filters.offset || 0,
    }),
    prisma.sEOIssue.count({ where }),
  ]);

  return { issues, total };
}

/**
 * Get a single SEO issue by ID
 */
export async function getSEOIssue(issueId: string) {
  return prisma.sEOIssue.findUnique({
    where: { id: issueId },
    include: {
      site: { select: { name: true, primaryDomain: true } },
      page: { select: { title: true, slug: true, type: true } },
    },
  });
}

/**
 * Update issue status
 */
export async function updateSEOIssueStatus(issueId: string, status: IssueStatus): Promise<void> {
  await prisma.sEOIssue.update({
    where: { id: issueId },
    data: { status },
  });
}

/**
 * Resolve an SEO issue with notes
 */
export async function resolveSEOIssue(
  issueId: string,
  resolution: string,
  resolvedBy: string
): Promise<void> {
  await prisma.sEOIssue.update({
    where: { id: issueId },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedBy,
      resolution,
    },
  });
}

/**
 * Mark issue as won't fix
 */
export async function dismissSEOIssue(
  issueId: string,
  reason: string,
  dismissedBy: string
): Promise<void> {
  await prisma.sEOIssue.update({
    where: { id: issueId },
    data: {
      status: 'WONT_FIX',
      resolvedAt: new Date(),
      resolvedBy: dismissedBy,
      resolution: reason,
    },
  });
}

/**
 * Get summary statistics for SEO issues
 */
export async function getSEOIssueSummary(siteId?: string) {
  const where = siteId ? { siteId } : {};
  const openWhere = { ...where, status: { in: ['OPEN', 'IN_PROGRESS'] } };

  const [byCategory, bySeverity, byStatus, recentlyResolved] = await Promise.all([
    prisma.sEOIssue.groupBy({
      by: ['category'],
      where: openWhere,
      _count: true,
    }),
    prisma.sEOIssue.groupBy({
      by: ['severity'],
      where: openWhere,
      _count: true,
    }),
    prisma.sEOIssue.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
    prisma.sEOIssue.count({
      where: {
        ...where,
        status: 'RESOLVED',
        resolvedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    }),
  ]);

  // Convert to more usable format
  const categoryMap = Object.fromEntries(byCategory.map((c) => [c.category, c._count]));
  const severityMap = Object.fromEntries(bySeverity.map((s) => [s.severity, s._count]));
  const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));

  return {
    total: Object.values(statusMap).reduce((a, b) => a + b, 0),
    open: (statusMap['OPEN'] || 0) + (statusMap['IN_PROGRESS'] || 0),
    critical: severityMap['CRITICAL'] || 0,
    high: severityMap['HIGH'] || 0,
    medium: severityMap['MEDIUM'] || 0,
    low: severityMap['LOW'] || 0,
    resolvedThisWeek: recentlyResolved,
    byCategory: categoryMap,
    byStatus: statusMap,
  };
}

/**
 * Bulk update issues for a site (e.g., resolve all of a category)
 */
export async function bulkUpdateSEOIssues(
  issueIds: string[],
  status: IssueStatus,
  resolution?: string,
  resolvedBy?: string
): Promise<number> {
  const result = await prisma.sEOIssue.updateMany({
    where: { id: { in: issueIds } },
    data: {
      status,
      ...(status === 'RESOLVED' || status === 'WONT_FIX'
        ? {
            resolvedAt: new Date(),
            resolvedBy,
            resolution,
          }
        : {}),
    },
  });

  return result.count;
}

/**
 * Clean up old resolved issues (older than 30 days)
 */
export async function cleanupOldResolvedIssues(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await prisma.sEOIssue.deleteMany({
    where: {
      status: { in: ['RESOLVED', 'WONT_FIX'] },
      resolvedAt: { lt: thirtyDaysAgo },
    },
  });

  return result.count;
}
