/**
 * Regenerate favicons for all active sites using SVG-based generation
 * Creates simple icon-based favicons without full logos
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Import the SVG favicon generator
  const { generateSvgLogos, isSvgLogoGenerationAvailable } = await import("@experience-marketplace/jobs");

  if (!isSvgLogoGenerationAvailable()) {
    console.error("Favicon generation not available. Check R2 storage config.");
    process.exit(1);
  }

  console.log("Regenerating favicons for all active sites...\n");

  const sites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    include: {
      brand: true,
      opportunities: {
        take: 1,
        select: {
          niche: true,
        }
      }
    }
  });

  console.log(`Found ${sites.length} active sites\n`);

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const opportunity = site.opportunities[0];

    console.log(`[${i + 1}/${sites.length}] ${site.name}`);

    if (!site.brand) {
      console.log("  Skipping - no brand record");
      continue;
    }

    try {
      // Generate only the favicon (we'll extract just the favicon from the result)
      const result = await generateSvgLogos({
        brandName: site.brand.name,
        niche: opportunity?.niche || "travel experiences",
        primaryColor: site.brand.primaryColor,
        secondaryColor: site.brand.secondaryColor,
      });

      // Update only the favicon URL (leave logos as null)
      await prisma.brand.update({
        where: { id: site.brand.id },
        data: {
          faviconUrl: result.faviconUrl
        }
      });

      console.log(`  ✓ Favicon: ${result.faviconUrl}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    }
  }

  console.log("\nDone!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
