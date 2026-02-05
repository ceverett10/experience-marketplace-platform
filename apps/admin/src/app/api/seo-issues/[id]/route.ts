export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getSEOIssue,
  updateSEOIssueStatus,
  resolveSEOIssue,
  dismissSEOIssue,
  type IssueStatus,
} from '@experience-marketplace/jobs';
import { prisma } from '@experience-marketplace/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/seo-issues/[id]
 * Returns a single SEO issue with full details
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const issue = await getSEOIssue(id);

    if (!issue) {
      return NextResponse.json({ error: 'SEO issue not found' }, { status: 404 });
    }

    return NextResponse.json(issue);
  } catch (error) {
    console.error('[API] Error fetching SEO issue:', error);
    return NextResponse.json({ error: 'Failed to fetch SEO issue' }, { status: 500 });
  }
}

/**
 * PATCH /api/seo-issues/[id]
 * Update issue status or resolve
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, status, resolution, resolvedBy } = body;

    // Check issue exists
    const issue = await getSEOIssue(id);
    if (!issue) {
      return NextResponse.json({ error: 'SEO issue not found' }, { status: 404 });
    }

    // Simple status update
    if (action === 'update-status' && status) {
      await updateSEOIssueStatus(id, status as IssueStatus);
      return NextResponse.json({
        success: true,
        message: `Issue status updated to ${status}`,
      });
    }

    // Resolve issue
    if (action === 'resolve') {
      await resolveSEOIssue(id, resolution || 'Resolved', resolvedBy || 'admin');
      return NextResponse.json({
        success: true,
        message: 'Issue resolved successfully',
      });
    }

    // Dismiss issue (won't fix)
    if (action === 'dismiss') {
      await dismissSEOIssue(id, resolution || 'Dismissed', resolvedBy || 'admin');
      return NextResponse.json({
        success: true,
        message: 'Issue dismissed successfully',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API] Error updating SEO issue:', error);
    return NextResponse.json({ error: 'Failed to update SEO issue' }, { status: 500 });
  }
}

/**
 * DELETE /api/seo-issues/[id]
 * Delete an SEO issue
 */
export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;

    // Check issue exists
    const issue = await getSEOIssue(id);
    if (!issue) {
      return NextResponse.json({ error: 'SEO issue not found' }, { status: 404 });
    }

    await prisma.sEOIssue.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'SEO issue deleted successfully',
    });
  } catch (error) {
    console.error('[API] Error deleting SEO issue:', error);
    return NextResponse.json({ error: 'Failed to delete SEO issue' }, { status: 500 });
  }
}
