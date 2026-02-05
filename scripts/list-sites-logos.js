const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const sites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      brand: {
        select: {
          logoUrl: true,
          logoDarkUrl: true,
          faviconUrl: true
        }
      }
    }
  });

  console.log("Active sites:", sites.length);
  console.log("---");
  sites.forEach(s => {
    const hasLight = !!s.brand?.logoUrl;
    const hasDark = !!s.brand?.logoDarkUrl;
    const hasFavicon = !!s.brand?.faviconUrl;
    console.log(`- ${s.name}`);
    console.log(`  ID: ${s.id}`);
    console.log(`  Light: ${hasLight}, Dark: ${hasDark}, Favicon: ${hasFavicon}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
