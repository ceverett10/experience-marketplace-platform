/**
 * Microsite Detection and Configuration Helpers
 * Handles subdomain-based microsite detection for *.experiencess.com
 */

/**
 * Parent domains that support microsite subdomains.
 * Requests to *.PARENT_DOMAIN will be resolved as microsites.
 */
export const MICROSITE_PARENT_DOMAINS = ['experiencess.com'] as const;

export type MicrositeParentDomain = (typeof MICROSITE_PARENT_DOMAINS)[number];

/**
 * Result of parsing a hostname for microsite detection
 */
export interface MicrositeHostnameInfo {
  /** Whether this hostname matches a known microsite parent domain pattern */
  isMicrositeSubdomain: boolean;
  /** The subdomain portion (e.g., "adventure-co" from "adventure-co.experiencess.com") */
  subdomain: string | null;
  /** The parent domain (e.g., "experiencess.com") */
  parentDomain: MicrositeParentDomain | null;
}

/**
 * Parse a hostname to detect if it's a microsite subdomain.
 *
 * Examples:
 * - "adventure-co.experiencess.com" -> { isMicrositeSubdomain: true, subdomain: "adventure-co", parentDomain: "experiencess.com" }
 * - "experiencess.com" -> { isMicrositeSubdomain: false, ... } (bare parent domain, not a subdomain)
 * - "www.experiencess.com" -> { isMicrositeSubdomain: false, ... } (www is not a microsite)
 * - "london-tours.com" -> { isMicrositeSubdomain: false, ... } (custom domain, not a microsite subdomain)
 */
export function parseMicrositeHostname(hostname: string): MicrositeHostnameInfo {
  // Remove port if present
  const cleanHostname = hostname.split(':')[0]?.toLowerCase() ?? hostname.toLowerCase();

  for (const parentDomain of MICROSITE_PARENT_DOMAINS) {
    // Check if hostname ends with .PARENT_DOMAIN
    if (cleanHostname.endsWith(`.${parentDomain}`)) {
      // Extract the subdomain part
      const subdomain = cleanHostname.slice(0, -(parentDomain.length + 1)); // +1 for the dot

      // Skip "www" - it's not a microsite subdomain
      if (subdomain === 'www') {
        continue;
      }

      // Must have a subdomain (not just bare ".experiencess.com")
      if (subdomain && subdomain.length > 0) {
        return {
          isMicrositeSubdomain: true,
          subdomain,
          parentDomain,
        };
      }
    }

    // Check if it's the bare parent domain (with or without www)
    if (cleanHostname === parentDomain || cleanHostname === `www.${parentDomain}`) {
      // This is the parent domain itself, not a subdomain
      // It should be handled by the main site logic (or serve as an aggregator site)
      return {
        isMicrositeSubdomain: false,
        subdomain: null,
        parentDomain,
      };
    }
  }

  // Not a microsite subdomain
  return {
    isMicrositeSubdomain: false,
    subdomain: null,
    parentDomain: null,
  };
}

/**
 * Check if a hostname is a microsite subdomain (quick boolean check)
 */
export function isMicrositeSubdomain(hostname: string): boolean {
  return parseMicrositeHostname(hostname).isMicrositeSubdomain;
}

/**
 * Build the full domain from subdomain and parent domain
 */
export function buildMicrositeFullDomain(
  subdomain: string,
  parentDomain: MicrositeParentDomain
): string {
  return `${subdomain}.${parentDomain}`;
}
