# Holibob MCP Server

Search, discover, and book travel experiences through AI assistants. This MCP (Model Context Protocol) server connects AI platforms like **Perplexity**, **Claude**, and **ChatGPT** to the Holibob experience marketplace.

## Prerequisites

- Node.js 20+
- Holibob partner credentials (`HOLIBOB_PARTNER_ID` and `HOLIBOB_API_KEY`)

## Setup

### Perplexity (Mac App)

1. Open Perplexity → Settings → Connectors → Add Connector
2. Install the PerplexityXPC helper if prompted

**Simple tab:**
```
HOLIBOB_PARTNER_ID=your-partner-id HOLIBOB_API_KEY=your-api-key npx -yq holibob-mcp
```

**Advanced (JSON) tab:**
```json
{
  "mcpServers": {
    "holibob": {
      "command": "npx",
      "args": ["-yq", "holibob-mcp"],
      "env": {
        "HOLIBOB_PARTNER_ID": "your-partner-id",
        "HOLIBOB_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Perplexity (Remote MCP)

For Perplexity's remote MCP feature (rolling out to paid users), enter your hosted server URL:

```
https://your-domain.com/mcp
```

The server supports OAuth 2.0 with PKCE for authentication.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "holibob": {
      "command": "npx",
      "args": ["-yq", "holibob-mcp"],
      "env": {
        "HOLIBOB_PARTNER_ID": "your-partner-id",
        "HOLIBOB_API_KEY": "your-api-key"
      }
    }
  }
}
```

### ChatGPT

ChatGPT connects via the remote HTTP endpoint with OAuth. Point it to your hosted server URL:

```
https://your-domain.com/mcp
```

The server supports Dynamic Client Registration (RFC 7591) and OAuth 2.0 with PKCE.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HOLIBOB_PARTNER_ID` | Yes | Your Holibob partner ID |
| `HOLIBOB_API_KEY` | Yes | Your Holibob API key |
| `HOLIBOB_API_SECRET` | No | API secret for HMAC authentication |
| `HOLIBOB_API_URL` | No | API endpoint (defaults to production) |

## Available Tools

### Discovery
| Tool | Description |
|------|-------------|
| `search_experiences` | Search by destination, dates, travelers, and activity type |
| `get_experience_details` | Full details with reviews, images, pricing, cancellation policy |
| `get_suggestions` | Destination and activity auto-suggestions |
| `load_more_experiences` | Load additional results (pagination) |
| `plan_trip` | Interactive trip planner |

### Availability & Pricing
| Tool | Description |
|------|-------------|
| `check_availability` | Find available dates within a range |
| `get_slot_options` | Get configuration options for a time slot |
| `answer_slot_options` | Select time, variant, language, etc. |
| `get_slot_pricing` | View pricing categories (Adult, Child, etc.) |
| `set_slot_pricing` | Set participant counts and confirm pricing |

### Booking
| Tool | Description |
|------|-------------|
| `create_booking` | Create a new booking basket |
| `add_to_booking` | Add a configured availability slot |
| `get_booking_questions` | Get required guest details and questions |
| `answer_booking_questions` | Submit guest name, email, phone, etc. |
| `get_payment_info` | Check if payment is required (Stripe) |
| `commit_booking` | Finalize the booking and get voucher |
| `get_booking_status` | Check booking confirmation status |

## Booking Flow

The typical booking sequence:

```
search_experiences → get_experience_details → check_availability
  → get_slot_options → answer_slot_options → get_slot_pricing
  → set_slot_pricing → create_booking → add_to_booking
  → get_booking_questions → answer_booking_questions
  → get_payment_info → commit_booking
```

## Transport Modes

| Mode | Use Case | Flag |
|------|----------|------|
| STDIO | Local clients (Perplexity, Claude Desktop) | Default, no flag needed |
| HTTP | Hosted deployment (ChatGPT, remote MCP) | `--transport=http --port=3100` |

## License

MIT
