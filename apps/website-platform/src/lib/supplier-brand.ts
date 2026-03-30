/**
 * Supplier Brand Colour Utilities
 *
 * Auto-assigns brand colours to supplier microsites based on their experience category.
 * Provides CSS custom property generation for the supplier-brand theming system.
 */

const CATEGORY_PALETTES: Array<{ keywords: string[]; colour: string }> = [
  { keywords: ['desert', 'safari', 'camel'], colour: '#B8860B' },
  {
    keywords: [
      'ocean',
      'water',
      'boat',
      'cruise',
      'diving',
      'snorkel',
      'surf',
      'kayak',
      'sailing',
    ],
    colour: '#0077B6',
  },
  {
    keywords: ['forest', 'cycling', 'bike', 'nature', 'eco', 'wildlife', 'jungle'],
    colour: '#2D6A4F',
  },
  {
    keywords: ['museum', 'culture', 'art', 'heritage', 'history', 'gallery'],
    colour: '#2C3E6B',
  },
  { keywords: ['mountain', 'trek', 'hiking', 'climbing', 'alpine'], colour: '#5C6B73' },
  { keywords: ['food', 'wine', 'culinary', 'cooking', 'beer', 'gastro'], colour: '#9B2335' },
  { keywords: ['wellness', 'spa', 'yoga', 'meditation', 'retreat'], colour: '#7B6D8D' },
  {
    keywords: ['adventure', 'extreme', 'zipline', 'paraglid', 'bungee', 'skydiv'],
    colour: '#D35400',
  },
];

const DEFAULT_BRAND_COLOUR = '#1D9E75';

export function getBrandColourFromCategories(categories: string[]): string {
  if (!categories.length) return DEFAULT_BRAND_COLOUR;
  const joined = categories.join(' ').toLowerCase();
  for (const palette of CATEGORY_PALETTES) {
    if (palette.keywords.some((kw) => joined.includes(kw))) {
      return palette.colour;
    }
  }
  return DEFAULT_BRAND_COLOUR;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 0 };
  const r = parseInt(result[1] ?? '0', 16) / 255;
  const g = parseInt(result[2] ?? '0', 16) / 255;
  const b = parseInt(result[3] ?? '0', 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const colour = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * colour)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function generateSupplierBrandCSS(
  brandColour: string | undefined,
  categories: string[] = [],
): string {
  const colour = brandColour || getBrandColourFromCategories(categories);
  const { h, s, l } = hexToHsl(colour);
  const dark = hslToHex(h, s, Math.max(0, l - 30));
  const light = hslToHex(h, Math.min(100, s), Math.min(100, l + 35));
  const text = hslToHex(h, s, Math.max(0, l - 20));
  return `:root {
    --supplier-brand: ${colour};
    --supplier-brand-dark: ${dark};
    --supplier-brand-light: ${light};
    --supplier-brand-text: ${text};
  }`;
}
