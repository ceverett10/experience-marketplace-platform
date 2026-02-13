import { prisma } from '@experience-marketplace/database';

async function main() {
  const domains = [
    'phototrek-tours.experiencess.com',
    'trawey-tours.experiencess.com',
    'london-experiences.experiencess.com',
  ];

  for (const domain of domains) {
    const ms = await prisma.micrositeConfig.findFirst({
      where: { fullDomain: domain },
      select: { id: true, siteName: true },
    });
    if (ms == null) continue;

    const pages = await prisma.page.findMany({
      where: { micrositeId: ms.id, type: 'BLOG' },
      select: {
        slug: true,
        title: true,
        status: true,
        contentId: true,
        createdAt: true,
        publishedAt: true,
        content: { select: { body: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`\n=== ${ms.siteName} (${pages.length} blog pages) ===`);
    for (const pg of pages) {
      const slug = pg.slug.replace('blog/', '');
      const tag = pg.status === 'PUBLISHED' ? '[LIVE]' : '[DRAFT]';
      console.log(`${tag} ${pg.title}`);
      console.log(`  Created: ${pg.createdAt?.toISOString()?.substring(0, 19)}`);
      console.log(`  URL: https://${domain}/blog/${slug}`);
      if (pg.status === 'PUBLISHED' && pg.content?.body) {
        console.log(`  Preview: ${pg.content.body.substring(0, 200)}...`);
      } else {
        console.log(`  Content: ${pg.contentId ? 'yes' : 'pending'}`);
      }
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
