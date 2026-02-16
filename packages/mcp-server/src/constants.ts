// CSP domain whitelist — shared between widget resource registration and tool responses
export const WIDGET_RESOURCE_DOMAINS = [
  'https://holibob.com',
  'https://www.holibob.tech',
  'https://images.holibob.tech',
  'https://images.unsplash.com',
  'https://hblb.s3.eu-west-1.amazonaws.com',
];

/**
 * Returns the resource domains list including the MCP server's own origin
 * (needed so image proxy URLs pass CSP checks).
 */
export function getWidgetResourceDomains(publicUrl?: string): string[] {
  if (!publicUrl) return WIDGET_RESOURCE_DOMAINS;
  try {
    const origin = new URL(publicUrl).origin;
    if (WIDGET_RESOURCE_DOMAINS.includes(origin)) return WIDGET_RESOURCE_DOMAINS;
    return [...WIDGET_RESOURCE_DOMAINS, origin];
  } catch {
    return WIDGET_RESOURCE_DOMAINS;
  }
}
