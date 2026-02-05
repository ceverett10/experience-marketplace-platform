/**
 * Image Utilities
 * Shared utilities for optimized image loading
 */

/**
 * Gray blur placeholder for lazy-loaded images
 * Provides smooth loading experience without layout shift
 */
export const BLUR_PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjI2NyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PC9zdmc+';

/**
 * Generate a brand-colored blur placeholder
 * Creates a subtle tinted placeholder using the brand's primary color
 *
 * @param primaryColor - The brand's primary color (hex)
 * @param opacity - Opacity of the color overlay (0-1), default 0.1
 */
export function getBrandBlurPlaceholder(primaryColor: string, opacity: number = 0.1): string {
  // Convert hex to RGB
  const hex = primaryColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const svg = `<svg width="400" height="267" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#e5e7eb"/>
    <rect width="100%" height="100%" fill="rgba(${r},${g},${b},${opacity})"/>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Responsive image sizes for common layouts
 * Use these with the `sizes` prop of next/image
 */
export const IMAGE_SIZES = {
  // Full width on mobile, half on tablet, third on desktop
  gridCard: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',

  // Full width on mobile, half on desktop
  halfWidth: '(max-width: 768px) 100vw, 50vw',

  // Full viewport width (heroes, banners)
  fullWidth: '100vw',

  // Quarter width for thumbnails
  thumbnail: '(max-width: 640px) 50vw, 25vw',

  // Fixed small size for avatars, icons
  small: '96px',

  // Fixed medium size for compact cards
  compact: '160px',
} as const;
