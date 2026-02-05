/**
 * Logo Generator Service
 *
 * Generates professional logos using DALL-E 3 API.
 * Uploads to Cloudflare R2 for persistent storage.
 */

import { uploadToR2, deleteFromR2 } from './image-storage.js';

interface LogoGenerationParams {
  brandName: string;
  niche: string;
  primaryColor: string;
  secondaryColor?: string;
  logoDescription?: string;
  location?: string;
}

interface LogoResult {
  logoUrl: string;
  thumbnailUrl?: string;
  prompt: string;
  generatedAt: Date;
}

/**
 * Build an optimized DALL-E prompt for logo generation
 */
function buildLogoPrompt(params: LogoGenerationParams): string {
  const { brandName, niche, primaryColor, logoDescription, location } = params;

  // Map niche to visual style hints
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

  // Find matching style or use generic
  const nicheKey = Object.keys(nicheStyles).find((key) =>
    niche.toLowerCase().includes(key.replace(' tours', ''))
  );
  const styleHint = nicheKey ? nicheStyles[nicheKey] : 'travel, exploration, discovery';

  // Build the prompt
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
    '- Suitable for website header, favicon, and social media',
    '- Professional and trustworthy appearance',
    '',
    `Color: Primarily use ${primaryColor} as the main brand color`,
    `Visual theme: ${styleHint}`,
    '',
    logoDescription ? `Concept guidance: ${logoDescription}` : null,
    '',
    'Technical requirements:',
    '- Pure white (#FFFFFF) background only',
    '- The icon/symbol must be bold and clearly visible',
    `- The main icon should prominently feature the brand color ${primaryColor}`,
    '- No text, letters, or words in the logo',
    '- No gradients or complex shadows',
    '- High contrast between icon and white background',
    '- Simple geometric shapes preferred',
    '- Must work at small sizes (32x32 pixels)',
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Generate a logo using DALL-E 3
 */
export async function generateLogo(params: LogoGenerationParams): Promise<LogoResult> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for logo generation');
  }

  const prompt = buildLogoPrompt(params);

  console.log(`[Logo Generator] Generating logo for "${params.brandName}"`);
  console.log(`[Logo Generator] Prompt:\n${prompt.substring(0, 200)}...`);

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
      quality: 'standard', // 'hd' costs 2x more
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Logo Generator] DALL-E API error: ${response.status} ${errorBody}`);
    throw new Error(`DALL-E API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: Array<{ url: string; revised_prompt?: string }>;
  };

  const imageUrl = data.data[0]?.url;
  if (!imageUrl) {
    throw new Error('No image URL returned from DALL-E');
  }

  console.log(`[Logo Generator] Generated temporary URL for "${params.brandName}"`);

  // Download the image and upload to R2 for permanent storage
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download generated image: ${imageResponse.status}`);
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  // Generate a unique filename
  const sanitizedName = params.brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const timestamp = Date.now();
  const filename = `logos/${sanitizedName}-${timestamp}.png`;

  // Upload to R2
  const permanentUrl = await uploadToR2(imageBuffer, filename, 'image/png');

  console.log(`[Logo Generator] Uploaded logo to R2: ${permanentUrl}`);

  return {
    logoUrl: permanentUrl,
    prompt,
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
  // Generate new logo
  const result = await generateLogo(params);

  // Delete old logo from R2 if it exists and is hosted on R2
  if (oldLogoUrl && oldLogoUrl.includes('.r2.cloudflarestorage.com')) {
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
 * Check if logo generation is available (API key configured)
 */
export function isLogoGenerationAvailable(): boolean {
  return !!(
    process.env['OPENAI_API_KEY'] &&
    process.env['R2_ACCESS_KEY_ID'] &&
    process.env['R2_SECRET_ACCESS_KEY'] &&
    process.env['R2_BUCKET_NAME']
  );
}
