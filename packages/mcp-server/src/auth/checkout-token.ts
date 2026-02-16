import { encryptToken, decryptToken } from './oauth.js';

interface CheckoutPayload {
  bookingId: string;
  mcpApiKey: string;
  amount: number;
  currency: string;
}

const CHECKOUT_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate an encrypted, time-limited checkout token.
 * Safe for embedding in URLs (base64url encoded).
 */
export function generateCheckoutToken(payload: CheckoutPayload): string {
  return encryptToken({
    typ: 'checkout',
    clientId: payload.bookingId,
    mcpApiKey: payload.mcpApiKey,
    scope: JSON.stringify({ amount: payload.amount, currency: payload.currency }),
    exp: Date.now() + CHECKOUT_TTL_MS,
  });
}

/**
 * Validate and decrypt a checkout token.
 * Returns null if expired, tampered, or invalid.
 */
export function validateCheckoutToken(token: string): CheckoutPayload | null {
  const payload = decryptToken(token);
  if (!payload || payload.typ !== 'checkout') return null;

  try {
    const { amount, currency } = JSON.parse(payload.scope) as { amount: number; currency: string };
    return {
      bookingId: payload.clientId,
      mcpApiKey: payload.mcpApiKey,
      amount,
      currency,
    };
  } catch {
    return null;
  }
}
