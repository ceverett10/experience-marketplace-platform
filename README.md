# Experience Marketplace Platform

Autonomous SEO/LLM-optimised experience marketplace platform powered by the Holibob API.

## Overview

This platform enables the creation and management of multiple niche experience booking websites, optimised for search engines and AI assistants. It follows an autonomous operation model with minimal manual intervention.

## Architecture

```
experience-marketplace-platform/
├── apps/
│   ├── demand-generation/    # SEO opportunity identification & content generation
│   ├── website-platform/     # Multi-tenant consumer storefronts (Next.js)
│   └── admin/                # Admin dashboard for management
├── packages/
│   ├── shared/               # Shared types, utilities, and constants
│   ├── holibob-api/          # Holibob GraphQL API client
│   └── ui-components/        # Shared React UI components
└── infrastructure/           # Deployment configurations
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Redis (for job queues)

### Installation

```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Run development servers
npm run dev
```

### Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run typecheck
```

## Applications

### Demand Generation Service

The demand generation service identifies SEO opportunities and generates optimised content:

- **Keyword Research**: Identifies high-value, low-competition keywords
- **Content Generation**: Uses LLMs to create SEO-optimised content
- **Performance Monitoring**: Tracks rankings and adjusts strategies

### Website Platform

Multi-tenant Next.js application for consumer storefronts:

- **SSR/SEO Optimised**: Server-side rendering for optimal SEO
- **Dynamic Routing**: Domain-based tenant resolution
- **Holibob Integration**: Full booking flow via Holibob API

### Admin Dashboard

Management interface for platform operators:

- **Storefront Management**: Create and configure niche websites
- **Content Review**: Review and publish generated content
- **Analytics**: Track performance metrics across all sites

## Packages

### @experience-marketplace/shared

Shared TypeScript types, Zod schemas, and utility functions.

### @experience-marketplace/holibob-api

Type-safe GraphQL client for the Holibob API:

- Product Discovery
- Availability Checking
- Booking Flow
- Basket Management

### @experience-marketplace/ui-components

Reusable React components with Tailwind CSS styling.

## Testing

We use Vitest for testing with the following coverage targets:

- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Deployment

The platform is deployed to Heroku with automatic deploys from the `main` branch.

```bash
# Manual deploy
git push heroku main
```

## Environment Variables

See `.env.example` for required environment variables.

## License

UNLICENSED - Proprietary
