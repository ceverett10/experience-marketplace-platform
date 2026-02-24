import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { HolibobClient } from '@experience-marketplace/holibob-api';
import { registerDiscoveryTools } from './tools/discovery.js';
import { registerAvailabilityTools } from './tools/availability.js';
import { registerBookingTools } from './tools/booking.js';
import { registerPaymentTools } from './tools/payment.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';
import { TRIP_PLANNER_HTML } from './widgets/trip-planner.js';
import { EXPERIENCE_CAROUSEL_HTML } from './widgets/experience-carousel.js';
import { EXPERIENCE_DETAIL_HTML } from './widgets/experience-detail.js';
import { COMBINED_EXPERIENCE_HTML } from './widgets/combined-experience.js';
import { getWidgetResourceDomains } from './constants.js';

/**
 * Compute the dedicated sandbox origin for Claude MCP Apps.
 * Claude expects ui.domain to be a content-addressed subdomain of claudemcpcontent.com,
 * derived from the SSE connection URL.
 */
function computeSandboxDomain(publicUrl: string): string {
  const sseUrl = `${publicUrl}/mcp/sse`;
  const hash = createHash('sha256').update(sseUrl).digest('hex').slice(0, 32);
  return `${hash}.claudemcpcontent.com`;
}

export interface ServerContext {
  /** The MCP API key used to authenticate this session */
  mcpApiKey: string;
  /** The public base URL of the MCP server (for image proxy and checkout URLs) */
  publicUrl: string;
}

export function createServer(client: HolibobClient, context?: ServerContext): McpServer {
  const server = new McpServer({
    name: 'holibob',
    version: '0.1.0',
  });

  // Register all tools
  registerDiscoveryTools(server, client, context);
  registerAvailabilityTools(server, client);
  registerBookingTools(server, client);
  registerPaymentTools(server, client, context);

  // Register resources
  registerResources(server, client);

  // Register prompts
  registerPrompts(server);

  // Register widget app resources for ChatGPT Apps SDK
  const widgets: Array<[string, string, string]> = [
    ['trip-planner', 'ui://holibob/trip-planner.html', TRIP_PLANNER_HTML],
    ['experience-carousel', 'ui://holibob/experience-carousel.html', EXPERIENCE_CAROUSEL_HTML],
    ['experience-detail', 'ui://holibob/experience-detail.html', EXPERIENCE_DETAIL_HTML],
    ['combined-experience', 'ui://holibob/combined-experience.html', COMBINED_EXPERIENCE_HTML],
  ];

  const resourceDomains = getWidgetResourceDomains(context?.publicUrl);
  const redirectDomains: string[] = [];
  if (context?.publicUrl) {
    try {
      redirectDomains.push(new URL(context.publicUrl).hostname);
    } catch {
      // Ignore invalid publicUrl
    }
  }

  // CSP metadata — declared on both the resource config (so the host reads it at
  // connection/listing time) and on the resource contents (for hosts that read it
  // when the resource is actually fetched).
  const sandboxDomain = context?.publicUrl ? computeSandboxDomain(context.publicUrl) : undefined;
  const cspMeta = {
    // Modern MCP Apps format (Claude reads ui.domain for sandbox origin)
    ui: {
      ...(sandboxDomain ? { domain: sandboxDomain } : {}),
      csp: {
        connectDomains: [] as string[],
        resourceDomains,
        redirectDomains,
      },
    },
    // Legacy OpenAI format (published mode)
    'openai/widgetCSP': {
      connect_domains: [] as string[],
      resource_domains: resourceDomains,
      redirect_domains: redirectDomains,
    },
  };

  for (const [name, uri, html] of widgets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM type resolution mismatch
    registerAppResource(
      server as any,
      name,
      uri,
      // Config _meta — host reads this at connection time to configure iframe CSP
      { mimeType: RESOURCE_MIME_TYPE, _meta: cspMeta },
      async () => ({
        contents: [
          {
            uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            // Contents _meta — host reads this when resource is fetched
            _meta: cspMeta,
          },
        ],
      })
    );
  }

  return server;
}
