import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PageStatus, PageType } from '@prisma/client';
import { addJob } from '@experience-marketplace/jobs';

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
        contentId: page.contentId, // Include for debugging - null means no content record exists
        hasContent: !!page.content?.body,
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

    // Update or create content body if provided
    if (content !== undefined) {
      if (page.contentId) {
        // Update existing content
        await prisma.content.update({
          where: { id: page.contentId },
          data: {
            body: content,
            isAiGenerated: false, // Mark as manually edited
          },
        });
      } else {
        // Create new content and link to page
        const newContent = await prisma.content.create({
          data: {
            siteId: page.siteId,
            body: content,
            bodyFormat: 'MARKDOWN',
            isAiGenerated: false,
            qualityScore: 0,
            version: 1,
          },
        });
        // Link content to page
        await prisma.page.update({
          where: { id },
          data: { contentId: newContent.id },
        });
      }
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
      contentId: updatedPage.contentId,
      hasContent: !!updatedPage.content?.body,
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

// Map PageType to content generation type
function mapPageTypeToGenerationType(
  pageType: PageType
): 'destination' | 'experience' | 'category' | 'blog' {
  switch (pageType) {
    case PageType.PRODUCT:
      return 'experience';
    case PageType.CATEGORY:
      return 'category';
    case PageType.BLOG:
      return 'blog';
    default:
      return 'destination';
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action, pageIds } = body;

    if (action === 'generate') {
      // Find pages without content or specific pages to regenerate
      let pagesToGenerate;

      if (pageIds && pageIds.length > 0) {
        // Generate content for specific pages
        pagesToGenerate = await prisma.page.findMany({
          where: {
            id: { in: pageIds },
          },
          include: {
            site: true,
          },
        });
      } else {
        // Find all pages without content
        pagesToGenerate = await prisma.page.findMany({
          where: {
            OR: [{ contentId: null }, { content: { body: '' } }],
          },
          include: {
            site: true,
          },
        });
      }

      if (pagesToGenerate.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No pages need content generation',
          jobsQueued: 0,
        });
      }

      // Queue content generation jobs for each page
      const queuedJobs = [];
      for (const page of pagesToGenerate) {
        try {
          await addJob('CONTENT_GENERATE', {
            siteId: page.siteId,
            pageId: page.id, // Pass the existing page ID so worker updates it
            contentType: mapPageTypeToGenerationType(page.type),
            targetKeyword: page.title,
            secondaryKeywords: [],
          });
          queuedJobs.push({
            pageId: page.id,
            title: page.title,
            siteName: page.site.name,
          });
        } catch (err) {
          console.error(`[API] Failed to queue job for page ${page.id}:`, err);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Queued ${queuedJobs.length} content generation jobs`,
        jobsQueued: queuedJobs.length,
        pages: queuedJobs,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API] Error in content POST:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
