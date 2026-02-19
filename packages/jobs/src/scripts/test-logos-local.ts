#!/usr/bin/env npx tsx
/**
 * Local Logo Test — No Database Required
 *
 * Generates logos for 10 sample brands using the Satori pipeline.
 * Saves PNGs to local disk instead of R2, so you can preview immediately.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/test-logos-local.ts
 *
 * Output: PNG files saved to /tmp/logo-pilot-v2/
 */

import fs from 'fs';
import path from 'path';
import { getGoogleFont, validateFontName, preloadFonts } from '../services/google-font-cache.js';
import { renderToPng } from '../services/satori-renderer.js';
import { selectTemplate } from '../services/logo-template-selector.js';
import { getTemplate } from '../services/logo-templates/index.js';
import type { LogoTemplateParams } from '../services/logo-templates/types.js';
import type { FontData } from '../services/google-font-cache.js';

const OUTPUT_DIR = '/tmp/logo-pilot-v2';

/** Logo dimensions */
const LOGO_WIDTH = 800;
const LOGO_HEIGHT = 200;
const FAVICON_SIZE = 192;
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** Sample brands representing diverse niches, name lengths, and styles */
const SAMPLE_BRANDS: LogoTemplateParams[] = [
  {
    brandName: 'London Food Tours',
    tagline: 'Discover the Flavours of London',
    primaryColor: '#e63946',
    secondaryColor: '#457b9d',
    accentColor: '#f1a208',
    headingFont: 'Playfair Display',
    bodyFont: 'Inter',
    niche: 'food tours',
    location: 'London',
  },
  {
    brandName: 'Adventure Vision',
    tagline: 'Explore Beyond the Ordinary',
    primaryColor: '#2d6a4f',
    secondaryColor: '#40916c',
    accentColor: '#d4a373',
    headingFont: 'Montserrat',
    bodyFont: 'Inter',
    niche: 'adventure tours',
    location: 'Nepal',
  },
  {
    brandName: 'Varoom Barcelona',
    tagline: 'Your Gateway to Barcelona Experiences',
    primaryColor: '#7209b7',
    secondaryColor: '#3a0ca3',
    accentColor: '#f72585',
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    niche: 'sightseeing tours',
    location: 'Barcelona',
  },
  {
    brandName: 'Winetastic',
    tagline: 'Premium Wine Experiences',
    primaryColor: '#722f37',
    secondaryColor: '#4a1a21',
    accentColor: '#c89b3c',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Lora',
    niche: 'wine tours',
    location: 'Tuscany',
  },
  {
    brandName: 'Sapori di Roma',
    tagline: 'Taste Authentic Rome',
    primaryColor: '#bc6c25',
    secondaryColor: '#606c38',
    accentColor: '#dda15e',
    headingFont: 'DM Serif Display',
    bodyFont: 'DM Sans',
    niche: 'food tours',
    location: 'Rome',
  },
  {
    brandName: 'CityWalk',
    tagline: 'Walk the Story of the City',
    primaryColor: '#264653',
    secondaryColor: '#2a9d8f',
    accentColor: '#e9c46a',
    headingFont: 'Space Grotesk',
    bodyFont: 'Inter',
    niche: 'walking tours',
    location: 'Amsterdam',
  },
  {
    brandName: 'Aloha Kayak Adventures',
    tagline: 'Paddle Paradise',
    primaryColor: '#0077b6',
    secondaryColor: '#00b4d8',
    accentColor: '#90e0ef',
    headingFont: 'Outfit',
    bodyFont: 'Inter',
    niche: 'water activities',
    location: 'Hawaii',
  },
  {
    brandName: 'The Culture Club',
    tagline: 'Immersive Cultural Experiences',
    primaryColor: '#6d597a',
    secondaryColor: '#b56576',
    accentColor: '#eaac8b',
    headingFont: 'Libre Baskerville',
    bodyFont: 'Raleway',
    niche: 'cultural tours',
    location: 'Paris',
  },
  {
    brandName: 'NordExplore',
    tagline: 'Discover Scandinavia',
    primaryColor: '#1d3557',
    secondaryColor: '#457b9d',
    accentColor: '#a8dadc',
    headingFont: 'Sora',
    bodyFont: 'Inter',
    niche: 'adventure tours',
    location: 'Norway',
  },
  {
    brandName: 'Serenity Spa Retreats',
    tagline: 'Wellness Journeys for the Soul',
    primaryColor: '#588157',
    secondaryColor: '#a3b18a',
    accentColor: '#dad7cd',
    headingFont: 'Raleway',
    bodyFont: 'Lora',
    niche: 'spa wellness',
    location: 'Bali',
  },
];

async function loadFonts(headingFont: string, bodyFont: string): Promise<FontData[]> {
  const fontPromises: Promise<FontData>[] = [
    getGoogleFont(headingFont, 400),
    getGoogleFont(headingFont, 600),
    getGoogleFont(headingFont, 700),
  ];

  if (bodyFont !== headingFont) {
    fontPromises.push(getGoogleFont(bodyFont, 400), getGoogleFont(bodyFont, 500));
  }

  const results = await Promise.allSettled(fontPromises);
  const fonts: FontData[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      fonts.push(result.value);
    }
  }
  return fonts;
}

async function main() {
  console.info('='.repeat(80));
  console.info('LOCAL LOGO TEST v2 (Satori-based)');
  console.info('='.repeat(80));
  console.info(`Output directory: ${OUTPUT_DIR}`);
  console.info(`Sample brands: ${SAMPLE_BRANDS.length}`);
  console.info('');

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Preload all unique fonts
  const uniqueFonts = [
    ...new Set(
      SAMPLE_BRANDS.flatMap((b) => [validateFontName(b.headingFont), validateFontName(b.bodyFont)])
    ),
  ];
  console.info(`Preloading ${uniqueFonts.length} unique fonts...`);
  await preloadFonts(uniqueFonts);
  console.info('');

  for (let i = 0; i < SAMPLE_BRANDS.length; i++) {
    const params = SAMPLE_BRANDS[i]!;
    const prefix = `[${i + 1}/${SAMPLE_BRANDS.length}]`;
    const slug = params.brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    console.info(`${prefix} "${params.brandName}"`);
    console.info(
      `  Niche: ${params.niche} | Font: ${params.headingFont} | Color: ${params.primaryColor}`
    );

    try {
      // Select template
      const selection = await selectTemplate(params);
      const template = getTemplate(selection.templateId);

      if (!template) {
        console.error(`  Template "${selection.templateId}" not found!`);
        continue;
      }

      console.info(`  Template: ${selection.templateId}`);
      console.info(`  Customization: ${JSON.stringify(selection.customization)}`);

      // Load fonts
      const fonts = await loadFonts(
        validateFontName(params.headingFont),
        validateFontName(params.bodyFont)
      );

      // Render all 4 variants
      const [logoPng, logoDarkPng, faviconPng, ogPng] = await Promise.all([
        renderToPng({
          width: LOGO_WIDTH,
          height: LOGO_HEIGHT,
          fonts,
          element: template.renderLight(params, selection.customization),
        }),
        renderToPng({
          width: LOGO_WIDTH,
          height: LOGO_HEIGHT,
          fonts,
          element: template.renderDark(params, selection.customization),
        }),
        renderToPng({
          width: FAVICON_SIZE,
          height: FAVICON_SIZE,
          fonts,
          element: template.renderFavicon(params, selection.customization),
        }),
        renderToPng({
          width: OG_WIDTH,
          height: OG_HEIGHT,
          fonts,
          element: template.renderOgImage(params, selection.customization),
        }),
      ]);

      // Save to local disk
      const files = [
        { name: `${slug}-light.png`, data: logoPng },
        { name: `${slug}-dark.png`, data: logoDarkPng },
        { name: `${slug}-favicon.png`, data: faviconPng },
        { name: `${slug}-og.png`, data: ogPng },
      ];

      for (const file of files) {
        const filePath = path.join(OUTPUT_DIR, file.name);
        fs.writeFileSync(filePath, file.data);
      }

      console.info(`  Saved: ${files.map((f) => f.name).join(', ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ERROR: ${message}`);
    }

    console.info('');
  }

  // Summary
  const allFiles = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.png'));
  console.info('='.repeat(80));
  console.info('DONE');
  console.info(`Generated ${allFiles.length} PNG files in ${OUTPUT_DIR}`);
  console.info('');
  console.info('To preview, open the folder:');
  console.info(`  open ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
