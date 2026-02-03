/**
 * Favicon Generator Service
 *
 * Generates SVG favicons programmatically from brand identity (colors + name).
 * Pure functions with no external API dependencies.
 * Stores as base64 data URIs in Brand.faviconUrl.
 */

import { prisma } from '@experience-marketplace/database';

// --- Color Utilities ---

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
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

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Darken a hex color by a percentage (0-1).
 */
export function darkenColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  return hslToHex(h, s, Math.max(0, l - amount));
}

/**
 * Calculate relative luminance (WCAG 2.0).
 */
export function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linearize = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Choose white or dark text color based on background luminance.
 */
export function getContrastTextColor(backgroundHex: string): '#FFFFFF' | '#1A1A2E' {
  return getLuminance(backgroundHex) > 0.35 ? '#1A1A2E' : '#FFFFFF';
}

// --- Favicon Generation ---

/**
 * Extract 1-2 character initials from a brand name.
 * Examples: "London Food Tours" -> "LF", "Explore" -> "E"
 */
export function extractInitials(brandName: string): string {
  const words = brandName.trim().split(/[\s\-_]+/).filter(Boolean);
  if (words.length === 0) return 'X';
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

/**
 * Validate a hex color string. Returns the color or a default.
 */
function validateHex(hex: string, fallback = '#6366f1'): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;
}

/**
 * Generate an SVG favicon from brand identity.
 * Returns raw SVG string.
 */
export function generateFaviconSvg(params: {
  brandName: string;
  primaryColor: string;
  shape?: 'rounded-square' | 'circle';
}): string {
  const primaryColor = validateHex(params.primaryColor);
  const darkColor = darkenColor(primaryColor, 0.15);
  const textColor = getContrastTextColor(primaryColor);
  const initials = extractInitials(params.brandName);
  const shape = params.shape ?? 'rounded-square';

  // Adjust font size: 1 char = larger, 2 chars = smaller
  const fontSize = initials.length === 1 ? 20 : 16;

  const shapeElement =
    shape === 'circle'
      ? `<circle cx="16" cy="16" r="16" fill="url(#bg)"/>`
      : `<rect width="32" height="32" rx="6" fill="url(#bg)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primaryColor}"/>
      <stop offset="100%" stop-color="${darkColor}"/>
    </linearGradient>
  </defs>
  ${shapeElement}
  <text x="16" y="22" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="${fontSize}" fill="${textColor}">${initials}</text>
</svg>`;
}

/**
 * Convert SVG string to a base64 data URI.
 */
export function svgToDataUri(svg: string): string {
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Generate favicon and store in database for a brand.
 */
export async function generateAndStoreFavicon(
  brandId: string,
  brandName: string,
  primaryColor: string
): Promise<{ faviconUrl: string }> {
  const svg = generateFaviconSvg({ brandName, primaryColor });
  const faviconUrl = svgToDataUri(svg);

  await prisma.brand.update({
    where: { id: brandId },
    data: { faviconUrl },
  });

  console.log(`[Favicon] Generated and stored favicon for brand "${brandName}" (${extractInitials(brandName)})`);
  return { faviconUrl };
}
