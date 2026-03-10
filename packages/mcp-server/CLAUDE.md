# MCP Server (`@experience-marketplace/mcp-server`)

Model Context Protocol server for Holibob experience discovery and booking. Connects AI platforms (Claude, ChatGPT, Perplexity) to the Holibob API.

## Architecture

`createServer(client, context?)` → registers tools, resources, prompts, and widget apps on an `McpServer` instance.

### Transport Modes

- **STDIO**: Local clients (Perplexity, Claude Desktop) — default
- **HTTP**: Hosted deployment (ChatGPT, remote MCP) — `--transport=http --port=3100`

### Authentication

- `src/auth/api-key.ts` — Header-based API key auth
- `src/auth/oauth.ts` — OAuth 2.0 with PKCE + Dynamic Client Registration (RFC 7591)
- `src/auth/checkout-token.ts` — Short-lived tokens for payment redirects

## Tools (4 groups)

| Group        | File                    | Tools                                                                                                   |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Discovery    | `tools/discovery.ts`    | `search_experiences`, `get_experience_details`, `get_suggestions`, `load_more_experiences`, `plan_trip` |
| Availability | `tools/availability.ts` | `check_availability`, `get_slot_options`, `answer_slot_options`, `get_slot_pricing`, `set_slot_pricing` |
| Booking      | `tools/booking.ts`      | `create_booking`, `add_to_booking`, `get_booking_questions`, `answer_booking_questions`                 |
| Payment      | `tools/payment.ts`      | `get_payment_info`, `commit_booking`, `get_booking_status`                                              |

### Booking Flow Sequence

```
search → details → availability → slot_options → answer_options
→ pricing → set_pricing → create_booking → add_to_booking
→ questions → answer_questions → payment_info → commit
```

## Widgets (ChatGPT Apps SDK)

4 HTML widgets registered as MCP app resources:

- `trip-planner` — Interactive trip planning UI
- `experience-carousel` — Browsable experience cards
- `experience-detail` — Single experience view
- `combined-experience` — Multi-experience layout

CSP domains whitelisted in `constants.ts`. Image proxy (`/image-proxy`) rewrites non-whitelisted URLs.

## Key Dependencies

- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `@modelcontextprotocol/ext-apps` — ChatGPT Apps SDK extensions
- `@experience-marketplace/holibob-api` — Holibob GraphQL client (all data comes from here)

## Environment Variables

- `HOLIBOB_PARTNER_ID` (required) — Partner ID for Holibob API
- `HOLIBOB_API_KEY` (required) — API key
- `HOLIBOB_API_SECRET` (optional) — For HMAC authentication
- `HOLIBOB_API_URL` (optional) — Defaults to production

## Common Pitfalls

1. Widget CSP: New image domains must be added to `WIDGET_RESOURCE_DOMAINS` in `constants.ts`
2. Claude sandbox domain is content-addressed from SSE URL hash — see `computeSandboxDomain()`
3. `registerAppResource` needs `as any` cast due to CJS/ESM type mismatch — this is intentional
4. Published as `holibob-mcp` on npm — `package.publish.json` overrides `package.json` for publishing
