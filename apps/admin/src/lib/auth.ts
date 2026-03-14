/**
 * Admin Session Authentication
 * Uses AES-256-GCM encrypted stateless session cookies.
 * Same pattern as packages/mcp-server/src/auth/oauth.ts
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  iat: number; // issued-at as unix timestamp (ms)
  exp: number; // expiry as unix timestamp (ms)
}

export const SESSION_COOKIE_NAME = 'admin_session';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSessionKey(): Buffer {
  const secret = process.env['ADMIN_SESSION_SECRET'];
  if (!secret) {
    throw new Error(
      'ADMIN_SESSION_SECRET env var is required for admin session encryption. ' +
        'Set a unique, high-entropy secret dedicated to admin sessions.'
    );
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptSession(payload: SessionPayload): string {
  const key = getSessionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptSession(token: string): SessionPayload | null {
  try {
    const key = getSessionKey();
    const combined = Buffer.from(token, 'base64url');
    if (combined.length < 28) return null; // 12 iv + 16 tag minimum
    const iv = combined.subarray(0, 12);
    const tag = combined.subarray(12, 28);
    const encrypted = combined.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf8')) as SessionPayload;
    if (payload.exp < Date.now()) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

export function createSessionPayload(user: {
  id: string;
  email: string;
  name: string;
  role: string;
}): SessionPayload {
  const now = Date.now();
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
}
