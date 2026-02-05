/**
 * Regenerate all logos for active sites
 * Creates light, dark, and favicon versions using DALL-E 3
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Import jobs package functions
  const { regenerateAllLogos, isLogoGenerationAvailable } = await import("@experience-marketplace/jobs");

  if (!isLogoGenerationAvailable()) {
    console.error("Logo generation not available. Check OPENAI_API_KEY and R2 config.");
    process.exit(1);
  }

  const sites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    include: {
      brand: true,
      opportunities: {
        take: 1,
        select: {
          niche: true,
          location: true
        }
      }
    }
  });

  console.log(`Found ${sites.length} active sites to process\n`);

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const opportunity = site.opportunities[0];

    console.log(`\n[${i + 1}/${sites.length}] Processing: ${site.name}`);

    if (!site.brand) {
      console.log("  Skipping - no brand record");
      continue;
    }

    try {
      console.log("  Generating all logo versions...");
      const result = await regenerateAllLogos(
        {
          brandName: site.brand.name,
          niche: opportunity?.niche || "travel experiences",
          primaryColor: site.brand.primaryColor,
          secondaryColor: site.brand.secondaryColor,
          location: opportunity?.location || undefined
        },
        {
          logoUrl: site.brand.logoUrl,
          logoDarkUrl: site.brand.logoDarkUrl,
          faviconUrl: site.brand.faviconUrl
        }
      );

      // Update brand with new logo URLs
      await prisma.brand.update({
        where: { id: site.brand.id },
        data: {
          logoUrl: result.logoUrl,
          logoDarkUrl: result.logoDarkUrl,
          faviconUrl: result.faviconUrl
        }
      });

      console.log("  ✓ Done!");
      console.log(`    Light: ${result.logoUrl}`);
      console.log(`    Dark:  ${result.logoDarkUrl}`);
      console.log(`    Favicon: ${result.faviconUrl}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    }

    // Small delay to avoid rate limiting
    if (i < sites.length - 1) {
      console.log("  Waiting 2s before next site...");
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log("\n\nAll done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
