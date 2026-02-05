import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Generate brand identity for existing sites
 * This calls the brand identity generation service for sites that don't have
 * comprehensive brand data (tone of voice, trust signals, etc.)
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { siteIds, regenerateAll = false } = body;

    // Import the brand identity functions dynamically
    const { generateComprehensiveBrandIdentity, storeBrandIdentity, generateAllLogoVersions, isLogoGenerationAvailable } =
      await import('@experience-marketplace/jobs').then((m) => m);

    // Common include for all queries
    const includeRelations = {
      brand: true,
      opportunities: {
        take: 1,
      },
    } as const;

    // Get sites to process
    let sites;
    if (siteIds && siteIds.length > 0) {
      sites = await prisma.site.findMany({
        where: { id: { in: siteIds } },
        include: includeRelations,
      });
    } else if (regenerateAll) {
      // Get all sites
      sites = await prisma.site.findMany({
        include: includeRelations,
      });
    } else {
      // Get sites without seoConfig (brand identity)
      // Use Prisma.JsonNull for null JSON values
      sites = await prisma.site.findMany({
        where: {
          OR: [
            { seoConfig: { equals: Prisma.JsonNull } },
            { seoConfig: { equals: Prisma.DbNull } },
            { seoConfig: { equals: {} } },
          ],
        },
        include: includeRelations,
      });
    }

    if (sites.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No sites need brand identity generation',
        processed: 0,
      });
    }

    console.log(`[Brand Identity] Processing ${sites.length} sites`);

    const results = [];
    for (const site of sites) {
      try {
        // Get opportunity data for context, or create from site info
        const opportunity = site.opportunities[0];
        const context = {
          keyword: opportunity?.keyword || site.name,
          location: opportunity?.location || undefined,
          niche: opportunity?.niche || 'travel experiences',
          searchVolume: opportunity?.searchVolume || 1000,
          intent: opportunity?.intent || 'transactional',
        };

        console.log(`[Brand Identity] Generating for site ${site.id} (${site.name})`);

        // Generate comprehensive brand identity
        const brandIdentity = await generateComprehensiveBrandIdentity(context, {
          name: site.brand?.name || site.name,
          tagline: site.brand?.tagline || site.description || undefined,
          primaryColor: site.brand?.primaryColor || undefined,
          secondaryColor: site.brand?.secondaryColor || undefined,
          accentColor: site.brand?.accentColor || undefined,
          headingFont: site.brand?.headingFont || undefined,
          bodyFont: site.brand?.bodyFont || undefined,
          logoUrl: site.brand?.logoUrl || undefined,
        });

        // Store brand identity in seoConfig
        await storeBrandIdentity(site.id, site.brand?.id || '', brandIdentity);

        // Generate all logo versions if DALL-E + R2 configured
        let logoUrl: string | null = site.brand?.logoUrl || null;
        let logoDarkUrl: string | null = site.brand?.logoDarkUrl || null;
        let faviconUrl: string | null = site.brand?.faviconUrl || null;
        if (isLogoGenerationAvailable()) {
          try {
            console.log(`[Brand Identity] Generating all logo versions for ${site.name}...`);
            const logoResult = await generateAllLogoVersions({
              brandName: brandIdentity.name,
              niche: context.niche,
              primaryColor: brandIdentity.primaryColor,
              secondaryColor: brandIdentity.secondaryColor,
              logoDescription: brandIdentity.logoDescription,
              location: context.location,
            });
            logoUrl = logoResult.logoUrl;
            logoDarkUrl = logoResult.logoDarkUrl;
            faviconUrl = logoResult.faviconUrl;
            console.log(`[Brand Identity] All logos generated: light=${logoUrl}, dark=${logoDarkUrl}, favicon=${faviconUrl}`);
          } catch (logoErr) {
            console.warn(`[Brand Identity] Logo generation failed for ${site.name}:`, logoErr);
          }
        }

        // Update existing brand record, or create one if missing
        if (site.brand) {
          await prisma.brand.update({
            where: { id: site.brand.id },
            data: {
              name: brandIdentity.name,
              tagline: brandIdentity.tagline,
              primaryColor: brandIdentity.primaryColor,
              secondaryColor: brandIdentity.secondaryColor,
              accentColor: brandIdentity.accentColor,
              headingFont: brandIdentity.headingFont,
              bodyFont: brandIdentity.bodyFont,
              logoUrl,
              logoDarkUrl,
              faviconUrl,
            },
          });
        } else {
          await prisma.site.update({
            where: { id: site.id },
            data: {
              brand: {
                create: {
                  name: brandIdentity.name,
                  tagline: brandIdentity.tagline,
                  primaryColor: brandIdentity.primaryColor,
                  secondaryColor: brandIdentity.secondaryColor,
                  accentColor: brandIdentity.accentColor,
                  headingFont: brandIdentity.headingFont,
                  bodyFont: brandIdentity.bodyFont,
                  logoUrl,
                  logoDarkUrl,
                  faviconUrl,
                  isAutoGenerated: true,
                  generationPrompt: `Brand identity for ${context.niche} in ${context.keyword}`,
                },
              },
            },
          });
        }

        results.push({
          siteId: site.id,
          siteName: site.name,
          success: true,
          brandName: brandIdentity.name,
          tonePersonality: brandIdentity.toneOfVoice.personality,
        });

        console.log(
          `[Brand Identity] Generated for ${site.name}: tone=${brandIdentity.toneOfVoice.personality.join(', ')}`
        );
      } catch (err) {
        console.error(`[Brand Identity] Failed for site ${site.id}:`, err);
        results.push({
          siteId: site.id,
          siteName: site.name,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      message: `Generated brand identity for ${successCount}/${sites.length} sites`,
      processed: sites.length,
      successful: successCount,
      failed: sites.length - successCount,
      results,
    });
  } catch (error) {
    console.error('[API] Error generating brand identity:', error);
    return NextResponse.json({ error: 'Failed to generate brand identity' }, { status: 500 });
  }
}

/**
 * Get brand identity status for all sites
 */
export async function GET(): Promise<NextResponse> {
  try {
    const sites = await prisma.site.findMany({
      select: {
        id: true,
        name: true,
        seoConfig: true,
        brand: {
          select: {
            name: true,
            tagline: true,
          },
        },
      },
    });

    const siteStatus = sites.map((site) => {
      const seoConfig = site.seoConfig as Record<string, unknown> | null;
      const hasBrandIdentity = !!(seoConfig?.['toneOfVoice'] || seoConfig?.['trustSignals']);

      return {
        id: site.id,
        name: site.name,
        brandName: site.brand?.name || null,
        hasBrandIdentity,
        toneOfVoice: seoConfig?.['toneOfVoice'] ? 'configured' : 'missing',
        trustSignals: seoConfig?.['trustSignals'] ? 'configured' : 'missing',
        brandStory: seoConfig?.['brandStory'] ? 'configured' : 'missing',
      };
    });

    const stats = {
      total: sites.length,
      withBrandIdentity: siteStatus.filter((s) => s.hasBrandIdentity).length,
      withoutBrandIdentity: siteStatus.filter((s) => !s.hasBrandIdentity).length,
    };

    return NextResponse.json({ sites: siteStatus, stats });
  } catch (error) {
    console.error('[API] Error fetching brand identity status:', error);
    return NextResponse.json({ error: 'Failed to fetch brand identity status' }, { status: 500 });
  }
}
