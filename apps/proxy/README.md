# Proxy Server

Simple Express-based reverse proxy for routing requests to multiple Next.js applications on Heroku.

## Purpose

Heroku only allows one web process per application, but we need to serve both:
- Public website (website-platform)
- Admin dashboard (admin)

This proxy server routes incoming requests to the appropriate application:

## Routing

- `https://your-app.herokuapp.com/admin/*` → Admin Dashboard (port 3001)
- `https://your-app.herokuapp.com/*` → Website Platform (port 3000)

## Local Development

This proxy is only needed for production deployments. In local development, run each app independently:

```bash
# Website (port 3000)
npm run dev --workspace=@experience-marketplace/website-platform

# Admin (port 3001)
npm run dev --workspace=@experience-marketplace/admin
```

## Production

On Heroku, the proxy runs as the main web process and forwards requests to both Next.js apps running in the background.
