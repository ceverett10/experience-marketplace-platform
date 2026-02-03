/**
 * Backfill favicons and SEO title configs for existing sites.
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/backfill-favicons.js [options] [site-slug]
 *
 * Options:
 *   --dry-run   Preview changes without writing to database
 *   --force     Overwrite existing favicons and SEO title configs
 *
 * Examples:
 *   node scripts/backfill-favicons.js --dry-run
 *   node scripts/backfill-favicons.js --force london-museum-tickets
 *   node scripts/backfill-favicons.js
 */

const { PrismaClient } = require('@prisma/client');

// --- Inline favicon generation (mirrors packages/jobs/src/services/favicon-generator.ts) ---

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (c) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function darkenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  return hslToHex(h, s, Math.max(0, l - amount));
}

function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastTextColor(backgroundHex) {
  return getLuminance(backgroundHex) > 0.35 ? '#1A1A2E' : '#FFFFFF';
}

function extractInitials(brandName) {
  const words = brandName
    .trim()
    .split(/[\s\-_]+/)
    .filter(Boolean);
  if (words.length === 0) return 'X';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

function validateHex(hex, fallback = '#6366f1') {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;
}

function generateFaviconSvg(brandName, primaryColor) {
  primaryColor = validateHex(primaryColor);
  const darkColor = darkenColor(primaryColor, 0.15);
  const textColor = getContrastTextColor(primaryColor);
  const initials = extractInitials(brandName);
  const fontSize = initials.length === 1 ? 20 : 16;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primaryColor}"/>
      <stop offset="100%" stop-color="${darkColor}"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="6" fill="url(#bg)"/>
  <text x="16" y="22" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="${fontSize}" fill="${textColor}">${initials}</text>
</svg>`;
}

function svgToDataUri(svg) {
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

// --- SEO title config generation (mirrors brand-identity.ts) ---

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateSeoTitleConfig({ brandName, niche, location, keyword, tagline }) {
  const nicheCap = capitalize(niche);
  const titleTemplate = `%s | ${brandName}`;

  let defaultTitle = `${brandName} - ${tagline}`;
  if (defaultTitle.length > 60) {
    defaultTitle = `${brandName} | ${nicheCap} in ${location || 'Your Destination'}`;
  }
  if (defaultTitle.length > 60) {
    defaultTitle = brandName;
  }

  const locationStr = location || 'your destination';
  let defaultDescription = `Discover the best ${niche} experiences in ${locationStr}. ${tagline}. Book online with instant confirmation and free cancellation.`;
  if (defaultDescription.length > 155) {
    defaultDescription = `Discover the best ${niche} experiences in ${locationStr}. Book online with instant confirmation and free cancellation.`;
  }
  if (defaultDescription.length > 155) {
    defaultDescription = `Book the best ${niche} experiences in ${locationStr}. Instant confirmation & free cancellation.`;
  }

  const keywords = [
    keyword,
    `${niche} experiences`,
    location ? `${location.toLowerCase()} ${niche}` : undefined,
    `best ${niche}`,
    `book ${niche}`,
    location ? `things to do in ${location.toLowerCase()}` : undefined,
    `${niche} tours`,
    `${niche} tickets`,
    location ? `${location.toLowerCase()} experiences` : undefined,
    brandName.toLowerCase(),
  ].filter(Boolean);

  return { titleTemplate, defaultTitle, defaultDescription, keywords };
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const siteSlug = args.find((a) => !a.startsWith('--'));

  if (dryRun) console.log('=== DRY RUN MODE (no database writes) ===\n');
  if (force) console.log('=== FORCE MODE (overwriting existing data) ===\n');

  const prisma = new PrismaClient();

  try {
    const where = {
      brand: { isNot: null },
      status: {
        in: ['ACTIVE', 'DRAFT', 'REVIEW', 'DNS_PENDING', 'GSC_VERIFICATION', 'SSL_PENDING'],
      },
    };
    if (siteSlug) {
      where.slug = siteSlug;
    }

    const sites = await prisma.site.findMany({
      where,
      include: {
        brand: true,
        opportunities: {
          select: { keyword: true, niche: true, location: true },
          take: 1,
        },
      },
    });

    console.log(`Found ${sites.length} site(s) to process\n`);

    let faviconCount = 0;
    let seoCount = 0;
    let skippedCount = 0;

    for (const site of sites) {
      const brand = site.brand;
      if (!brand) {
        console.log(`[SKIP] ${site.name} - no brand`);
        skippedCount++;
        continue;
      }

      console.log(`\n--- ${site.name} (${site.slug}) ---`);
      console.log(`  Brand: ${brand.name} | Primary: ${brand.primaryColor}`);

      // --- Favicon ---
      const needsFavicon = !brand.faviconUrl || force;
      if (needsFavicon) {
        const svg = generateFaviconSvg(brand.name, brand.primaryColor);
        const faviconUrl = svgToDataUri(svg);
        const initials = extractInitials(brand.name);
        console.log(
          `  Favicon: "${initials}" on ${brand.primaryColor} (${faviconUrl.length} bytes)`
        );

        if (!dryRun) {
          await prisma.brand.update({
            where: { id: brand.id },
            data: { faviconUrl },
          });
          console.log(`  -> Favicon saved`);
        } else {
          console.log(`  -> Would save favicon`);
        }
        faviconCount++;
      } else {
        console.log(`  Favicon: already exists (skipping)`);
      }

      // --- SEO Title Config ---
      const seoConfig = site.seoConfig || {};
      const hasSeoTitle = seoConfig.defaultTitle && seoConfig.titleTemplate;
      const needsSeo = !hasSeoTitle || force;

      if (needsSeo) {
        const opportunity = site.opportunities[0];
        if (opportunity) {
          const seoTitleConfig = generateSeoTitleConfig({
            brandName: brand.name,
            niche: opportunity.niche,
            location: opportunity.location || undefined,
            keyword: opportunity.keyword,
            tagline: brand.tagline || `Best ${capitalize(opportunity.niche)} Experiences`,
          });

          console.log(`  SEO Title: "${seoTitleConfig.defaultTitle}"`);
          console.log(`  SEO Template: "${seoTitleConfig.titleTemplate}"`);
          console.log(
            `  SEO Description: "${seoTitleConfig.defaultDescription.substring(0, 80)}..."`
          );
          console.log(`  Keywords: ${seoTitleConfig.keywords.slice(0, 5).join(', ')}`);

          if (!dryRun) {
            await prisma.site.update({
              where: { id: site.id },
              data: {
                seoConfig: {
                  ...seoConfig,
                  ...seoTitleConfig,
                },
              },
            });
            console.log(`  -> SEO config saved`);
          } else {
            console.log(`  -> Would save SEO config`);
          }
          seoCount++;
        } else {
          console.log(`  SEO: no opportunity data found (skipping)`);
        }
      } else {
        console.log(`  SEO: already configured (skipping)`);
      }
    }

    console.log(`\n========================================`);
    console.log(`Summary:`);
    console.log(`  Sites processed: ${sites.length}`);
    console.log(`  Favicons ${dryRun ? 'to generate' : 'generated'}: ${faviconCount}`);
    console.log(`  SEO configs ${dryRun ? 'to update' : 'updated'}: ${seoCount}`);
    console.log(`  Skipped: ${skippedCount}`);
    console.log(`========================================`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
