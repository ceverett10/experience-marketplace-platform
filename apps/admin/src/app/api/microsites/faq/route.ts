import { NextResponse } from 'next/server';

/**
 * Admin API: Microsite FAQ Generation
 *
 * POST /api/microsites/faq
 *   body: { action: 'generate', limit?: number, micrositeId?: string }
 *   - action: 'generate' — generate FAQs for supplier microsites
 *   - limit: max microsites to process (default 10, max 50)
 *   - micrositeId: optional — generate for a specific microsite only
 *
 * GET /api/microsites/faq
 *   Returns stats on FAQ coverage across supplier microsites.
 */

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action, limit: rawLimit, micrositeId } = body;

    if (action !== 'generate') {
      return NextResponse.json({ error: 'Invalid action. Use "generate".' }, { status: 400 });
    }

    const limit = Math.min(Math.max(parseInt(rawLimit || '10', 10), 1), 50);

    // Dynamic import to avoid loading heavy jobs package at module level
    const { generateFAQForMicrosite, generateFAQsForMicrosites } =
      await import('@experience-marketplace/jobs');

    if (micrositeId) {
      // Generate for a specific microsite
      const result = await generateFAQForMicrosite(micrositeId);
      return NextResponse.json({ result });
    }

    // Generate for a batch of microsites
    const { results, summary } = await generateFAQsForMicrosites(limit);

    return NextResponse.json({ results, summary });
  } catch (error) {
    console.error('[Admin API] FAQ generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    // Dynamic import for Prisma
    const { prisma } = await import('@/lib/prisma');

    // Get FAQ coverage stats
    const [totalSupplierMicrosites, micrositesWithFaq] = await Promise.all([
      prisma.micrositeConfig.count({
        where: {
          entityType: 'SUPPLIER' as any,
          status: 'ACTIVE' as any,
          supplierId: { not: null },
        },
      }),
      prisma.micrositeConfig.count({
        where: {
          entityType: 'SUPPLIER' as any,
          status: 'ACTIVE' as any,
          supplierId: { not: null },
          pages: {
            some: {
              type: 'FAQ' as any,
              status: 'PUBLISHED' as any,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      totalSupplierMicrosites,
      micrositesWithFaq,
      micrositesWithoutFaq: totalSupplierMicrosites - micrositesWithFaq,
      coveragePercent:
        totalSupplierMicrosites > 0
          ? Math.round((micrositesWithFaq / totalSupplierMicrosites) * 100)
          : 0,
    });
  } catch (error) {
    console.error('[Admin API] FAQ stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
