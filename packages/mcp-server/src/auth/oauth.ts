import { randomBytes, createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// In-memory stores (single dyno — fine for auth codes and tokens)
interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  expiresAt: number;
}

interface AccessToken {
  token: string;
  clientId: string;
  mcpApiKey: string; // The actual MCP API key for partner lookup
  scope: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCode>();
const accessTokens = new Map<string, AccessToken>();

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
  });
  // Store the MCP API key alongside the code so we can create a token that maps back to the partner
  (authCodes.get(code) as AuthCode & { mcpApiKey: string }).mcpApiKey = mcpApiKey;
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
  const authCode = authCodes.get(code) as (AuthCode & { mcpApiKey?: string }) | undefined;
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
 * Handle the /oauth/authorize endpoint.
 * Auto-approves if client_id (partner ID) has an active MCP API key.
 */
export async function handleAuthorize(params: URLSearchParams): Promise<{
  redirect?: string;
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

  // Look up any active MCP API key for this partner
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
