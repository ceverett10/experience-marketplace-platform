import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'admin_session';

// Routes that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/social/callback', // OAuth callbacks from external platforms (Pinterest, Facebook, Twitter)
];

/**
 * Derive the AES-256 key from the session secret using Web Crypto API.
 * Compatible with the Node.js crypto version in auth.ts (SHA-256 → 32 bytes).
 */
async function getSessionKey(): Promise<CryptoKey> {
  const secret =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).process?.env?.['ADMIN_SESSION_SECRET'] ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).process?.env?.['TOKEN_SECRET'] ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).process?.env?.['HOLIBOB_API_SECRET'];

  if (!secret) {
    throw new Error('Session secret env var not configured');
  }

  // SHA-256 hash to get 32-byte key (same as auth.ts)
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(secret));

  return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['decrypt']);
}

/**
 * Decrypt and validate a session token using Web Crypto API.
 * Produces the same result as decryptSession() in auth.ts.
 */
async function validateSession(token: string): Promise<boolean> {
  try {
    const key = await getSessionKey();

    // Decode base64url → Uint8Array
    const raw = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
    const combined = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

    if (combined.length < 28) return false; // 12 iv + 16 tag minimum

    const iv = combined.slice(0, 12);
    const tag = combined.slice(12, 28);
    const ciphertext = combined.slice(28);

    // AES-GCM expects ciphertext + tag concatenated
    const data = new Uint8Array(ciphertext.length + tag.length);
    data.set(ciphertext);
    data.set(tag, ciphertext.length);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      data
    );

    const payload = JSON.parse(new TextDecoder().decode(decrypted));

    // Check expiry
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Skip Next.js internals and static files
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return redirectOrReject(request);
  }

  const valid = await validateSession(token);
  if (!valid) {
    return redirectOrReject(request);
  }

  return NextResponse.next();
}

function redirectOrReject(request: NextRequest): NextResponse {
  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  // API routes get 401 JSON response
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Page routes get redirected to login
  const loginUrl = new URL(`${basePath}/login`, request.url);
  loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
