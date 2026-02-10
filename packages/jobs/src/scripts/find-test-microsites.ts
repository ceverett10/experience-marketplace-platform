import { prisma } from '@experience-marketplace/database';

async function main() {
  // Find microsites with suppliers that have product data
  const ms = await prisma.micrositeConfig.findMany({
    where: {
      status: 'ACTIVE',
      supplierId: { not: null },
    },
    include: {
      supplier: {
        select: { id: true, name: true, description: true, cities: true, categories: true },
      },
    },
    orderBy: { pageViews: 'desc' },
    take: 50,
  });

  const candidates = [];
  for (const m of ms) {
    if (m.supplier == null || m.supplier.id == null) continue;
    const pc = await prisma.product.count({ where: { supplierId: m.supplier.id } });
    if (pc >= 3) {
      const products = await prisma.product.findMany({
        where: { supplierId: m.supplier.id },
        select: { title: true, city: true },
        orderBy: { rating: 'desc' },
        take: 5,
      });
      candidates.push({
        id: m.id,
        siteName: m.siteName,
        domain: m.fullDomain,
        supplier: m.supplier.name,
        description: (m.supplier.description || '').substring(0, 100),
        cities: (m.supplier.cities || []).slice(0, 3),
        categories: (m.supplier.categories || []).slice(0, 3),
        productCount: pc,
        sampleProducts: products.map((p) => p.title),
      });
      if (candidates.length >= 5) break;
    }
  }
  console.log(JSON.stringify(candidates, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
