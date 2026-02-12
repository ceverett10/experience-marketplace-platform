#!/usr/bin/env node

import { createHolibobClient } from '@experience-marketplace/holibob-api';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server.js';

// Parse CLI args
const args = process.argv.slice(2);
const transportArg = args.find((a) => a.startsWith('--transport='))?.split('=')[1] ?? 'stdio';
const portArg = args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? '3100';

// Read Holibob credentials from env
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

// Create Holibob client
const client = createHolibobClient({
  apiUrl,
  partnerId,
  apiKey,
  apiSecret,
});

// Create MCP server
const server = createServer(client);

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp(port: number): Promise<void> {
  // Dynamic imports to keep express optional for stdio-only usage
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');

  // Use dynamic import + require-style for express to avoid type issues
  const http = await import('node:http');

  const transports = new Map<string, InstanceType<typeof SSEServerTransport>>();

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

    // SSE endpoint
    if (url.pathname === '/sse' && req.method === 'GET') {
      const transport = new SSEServerTransport('/messages', res);
      transports.set(transport.sessionId, transport);
      res.on('close', () => {
        transports.delete(transport.sessionId);
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

      const transport = transports.get(sessionId);
      if (!transport) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      await transport.handlePostMessage(req, res);
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
  });
}

async function main(): Promise<void> {
  if (transportArg === 'stdio') {
    await startStdio();
  } else if (transportArg === 'http') {
    await startHttp(parseInt(portArg, 10));
  } else {
    console.error(`Unknown transport: ${transportArg}. Use --transport=stdio or --transport=http`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
