import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

const FUNNEL_STEPS = [
  'LANDING_PAGE_VIEW',
  'EXPERIENCE_CLICKED',
  'AVAILABILITY_SEARCH',
  'BOOKING_CREATED',
  'AVAILABILITY_ADDED',
  'CHECKOUT_LOADED',
  'QUESTIONS_ANSWERED',
  'PAYMENT_STARTED',
  'BOOKING_COMPLETED',
] as const;

const STEP_LABELS: Record<string, string> = {
  LANDING_PAGE_VIEW: 'Landing Page View',
  EXPERIENCE_CLICKED: 'Experience Clicked',
  AVAILABILITY_SEARCH: 'Availability Search',
  BOOKING_CREATED: 'Booking Created',
  AVAILABILITY_ADDED: 'Availability Added',
  CHECKOUT_LOADED: 'Checkout Loaded',
  QUESTIONS_ANSWERED: 'Questions Answered',
  PAYMENT_STARTED: 'Payment Started',
  BOOKING_COMPLETED: 'Booking Completed',
};

function getDefaultStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split('T')[0]!;
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0]!;
}

/**
 * GET /api/analytics/funnel
 * Returns booking funnel analytics data
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const siteId = searchParams.get('siteId') || undefined;
    const from = searchParams.get('from') || getDefaultStartDate();
    const to = searchParams.get('to') || getDefaultEndDate();
    const trafficSource = searchParams.get('trafficSource') as
      | 'paid'
      | 'organic'
      | 'compare'
      | null;
    const landingPage = searchParams.get('landingPage') || undefined;
    const landingPageType = searchParams.get('landingPageType') || undefined;

    const startDate = new Date(from);
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    // Exclude test/synthetic events from analytics
    const excludeTestData: Prisma.BookingFunnelEventWhereInput = {
      siteId: { notIn: ['unknown', 'test-site'] },
      sessionId: { not: 'unknown' },
    };
    const excludeTestDataSql = Prisma.sql`AND "siteId" NOT IN ('unknown', 'test-site') AND "sessionId" != 'unknown'`;

    // Build traffic source filter for Prisma and raw SQL
    const trafficFilter: Prisma.BookingFunnelEventWhereInput =
      trafficSource === 'paid'
        ? { utmMedium: 'cpc' }
        : trafficSource === 'organic'
          ? { OR: [{ utmMedium: null }, { utmMedium: { not: 'cpc' } }] }
          : {};

    const landingPageFilter: Prisma.BookingFunnelEventWhereInput = {
      ...(landingPage ? { landingPage } : {}),
    };

    const trafficSqlFilter = (source: 'paid' | 'organic') =>
      source === 'paid'
        ? Prisma.sql`AND "utmMedium" = 'cpc'`
        : Prisma.sql`AND ("utmMedium" IS NULL OR "utmMedium" != 'cpc')`;

    // For 'compare' mode, build both funnels
    if (trafficSource === 'compare') {
      const [paidFunnel, organicFunnel] = await Promise.all([
        buildFunnelData(prisma, startDate, endDate, siteId, 'paid', landingPage),
        buildFunnelData(prisma, startDate, endDate, siteId, 'organic', landingPage),
      ]);

      const paidCvr = paidFunnel.summary.overallConversion;
      const organicCvr = organicFunnel.summary.overallConversion;
      const cvrLift =
        organicCvr > 0
          ? `${paidCvr >= organicCvr ? '+' : ''}${((paidCvr / organicCvr - 1) * 100).toFixed(0)}%`
          : 'N/A';

      // Site list for filter dropdown
      const allSites = await prisma.site.findMany({
        where: { status: { in: ['ACTIVE', 'REVIEW'] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });

      return NextResponse.json({
        mode: 'compare',
        paid: paidFunnel,
        organic: organicFunnel,
        comparison: { cvrLift },
        sites: allSites,
        dateRange: { from, to },
      });
    }

    const where: Prisma.BookingFunnelEventWhereInput = {
      createdAt: { gte: startDate, lte: endDate },
      ...(siteId ? { siteId } : {}),
      ...excludeTestData,
      ...trafficFilter,
      ...landingPageFilter,
    };

    // 1. Funnel: event counts and unique sessions per step
    const stepCounts = await prisma.bookingFunnelEvent.groupBy({
      by: ['step'],
      where,
      _count: { id: true },
    });

    // Use raw query for distinct session counts (groupBy _count doesn't do DISTINCT)
    const trafficSql =
      trafficSource === 'paid'
        ? Prisma.sql`AND "utmMedium" = 'cpc'`
        : trafficSource === 'organic'
          ? Prisma.sql`AND ("utmMedium" IS NULL OR "utmMedium" != 'cpc')`
          : Prisma.empty;
    const landingPageSql = landingPage
      ? Prisma.sql`AND "landingPage" = ${landingPage}`
      : Prisma.empty;

    const distinctSessionsRaw = await prisma.$queryRaw<Array<{ step: string; sessions: bigint }>>`
      SELECT step, COUNT(DISTINCT "sessionId") as sessions
      FROM "BookingFunnelEvent"
      WHERE "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        AND "errorCode" IS NULL
        ${excludeTestDataSql}
        ${siteId ? Prisma.sql`AND "siteId" = ${siteId}` : Prisma.empty}
        ${trafficSql}
        ${landingPageSql}
      GROUP BY step
    `;

    const sessionMap = new Map(distinctSessionsRaw.map((r) => [r.step, Number(r.sessions)]));
    const eventMap = new Map(stepCounts.map((r) => [r.step, r._count.id]));

    const funnel = FUNNEL_STEPS.map((step) => ({
      step,
      label: STEP_LABELS[step] ?? step,
      sessions: sessionMap.get(step) ?? 0,
      events: eventMap.get(step) ?? 0,
    }));

    // 2. Error counts per step
    const errorCounts = await prisma.bookingFunnelEvent.groupBy({
      by: ['step'],
      where: { ...where, errorCode: { not: null } },
      _count: { id: true },
    });
    const errorMap = new Map(errorCounts.map((r) => [r.step, r._count.id]));

    // 3. Daily trend data
    const dailyTrendRaw = await prisma.$queryRaw<
      Array<{ date: string; step: string; count: bigint }>
    >`
      SELECT DATE("createdAt")::text as date, step, COUNT(*) as count
      FROM "BookingFunnelEvent"
      WHERE "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        AND "errorCode" IS NULL
        ${excludeTestDataSql}
        ${siteId ? Prisma.sql`AND "siteId" = ${siteId}` : Prisma.empty}
        ${trafficSql}
        ${landingPageSql}
      GROUP BY DATE("createdAt"), step
      ORDER BY DATE("createdAt")
    `;

    // Pivot daily trend into {date, STEP1: count, STEP2: count, ...}
    const dailyMap = new Map<string, Record<string, string | number>>();
    for (const row of dailyTrendRaw) {
      const existing = dailyMap.get(row.date) ?? { date: row.date };
      existing[row.step] = Number(row.count);
      dailyMap.set(row.date, existing);
    }
    const dailyTrend = Array.from(dailyMap.values());

    // 4. Recent errors
    const recentErrors = await prisma.bookingFunnelEvent.findMany({
      where: { ...where, errorCode: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        step: true,
        siteId: true,
        errorCode: true,
        errorMessage: true,
        bookingId: true,
        productId: true,
      },
    });

    // Enrich errors with site names
    const siteIds = [...new Set(recentErrors.map((e) => e.siteId))];
    const sites = await prisma.site.findMany({
      where: { id: { in: siteIds } },
      select: { id: true, name: true },
    });
    const siteNameMap = new Map(sites.map((s) => [s.id, s.name]));

    const enrichedErrors = recentErrors.map((e) => ({
      ...e,
      siteName: siteNameMap.get(e.siteId) ?? e.siteId,
      stepLabel: STEP_LABELS[e.step] ?? e.step,
    }));

    // 5. Summary metrics
    const totalSearchSessions = sessionMap.get('AVAILABILITY_SEARCH') ?? 0;
    const totalCompleted = sessionMap.get('BOOKING_COMPLETED') ?? 0;
    const totalErrors = errorCounts.reduce((sum, r) => sum + r._count.id, 0);
    const totalEvents = stepCounts.reduce((sum, r) => sum + r._count.id, 0);

    const summary = {
      totalSearches: totalSearchSessions,
      totalCompleted,
      overallConversion: totalSearchSessions > 0 ? (totalCompleted / totalSearchSessions) * 100 : 0,
      errorRate: totalEvents > 0 ? (totalErrors / totalEvents) * 100 : 0,
      totalErrors,
    };

    // 6. Site list for filter dropdown
    const allSites = await prisma.site.findMany({
      where: { status: { in: ['ACTIVE', 'REVIEW'] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      mode: trafficSource || 'all',
      funnel,
      dailyTrend,
      recentErrors: enrichedErrors,
      summary,
      sites: allSites,
      errorsByStep: FUNNEL_STEPS.map((step) => ({
        step,
        label: STEP_LABELS[step] ?? step,
        errors: errorMap.get(step) ?? 0,
      })),
      dateRange: { from, to },
    });
  } catch (error) {
    console.error('[Funnel Analytics API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch funnel analytics' }, { status: 500 });
  }
}

// --- Helper: Build funnel data for a specific traffic source -----------------

async function buildFunnelData(
  db: typeof prisma,
  startDate: Date,
  endDate: Date,
  siteId: string | undefined,
  source: 'paid' | 'organic',
  landingPage?: string
) {
  const testDataSql = Prisma.sql`AND "siteId" NOT IN ('unknown', 'test-site') AND "sessionId" != 'unknown'`;
  const trafficSql =
    source === 'paid'
      ? Prisma.sql`AND "utmMedium" = 'cpc'`
      : Prisma.sql`AND ("utmMedium" IS NULL OR "utmMedium" != 'cpc')`;
  const landingPageSql = landingPage
    ? Prisma.sql`AND "landingPage" = ${landingPage}`
    : Prisma.empty;

  const distinctSessionsRaw = await db.$queryRaw<Array<{ step: string; sessions: bigint }>>`
    SELECT step, COUNT(DISTINCT "sessionId") as sessions
    FROM "BookingFunnelEvent"
    WHERE "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
      AND "errorCode" IS NULL
      ${testDataSql}
      ${siteId ? Prisma.sql`AND "siteId" = ${siteId}` : Prisma.empty}
      ${trafficSql}
      ${landingPageSql}
    GROUP BY step
  `;

  const sessionMap = new Map(distinctSessionsRaw.map((r) => [r.step, Number(r.sessions)]));

  const funnel = FUNNEL_STEPS.map((step) => ({
    step,
    label: STEP_LABELS[step] ?? step,
    sessions: sessionMap.get(step) ?? 0,
  }));

  const totalSearchSessions = sessionMap.get('AVAILABILITY_SEARCH') ?? 0;
  const totalCompleted = sessionMap.get('BOOKING_COMPLETED') ?? 0;

  return {
    funnel,
    summary: {
      totalSearches: totalSearchSessions,
      totalCompleted,
      overallConversion: totalSearchSessions > 0 ? (totalCompleted / totalSearchSessions) * 100 : 0,
    },
  };
}
