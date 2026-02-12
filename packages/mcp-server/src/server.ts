import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { HolibobClient } from '@experience-marketplace/holibob-api';
import { registerDiscoveryTools } from './tools/discovery.js';
import { registerAvailabilityTools } from './tools/availability.js';
import { registerBookingTools } from './tools/booking.js';
import { registerPaymentTools } from './tools/payment.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';
import { SEARCH_RESULTS_HTML } from './widgets/search-results.js';
import { EXPERIENCE_DETAIL_HTML } from './widgets/experience-detail.js';
import { AVAILABILITY_HTML } from './widgets/availability.js';
import { SLOT_CONFIG_HTML } from './widgets/slot-config.js';
import { BOOKING_HTML } from './widgets/booking.js';
import { BOOKING_STATUS_HTML } from './widgets/booking-status.js';

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
    ['search-results', 'ui://holibob/search-results.html', SEARCH_RESULTS_HTML],
    ['experience-detail', 'ui://holibob/experience-detail.html', EXPERIENCE_DETAIL_HTML],
    ['availability', 'ui://holibob/availability.html', AVAILABILITY_HTML],
    ['slot-config', 'ui://holibob/slot-config.html', SLOT_CONFIG_HTML],
    ['booking', 'ui://holibob/booking.html', BOOKING_HTML],
    ['booking-status', 'ui://holibob/booking-status.html', BOOKING_STATUS_HTML],
  ];

  for (const [name, uri, html] of widgets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM type resolution mismatch
    registerAppResource(server as any, name, uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html }],
    }));
  }

  return server;
}
