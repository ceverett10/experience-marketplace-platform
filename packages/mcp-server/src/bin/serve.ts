#!/usr/bin/env node

import { createHolibobClient } from '@experience-marketplace/holibob-api';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server.js';

// Parse CLI args
const args = process.argv.slice(2);
const transportArg = args.find((a) => a.startsWith('--transport='))?.split('=')[1] ?? 'stdio';
const portArg = args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? '3100';

async function startStdio(): Promise<void> {
  const apiUrl = process.env['HOLIBOB_API_URL'] ?? 'https://api.production.holibob.tech/graphql';
  const partnerId = process.env['HOLIBOB_PARTNER_ID'];
  const apiKey = process.env['HOLIBOB_API_KEY'];
  const apiSecret = process.env['HOLIBOB_API_SECRET'];

  if (!partnerId || !apiKey) {
    console.error('Missing required environment variables:');
    console.error('  HOLIBOB_PARTNER_ID - Your Holibob partner ID');
    console.error('  HOLIBOB_API_KEY    - Your Holibob API key');
    console.error('Optional:');
    console.error('  HOLIBOB_API_SECRET - Your Holibob API secret (for HMAC auth)');
    console.error('  HOLIBOB_API_URL    - Holibob API URL (default: production)');
    process.exit(1);
  }

  const client = createHolibobClient({ apiUrl, partnerId, apiKey, apiSecret });
  const server = createServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp(port: number): Promise<void> {
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
  const { StreamableHTTPServerTransport } =
    await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const { isInitializeRequest } = await import('@modelcontextprotocol/sdk/types.js');

  let authenticateApiKey: Awaited<typeof import('../auth/api-key.js')>['authenticateApiKey'];
  let handleAuthorize: Awaited<typeof import('../auth/oauth.js')>['handleAuthorize'];
  let handleAuthorizePost: Awaited<typeof import('../auth/oauth.js')>['handleAuthorizePost'];
  let handleToken: Awaited<typeof import('../auth/oauth.js')>['handleToken'];
  let handleRegister: Awaited<typeof import('../auth/oauth.js')>['handleRegister'];
  let validateAccessToken: Awaited<typeof import('../auth/oauth.js')>['validateAccessToken'];
  let validateCheckoutToken: Awaited<
    typeof import('../auth/checkout-token.js')
  >['validateCheckoutToken'];

  try {
    ({ authenticateApiKey } = await import('../auth/api-key.js'));
    ({ handleAuthorize, handleAuthorizePost, handleToken, handleRegister, validateAccessToken } =
      await import('../auth/oauth.js'));
    ({ validateCheckoutToken } = await import('../auth/checkout-token.js'));
  } catch {
    console.error(
      'HTTP transport requires database dependencies (@prisma/client) which are not installed.'
    );
    console.error(
      'Use STDIO transport for local/standalone mode: holibob-mcp (no --transport flag)'
    );
    process.exit(1);
  }

  const http = await import('node:http');

  // Determine the public base URL (used in OAuth metadata)
  // MCP_PUBLIC_URL should be the ROOT origin (e.g. https://domain.com) — NOT /mcp subpath
  // Claude Desktop discovers OAuth metadata from the root origin
  const publicBaseUrl = (process.env['MCP_PUBLIC_URL'] ?? `http://localhost:${port}`).replace(
    /\/mcp\/?$/,
    ''
  );

  // Track per-session SSE transports
  const sseSessions = new Map<
    string,
    {
      transport: InstanceType<typeof SSEServerTransport>;
      partnerName: string;
    }
  >();

  // Track per-session Streamable HTTP transports
  const streamableSessions = new Map<
    string,
    {
      transport: InstanceType<typeof StreamableHTTPServerTransport>;
      server: ReturnType<typeof createServer>;
      partnerName: string;
    }
  >();

  // Env var auth fallback
  const envPartnerId = process.env['HOLIBOB_PARTNER_ID'];
  const envApiKey = process.env['HOLIBOB_API_KEY'];
  const envApiSecret = process.env['HOLIBOB_API_SECRET'];
  const envApiUrl = process.env['HOLIBOB_API_URL'] ?? 'https://api.production.holibob.tech/graphql';

  function extractBearerToken(req: import('node:http').IncomingMessage): string | null {
    const auth = req.headers['authorization'];
    if (!auth) return null;
    const parts = auth.split(' ');
    if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer') {
      return parts[1] ?? null;
    }
    return null;
  }

  function jsonResponse(
    res: import('node:http').ServerResponse,
    status: number,
    body: unknown
  ): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  function parseBody(req: import('node:http').IncomingMessage): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => {
        try {
          const contentType = req.headers['content-type'] ?? '';
          if (contentType.includes('application/json')) {
            resolve(JSON.parse(data));
          } else {
            const params = new URLSearchParams(data);
            const result: Record<string, string> = {};
            for (const [key, value] of params) {
              result[key] = value;
            }
            resolve(result);
          }
        } catch {
          reject(new Error('Failed to parse request body'));
        }
      });
      req.on('error', reject);
    });
  }

  function parseJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : undefined);
        } catch {
          reject(new Error('Failed to parse JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Authenticate a Bearer token — could be an MCP API key (mcp_live_...)
   * or an encrypted OAuth access token (base64url).
   */
  async function authenticateToken(token: string) {
    // MCP API keys have a known prefix — try direct auth
    if (token.startsWith('mcp_live_') || token.startsWith('mcp_test_')) {
      return authenticateApiKey(token);
    }
    // Otherwise treat as encrypted OAuth access token
    const tokenData = validateAccessToken(token);
    if (!tokenData) return null;
    return authenticateApiKey(tokenData.mcpApiKey);
  }

  /**
   * Resolve the MCP API key from a Bearer token (could be raw key or OAuth token).
   */
  function resolveMcpApiKey(token: string): string {
    if (token.startsWith('mcp_live_') || token.startsWith('mcp_test_')) return token;
    const tokenData = validateAccessToken(token);
    return tokenData?.mcpApiKey ?? '';
  }

  /**
   * Authenticate request and create a partner-scoped MCP server,
   * or fall back to env vars.
   */
  async function authenticateAndCreateServer(req: import('node:http').IncomingMessage): Promise<{
    server: ReturnType<typeof createServer>;
    partnerName: string;
  } | null> {
    const token = extractBearerToken(req);

    if (token) {
      const auth = await authenticateToken(token);
      if (!auth) return null;
      const mcpApiKey = resolveMcpApiKey(token);
      return {
        server: createServer(auth.client, { mcpApiKey, publicUrl: publicBaseUrl }),
        partnerName: auth.partnerName,
      };
    }

    if (envPartnerId && envApiKey) {
      const client = createHolibobClient({
        apiUrl: envApiUrl,
        partnerId: envPartnerId,
        apiKey: envApiKey,
        apiSecret: envApiSecret,
      });
      return {
        server: createServer(client, { mcpApiKey: envApiKey, publicUrl: publicBaseUrl }),
        partnerName: 'env',
      };
    }

    return null;
  }

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    // CORS headers (extended for Streamable HTTP)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── OAuth 2.0 Protected Resource Metadata (RFC 9728) ──
    if (url.pathname === '/.well-known/oauth-protected-resource' && req.method === 'GET') {
      jsonResponse(res, 200, {
        resource: publicBaseUrl,
        authorization_servers: [publicBaseUrl],
        scopes_supported: ['mcp'],
      });
      return;
    }

    // ── OAuth 2.0 Authorization Server Metadata (RFC 8414) ──
    if (url.pathname === '/.well-known/oauth-authorization-server' && req.method === 'GET') {
      jsonResponse(res, 200, {
        issuer: publicBaseUrl,
        authorization_endpoint: `${publicBaseUrl}/authorize`,
        token_endpoint: `${publicBaseUrl}/oauth/token`,
        registration_endpoint: `${publicBaseUrl}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['mcp'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      });
      return;
    }

    // ── Dynamic Client Registration (RFC 7591) ──
    if (url.pathname === '/oauth/register' && req.method === 'POST') {
      try {
        const body = (await parseJsonBody(req)) as Record<string, unknown>;
        const result = handleRegister(body);
        if (result.json) {
          jsonResponse(res, result.statusCode ?? 201, result.json);
        } else {
          jsonResponse(res, result.statusCode ?? 400, { error: result.error });
        }
      } catch {
        jsonResponse(res, 400, {
          error: 'invalid_request',
          error_description: 'Failed to parse request body',
        });
      }
      return;
    }

    // ── OAuth Authorization Endpoint (GET — show form or auto-redirect) ──
    if (
      (url.pathname === '/oauth/authorize' || url.pathname === '/authorize') &&
      req.method === 'GET'
    ) {
      const result = await handleAuthorize(url.searchParams);
      if (result.redirect) {
        res.writeHead(302, { Location: result.redirect });
        res.end();
      } else if (result.html) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(result.html);
      } else {
        jsonResponse(res, result.statusCode ?? 400, { error: result.error });
      }
      return;
    }

    // ── OAuth Authorization Endpoint (POST — process login form) ──
    if (
      (url.pathname === '/oauth/authorize' || url.pathname === '/authorize') &&
      req.method === 'POST'
    ) {
      try {
        const body = await parseBody(req);
        const result = await handleAuthorizePost(body, url.searchParams);
        if (result.redirect) {
          res.writeHead(302, { Location: result.redirect });
          res.end();
        } else if (result.html) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(result.html);
        } else {
          jsonResponse(res, result.statusCode ?? 400, { error: result.error });
        }
      } catch {
        jsonResponse(res, 400, {
          error: 'invalid_request',
          error_description: 'Failed to parse request body',
        });
      }
      return;
    }

    // ── OAuth Token Endpoint ──
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = await handleToken(body);
        if (result.json) {
          res.setHeader('Cache-Control', 'no-store');
          jsonResponse(res, result.statusCode ?? 200, result.json);
        } else {
          jsonResponse(res, result.statusCode ?? 400, { error: result.error });
        }
      } catch {
        jsonResponse(res, 400, {
          error: 'invalid_request',
          error_description: 'Failed to parse request body',
        });
      }
      return;
    }

    // ── Image proxy — route supplier CDN images through our whitelisted domain ──
    if (url.pathname === '/image-proxy' && req.method === 'GET') {
      const imageUrl = url.searchParams.get('url');
      if (!imageUrl || !imageUrl.startsWith('https://')) {
        jsonResponse(res, 400, { error: 'Missing or invalid url parameter (https only)' });
        return;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const upstream = await fetch(imageUrl, {
          signal: controller.signal,
          headers: { Accept: 'image/*' },
        });
        clearTimeout(timeout);

        const contentType = upstream.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) {
          jsonResponse(res, 400, { error: 'URL does not point to an image' });
          return;
        }

        const contentLength = upstream.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
          jsonResponse(res, 413, { error: 'Image too large (max 10MB)' });
          return;
        }

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          ...(contentLength ? { 'Content-Length': contentLength } : {}),
        });

        if (upstream.body) {
          const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
          const pump = async () => {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
          };
          pump().catch(() => res.end());
        } else {
          const buffer = Buffer.from(await upstream.arrayBuffer());
          res.end(buffer);
        }
      } catch (err) {
        if (!res.headersSent) {
          jsonResponse(res, 502, {
            error: `Failed to fetch image: ${err instanceof Error ? err.message : 'unknown'}`,
          });
        }
      }
      return;
    }

    // ── Hosted checkout page — Stripe payment form ──
    if (url.pathname.startsWith('/checkout/') && req.method === 'GET') {
      const token = url.pathname.slice('/checkout/'.length).replace(/\/success$/, '');
      const isSuccess = url.pathname.endsWith('/success');

      if (!token) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Invalid checkout link</h1>');
        return;
      }

      const checkout = validateCheckoutToken(token);
      if (!checkout) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(
          '<h1>Checkout link expired or invalid</h1><p>Please go back to ChatGPT and request a new payment link.</p>'
        );
        return;
      }

      const auth = await authenticateApiKey(checkout.mcpApiKey);
      if (!auth) {
        res.writeHead(401, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication failed</h1>');
        return;
      }

      if (isSuccess) {
        // Success page — commit the booking
        try {
          const booking = await auth.client.commitBooking({ id: checkout.bookingId });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildCheckoutSuccessHtml({
            bookingId: booking.id,
            bookingCode: booking.code ?? undefined,
            voucherUrl: booking.voucherUrl ?? undefined,
          }));
        } catch {
          // Booking may already be committed or pending
          try {
            const booking = await auth.client.getBooking(checkout.bookingId);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(buildCheckoutSuccessHtml({
              bookingId: booking?.id ?? checkout.bookingId,
              bookingCode: booking?.code ?? undefined,
              voucherUrl: booking?.voucherUrl ?? undefined,
            }));
          } catch {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(buildCheckoutSuccessHtml({ bookingId: checkout.bookingId }));
          }
        }
        return;
      }

      // Payment page — get fresh Stripe payment intent
      try {
        const paymentIntent = await auth.client.getStripePaymentIntent({ id: checkout.bookingId });
        const amount = paymentIntent.amount / 100;
        const currency = (checkout.currency ?? 'GBP').toUpperCase();

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildCheckoutPageHtml({
          publishableKey: paymentIntent.apiKey,
          clientSecret: paymentIntent.clientSecret,
          amount,
          currency,
          successUrl: `${publicBaseUrl}/checkout/${token}/success`,
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(
          `<h1>Payment Error</h1><p>${err instanceof Error ? err.message : 'Failed to load payment details'}</p>`
        );
      }
      return;
    }

    // ── Health check ──
    if (url.pathname === '/health' && req.method === 'GET') {
      jsonResponse(res, 200, { status: 'ok', server: 'holibob-mcp', version: '0.1.0' });
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // STREAMABLE HTTP TRANSPORT (protocol version 2025-03-26)
    // Handles POST (JSON-RPC), GET (SSE stream), DELETE (session close) on /
    // ══════════════════════════════════════════════════════════════════════
    if (
      url.pathname === '/' &&
      (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE')
    ) {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // ── Existing session ──
      if (sessionId && streamableSessions.has(sessionId)) {
        const session = streamableSessions.get(sessionId)!;
        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          await session.transport.handleRequest(req, res, body);
        } else if (req.method === 'GET') {
          await session.transport.handleRequest(req, res);
        } else {
          // DELETE — close session
          await session.transport.handleRequest(req, res);
          streamableSessions.delete(sessionId);
          console.error(`[MCP] Streamable session ${sessionId} deleted (${session.partnerName})`);
        }
        return;
      }

      // ── New session (POST with initialize request) ──
      if (req.method === 'POST' && !sessionId) {
        const body = await parseJsonBody(req);
        if (!isInitializeRequest(body)) {
          jsonResponse(res, 400, {
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: first request must be an initialize request',
            },
            id: null,
          });
          return;
        }

        const authResult = await authenticateAndCreateServer(req);
        if (!authResult) {
          res.writeHead(401, {
            'Content-Type': 'application/json',
            'WWW-Authenticate': `Bearer resource_metadata="${publicBaseUrl}/.well-known/oauth-protected-resource"`,
          });
          res.end(JSON.stringify({ error: 'Authentication required' }));
          return;
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () =>
            `sh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          onsessioninitialized: (newSessionId: string) => {
            streamableSessions.set(newSessionId, {
              transport,
              server: authResult.server,
              partnerName: authResult.partnerName,
            });
            console.error(
              `[MCP] Streamable session ${newSessionId} created (${authResult.partnerName})`
            );
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && streamableSessions.has(sid)) {
            streamableSessions.delete(sid);
            console.error(`[MCP] Streamable session ${sid} closed (${authResult.partnerName})`);
          }
        };

        await authResult.server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      // ── Invalid request ──
      if (sessionId && !streamableSessions.has(sessionId)) {
        jsonResponse(res, 400, {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: invalid or expired session ID' },
          id: null,
        });
        return;
      }

      jsonResponse(res, 400, {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: POST with initialize request required to create session',
        },
        id: null,
      });
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // DEPRECATED SSE TRANSPORT (protocol version 2024-11-05)
    // Kept for backward compatibility with Claude Desktop
    // ══════════════════════════════════════════════════════════════════════

    // ── SSE endpoint — authenticate and create per-session MCP server ──
    if (url.pathname === '/sse' && req.method === 'GET') {
      const token = extractBearerToken(req);

      let server;
      let partnerName = 'env';

      if (token) {
        const auth = await authenticateToken(token);
        if (!auth) {
          res.writeHead(401, {
            'Content-Type': 'application/json',
            'WWW-Authenticate': `Bearer resource_metadata="${publicBaseUrl}/.well-known/oauth-protected-resource"`,
          });
          res.end(JSON.stringify({ error: 'Invalid or expired token' }));
          return;
        }
        const mcpApiKey = resolveMcpApiKey(token);
        server = createServer(auth.client, { mcpApiKey, publicUrl: publicBaseUrl });
        partnerName = auth.partnerName;
        console.error(
          `[MCP] Partner "${partnerName}" connected (holibob: ${auth.holibobPartnerId})`
        );
      } else if (envPartnerId && envApiKey) {
        const client = createHolibobClient({
          apiUrl: envApiUrl,
          partnerId: envPartnerId,
          apiKey: envApiKey,
          apiSecret: envApiSecret,
        });
        server = createServer(client, { mcpApiKey: envApiKey, publicUrl: publicBaseUrl });
        console.error('[MCP] Session connected using env var credentials');
      } else {
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer resource_metadata="${publicBaseUrl}/.well-known/oauth-protected-resource"`,
        });
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
      }

      // Use /mcp/messages so the client POSTs through the proxy (which strips /mcp prefix)
      const messagesPath = publicBaseUrl.includes('localhost') ? '/messages' : '/mcp/messages';
      const transport = new SSEServerTransport(messagesPath, res);
      sseSessions.set(transport.sessionId, { transport, partnerName });
      res.on('close', () => {
        sseSessions.delete(transport.sessionId);
        console.error(`[MCP] Session ${transport.sessionId} disconnected (${partnerName})`);
      });
      await server.connect(transport);
      return;
    }

    // ── Messages endpoint (SSE transport) ──
    if (url.pathname === '/messages' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        jsonResponse(res, 400, { error: 'Missing sessionId parameter' });
        return;
      }

      const session = sseSessions.get(sessionId);
      if (!session) {
        jsonResponse(res, 404, { error: 'Session not found' });
        return;
      }

      await session.transport.handlePostMessage(req, res);
      return;
    }

    // ── Not found ──
    jsonResponse(res, 404, { error: 'Not found' });
  });

  httpServer.listen(port, () => {
    console.error(`Holibob MCP Server listening on port ${port}`);
    console.error(`  Public URL: ${publicBaseUrl}`);
    console.error(`  Streamable HTTP: ${publicBaseUrl}/mcp (POST/GET/DELETE)`);
    console.error(`  SSE endpoint: ${publicBaseUrl}/mcp/sse (deprecated, Claude Desktop)`);
    console.error(`  Image proxy: ${publicBaseUrl}/image-proxy?url=...`);
    console.error(`  Checkout: ${publicBaseUrl}/checkout/:token`);
    console.error(`  DCR: ${publicBaseUrl}/oauth/register`);
    console.error(`  OAuth authorize: ${publicBaseUrl}/authorize`);
    console.error(`  OAuth token: ${publicBaseUrl}/oauth/token`);
    console.error(`  Health check: ${publicBaseUrl}/health`);
  });
}

// ── Checkout page HTML builders ──

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCheckoutPageHtml(opts: {
  publishableKey: string;
  clientSecret: string;
  amount: number;
  currency: string;
  successUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Complete Payment — Holibob</title>
<script src="https://js.stripe.com/v3/"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #F0F4F8; min-height: 100vh; display: flex; align-items: center; justify-content: center; -webkit-font-smoothing: antialiased; }
  .card { background: white; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); padding: 40px; max-width: 480px; width: 100%; }
  .logo { text-align: center; margin-bottom: 20px; }
  .logo span { font-size: 28px; font-weight: 700; color: #0F766E; }
  h1 { font-size: 20px; font-weight: 700; text-align: center; color: #111827; margin-bottom: 4px; }
  .amount { font-size: 32px; font-weight: 700; text-align: center; color: #0F766E; margin: 16px 0 24px; }
  #payment-element { margin-bottom: 24px; }
  #error-message { color: #DC2626; font-size: 14px; margin-bottom: 16px; display: none; }
  button { width: 100%; padding: 14px; background: #0F766E; color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  button:hover { background: #0D6B63; }
  button:disabled { background: #9CA3AF; cursor: not-allowed; }
  .secure { text-align: center; font-size: 12px; color: #9CA3AF; margin-top: 16px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo"><span>holibob</span></div>
  <h1>Complete Your Booking</h1>
  <div class="amount">${escHtml(opts.currency)} ${escHtml(opts.amount.toFixed(2))}</div>
  <form id="payment-form">
    <div id="payment-element"></div>
    <div id="error-message"></div>
    <button id="submit-btn" type="submit">Pay Now</button>
  </form>
  <p class="secure">Secured by Stripe. Your payment details are encrypted.</p>
</div>
<script>
  const stripe = Stripe('${escHtml(opts.publishableKey)}');
  const elements = stripe.elements({ clientSecret: '${escHtml(opts.clientSecret)}' });
  const paymentElement = elements.create('payment');
  paymentElement.mount('#payment-element');

  const form = document.getElementById('payment-form');
  const btn = document.getElementById('submit-btn');
  const errorEl = document.getElementById('error-message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Processing...';
    errorEl.style.display = 'none';

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: '${escHtml(opts.successUrl)}' },
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Pay Now';
    }
  });
</script>
</body>
</html>`;
}

function buildCheckoutSuccessHtml(opts: {
  bookingId: string;
  bookingCode?: string;
  voucherUrl?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Booking Confirmed — Holibob</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #F0F4F8; min-height: 100vh; display: flex; align-items: center; justify-content: center; -webkit-font-smoothing: antialiased; }
  .card { background: white; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); padding: 40px; max-width: 480px; width: 100%; text-align: center; }
  .checkmark { font-size: 64px; margin-bottom: 16px; }
  h1 { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 8px; }
  .subtitle { font-size: 16px; color: #6B7280; margin-bottom: 24px; }
  .detail { background: #F0FDF4; border-radius: 10px; padding: 16px; margin-bottom: 16px; text-align: left; }
  .detail-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
  .detail-label { color: #6B7280; }
  .detail-value { font-weight: 600; color: #111827; }
  .voucher-btn { display: inline-block; padding: 14px 28px; background: #0F766E; color: white; border-radius: 10px; font-size: 16px; font-weight: 600; text-decoration: none; margin-top: 8px; transition: background 0.15s; }
  .voucher-btn:hover { background: #0D6B63; }
  .return-msg { font-size: 14px; color: #9CA3AF; margin-top: 20px; }
</style>
</head>
<body>
<div class="card">
  <div class="checkmark">&#10003;</div>
  <h1>Payment Successful!</h1>
  <p class="subtitle">Your booking has been confirmed.</p>
  <div class="detail">
    <div class="detail-row">
      <span class="detail-label">Booking ID</span>
      <span class="detail-value">${escHtml(opts.bookingId)}</span>
    </div>
    ${opts.bookingCode ? `<div class="detail-row"><span class="detail-label">Booking Code</span><span class="detail-value">${escHtml(opts.bookingCode)}</span></div>` : ''}
  </div>
  ${opts.voucherUrl ? `<a class="voucher-btn" href="${escHtml(opts.voucherUrl)}" target="_blank">Download Voucher</a>` : ''}
  <p class="return-msg">You can now close this tab and return to ChatGPT.</p>
</div>
</body>
</html>`;
}

async function main(): Promise<void> {
  if (transportArg === 'stdio') {
    await startStdio();
  } else if (transportArg === 'http') {
    const port = parseInt(portArg !== '3100' ? portArg : (process.env['MCP_PORT'] ?? portArg), 10);
    await startHttp(port);
  } else {
    console.error(`Unknown transport: ${transportArg}. Use --transport=stdio or --transport=http`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
