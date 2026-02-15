import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { decryptSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { randomBytes } from 'crypto';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return decryptSession(token);
}

/** GET /api/auth/users — List all admin users */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = await (prisma as any).adminUser.findMany({
    select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ users });
}

/** POST /api/auth/users — Create a new admin user */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, name, role } = await request.json();

  if (!email || !name) {
    return NextResponse.json({ error: 'Email and name are required' }, { status: 400 });
  }

  // Check if user already exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (prisma as any).adminUser.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Generate a random temporary password
  const tempPassword = randomBytes(12).toString('base64url').slice(0, 16);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await (prisma as any).adminUser.create({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      role: role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN',
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return NextResponse.json({ user, tempPassword }, { status: 201 });
}

/** DELETE /api/auth/users — Delete an admin user */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('id');

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  // Prevent self-deletion
  if (userId === session.userId) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).adminUser.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
