import { randomBytes, createHash, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authenticateApiKey } from './api-key.js';

const prisma = new PrismaClient();

// In-memory stores (single dyno — fine for auth codes and tokens)
interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  expiresAt: number;
  mcpApiKey?: string;
}

interface AccessToken {
  token: string;
  clientId: string;
  mcpApiKey: string; // The actual MCP API key for partner lookup
  scope: string;
  expiresAt: number;
}

// ── DCR (Dynamic Client Registration) store ──
interface DcrClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: number;
}

const authCodes = new Map<string, AuthCode>();
const accessTokens = new Map<string, AccessToken>();
const dcrClients = new Map<string, DcrClient>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authCodes) {
    if (data.expiresAt < now) authCodes.delete(code);
  }
  for (const [token, data] of accessTokens) {
    if (data.expiresAt < now) accessTokens.delete(token);
  }
}, 5 * 60 * 1000);

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
  mcpApiKey: string,
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
 * Exchange an authorization code for an access token.
 * Validates PKCE code_verifier against stored code_challenge.
 */
export function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  codeVerifier: string,
  redirectUri: string,
): { accessToken: string; expiresIn: number; scope: string } | null {
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
  const challenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  if (challenge !== authCode.codeChallenge) return null;

  // Consume the code (one-time use)
  authCodes.delete(code);

  // Issue access token
  const token = `hbmcp_${randomBytes(32).toString('hex')}`;
  const expiresIn = 3600; // 1 hour
  accessTokens.set(token, {
    token,
    clientId,
    mcpApiKey: authCode.mcpApiKey ?? '',
    scope: authCode.scope,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return { accessToken: token, expiresIn, scope: authCode.scope };
}

/**
 * Validate an access token and return the MCP API key for partner lookup.
 */
export function validateAccessToken(token: string): { mcpApiKey: string; clientId: string } | null {
  const data = accessTokens.get(token);
  if (!data) return null;
  if (data.expiresAt < Date.now()) {
    accessTokens.delete(token);
    return null;
  }
  return { mcpApiKey: data.mcpApiKey, clientId: data.clientId };
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
      json: { error: 'invalid_client_metadata', error_description: 'grant_types must include authorization_code' },
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
    return { error: 'Missing required parameters: client_id, redirect_uri, response_type=code', statusCode: 400 };
  }

  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return { error: 'PKCE required: code_challenge and code_challenge_method=S256', statusCode: 400 };
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
  queryParams: URLSearchParams,
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

  console.error(`[OAuth] DCR client "${clientId}" authorized via API key for partner "${auth.partnerName}"`);

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
        json: { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
        statusCode: 400,
      };
    }

    return {
      json: {
        access_token: result.accessToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        scope: result.scope,
      },
    };
  }

  if (grantType === 'client_credentials') {
    // Also support client_credentials for M2M (e.g., ChatGPT)
    const clientId = body['client_id'];
    const clientSecret = body['client_secret'];

    if (!clientId || !clientSecret) {
      return {
        json: { error: 'invalid_request', error_description: 'client_id and client_secret required' },
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

    const token = `hbmcp_${randomBytes(32).toString('hex')}`;
    const expiresIn = 3600;
    accessTokens.set(token, {
      token,
      clientId,
      mcpApiKey: clientSecret,
      scope: 'mcp',
      expiresAt: Date.now() + expiresIn * 1000,
    });

    return {
      json: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: 'mcp',
      },
    };
  }

  return {
    json: { error: 'unsupported_grant_type', error_description: 'Supported: authorization_code, client_credentials' },
    statusCode: 400,
  };
}

export { validateClient };

// ── Login page HTML ──

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
