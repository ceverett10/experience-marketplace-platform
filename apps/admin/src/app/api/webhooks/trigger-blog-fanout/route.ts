import { NextResponse } from 'next/server';
import { addJob } from '@experience-marketplace/jobs';

/**
 * POST /api/webhooks/trigger-blog-fanout
 *
 * Webhook endpoint for triggering microsite blog generation programmatically.
 * Requires Bearer token matching ADMIN_SESSION_SECRET.
 * Added to PUBLIC_PATHS in middleware so session cookie auth is bypassed.
 *
 * Retries addJob up to 5 times because the Redis TLS connection on the web dyno
 * may need multiple attempts to establish (Heroku ECONNRESET on fresh connections).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env['ADMIN_SESSION_SECRET'];
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const maxRetries = 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobId = await addJob('CONTENT_BLOG_FANOUT' as any, {} as any);
      return NextResponse.json({
        success: true,
        message: 'Blog fanout job queued — worker-fast will process up to 500 supplier microsites',
        jobId,
        attempt,
      });
    } catch (error) {
      lastError = error;
      console.warn(`[Webhook] addJob attempt ${attempt}/${maxRetries} failed:`, error);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
      }
    }
  }

  console.error('[Webhook] All addJob attempts failed:', lastError);
  return NextResponse.json({ error: 'Failed to queue job after retries' }, { status: 500 });
}
