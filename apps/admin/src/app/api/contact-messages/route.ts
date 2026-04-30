import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const STATUSES = ['NEW', 'READ', 'REPLIED', 'ARCHIVED'] as const;
type Status = (typeof STATUSES)[number];

/**
 * GET /api/contact-messages
 * Returns contact-form submissions with stats, filtering, and pagination.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = new URL(request.url).searchParams;
    const siteId = searchParams.get('siteId');
    const status = searchParams.get('status');
    const subject = searchParams.get('subject');
    const search = searchParams.get('search')?.trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (siteId) where['siteId'] = siteId;
    if (status && status !== 'ALL' && (STATUSES as readonly string[]).includes(status)) {
      where['status'] = status;
    }
    if (subject && subject !== 'ALL') where['subject'] = subject;
    if (search) {
      where['OR'] = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
      ];
    }

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    const [messages, total, sites, statusCounts, newThisWeek, distinctSubjects] = await Promise.all(
      [
        prisma.contactMessage.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            site: { select: { id: true, name: true, primaryDomain: true } },
            microsite: { select: { id: true, subdomain: true, parentDomain: true } },
          },
        }),
        prisma.contactMessage.count({ where }),
        prisma.site.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        prisma.contactMessage.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        prisma.contactMessage.count({ where: { createdAt: { gte: startOfWeek } } }),
        prisma.contactMessage.findMany({
          distinct: ['subject'],
          select: { subject: true },
          orderBy: { subject: 'asc' },
        }),
      ]
    );

    const counts: Record<Status, number> = { NEW: 0, READ: 0, REPLIED: 0, ARCHIVED: 0 };
    for (const row of statusCounts) {
      counts[row.status as Status] = row._count._all;
    }
    const totalAll = counts.NEW + counts.READ + counts.REPLIED + counts.ARCHIVED;

    const formatted = messages.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      subject: m.subject,
      message: m.message,
      domain: m.domain,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      site: m.site
        ? { id: m.site.id, name: m.site.name, domain: m.site.primaryDomain || m.domain }
        : null,
      microsite: m.microsite
        ? {
            id: m.microsite.id,
            domain: `${m.microsite.subdomain}.${m.microsite.parentDomain}`,
          }
        : null,
    }));

    return NextResponse.json({
      messages: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalAll,
        new: counts.NEW,
        read: counts.READ,
        replied: counts.REPLIED,
        archived: counts.ARCHIVED,
        newThisWeek,
      },
      filters: {
        sites,
        statuses: ['ALL', ...STATUSES],
        subjects: ['ALL', ...distinctSubjects.map((s) => s.subject)],
      },
    });
  } catch (error) {
    console.error('[ContactMessages API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch contact messages' }, { status: 500 });
  }
}
