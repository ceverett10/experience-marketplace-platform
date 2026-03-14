import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { requireSuperAdmin } from '@/lib/require-role';
import { logAudit, getClientIp } from '@/lib/audit';

/** GET /api/auth/users — List all admin users */
export async function GET() {
  const result = await requireSuperAdmin();
  if ('error' in result) return result.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = await (prisma as any).adminUser.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastLoginAt: true,
      mustChangePassword: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ users });
}

/** POST /api/auth/users — Create a new admin user */
export async function POST(request: Request) {
  const result = await requireSuperAdmin();
  if ('error' in result) return result.error;

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
      mustChangePassword: true, // Force password change on first login
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  await logAudit({
    userId: result.session.userId,
    userEmail: result.session.email,
    action: 'CREATE_USER',
    details: { createdUserId: user.id, createdUserEmail: user.email, role: user.role },
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({ user, tempPassword }, { status: 201 });
}

/** DELETE /api/auth/users — Delete an admin user */
export async function DELETE(request: Request) {
  const result = await requireSuperAdmin();
  if ('error' in result) return result.error;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('id');

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  // Prevent self-deletion
  if (userId === result.session.userId) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  // Get user info for audit log before deletion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userToDelete = await (prisma as any).adminUser.findUnique({
    where: { id: userId },
    select: { email: true, name: true, role: true },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).adminUser.delete({ where: { id: userId } });

  await logAudit({
    userId: result.session.userId,
    userEmail: result.session.email,
    action: 'DELETE_USER',
    details: {
      deletedUserId: userId,
      deletedUserEmail: userToDelete?.email,
      deletedUserRole: userToDelete?.role,
    },
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({ success: true });
}
