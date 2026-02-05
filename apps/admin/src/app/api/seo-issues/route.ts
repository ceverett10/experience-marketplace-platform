export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getSEOIssues,
  getSEOIssueSummary,
  createSEOIssue,
  bulkUpdateSEOIssues,
  cleanupOldResolvedIssues,
  type IssueCategory,
  type IssueSeverity,
  type IssueStatus,
} from '@experience-marketplace/jobs';

/**
 * GET /api/seo-issues
 * Returns paginated SEO issues with filtering + summary stats
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Filters
    const siteId = searchParams.get('siteId') || undefined;
    const pageId = searchParams.get('pageId') || undefined;
    const category = (searchParams.get('category') as IssueCategory) || undefined;
    const severity = (searchParams.get('severity') as IssueSeverity) || undefined;
    const status = (searchParams.get('status') as IssueStatus) || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const offset = (page - 1) * limit;

    // Fetch issues + summary in parallel
    const [issuesResult, summary] = await Promise.all([
      getSEOIssues({
        siteId,
        pageId,
        category,
        severity,
        status,
        limit,
        offset,
      }),
      getSEOIssueSummary(siteId),
    ]);

    // Determine overall health based on issues
    let health: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (summary.critical > 0) {
      health = 'critical';
    } else if (summary.high > 5 || summary.open > 20) {
      health = 'degraded';
    }

    return NextResponse.json({
      health,
      summary: {
        total: summary.total,
        open: summary.open,
        critical: summary.critical,
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
        resolvedThisWeek: summary.resolvedThisWeek,
        byCategory: summary.byCategory,
        byStatus: summary.byStatus,
      },
      issues: issuesResult.issues,
      pagination: {
        page,
        limit,
        total: issuesResult.total,
        totalPages: Math.ceil(issuesResult.total / limit),
      },
    });
  } catch (error) {
    console.error('[API] Error fetching SEO issues:', error);
    return NextResponse.json({ error: 'Failed to fetch SEO issues' }, { status: 500 });
  }
}

/**
 * POST /api/seo-issues
 * Actions: create issue, bulk update, cleanup old issues
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = body;

    // Create a manual issue
    if (action === 'create') {
      const {
        siteId,
        pageId,
        category,
        severity,
        title,
        description,
        recommendation,
        estimatedImpact,
      } = body;

      if (!siteId || !category || !severity || !title || !description || !recommendation) {
        return NextResponse.json(
          { error: 'Missing required fields: siteId, category, severity, title, description, recommendation' },
          { status: 400 }
        );
      }

      const issueId = await createSEOIssue({
        siteId,
        pageId,
        category,
        severity,
        title,
        description,
        recommendation,
        estimatedImpact: estimatedImpact || 'Unknown',
        detectedBy: 'MANUAL',
      });

      return NextResponse.json({
        success: true,
        issueId,
        message: 'SEO issue created successfully',
      });
    }

    // Bulk update issues
    if (action === 'bulk-update') {
      const { issueIds, status, resolution, resolvedBy } = body;

      if (!issueIds || !Array.isArray(issueIds) || !status) {
        return NextResponse.json(
          { error: 'Missing required fields: issueIds (array), status' },
          { status: 400 }
        );
      }

      const updatedCount = await bulkUpdateSEOIssues(
        issueIds,
        status,
        resolution,
        resolvedBy || 'admin'
      );

      return NextResponse.json({
        success: true,
        message: `Updated ${updatedCount} issues`,
        updatedCount,
      });
    }

    // Cleanup old resolved issues
    if (action === 'cleanup') {
      const deletedCount = await cleanupOldResolvedIssues();
      return NextResponse.json({
        success: true,
        message: `Cleaned up ${deletedCount} old resolved issues`,
        deletedCount,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API] Error performing SEO issue action:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
