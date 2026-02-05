/**
 * SVG-Based Logo Generator
 *
 * Generates professional logos using curated SVG icons + typography.
 * Much more consistent and professional than AI-generated logos.
 *
 * Features:
 * - Niche-specific icons (food, wine, museum, etc.)
 * - Professional Google Font typography
 * - SVG output converted to PNG for storage
 * - Light version (colored icon + dark text)
 * - Dark version (white icon + white text for hero overlays)
 * - Favicon (icon only, optimized for small sizes)
 */

import sharp from 'sharp';
import { uploadToR2 } from './image-storage.js';

export interface SvgLogoParams {
  brandName: string;
  niche: string;
  primaryColor: string;
  secondaryColor?: string;
}

export interface SvgLogoResult {
  logoUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  generatedAt: Date;
}

/**
 * Lucide icon SVG paths (MIT licensed)
 * These are 24x24 viewBox icons
 */
const ICON_PATHS: Record<string, string> = {
  // Food & Dining - Utensils crossed
  utensils: `<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>`,

  // Wine - Wine glass
  wine: `<path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>`,

  // Museum/Culture - Classical building/landmark
  landmark: `<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>`,

  // Walking/Exploration - Map pin
  mapPin: `<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>`,

  // Adventure - Mountain
  mountain: `<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>`,

  // Boat/Water - Ship/Sailboat
  sailboat: `<path d="M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z"/><path d="M21 14 10 2 3 14h18Z"/><path d="M10 2v16"/>`,

  // City/Urban - Building
  building: `<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>`,

  // Corporate/Team - Users group
  users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,

  // Party/Celebration - Sparkles
  sparkles: `<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>`,

  // Romance/Honeymoon - Heart
  heart: `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>`,

  // Solo/Individual - Compass
  compass: `<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>`,

  // Default/Travel - Globe
  globe: `<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>`,

  // Tickets/Events - Ticket
  ticket: `<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>`,
};

/**
 * Map niche keywords to appropriate icons
 */
function getIconForNiche(niche: string): string {
  const nicheLower = niche.toLowerCase();

  // Food related
  if (nicheLower.includes('food') || nicheLower.includes('culinary') || nicheLower.includes('gastro')) {
    return 'utensils';
  }

  // Wine/Beer related
  if (nicheLower.includes('wine') || nicheLower.includes('beer') || nicheLower.includes('drink')) {
    return 'wine';
  }

  // Museum/Culture/Art
  if (nicheLower.includes('museum') || nicheLower.includes('art') || nicheLower.includes('gallery')) {
    return 'landmark';
  }

  // Walking tours
  if (nicheLower.includes('walk') || nicheLower.includes('hiking') || nicheLower.includes('trek')) {
    return 'mapPin';
  }

  // Adventure/Outdoor
  if (nicheLower.includes('adventure') || nicheLower.includes('outdoor') || nicheLower.includes('mountain')) {
    return 'mountain';
  }

  // Boat/Water
  if (nicheLower.includes('boat') || nicheLower.includes('cruise') || nicheLower.includes('sail') || nicheLower.includes('water')) {
    return 'sailboat';
  }

  // City tours
  if (nicheLower.includes('city') || nicheLower.includes('urban') || nicheLower.includes('architecture')) {
    return 'building';
  }

  // Corporate/Team building
  if (nicheLower.includes('corporate') || nicheLower.includes('team') || nicheLower.includes('business')) {
    return 'users';
  }

  // Party/Celebration
  if (nicheLower.includes('party') || nicheLower.includes('bachelorette') || nicheLower.includes('bachelor') || nicheLower.includes('celebration')) {
    return 'sparkles';
  }

  // Romance
  if (nicheLower.includes('honeymoon') || nicheLower.includes('romantic') || nicheLower.includes('anniversary') || nicheLower.includes('couple')) {
    return 'heart';
  }

  // Solo travelers
  if (nicheLower.includes('solo') || nicheLower.includes('individual')) {
    return 'compass';
  }

  // Tickets/Events
  if (nicheLower.includes('ticket') || nicheLower.includes('event') || nicheLower.includes('show')) {
    return 'ticket';
  }

  // Default
  return 'globe';
}

/**
 * Generate SVG logo with icon and brand name
 */
function generateLogoSvg(
  params: SvgLogoParams,
  variant: 'light' | 'dark'
): string {
  const iconKey = getIconForNiche(params.niche);
  const iconPath = ICON_PATHS[iconKey] || ICON_PATHS['globe'];

  // Colors based on variant
  const iconColor = variant === 'light' ? params.primaryColor : '#FFFFFF';
  const textColor = variant === 'light' ? '#1F2937' : '#FFFFFF';
  const bgColor = variant === 'light' ? '#FFFFFF' : params.primaryColor;

  // Clean up brand name for display
  const displayName = params.brandName
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // Calculate text width (rough estimate: 10px per character at font-size 28)
  const textWidth = displayName.length * 14;
  const totalWidth = 56 + textWidth + 24; // icon + gap + text + padding

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${totalWidth}" height="56" viewBox="0 0 ${totalWidth} 56" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@600&amp;display=swap');
      .brand-text {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-weight: 600;
        font-size: 24px;
      }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${totalWidth}" height="56" fill="${bgColor}" rx="4"/>

  <!-- Icon container -->
  <g transform="translate(12, 12)">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${iconPath}
    </svg>
  </g>

  <!-- Brand name -->
  <text x="56" y="36" class="brand-text" fill="${textColor}">${escapeXml(displayName)}</text>
</svg>`;
}

/**
 * Generate favicon SVG (icon only)
 */
function generateFaviconSvg(params: SvgLogoParams): string {
  const iconKey = getIconForNiche(params.niche);
  const iconPath = ICON_PATHS[iconKey] || ICON_PATHS['globe'];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <!-- Background circle with brand color -->
  <circle cx="16" cy="16" r="16" fill="${params.primaryColor}"/>

  <!-- Icon centered and white -->
  <g transform="translate(4, 4)">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      ${iconPath}
    </svg>
  </g>
</svg>`;
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert SVG to PNG using sharp
 */
async function svgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svg))
    .resize(width, height)
    .png()
    .toBuffer();
}

/**
 * Generate all logo versions and upload to R2
 */
export async function generateSvgLogos(params: SvgLogoParams): Promise<SvgLogoResult> {
  console.log(`[SVG Logo] Generating logos for "${params.brandName}" (niche: ${params.niche})`);

  // Generate SVGs
  const lightSvg = generateLogoSvg(params, 'light');
  const darkSvg = generateLogoSvg(params, 'dark');
  const faviconSvg = generateFaviconSvg(params);

  // Convert to PNGs (high resolution for quality)
  const [lightPng, darkPng, faviconPng] = await Promise.all([
    svgToPng(lightSvg, 400, 112),  // 2x resolution for retina
    svgToPng(darkSvg, 400, 112),
    svgToPng(faviconSvg, 64, 64),  // Standard favicon size
  ]);

  // Generate filenames
  const sanitizedName = params.brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const timestamp = Date.now();

  // Upload to R2
  const [logoUrl, logoDarkUrl, faviconUrl] = await Promise.all([
    uploadToR2(lightPng, `logos/${sanitizedName}-light-${timestamp}.png`, 'image/png'),
    uploadToR2(darkPng, `logos/${sanitizedName}-dark-${timestamp}.png`, 'image/png'),
    uploadToR2(faviconPng, `logos/${sanitizedName}-favicon-${timestamp}.png`, 'image/png'),
  ]);

  console.log(`[SVG Logo] Uploaded: light=${logoUrl}, dark=${logoDarkUrl}, favicon=${faviconUrl}`);

  return {
    logoUrl,
    logoDarkUrl,
    faviconUrl,
    generatedAt: new Date(),
  };
}

/**
 * Regenerate logos, optionally deleting old ones
 */
export async function regenerateSvgLogos(
  params: SvgLogoParams,
  oldUrls?: { logoUrl?: string | null; logoDarkUrl?: string | null; faviconUrl?: string | null }
): Promise<SvgLogoResult> {
  const { deleteFromR2 } = await import('./image-storage.js');

  // Generate new logos
  const result = await generateSvgLogos(params);

  // Delete old logos from R2
  const urlsToDelete = [oldUrls?.logoUrl, oldUrls?.logoDarkUrl, oldUrls?.faviconUrl].filter(
    (url): url is string =>
      !!url && (url.includes('.r2.cloudflarestorage.com') || url.includes('.r2.dev'))
  );

  for (const url of urlsToDelete) {
    try {
      await deleteFromR2(url);
      console.log(`[SVG Logo] Deleted old logo: ${url}`);
    } catch (err) {
      console.warn(`[SVG Logo] Failed to delete old logo: ${err}`);
    }
  }

  return result;
}

/**
 * Check if SVG logo generation is available
 * Only requires R2 storage (no OpenAI needed)
 */
export function isSvgLogoGenerationAvailable(): boolean {
  return !!(
    process.env['R2_ACCESS_KEY_ID'] &&
    process.env['R2_SECRET_ACCESS_KEY'] &&
    process.env['R2_BUCKET_NAME']
  );
}
