import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  encryptSession,
  createSessionPayload,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from '@/lib/auth';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from '@/lib/rate-limit';
import { logAudit, getClientIp } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const ip = getClientIp(request);

    // Rate limiting: block after 5 failed attempts in 15 minutes
    const retryAfter = checkRateLimit(normalizedEmail);
    if (retryAfter > 0) {
      await logAudit({
        userEmail: normalizedEmail,
        action: 'LOGIN_RATE_LIMITED',
        details: { retryAfterSeconds: retryAfter },
        ipAddress: ip,
      });
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (prisma as any).adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      recordFailedAttempt(normalizedEmail);
      await logAudit({
        userEmail: normalizedEmail,
        action: 'LOGIN_FAILED',
        details: { reason: 'unknown_email' },
        ipAddress: ip,
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordFailedAttempt(normalizedEmail);
      await logAudit({
        userId: user.id,
        userEmail: normalizedEmail,
        action: 'LOGIN_FAILED',
        details: { reason: 'invalid_password' },
        ipAddress: ip,
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Successful authentication — clear rate limit
    clearRateLimit(normalizedEmail);

    // Update last login timestamp
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = createSessionPayload(user);
    const token = encryptSession(payload);

    await logAudit({
      userId: user.id,
      userEmail: normalizedEmail,
      action: 'LOGIN',
      ipAddress: ip,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      mustChangePassword: user.mustChangePassword === true,
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
