import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PageStatus, PageType } from '@prisma/client';

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
    const contentItems = pages.map((page) => {
      // Safely get the generated date with proper null checking
      let generatedAt: string;
      if (page.content?.createdAt) {
        generatedAt = page.content.createdAt.toISOString();
      } else {
        generatedAt = page.createdAt.toISOString();
      }

      return {
        id: page.id,
        type: mapPageTypeToContentType(page.type),
        title: page.title,
        content: page.content?.body || '',
        siteName: page.site.name,
        status: mapPageStatusToContentStatus(page.status),
        qualityScore: page.content?.qualityScore ?? 0,
        generatedAt,
      };
    });

    return NextResponse.json(contentItems);
  } catch (error) {
    console.error('[API] Error fetching content:', error);
    // Log more details for debugging
    if (error instanceof Error) {
      console.error('[API] Error details:', error.message, error.stack);
    }
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

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { id, title, content } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Missing page ID' }, { status: 400 });
    }

    // Get the page to find associated content
    const page = await prisma.page.findUnique({
      where: { id },
      include: { content: true },
    });

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Update page title if provided
    if (title !== undefined) {
      await prisma.page.update({
        where: { id },
        data: { title },
      });
    }

    // Update content body if provided and content exists
    if (content !== undefined && page.contentId) {
      await prisma.content.update({
        where: { id: page.contentId },
        data: {
          body: content,
          isAiGenerated: false, // Mark as manually edited
        },
      });
    }

    // Fetch updated page data
    const updatedPage = await prisma.page.findUnique({
      where: { id },
      include: {
        site: { select: { name: true } },
        content: { select: { body: true, qualityScore: true, createdAt: true } },
      },
    });

    if (!updatedPage) {
      return NextResponse.json({ error: 'Failed to fetch updated page' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: updatedPage.id,
      title: updatedPage.title,
      content: updatedPage.content?.body || '',
      siteName: updatedPage.site.name,
      status: mapPageStatusToContentStatus(updatedPage.status),
      qualityScore: updatedPage.content?.qualityScore ?? 0,
      generatedAt: updatedPage.content?.createdAt?.toISOString() || updatedPage.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('[API] Error updating content:', error);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}

// Helper functions to map between database enums and frontend types
function mapPageTypeToContentType(pageType: PageType): 'experience' | 'collection' | 'seo' | 'blog' {
  switch (pageType) {
    case PageType.BLOG:
      return 'blog';
    case PageType.CATEGORY:
      return 'collection';
    case PageType.PRODUCT:
      return 'experience';
    case PageType.LANDING:
    case PageType.HOMEPAGE:
      return 'seo';
    case PageType.FAQ:
    case PageType.ABOUT:
    case PageType.CONTACT:
    case PageType.LEGAL:
    default:
      return 'blog';
  }
}

function mapPageStatusToContentStatus(
  pageStatus: PageStatus
): 'pending' | 'approved' | 'rejected' | 'published' {
  switch (pageStatus) {
    case PageStatus.DRAFT:
      return 'pending';
    case PageStatus.REVIEW:
      return 'approved';
    case PageStatus.PUBLISHED:
      return 'published';
    case PageStatus.ARCHIVED:
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
