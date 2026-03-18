import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get distinct countries per supplier via raw SQL (Prisma can't handle distinct on 67k suppliers)
  const countryRows = await prisma.$queryRaw<{ supplierId: string; countries: string }[]>`
    SELECT "supplierId", STRING_AGG(DISTINCT country, '; ') as countries
    FROM products
    WHERE country IS NOT NULL
    GROUP BY "supplierId"
  `;
  const countryMap = new Map(countryRows.map((r) => [r.supplierId, r.countries]));

  const suppliers = await prisma.supplier.findMany({
    select: {
      id: true,
      name: true,
      cities: true,
      productCount: true,
      microsite: {
        select: {
          fullDomain: true,
          status: true,
        },
      },
    },
    orderBy: { productCount: 'desc' },
  });

  // Escape CSV fields that contain commas or quotes
  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  // CSV header
  process.stdout.write('Supplier Name,Microsite URL,Product Count,Cities,Countries\n');

  for (const s of suppliers) {
    const url = s.microsite ? `https://${s.microsite.fullDomain}` : '';
    const cities = s.cities.join('; ');
    const countries = countryMap.get(s.id) ?? '';
    process.stdout.write(
      `${escapeCsv(s.name)},${url},${s.productCount},${escapeCsv(cities)},${escapeCsv(countries)}\n`
    );
  }

  console.error(`\nTotal suppliers: ${suppliers.length}`);
  console.error(`With microsites: ${suppliers.filter((s) => s.microsite).length}`);
  console.error(`Without microsites: ${suppliers.filter((s) => !s.microsite).length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
