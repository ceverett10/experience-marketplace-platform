import { describe, it, expect, beforeAll } from 'vitest';
import { encryptSession, decryptSession, createSessionPayload, SESSION_COOKIE_NAME } from './auth';

beforeAll(() => {
  process.env['ADMIN_SESSION_SECRET'] = 'test-secret-for-unit-tests';
});

describe('auth', () => {
  const testUser = { id: 'user-1', email: 'test@example.com', name: 'Test', role: 'admin' };

  it('exports SESSION_COOKIE_NAME', () => {
    expect(SESSION_COOKIE_NAME).toBe('admin_session');
  });

  it('createSessionPayload sets expiry in the future', () => {
    const payload = createSessionPayload(testUser);
    expect(payload.userId).toBe('user-1');
    expect(payload.email).toBe('test@example.com');
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  it('encrypt then decrypt round-trips', () => {
    const payload = createSessionPayload(testUser);
    const token = encryptSession(payload);
    const decrypted = decryptSession(token);
    expect(decrypted).not.toBeNull();
    expect(decrypted!.userId).toBe('user-1');
    expect(decrypted!.email).toBe('test@example.com');
  });

  it('returns null for invalid token', () => {
    expect(decryptSession('invalid-token')).toBeNull();
  });

  it('returns null for expired session', () => {
    const payload = createSessionPayload(testUser);
    payload.exp = Date.now() - 1000; // expired
    const token = encryptSession(payload);
    expect(decryptSession(token)).toBeNull();
  });

  it('returns null for too-short token', () => {
    expect(decryptSession('abc')).toBeNull();
  });
});
