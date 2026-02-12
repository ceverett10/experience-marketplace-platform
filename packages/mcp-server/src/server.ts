import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HolibobClient } from '@experience-marketplace/holibob-api';
import { registerDiscoveryTools } from './tools/discovery.js';
import { registerAvailabilityTools } from './tools/availability.js';
import { registerBookingTools } from './tools/booking.js';
import { registerPaymentTools } from './tools/payment.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';

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

  return server;
}
