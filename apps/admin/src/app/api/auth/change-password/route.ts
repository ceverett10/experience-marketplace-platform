import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import {
  decryptSession,
  encryptSession,
  createSessionPayload,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from '@/lib/auth';

/** POST /api/auth/change-password — Change the current user's password */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = decryptSession(token);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters' },
      { status: 400 }
    );
  }

  // Verify current password
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await (prisma as any).adminUser.findUnique({
    where: { id: session.userId },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
  }

  // Hash and update
  const passwordHash = await bcrypt.hash(newPassword, 12);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).adminUser.update({
    where: { id: session.userId },
    data: { passwordHash },
  });

  // Reissue session cookie with fresh expiry
  const newPayload = createSessionPayload(user);
  const newToken = encryptSession(newPayload);

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    path: '/',
  });

  return response;
}
