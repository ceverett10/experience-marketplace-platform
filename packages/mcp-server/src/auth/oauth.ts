import { randomBytes, createHash, randomUUID, createCipheriv, createDecipheriv } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authenticateApiKey } from './api-key.js';

const prisma = new PrismaClient();

// ── Encrypted stateless token helpers ──
// Tokens are AES-256-GCM encrypted payloads — no server-side storage needed.
// Survive dyno restarts because the secret key is in env vars.

function getTokenSecret(): Buffer {
  const secret = process.env['TOKEN_SECRET'] ?? process.env['HOLIBOB_API_SECRET'];
  if (!secret)
    throw new Error('TOKEN_SECRET or HOLIBOB_API_SECRET env var required for token encryption');
  // Derive a 32-byte key via SHA-256
  return createHash('sha256').update(secret).digest();
}

export interface TokenPayload {
  /** 'access' or 'refresh' */
  typ: string;
  clientId: string;
  mcpApiKey: string;
  scope: string;
  /** Expiry as unix timestamp (ms) */
  exp: number;
}

export function encryptToken(payload: TokenPayload): string {
  const key = getTokenSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64url(iv + tag + ciphertext)
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64url');
}

export function decryptToken(token: string): TokenPayload | null {
  try {
    const key = getTokenSecret();
    const combined = Buffer.from(token, 'base64url');
    if (combined.length < 28) return null; // 12 iv + 16 tag minimum
    const iv = combined.subarray(0, 12);
    const tag = combined.subarray(12, 28);
    const encrypted = combined.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf8')) as TokenPayload;
    if (payload.exp < Date.now()) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

// ── In-memory stores (only for short-lived auth codes and DCR registrations) ──
interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  expiresAt: number;
  mcpApiKey?: string;
}

interface DcrClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: number;
}

const authCodes = new Map<string, AuthCode>();
const dcrClients = new Map<string, DcrClient>();

// Clean up expired auth codes every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [code, data] of authCodes) {
      if (data.expiresAt < now) authCodes.delete(code);
    }
  },
  5 * 60 * 1000
);

/**
 * Check if a client_id belongs to a DCR-registered client.
 */
export function isDcrClient(clientId: string): boolean {
  return dcrClients.has(clientId);
}

/**
 * Validate client credentials.
 * Client ID = Partner database ID
 * Client Secret = MCP API key (mcp_live_...)
 */
async function validateClient(clientId: string, clientSecret: string): Promise<boolean> {
  const key = await prisma.mcpApiKey.findFirst({
    where: {
      key: clientSecret,
      isActive: true,
      partner: {
        id: clientId,
        status: 'ACTIVE',
      },
    },
  });
  return !!key;
}

/**
 * Create an authorization code for the OAuth authorization code flow.
 */
export function createAuthorizationCode(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  scope: string,
  mcpApiKey: string
): string {
  const code = randomBytes(32).toString('hex');
  authCodes.set(code, {
    code,
    clientId,
    redirectUri,
    codeChallenge,
    scope,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    mcpApiKey,
  });
  return code;
}

/**
 * Issue an access token + refresh token pair as encrypted stateless tokens.
 * No server-side storage — tokens survive dyno restarts.
 */
function issueTokenPair(
  clientId: string,
  mcpApiKey: string,
  scope: string
): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
} {
  const expiresIn = 3600; // 1 hour

  const accessToken = encryptToken({
    typ: 'access',
    clientId,
    mcpApiKey,
    scope,
    exp: Date.now() + expiresIn * 1000,
  });

  const refreshToken = encryptToken({
    typ: 'refresh',
    clientId,
    mcpApiKey,
    scope,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  return { accessToken, refreshToken, expiresIn, scope };
}

/**
 * Exchange an authorization code for an access token.
 * Validates PKCE code_verifier against stored code_challenge.
 */
export function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  codeVerifier: string,
  redirectUri: string
): { accessToken: string; refreshToken: string; expiresIn: number; scope: string } | null {
  const authCode = authCodes.get(code);
  if (!authCode) return null;

  // Verify not expired
  if (authCode.expiresAt < Date.now()) {
    authCodes.delete(code);
    return null;
  }

  // Verify client_id matches
  if (authCode.clientId !== clientId) return null;

  // Verify redirect_uri matches
  if (authCode.redirectUri !== redirectUri) return null;

  // Verify PKCE: SHA256(code_verifier) must equal code_challenge
  const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
  if (challenge !== authCode.codeChallenge) return null;

  // Consume the code (one-time use)
  authCodes.delete(code);

  return issueTokenPair(clientId, authCode.mcpApiKey ?? '', authCode.scope);
}

/**
 * Validate an access token and return the MCP API key for partner lookup.
 * Stateless — decrypts the token, checks expiry, no server storage needed.
 */
export function validateAccessToken(token: string): { mcpApiKey: string; clientId: string } | null {
  const payload = decryptToken(token);
  if (!payload || payload.typ !== 'access') return null;
  return { mcpApiKey: payload.mcpApiKey, clientId: payload.clientId };
}

/**
 * Handle Dynamic Client Registration (RFC 7591).
 * ChatGPT registers itself as an OAuth client to get a client_id.
 */
export function handleRegister(body: Record<string, unknown>): {
  json?: Record<string, unknown>;
  error?: string;
  statusCode?: number;
} {
  const redirectUris = body['redirect_uris'];
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return {
      json: { error: 'invalid_client_metadata', error_description: 'redirect_uris is required' },
      statusCode: 400,
    };
  }

  const grantTypes = body['grant_types'] as string[] | undefined;
  if (grantTypes && !grantTypes.includes('authorization_code')) {
    return {
      json: {
        error: 'invalid_client_metadata',
        error_description: 'grant_types must include authorization_code',
      },
      statusCode: 400,
    };
  }

  const clientId = randomUUID();
  const clientName = (body['client_name'] as string) ?? 'Unknown Client';

  dcrClients.set(clientId, {
    clientId,
    clientName,
    redirectUris: redirectUris as string[],
    createdAt: Date.now(),
  });

  console.error(`[DCR] Registered client "${clientName}" → ${clientId}`);

  return {
    json: {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes ?? ['authorization_code'],
      response_types: (body['response_types'] as string[]) ?? ['code'],
      token_endpoint_auth_method: 'none',
    },
  };
}

/**
 * Handle the /authorize endpoint for GET requests.
 * - Partner ID clients → auto-approve (existing behavior)
 * - DCR clients → return login page HTML
 */
export async function handleAuthorize(params: URLSearchParams): Promise<{
  redirect?: string;
  html?: string;
  error?: string;
  statusCode?: number;
}> {
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const responseType = params.get('response_type');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');
  const scope = params.get('scope') ?? 'mcp';
  const state = params.get('state');

  if (!clientId || !redirectUri || responseType !== 'code') {
    return {
      error: 'Missing required parameters: client_id, redirect_uri, response_type=code',
      statusCode: 400,
    };
  }

  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return {
      error: 'PKCE required: code_challenge and code_challenge_method=S256',
      statusCode: 400,
    };
  }

  // ── DCR client → show login page ──
  if (isDcrClient(clientId)) {
    const dcrClient = dcrClients.get(clientId)!;

    // Validate redirect_uri is registered
    if (!dcrClient.redirectUris.includes(redirectUri)) {
      return { error: 'redirect_uri does not match registered URIs', statusCode: 400 };
    }

    return {
      html: buildLoginPageHtml({
        clientName: dcrClient.clientName,
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod: 'S256',
        scope,
        state,
      }),
    };
  }

  // ── Partner ID client → auto-approve ──
  const mcpKey = await prisma.mcpApiKey.findFirst({
    where: {
      partner: { id: clientId, status: 'ACTIVE' },
      isActive: true,
    },
    select: { key: true },
  });

  if (!mcpKey) {
    return { error: 'Invalid client_id or no active API keys', statusCode: 401 };
  }

  // Auto-approve: generate authorization code
  const code = createAuthorizationCode(clientId, redirectUri, codeChallenge, scope, mcpKey.key);

  // Build redirect URL
  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);

  return { redirect: redirect.toString() };
}

/**
 * Handle POST to /authorize — processes the login form submission from DCR clients.
 */
export async function handleAuthorizePost(
  formBody: Record<string, string>,
  queryParams: URLSearchParams
): Promise<{ redirect?: string; html?: string; error?: string; statusCode?: number }> {
  const mcpApiKey = formBody['mcp_api_key'] ?? '';
  const clientId = formBody['client_id'] ?? queryParams.get('client_id') ?? '';
  const redirectUri = formBody['redirect_uri'] ?? queryParams.get('redirect_uri') ?? '';
  const codeChallenge = formBody['code_challenge'] ?? queryParams.get('code_challenge') ?? '';
  const scope = formBody['scope'] ?? queryParams.get('scope') ?? 'mcp';
  const state = formBody['state'] ?? queryParams.get('state') ?? '';

  if (!clientId || !redirectUri || !codeChallenge) {
    return { error: 'Missing required OAuth parameters', statusCode: 400 };
  }

  if (!mcpApiKey) {
    return {
      html: buildLoginPageHtml({
        clientName: dcrClients.get(clientId)?.clientName ?? 'App',
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod: 'S256',
        scope,
        state,
        errorMessage: 'Please enter your MCP API key.',
      }),
    };
  }

  // Validate the MCP API key
  const auth = await authenticateApiKey(mcpApiKey);
  if (!auth) {
    return {
      html: buildLoginPageHtml({
        clientName: dcrClients.get(clientId)?.clientName ?? 'App',
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod: 'S256',
        scope,
        state,
        errorMessage: 'Invalid API key. Please check and try again.',
      }),
    };
  }

  console.error(
    `[OAuth] DCR client "${clientId}" authorized via API key for partner "${auth.partnerName}"`
  );

  // Create authorization code using the validated API key
  const code = createAuthorizationCode(clientId, redirectUri, codeChallenge, scope, mcpApiKey);

  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);

  return { redirect: redirect.toString() };
}

/**
 * Handle the /oauth/token endpoint.
 * Supports authorization_code grant type with PKCE.
 */
export async function handleToken(body: Record<string, string>): Promise<{
  json?: Record<string, unknown>;
  error?: string;
  statusCode?: number;
}> {
  const grantType = body['grant_type'];

  if (grantType === 'authorization_code') {
    const code = body['code'];
    const clientId = body['client_id'];
    const codeVerifier = body['code_verifier'];
    const redirectUri = body['redirect_uri'];

    if (!code || !clientId || !codeVerifier || !redirectUri) {
      return {
        json: { error: 'invalid_request', error_description: 'Missing required parameters' },
        statusCode: 400,
      };
    }

    const result = exchangeAuthorizationCode(code, clientId, codeVerifier, redirectUri);
    if (!result) {
      return {
        json: {
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code',
        },
        statusCode: 400,
      };
    }

    return {
      json: {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        scope: result.scope,
      },
    };
  }

  if (grantType === 'refresh_token') {
    const incomingRefreshToken = body['refresh_token'];
    const clientId = body['client_id'];

    if (!incomingRefreshToken) {
      return {
        json: { error: 'invalid_request', error_description: 'refresh_token is required' },
        statusCode: 400,
      };
    }

    // Stateless: decrypt and validate the refresh token
    const payload = decryptToken(incomingRefreshToken);
    if (!payload || payload.typ !== 'refresh') {
      return {
        json: { error: 'invalid_grant', error_description: 'Invalid or expired refresh token' },
        statusCode: 400,
      };
    }

    // Verify client_id if provided
    if (clientId && payload.clientId !== clientId) {
      return {
        json: { error: 'invalid_grant', error_description: 'client_id mismatch' },
        statusCode: 400,
      };
    }

    // Issue new token pair (old refresh token naturally expires)
    const result = issueTokenPair(payload.clientId, payload.mcpApiKey, payload.scope);

    return {
      json: {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        scope: result.scope,
      },
    };
  }

  if (grantType === 'client_credentials') {
    const clientId = body['client_id'];
    const clientSecret = body['client_secret'];

    if (!clientId || !clientSecret) {
      return {
        json: {
          error: 'invalid_request',
          error_description: 'client_id and client_secret required',
        },
        statusCode: 400,
      };
    }

    const valid = await validateClient(clientId, clientSecret);
    if (!valid) {
      return {
        json: { error: 'invalid_client', error_description: 'Invalid client credentials' },
        statusCode: 401,
      };
    }

    const result = issueTokenPair(clientId, clientSecret, 'mcp');

    return {
      json: {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        scope: result.scope,
      },
    };
  }

  return {
    json: {
      error: 'unsupported_grant_type',
      error_description: 'Supported: authorization_code, refresh_token, client_credentials',
    },
    statusCode: 400,
  };
}

export { validateClient };

// ── Login page HTML ──

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLoginPageHtml(opts: {
  clientName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state: string | null;
  errorMessage?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connect to Holibob</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #F9FAFB; min-height: 100vh; display: flex; align-items: center; justify-content: center; -webkit-font-smoothing: antialiased; }
  .card { background: white; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); padding: 40px; max-width: 420px; width: 100%; }
  .logo { text-align: center; margin-bottom: 24px; }
  .logo svg { width: 48px; height: 48px; }
  h1 { font-size: 22px; font-weight: 700; text-align: center; color: #111827; margin-bottom: 4px; }
  .subtitle { font-size: 14px; color: #6B7280; text-align: center; margin-bottom: 24px; }
  .client-name { font-weight: 600; color: #0F766E; }
  label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
  input[type="text"] { width: 100%; padding: 12px 14px; border: 1px solid #D1D5DB; border-radius: 10px; font-size: 15px; color: #111827; transition: border-color 0.15s; }
  input[type="text"]:focus { outline: none; border-color: #0F766E; box-shadow: 0 0 0 3px rgba(15,118,110,0.15); }
  .error { background: #FEF2F2; color: #DC2626; font-size: 13px; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; }
  .hint { font-size: 12px; color: #9CA3AF; margin-top: 6px; }
  button { width: 100%; padding: 12px; background: #0F766E; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 20px; transition: background 0.15s; }
  button:hover { background: #0D6B63; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="12" fill="#0F766E"/>
      <path d="M14 24h20M24 14v20" stroke="white" stroke-width="3" stroke-linecap="round"/>
    </svg>
  </div>
  <h1>Connect to Holibob</h1>
  <p class="subtitle"><span class="client-name">${esc(opts.clientName)}</span> wants to access your Holibob experiences</p>
  ${opts.errorMessage ? `<div class="error">${esc(opts.errorMessage)}</div>` : ''}
  <form method="POST" action="/authorize">
    <input type="hidden" name="client_id" value="${esc(opts.clientId)}">
    <input type="hidden" name="redirect_uri" value="${esc(opts.redirectUri)}">
    <input type="hidden" name="code_challenge" value="${esc(opts.codeChallenge)}">
    <input type="hidden" name="code_challenge_method" value="${esc(opts.codeChallengeMethod)}">
    <input type="hidden" name="scope" value="${esc(opts.scope)}">
    <input type="hidden" name="state" value="${esc(opts.state ?? '')}">
    <input type="hidden" name="response_type" value="code">
    <label for="mcp_api_key">MCP API Key</label>
    <input type="text" id="mcp_api_key" name="mcp_api_key" placeholder="mcp_live_..." autocomplete="off" required>
    <div class="hint">Enter the API key from your Holibob partner dashboard</div>
    <button type="submit">Authorize</button>
  </form>
</div>
</body>
</html>`;
}
