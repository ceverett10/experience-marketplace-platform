/**
 * Logo Generator Service
 *
 * Generates professional logos using DALL-E 3 API.
 * Creates three versions:
 * - Light: Colored icon on white background (for white headers)
 * - Dark: White icon on brand color background (for hero overlays)
 * - Favicon: Simple bold icon optimized for small sizes
 *
 * Uploads to Cloudflare R2 for persistent storage.
 */

import { uploadToR2, deleteFromR2 } from './image-storage.js';

export interface LogoGenerationParams {
  brandName: string;
  niche: string;
  primaryColor: string;
  secondaryColor?: string;
  logoDescription?: string;
  location?: string;
}

export interface LogoResult {
  logoUrl: string;
  thumbnailUrl?: string;
  prompt: string;
  generatedAt: Date;
}

export interface AllLogosResult {
  logoUrl: string; // Light version
  logoDarkUrl: string; // Dark version
  faviconUrl: string; // Favicon
  generatedAt: Date;
}

type LogoType = 'light' | 'dark' | 'favicon';

/**
 * Map niche to visual style hints
 */
function getNicheStyleHint(niche: string): string {
  const nicheStyles: Record<string, string> = {
    'food tours': 'culinary, fork and knife motif, appetizing',
    'wine tours': 'elegant grape or wine glass motif, sophisticated',
    'museum tours': 'cultural, artistic, classical architecture elements',
    'walking tours': 'footsteps, compass, urban exploration',
    'adventure tours': 'mountain, outdoor, dynamic movement',
    'boat tours': 'nautical, waves, anchor or sail motif',
    'cultural tours': 'heritage, traditional patterns, landmark silhouette',
    'city tours': 'skyline, urban, modern architecture',
  };

  const nicheKey = Object.keys(nicheStyles).find((key) =>
    niche.toLowerCase().includes(key.replace(' tours', ''))
  );
  return nicheKey ? (nicheStyles[nicheKey] ?? 'travel, exploration, discovery') : 'travel, exploration, discovery';
}

/**
 * Build prompt for light version logo (colored icon on white background)
 */
function buildLightLogoPrompt(params: LogoGenerationParams): string {
  const { brandName, niche, primaryColor, logoDescription, location } = params;
  const styleHint = getNicheStyleHint(niche);

  const parts = [
    'Professional minimalist logo design',
    `for "${brandName}"`,
    `a ${niche} business`,
    location ? `based in ${location}` : null,
    '',
    'Style requirements:',
    '- Clean, modern, scalable vector-style design',
    '- Minimalist with strong visual identity',
    '- Simple icon or logomark (NOT a wordmark with text)',
    '- Professional and trustworthy appearance',
    '',
    `Color: Primarily use ${primaryColor} as the main brand color`,
    `Visual theme: ${styleHint}`,
    '',
    logoDescription ? `Concept guidance: ${logoDescription}` : null,
    '',
    'Technical requirements:',
    '- Pure white (#FFFFFF) background only',
    '- The icon/symbol must be BOLD, PROMINENT, and clearly visible',
    `- The main icon should prominently feature the brand color ${primaryColor}`,
    '- Use STRONG, SATURATED colors - avoid pastels or faded tones',
    '- No text, letters, or words in the logo',
    '- No gradients or complex shadows',
    '- HIGH CONTRAST between the colored icon and white background',
    '- Simple geometric shapes preferred',
    '- Must work at small sizes (32x32 pixels)',
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Build prompt for dark version logo (white icon on brand color background)
 * This version is optimized for display on dark hero images
 */
function buildDarkLogoPrompt(params: LogoGenerationParams): string {
  const { brandName, niche, primaryColor, logoDescription, location } = params;
  const styleHint = getNicheStyleHint(niche);

  const parts = [
    'Professional minimalist logo design',
    `for "${brandName}"`,
    `a ${niche} business`,
    location ? `based in ${location}` : null,
    '',
    'Style requirements:',
    '- Clean, modern, scalable vector-style design',
    '- Minimalist with strong visual identity',
    '- Simple icon or logomark (NOT a wordmark with text)',
    '- Professional and trustworthy appearance',
    '- This is a REVERSED/INVERTED version for dark backgrounds',
    '',
    `Visual theme: ${styleHint}`,
    '',
    logoDescription ? `Concept guidance: ${logoDescription}` : null,
    '',
    'CRITICAL Technical requirements:',
    `- Background: Solid ${primaryColor} (the brand color)`,
    '- Icon color: Pure WHITE (#FFFFFF)',
    '- The WHITE icon must be BOLD, PROMINENT, and clearly visible',
    '- HIGH CONTRAST between white icon and colored background',
    '- No text, letters, or words in the logo',
    '- No gradients or complex shadows',
    '- Simple geometric shapes preferred',
    '- Must work at small sizes',
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Build prompt for favicon (ultra-simple icon optimized for tiny sizes)
 */
function buildFaviconPrompt(params: LogoGenerationParams): string {
  const { brandName, niche, primaryColor, logoDescription } = params;
  const styleHint = getNicheStyleHint(niche);

  const parts = [
    'Ultra-simple favicon icon design',
    `for "${brandName}"`,
    `a ${niche} business`,
    '',
    `Visual theme: ${styleHint}`,
    logoDescription ? `Concept: ${logoDescription}` : null,
    '',
    'CRITICAL Requirements for favicon:',
    '- EXTREMELY SIMPLE - must be recognizable at 16x16 and 32x32 pixels',
    '- Single bold shape or symbol only',
    '- NO fine details, NO thin lines',
    '- Pure white (#FFFFFF) background',
    `- Icon in solid ${primaryColor} brand color`,
    '- HIGH CONTRAST and MAXIMUM VISIBILITY',
    '- Think of famous favicons: Twitter bird, Facebook F, Google G',
    '- NO text, NO letters, NO words',
    '- Geometric and bold',
    '- The shape should fill most of the square canvas',
    '- Must be instantly recognizable even when tiny',
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Generate a single logo version using DALL-E 3
 */
async function generateLogoVersion(
  params: LogoGenerationParams,
  logoType: LogoType
): Promise<{ url: string; prompt: string }> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for logo generation');
  }

  // Select the appropriate prompt builder
  let prompt: string;
  switch (logoType) {
    case 'light':
      prompt = buildLightLogoPrompt(params);
      break;
    case 'dark':
      prompt = buildDarkLogoPrompt(params);
      break;
    case 'favicon':
      prompt = buildFaviconPrompt(params);
      break;
  }

  console.log(`[Logo Generator] Generating ${logoType} logo for "${params.brandName}"`);

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Logo Generator] DALL-E API error for ${logoType}: ${response.status} ${errorBody}`);
    throw new Error(`DALL-E API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: Array<{ url: string; revised_prompt?: string }>;
  };

  const imageUrl = data.data[0]?.url;
  if (!imageUrl) {
    throw new Error(`No image URL returned from DALL-E for ${logoType} logo`);
  }

  // Download and upload to R2
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download ${logoType} image: ${imageResponse.status}`);
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  // Generate filename
  const sanitizedName = params.brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const timestamp = Date.now();
  const filename = `logos/${sanitizedName}-${logoType}-${timestamp}.png`;

  // Upload to R2
  const permanentUrl = await uploadToR2(imageBuffer, filename, 'image/png');
  console.log(`[Logo Generator] Uploaded ${logoType} logo to R2: ${permanentUrl}`);

  return { url: permanentUrl, prompt };
}

/**
 * Generate all logo versions (light, dark, favicon)
 * Uses SVG-based generation for consistent, professional results
 */
export async function generateAllLogoVersions(params: LogoGenerationParams): Promise<AllLogosResult> {
  // Use SVG-based logo generation (more consistent and professional)
  const { generateSvgLogos, isSvgLogoGenerationAvailable } = await import('./svg-logo-generator.js');

  if (isSvgLogoGenerationAvailable()) {
    console.log(`[Logo Generator] Using SVG-based generation for "${params.brandName}"`);
    return generateSvgLogos({
      brandName: params.brandName,
      niche: params.niche,
      primaryColor: params.primaryColor,
      secondaryColor: params.secondaryColor,
    });
  }

  // Fallback to DALL-E if SVG generation not available (shouldn't happen)
  console.log(`[Logo Generator] Falling back to DALL-E for "${params.brandName}"`);
  const [lightResult, darkResult, faviconResult] = await Promise.all([
    generateLogoVersion(params, 'light'),
    generateLogoVersion(params, 'dark'),
    generateLogoVersion(params, 'favicon'),
  ]);

  return {
    logoUrl: lightResult.url,
    logoDarkUrl: darkResult.url,
    faviconUrl: faviconResult.url,
    generatedAt: new Date(),
  };
}

/**
 * Generate a single logo (backward compatible - generates light version only)
 */
export async function generateLogo(params: LogoGenerationParams): Promise<LogoResult> {
  const result = await generateLogoVersion(params, 'light');
  return {
    logoUrl: result.url,
    prompt: result.prompt,
    generatedAt: new Date(),
  };
}

/**
 * Regenerate logo for an existing brand
 * Optionally deletes the old logo from storage
 */
export async function regenerateLogo(
  params: LogoGenerationParams,
  oldLogoUrl?: string | null
): Promise<LogoResult> {
  const result = await generateLogo(params);

  // Delete old logo from R2 if it exists
  if (oldLogoUrl && (oldLogoUrl.includes('.r2.cloudflarestorage.com') || oldLogoUrl.includes('.r2.dev'))) {
    try {
      await deleteFromR2(oldLogoUrl);
      console.log(`[Logo Generator] Deleted old logo: ${oldLogoUrl}`);
    } catch (err) {
      console.warn(`[Logo Generator] Failed to delete old logo: ${err}`);
    }
  }

  return result;
}

/**
 * Regenerate all logo versions for an existing brand
 * Uses SVG-based generation and deletes old logos from storage
 */
export async function regenerateAllLogos(
  params: LogoGenerationParams,
  oldUrls?: { logoUrl?: string | null; logoDarkUrl?: string | null; faviconUrl?: string | null }
): Promise<AllLogosResult> {
  // Use SVG-based regeneration
  const { regenerateSvgLogos, isSvgLogoGenerationAvailable } = await import('./svg-logo-generator.js');

  if (isSvgLogoGenerationAvailable()) {
    return regenerateSvgLogos(
      {
        brandName: params.brandName,
        niche: params.niche,
        primaryColor: params.primaryColor,
        secondaryColor: params.secondaryColor,
      },
      oldUrls
    );
  }

  // Fallback to DALL-E approach
  const result = await generateAllLogoVersions(params);

  // Delete old logos from R2
  const urlsToDelete = [oldUrls?.logoUrl, oldUrls?.logoDarkUrl, oldUrls?.faviconUrl].filter(
    (url): url is string =>
      !!url && (url.includes('.r2.cloudflarestorage.com') || url.includes('.r2.dev'))
  );

  for (const url of urlsToDelete) {
    try {
      await deleteFromR2(url);
      console.log(`[Logo Generator] Deleted old logo: ${url}`);
    } catch (err) {
      console.warn(`[Logo Generator] Failed to delete old logo: ${err}`);
    }
  }

  return result;
}

/**
 * Check if logo generation is available
 * Only requires R2 storage (SVG generation doesn't need external APIs)
 */
export function isLogoGenerationAvailable(): boolean {
  return !!(
    process.env['R2_ACCESS_KEY_ID'] &&
    process.env['R2_SECRET_ACCESS_KEY'] &&
    process.env['R2_BUCKET_NAME']
  );
}
