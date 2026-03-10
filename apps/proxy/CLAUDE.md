# Proxy Server (`@experience-marketplace/proxy`)

Express.js routing proxy. Single entry point on Heroku (port 8080).

## Routing Rules

```
Heroku Ingress (8080)
  ├── admin.experiencess.com  → Admin (3001) — full subdomain routing
  ├── /admin/*                → Admin (3001) — path-based routing
  ├── /.well-known/oauth-*    → MCP Server (3100) — OAuth discovery
  ├── /oauth, /authorize      → MCP Server (3100) — OAuth endpoints
  ├── /mcp/*                  → MCP Server (3100) — strips /mcp prefix
  └── /*                      → Website (3000) — catch-all for consumer sites
```

## Key Behaviors

- Preserves `Host` header for multi-tenant site resolution downstream
- Forwards: `X-Forwarded-Host`, `X-Forwarded-For`, `X-Forwarded-Proto`
- MCP routes strip `/mcp` prefix (MCP expects `/sse`, `/messages`, `/health` at root)
- Per-route error handlers return 503 with service identification
- Health check: `GET /health` returns JSON status

## Admin basePath

- Admin Next.js app uses `basePath = '/admin'` in production
- Proxy does NOT rewrite paths — Next.js handles `/admin` prefix internally
- In development, admin runs standalone with empty basePath on port 3001
