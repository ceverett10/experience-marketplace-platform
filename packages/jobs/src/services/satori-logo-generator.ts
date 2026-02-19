/**
 * Satori-Based Logo Generator v2
 *
 * Generates professional logos using:
 * 1. Google Font download + cache (actual TTF files)
 * 2. Satori text-to-path rendering (no font issues)
 * 3. Template library (8+ unique layouts)
 * 4. AI template selection (Claude Haiku)
 * 5. sharp for PNG conversion (transparent backgrounds)
 * 6. Cloudflare R2 for storage
 *
 * Generates 4 variants per brand:
 * - logoUrl: Light variant (dark text, transparent bg)
 * - logoDarkUrl: Dark variant (white text, transparent bg)
 * - faviconUrl: 192x192 monogram on colored bg
 * - ogImageUrl: 1200x630 social card
 */

import { getGoogleFont, validateFontName } from './google-font-cache.js';
import { renderToPng } from './satori-renderer.js';
import { uploadToR2, isR2Configured } from './image-storage.js';
import { selectTemplate } from './logo-template-selector.js';
import { getTemplate, type LogoTemplateParams } from './logo-templates/index.js';
import type { FontData } from './google-font-cache.js';

export interface LogoGenerationParams {
  brandName: string;
  tagline?: string;
  niche: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  location?: string;
}

export interface LogoGenerationResult {
  logoUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  templateId: string;
  generatedAt: Date;
}

/** Logo dimensions */
const LOGO_WIDTH = 800;
const LOGO_HEIGHT = 200;
const FAVICON_SIZE = 192;
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Generate all logo variants for a brand using the Satori pipeline.
 */
export async function generateLogos(params: LogoGenerationParams): Promise<LogoGenerationResult> {
  if (!isR2Configured()) {
    throw new Error(
      'R2 storage not configured. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME'
    );
  }

  const validHeadingFont = validateFontName(params.headingFont);
  const validBodyFont = validateFontName(params.bodyFont);

  console.info(
    `[Logo v2] Generating logos for "${params.brandName}" (fonts: ${validHeadingFont}/${validBodyFont})`
  );

  // 1. Download fonts
  const fonts = await loadFonts(validHeadingFont, validBodyFont);

  // 2. Select template via AI
  const templateParams: LogoTemplateParams = {
    brandName: params.brandName,
    tagline: params.tagline,
    primaryColor: params.primaryColor,
    secondaryColor: params.secondaryColor,
    accentColor: params.accentColor,
    headingFont: validHeadingFont,
    bodyFont: validBodyFont,
    niche: params.niche,
    location: params.location,
  };

  const selection = await selectTemplate(templateParams);
  const template = getTemplate(selection.templateId);

  if (!template) {
    throw new Error(`Template "${selection.templateId}" not found in registry`);
  }

  console.info(`[Logo v2] Selected template: ${selection.templateId} for "${params.brandName}"`);

  // 3. Render all 4 variants in parallel
  const [logoPng, logoDarkPng, faviconPng, ogPng] = await Promise.all([
    renderToPng({
      width: LOGO_WIDTH,
      height: LOGO_HEIGHT,
      fonts,
      element: template.renderLight(templateParams, selection.customization),
    }),
    renderToPng({
      width: LOGO_WIDTH,
      height: LOGO_HEIGHT,
      fonts,
      element: template.renderDark(templateParams, selection.customization),
    }),
    renderToPng({
      width: FAVICON_SIZE,
      height: FAVICON_SIZE,
      fonts,
      element: template.renderFavicon(templateParams, selection.customization),
    }),
    renderToPng({
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts,
      element: template.renderOgImage(templateParams, selection.customization),
    }),
  ]);

  // 4. Upload to R2
  const sanitizedName = params.brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50); // Limit filename length
  const timestamp = Date.now();

  const [logoUrl, logoDarkUrl, faviconUrl, ogImageUrl] = await Promise.all([
    uploadToR2(logoPng, `logos-v2/${sanitizedName}-light-${timestamp}.png`, 'image/png'),
    uploadToR2(logoDarkPng, `logos-v2/${sanitizedName}-dark-${timestamp}.png`, 'image/png'),
    uploadToR2(faviconPng, `logos-v2/${sanitizedName}-favicon-${timestamp}.png`, 'image/png'),
    uploadToR2(ogPng, `logos-v2/${sanitizedName}-og-${timestamp}.png`, 'image/png'),
  ]);

  console.info(`[Logo v2] Generated and uploaded all variants for "${params.brandName}"`);

  return {
    logoUrl,
    logoDarkUrl,
    faviconUrl,
    ogImageUrl,
    templateId: selection.templateId,
    generatedAt: new Date(),
  };
}

/**
 * Load the required font variants for rendering.
 */
async function loadFonts(headingFont: string, bodyFont: string): Promise<FontData[]> {
  const fontPromises: Promise<FontData>[] = [
    // Heading font in multiple weights for logo text
    getGoogleFont(headingFont, 400),
    getGoogleFont(headingFont, 600),
    getGoogleFont(headingFont, 700),
  ];

  // Body font (for taglines) — only if different from heading
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

  if (fonts.length === 0) {
    throw new Error('Failed to load any fonts for logo rendering');
  }

  return fonts;
}

/**
 * Check if the Satori logo generation system is available.
 */
export function isSatoriLogoGenerationAvailable(): boolean {
  return isR2Configured();
}
