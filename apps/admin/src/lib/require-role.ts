/**
 * RBAC helper for API routes.
 * Extracts the session from the cookie and enforces role requirements.
 * Also validates that the session hasn't been server-side invalidated (logout).
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import type { SessionPayload } from '@/lib/auth';

/**
 * Get the current session from the request cookie.
 * Validates both the encrypted token AND server-side invalidation.
 * Returns null if not authenticated, expired, or session was invalidated.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = decryptSession(token);
  if (!session) return null;

  // Check server-side session invalidation (set on logout)
  if (session.iat) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = await (prisma as any).adminUser.findUnique({
        where: { id: session.userId },
        select: { sessionInvalidatedAt: true },
      });
      if (user?.sessionInvalidatedAt) {
        const invalidatedAt = new Date(user.sessionInvalidatedAt).getTime();
        if (session.iat < invalidatedAt) {
          return null; // Session was issued before logout — reject
        }
      }
    } catch {
      // If DB is unreachable, fail-closed: reject the session
      return null;
    }
  }

  return session;
}

/**
 * Require SUPER_ADMIN role. Returns a 403 response if the user doesn't have it.
 * Returns the session if authorized, or a NextResponse error.
 */
export async function requireSuperAdmin(): Promise<
  { session: SessionPayload } | { error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (session.role !== 'SUPER_ADMIN') {
    return {
      error: NextResponse.json({ error: 'Forbidden: requires SUPER_ADMIN role' }, { status: 403 }),
    };
  }
  return { session };
}
