/**
 * Regenerate all logos for active sites using SVG-based generation
 * Creates professional icon + typography logos (no AI needed)
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Import jobs package functions (now uses SVG generator internally)
  const { regenerateAllLogos, isLogoGenerationAvailable } = await import("@experience-marketplace/jobs");

  if (!isLogoGenerationAvailable()) {
    console.error("Logo generation not available. Check R2 storage config.");
    process.exit(1);
  }

  console.log("Using SVG-based logo generation (icon + brand name)");
  console.log("No API calls needed - instant generation!\n");

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
    console.log(`  Niche: ${opportunity?.niche || 'travel experiences'}`);

    if (!site.brand) {
      console.log("  Skipping - no brand record");
      continue;
    }

    try {
      console.log("  Generating SVG logos...");
      const result = await regenerateAllLogos(
        {
          brandName: site.brand.name,
          niche: opportunity?.niche || "travel experiences",
          primaryColor: site.brand.primaryColor,
          secondaryColor: site.brand.secondaryColor,
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
      console.error(`    Stack: ${err.stack}`);
    }
  }

  console.log("\n\nAll done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
