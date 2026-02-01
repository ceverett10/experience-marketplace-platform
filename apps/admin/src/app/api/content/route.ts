import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PageStatus } from '@prisma/client';

export async function GET(): Promise<NextResponse> {
  try {
    // Fetch all pages with their site information and content
    const pages = await prisma.page.findMany({
      include: {
        site: {
          select: {
            id: true,
            name: true,
          },
        },
        content: {
          select: {
            id: true,
            body: true,
            qualityScore: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Transform database pages to match the frontend interface
    const contentItems = pages.map((page) => ({
      id: page.id,
      type: mapPageTypeToContentType(page.type),
      title: page.title,
      content: page.content?.body || '',
      siteName: page.site.name,
      status: mapPageStatusToContentStatus(page.status),
      qualityScore: page.content?.qualityScore || 0,
      generatedAt: page.content?.createdAt.toISOString() || page.createdAt.toISOString(),
    }));

    return NextResponse.json(contentItems);
  } catch (error) {
    console.error('[API] Error fetching content:', error);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Map frontend status to database PageStatus
    const pageStatus = mapContentStatusToPageStatus(status);

    // Update the page status
    const updatedPage = await prisma.page.update({
      where: { id },
      data: { status: pageStatus },
    });

    return NextResponse.json({
      success: true,
      id: updatedPage.id,
      status: mapPageStatusToContentStatus(updatedPage.status),
    });
  } catch (error) {
    console.error('[API] Error updating content:', error);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}

// Helper functions to map between database enums and frontend types
function mapPageTypeToContentType(pageType: string): 'experience' | 'collection' | 'seo' | 'blog' {
  switch (pageType) {
    case 'BLOG':
      return 'blog';
    case 'CATEGORY':
      return 'collection';
    case 'DESTINATION':
      return 'seo';
    case 'EXPERIENCE':
      return 'experience';
    default:
      return 'blog';
  }
}

function mapPageStatusToContentStatus(
  pageStatus: string
): 'pending' | 'approved' | 'rejected' | 'published' {
  switch (pageStatus) {
    case 'DRAFT':
      return 'pending';
    case 'PUBLISHED':
      return 'published';
    case 'ARCHIVED':
      return 'rejected';
    default:
      return 'pending';
  }
}

function mapContentStatusToPageStatus(contentStatus: string): PageStatus {
  switch (contentStatus) {
    case 'pending':
      return PageStatus.DRAFT;
    case 'approved':
      return PageStatus.DRAFT; // Keep as draft but mark as approved
    case 'published':
      return PageStatus.PUBLISHED;
    case 'rejected':
      return PageStatus.ARCHIVED;
    default:
      return PageStatus.DRAFT;
  }
}
