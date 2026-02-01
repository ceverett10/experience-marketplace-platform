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
    changeOrigin: true,
    onError: (err, req, res) => {
      console.error('Admin proxy error:', err.message);
      res.status(503).json({
        error: 'Admin dashboard unavailable',
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
    changeOrigin: true,
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
