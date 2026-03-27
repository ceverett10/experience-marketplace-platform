import { NextResponse } from 'next/server';
import { addJob } from '@experience-marketplace/jobs';

/**
 * POST /api/webhooks/trigger-blog-fanout
 *
 * Webhook endpoint for triggering microsite blog generation programmatically.
 * Requires Bearer token matching ADMIN_SESSION_SECRET.
 * Added to PUBLIC_PATHS in middleware so session cookie auth is bypassed.
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

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobId = await addJob('CONTENT_BLOG_FANOUT' as any, {} as any);
    return NextResponse.json({
      success: true,
      message: 'Blog fanout job queued — worker-fast will process up to 500 supplier microsites',
      jobId,
    });
  } catch (error) {
    console.error('[Webhook] Failed to queue blog fanout:', error);
    return NextResponse.json({ error: 'Failed to queue job' }, { status: 500 });
  }
}
