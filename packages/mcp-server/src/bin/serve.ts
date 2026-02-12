#!/usr/bin/env node

import { createHolibobClient } from '@experience-marketplace/holibob-api';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server.js';

// Parse CLI args
const args = process.argv.slice(2);
const transportArg = args.find((a) => a.startsWith('--transport='))?.split('=')[1] ?? 'stdio';
const portArg = args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? '3100';

async function startStdio(): Promise<void> {
  // Read Holibob credentials from env (for local / Claude Desktop usage)
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
  const http = await import('node:http');

  // Track per-session transports and their servers
  const sessions = new Map<string, {
    transport: InstanceType<typeof SSEServerTransport>;
    partnerName: string;
  }>();

  // Also support env var auth as fallback (for testing without DB)
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

    // Health check
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'holibob-mcp', version: '0.1.0' }));
      return;
    }

    // SSE endpoint — authenticate and create per-session server
    if (url.pathname === '/sse' && req.method === 'GET') {
      const token = extractBearerToken(req);

      let server;
      let partnerName = 'env';

      if (token) {
        // Database-backed auth: look up MCP API key → partner → Holibob credentials
        const auth = await authenticateApiKey(token);
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid or inactive API key' }));
          return;
        }
        server = createServer(auth.client);
        partnerName = auth.partnerName;
        console.error(`[MCP] Partner "${partnerName}" connected (holibob: ${auth.holibobPartnerId})`);
      } else if (envPartnerId && envApiKey) {
        // Fallback: env var auth (for local testing)
        const client = createHolibobClient({
          apiUrl: envApiUrl,
          partnerId: envPartnerId,
          apiKey: envApiKey,
          apiSecret: envApiSecret,
        });
        server = createServer(client);
        console.error('[MCP] Session connected using env var credentials');
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Authentication required. Provide an API key via Authorization: Bearer <key>',
        }));
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

    // Messages endpoint
    if (url.pathname === '/messages' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing sessionId parameter' }));
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      await session.transport.handlePostMessage(req, res);
      return;
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(port, () => {
    console.error(`Holibob MCP Server (HTTP/SSE) listening on port ${port}`);
    console.error(`  SSE endpoint: http://localhost:${port}/sse`);
    console.error(`  Messages endpoint: http://localhost:${port}/messages`);
    console.error(`  Health check: http://localhost:${port}/health`);
    console.error(`  Auth: Bearer token (MCP API key) or env var fallback`);
  });
}

async function main(): Promise<void> {
  if (transportArg === 'stdio') {
    await startStdio();
  } else if (transportArg === 'http') {
    // Use --port arg first, then MCP_PORT env var. Do NOT use PORT (that's the main Heroku web port).
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
