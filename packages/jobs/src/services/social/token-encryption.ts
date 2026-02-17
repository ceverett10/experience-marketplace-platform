import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env['SOCIAL_TOKEN_SECRET'];
  if (!secret) {
    throw new Error('SOCIAL_TOKEN_SECRET environment variable is required for token encryption');
  }
  // Expect a 64-char hex string (32 bytes)
  if (secret.length !== 64) {
    throw new Error('SOCIAL_TOKEN_SECRET must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(secret, 'hex');
}

/**
 * Encrypt a plaintext token using AES-256-GCM.
 * Returns a string in the format: iv:authTag:ciphertext (all base64-encoded)
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt an encrypted token string.
 * Expects format: iv:authTag:ciphertext (all base64-encoded)
 * If the token is not in encrypted format (plaintext), returns it as-is.
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    // Token is stored as plaintext (pre-encryption migration) — return as-is
    return encrypted;
  }

  const [ivPart, authTagPart, ciphertext] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, 'base64');
  const authTag = Buffer.from(authTagPart, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if token encryption is configured.
 */
export function isTokenEncryptionConfigured(): boolean {
  return !!(process.env['SOCIAL_TOKEN_SECRET'] && process.env['SOCIAL_TOKEN_SECRET'].length === 64);
}
