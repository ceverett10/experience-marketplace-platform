import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { decryptSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const session = decryptSession(token);
    if (session) {
      // Server-side session invalidation: set sessionInvalidatedAt to now.
      // Any existing tokens issued before this timestamp will be rejected by API routes.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).adminUser.update({
          where: { id: session.userId },
          data: { sessionInvalidatedAt: new Date() },
        });
      } catch {
        // Best-effort — don't fail logout if DB is unreachable
      }

      await logAudit({
        userId: session.userId,
        userEmail: session.email,
        action: 'LOGOUT',
        ipAddress: getClientIp(request),
      });
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
