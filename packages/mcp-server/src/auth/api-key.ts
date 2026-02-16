import { PrismaClient } from '@prisma/client';
import { createHolibobClient, type HolibobClient } from '@experience-marketplace/holibob-api';
import { decryptToken } from '@experience-marketplace/jobs';

const prisma = new PrismaClient();

export interface AuthenticatedPartner {
  partnerId: string;
  partnerName: string;
  holibobPartnerId: string;
  paymentModel: string;
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
    client,
  };
}
