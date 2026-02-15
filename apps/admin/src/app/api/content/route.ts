import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PageStatus, PageType } from '@prisma/client';
import { addJob } from '@experience-marketplace/jobs';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination params
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 200);
    const skip = (page - 1) * pageSize;

    // Filter params
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || '';
    const typeFilter = searchParams.get('type') || '';

    // Build where clause
    const where: any = {};

    if (statusFilter && statusFilter !== 'all') {
      const pageStatus = mapContentStatusToPageStatus(statusFilter);
      where.status = pageStatus;
    }

    if (typeFilter && typeFilter !== 'all') {
      const pageTypes = mapContentTypeToPageTypes(typeFilter);
      if (pageTypes.length === 1) {
        where.type = pageTypes[0];
      } else {
        where.type = { in: pageTypes };
      }
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { site: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Get total count, paginated pages, and stats in parallel
    const [totalCount, pages, statusCounts] = await Promise.all([
      prisma.page.count({ where }),
      prisma.page.findMany({
        where,
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
        skip,
        take: pageSize,
      }),
      // Single groupBy instead of multiple count queries
      prisma.page.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    // Build stats from groupBy
    const statsByStatus: Record<string, number> = {};
    let totalAll = 0;
    for (const row of statusCounts) {
      const frontendStatus = mapPageStatusToContentStatus(row.status);
      statsByStatus[frontendStatus] = (statsByStatus[frontendStatus] || 0) + row._count.id;
      totalAll += row._count.id;
    }

    // Transform pages
    const contentItems = pages.map((page) => {
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
        contentId: page.contentId,
        hasContent: !!page.content?.body,
        siteName: page.site?.name || 'Microsite',
        status: mapPageStatusToContentStatus(page.status),
        qualityScore: page.content?.qualityScore ?? 0,
        generatedAt,
      };
    });

    return NextResponse.json({
      items: contentItems,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      stats: {
        total: totalAll,
        pending: statsByStatus['pending'] || 0,
        approved: statsByStatus['approved'] || 0,
        published: statsByStatus['published'] || 0,
        rejected: statsByStatus['rejected'] || 0,
      },
    });
  } catch (error) {
    console.error('[API] Error fetching content:', error);
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
        // Content requires a siteId - microsite pages are not supported here
        if (!page.siteId) {
          return NextResponse.json(
            { error: 'Cannot create content for microsite pages through this endpoint' },
            { status: 400 }
          );
        }
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
      siteName: updatedPage.site?.name || 'Microsite',
      status: mapPageStatusToContentStatus(updatedPage.status),
      qualityScore: updatedPage.content?.qualityScore ?? 0,
      generatedAt:
        updatedPage.content?.createdAt?.toISOString() || updatedPage.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('[API] Error updating content:', error);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}

// Helper functions to map between database enums and frontend types
function mapPageTypeToContentType(
  pageType: PageType
): 'experience' | 'collection' | 'seo' | 'blog' {
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
      return PageStatus.REVIEW;
    case 'published':
      return PageStatus.PUBLISHED;
    case 'rejected':
      return PageStatus.ARCHIVED;
    default:
      return PageStatus.DRAFT;
  }
}

// Map frontend content type back to PageType(s) for filtering
function mapContentTypeToPageTypes(contentType: string): PageType[] {
  switch (contentType) {
    case 'experience':
      return [PageType.PRODUCT];
    case 'collection':
      return [PageType.CATEGORY];
    case 'blog':
      return [PageType.BLOG];
    case 'seo':
      return [PageType.LANDING, PageType.HOMEPAGE];
    default:
      return [];
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
          // Skip microsite pages (they don't have siteId)
          if (!page.siteId) {
            console.log(
              `[API] Skipping microsite page ${page.id} - not supported for batch regeneration`
            );
            continue;
          }

          // Ensure we have a valid targetKeyword - use title, slug, or generate from page type
          const targetKeyword = page.title || page.slug || `${page.type.toLowerCase()} content`;

          await addJob('CONTENT_GENERATE', {
            siteId: page.siteId,
            pageId: page.id, // Pass the existing page ID so worker updates it
            contentType: mapPageTypeToGenerationType(page.type),
            targetKeyword,
            secondaryKeywords: [],
          });
          queuedJobs.push({
            pageId: page.id,
            title: page.title,
            siteName: page.site?.name || 'Unknown',
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
