import { type NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 5000;

const ClientErrorSchema = z.object({
  errorName: z.string().max(200),
  errorMessage: z.string().max(MAX_MESSAGE_LENGTH),
  stackTrace: z.string().max(MAX_STACK_LENGTH).optional(),
  context: z
    .record(z.unknown())
    .optional()
    .transform((v) => v ?? {}),
});

/**
 * POST /api/errors/report
 * Lightweight endpoint for client-side error reporting.
 * Writes to the ErrorLog table with jobId=null.
 */
export async function POST(request: NextRequest) {
  try {
    // Reject oversized payloads (10KB max)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10_240) {
      return NextResponse.json({ ok: true });
    }

    const body = await request.json();
    const parsed = ClientErrorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: true }); // Don't leak validation errors
    }

    const { errorName, errorMessage, stackTrace, context } = parsed.data;

    // Resolve site from hostname
    const headersList = await headers();
    const hostname = headersList.get('x-forwarded-host') || headersList.get('host') || '';
    const site = await getSiteFromHostname(hostname);
    const siteId = site?.id ?? null;

    await prisma.errorLog.create({
      data: {
        jobType: 'CLIENT_ERROR',
        siteId,
        errorName,
        errorMessage,
        errorCategory: 'CLIENT',
        errorSeverity: 'LOW',
        stackTrace: stackTrace ?? null,
        context: {
          ...context,
          url: request.headers.get('referer') ?? undefined,
          userAgent: request.headers.get('user-agent') ?? undefined,
          reportedAt: new Date().toISOString(),
        },
        attemptNumber: 1,
        retryable: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Don't leak errors for reporting endpoint
  }
}
