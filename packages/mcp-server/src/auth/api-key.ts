import { PrismaClient } from '@prisma/client';
import { createHolibobClient, type HolibobClient } from '@experience-marketplace/holibob-api';
import { decryptToken } from '@experience-marketplace/jobs';

const prisma = new PrismaClient();

export interface AuthenticatedPartner {
  partnerId: string;
  partnerName: string;
  holibobPartnerId: string;
  paymentModel: string;
  /** Base URL of the partner's active site (e.g. "https://london-tours.com") for building experience links */
  siteUrl: string | null;
  client: HolibobClient;
}

/**
 * Authenticate an MCP API key and return a partner-scoped Holibob client.
 * Looks up the key in the database, decrypts the partner's credentials,
 * and creates a HolibobClient configured for that partner.
 */
export async function authenticateApiKey(apiKey: string): Promise<AuthenticatedPartner | null> {
  const mcpKey = await prisma.mcpApiKey.findUnique({
    where: { key: apiKey },
    include: { partner: true },
  });

  if (!mcpKey || !mcpKey.isActive) {
    return null;
  }

  const partner = mcpKey.partner;

  if (partner.status !== 'ACTIVE') {
    return null;
  }

  // Resolve the partner's site URL for building experience booking links.
  // Partner ↔ Site are linked by holibobPartnerId (no direct FK).
  // Prefer the site's primaryDomain; fall back to first ACTIVE domain.
  let siteUrl: string | null = null;
  try {
    const site = await prisma.site.findFirst({
      where: { holibobPartnerId: partner.holibobPartnerId, status: 'ACTIVE' },
      select: {
        primaryDomain: true,
        domains: {
          where: { status: 'ACTIVE' },
          select: { domain: true },
          take: 1,
          orderBy: { verifiedAt: 'desc' },
        },
      },
    });
    const domain = site?.primaryDomain ?? site?.domains[0]?.domain ?? null;
    if (domain) siteUrl = `https://${domain}`;
  } catch {
    // Non-critical — experience links will be omitted if lookup fails
  }

  // Update lastUsedAt
  await prisma.mcpApiKey
    .update({
      where: { id: mcpKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // Non-critical — don't fail auth if tracking update fails
    });

  // Decrypt Holibob credentials
  const holibobApiKey = decryptToken(partner.holibobApiKey);
  const holibobApiSecret = partner.holibobApiSecret
    ? decryptToken(partner.holibobApiSecret)
    : undefined;

  const client = createHolibobClient({
    apiUrl: partner.holibobApiUrl,
    partnerId: partner.holibobPartnerId,
    apiKey: holibobApiKey,
    apiSecret: holibobApiSecret,
  });

  return {
    partnerId: partner.id,
    partnerName: partner.name,
    holibobPartnerId: partner.holibobPartnerId,
    paymentModel: partner.paymentModel,
    siteUrl,
    client,
  };
}
