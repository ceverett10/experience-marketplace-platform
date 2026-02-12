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
  const { authenticateApiKey } = await import('../auth/api-key.js');
  const { handleAuthorize, handleToken, validateAccessToken } = await import('../auth/oauth.js');
  const http = await import('node:http');

  // Determine the public base URL (used in OAuth metadata)
  const publicBaseUrl = process.env['MCP_PUBLIC_URL'] ?? `http://localhost:${port}`;

  // Track per-session transports and their servers
  const sessions = new Map<string, {
    transport: InstanceType<typeof SSEServerTransport>;
    partnerName: string;
  }>();

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

  function jsonResponse(res: import('node:http').ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  function parseFormBody(req: import('node:http').IncomingMessage): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
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

  /**
   * Authenticate a Bearer token — could be an MCP API key (mcp_live_...)
   * or an OAuth access token (hbmcp_...).
   */
  async function authenticateToken(token: string) {
    if (token.startsWith('hbmcp_')) {
      const tokenData = validateAccessToken(token);
      if (!tokenData) return null;
      return authenticateApiKey(tokenData.mcpApiKey);
    }
    return authenticateApiKey(token);
  }

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
        authorization_endpoint: `${publicBaseUrl}/oauth/authorize`,
        token_endpoint: `${publicBaseUrl}/oauth/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'client_credentials'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['mcp'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      });
      return;
    }

    // ── OAuth Authorization Endpoint ──
    if (url.pathname === '/oauth/authorize' && req.method === 'GET') {
      const result = await handleAuthorize(url.searchParams);
      if (result.redirect) {
        res.writeHead(302, { Location: result.redirect });
        res.end();
      } else {
        jsonResponse(res, result.statusCode ?? 400, { error: result.error });
      }
      return;
    }

    // ── OAuth Token Endpoint ──
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      try {
        const body = await parseFormBody(req);
        const result = await handleToken(body);
        if (result.json) {
          res.setHeader('Cache-Control', 'no-store');
          jsonResponse(res, result.statusCode ?? 200, result.json);
        } else {
          jsonResponse(res, result.statusCode ?? 400, { error: result.error });
        }
      } catch {
        jsonResponse(res, 400, { error: 'invalid_request', error_description: 'Failed to parse request body' });
      }
      return;
    }

    // ── Health check ──
    if (url.pathname === '/health' && req.method === 'GET') {
      jsonResponse(res, 200, { status: 'ok', server: 'holibob-mcp', version: '0.1.0' });
      return;
    }

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
        server = createServer(auth.client);
        partnerName = auth.partnerName;
        console.error(`[MCP] Partner "${partnerName}" connected (holibob: ${auth.holibobPartnerId})`);
      } else if (envPartnerId && envApiKey) {
        const client = createHolibobClient({
          apiUrl: envApiUrl,
          partnerId: envPartnerId,
          apiKey: envApiKey,
          apiSecret: envApiSecret,
        });
        server = createServer(client);
        console.error('[MCP] Session connected using env var credentials');
      } else {
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer resource_metadata="${publicBaseUrl}/.well-known/oauth-protected-resource"`,
        });
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
      }

      const transport = new SSEServerTransport('/messages', res);
      sessions.set(transport.sessionId, { transport, partnerName });
      res.on('close', () => {
        sessions.delete(transport.sessionId);
        console.error(`[MCP] Session ${transport.sessionId} disconnected (${partnerName})`);
      });
      await server.connect(transport);
      return;
    }

    // ── Messages endpoint ──
    if (url.pathname === '/messages' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        jsonResponse(res, 400, { error: 'Missing sessionId parameter' });
        return;
      }

      const session = sessions.get(sessionId);
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
    console.error(`Holibob MCP Server (HTTP/SSE) listening on port ${port}`);
    console.error(`  Public URL: ${publicBaseUrl}`);
    console.error(`  SSE endpoint: ${publicBaseUrl}/sse`);
    console.error(`  OAuth authorize: ${publicBaseUrl}/oauth/authorize`);
    console.error(`  OAuth token: ${publicBaseUrl}/oauth/token`);
    console.error(`  Health check: ${publicBaseUrl}/health`);
  });
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
