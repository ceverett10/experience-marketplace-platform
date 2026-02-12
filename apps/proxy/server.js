/**
 * Heroku Proxy Server
 * Routes requests to the appropriate Next.js application
 * - /admin/* -> Admin Dashboard (port 3001)
 * - /* -> Website Platform (port 3000)
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Proxy /admin routes to admin dashboard
// Keep /admin prefix since Next.js is configured with basePath='/admin' in production
app.use(
  '/admin',
  createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: false, // Preserve original Host header for multi-tenant support
    xfwd: true, // Forward X-Forwarded-* headers
    onProxyReq: (proxyReq, req) => {
      // Preserve the original host from the incoming request for tenant identification
      const originalHost = req.headers['x-forwarded-host'] || req.headers.host;
      if (originalHost) {
        proxyReq.setHeader('x-forwarded-host', originalHost);
      }
    },
    onError: (err, req, res) => {
      console.error('Admin proxy error:', err.message);
      res.status(503).json({
        error: 'Admin dashboard unavailable',
        message: 'Please try again in a moment',
      });
    },
  })
);

// OAuth discovery & auth endpoints at root level — Claude Desktop looks for these at the origin root
// These MUST be before the catch-all website proxy
const mcpOAuthProxy = createProxyMiddleware({
  target: 'http://localhost:3100',
  changeOrigin: false,
  xfwd: true,
  onError: (err, req, res) => {
    console.error('MCP OAuth proxy error:', err.message);
    res.status(503).json({
      error: 'MCP server unavailable',
      message: 'Please try again in a moment',
    });
  },
});
app.use('/.well-known/oauth-protected-resource', mcpOAuthProxy);
app.use('/.well-known/oauth-authorization-server', mcpOAuthProxy);
app.use('/authorize', mcpOAuthProxy);
app.use('/oauth', mcpOAuthProxy);

// Proxy /mcp routes to MCP server (SSE transport for Claude Desktop / ChatGPT)
app.use(
  '/mcp',
  createProxyMiddleware({
    target: 'http://localhost:3100',
    changeOrigin: false,
    xfwd: true,
    pathRewrite: { '^/mcp': '' }, // Strip /mcp prefix — MCP server expects /sse, /messages, /health at root
    onError: (err, req, res) => {
      console.error('MCP proxy error:', err.message);
      res.status(503).json({
        error: 'MCP server unavailable',
        message: 'Please try again in a moment',
      });
    },
  })
);

// Proxy all other routes to website platform
app.use(
  '/',
  createProxyMiddleware({
    target: 'http://localhost:3000',
    changeOrigin: false, // Preserve original Host header for multi-tenant support
    xfwd: true, // Forward X-Forwarded-* headers
    onProxyReq: (proxyReq, req) => {
      // Preserve the original host from the incoming request for tenant identification
      const originalHost = req.headers['x-forwarded-host'] || req.headers.host;
      if (originalHost) {
        proxyReq.setHeader('x-forwarded-host', originalHost);
      }
    },
    onError: (err, req, res) => {
      console.error('Website proxy error:', err.message);
      res.status(503).json({
        error: 'Website unavailable',
        message: 'Please try again in a moment',
      });
    },
  })
);

app.listen(PORT, () => {
  console.log(`[Proxy] Server listening on port ${PORT}`);
  console.log(`[Proxy] Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`[Proxy] Website platform: http://localhost:${PORT}`);
});
