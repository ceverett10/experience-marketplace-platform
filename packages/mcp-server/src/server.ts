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
import { WIDGET_RESOURCE_DOMAINS } from './constants.js';

export function createServer(client: HolibobClient): McpServer {
  const server = new McpServer({
    name: 'holibob',
    version: '0.1.0',
  });

  // Register all tools
  registerDiscoveryTools(server, client);
  registerAvailabilityTools(server, client);
  registerBookingTools(server, client);
  registerPaymentTools(server, client);

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

  for (const [name, uri, html] of widgets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM type resolution mismatch
    registerAppResource(server as any, name, uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [
        {
          uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            // Modern format (dev mode)
            ui: {
              domain: 'https://holibob.com',
              csp: {
                connectDomains: [],
                resourceDomains: WIDGET_RESOURCE_DOMAINS,
              },
            },
            // Legacy format (published mode)
            'openai/widgetCSP': {
              connect_domains: [] as string[],
              resource_domains: WIDGET_RESOURCE_DOMAINS,
            },
          },
        },
      ],
    }));
  }

  return server;
}
