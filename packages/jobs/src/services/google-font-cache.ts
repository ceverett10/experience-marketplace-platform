/**
 * Google Font Download & Cache Service
 *
 * Downloads TTF font files from Google Fonts API and caches them
 * in memory for use with Satori logo rendering.
 *
 * Satori requires raw ArrayBuffer font data to convert text to SVG paths.
 */

export interface FontData {
  name: string;
  weight: number;
  style: 'normal' | 'italic';
  data: ArrayBuffer;
}

/**
 * Known-good Google Fonts that work well for logos.
 * If the brand's font isn't in this list, we fall back to Inter.
 */
const VALID_GOOGLE_FONTS = new Set([
  'Inter',
  'Poppins',
  'Montserrat',
  'Playfair Display',
  'Raleway',
  'Lora',
  'Merriweather',
  'Roboto',
  'Open Sans',
  'Oswald',
  'Nunito',
  'PT Serif',
  'Libre Baskerville',
  'Cormorant Garamond',
  'DM Sans',
  'Source Sans 3',
  'Josefin Sans',
  'Quicksand',
  'Crimson Text',
  'Bitter',
  'Arvo',
  'Noto Sans',
  'Ubuntu',
  'Work Sans',
  'Rubik',
  'Barlow',
  'Cabin',
  'Karla',
  'Space Grotesk',
  'Manrope',
  'Outfit',
  'Sora',
  'Lexend',
  'Archivo',
  'DM Serif Display',
  'Cormorant',
  'Spectral',
  'Vollkorn',
  'Alegreya',
  'Philosopher',
  'EB Garamond',
  'Libre Franklin',
  'Plus Jakarta Sans',
  'Figtree',
  'Albert Sans',
  'Red Hat Display',
  'Urbanist',
  'Bricolage Grotesque',
  'Geist',
]);

/** In-memory cache: fontFamily-weight -> FontData */
const fontCache = new Map<string, FontData>();

/**
 * Validate a font name. Returns the font name if valid, or 'Inter' as fallback.
 */
export function validateFontName(font: string): string {
  return VALID_GOOGLE_FONTS.has(font) ? font : 'Inter';
}

/**
 * Download a Google Font TTF file for the given family and weight.
 *
 * Uses the Google Fonts CSS2 API with a browser User-Agent to get TTF format
 * (Google serves WOFF2 to modern browsers, but TTF to older UAs).
 */
export async function getGoogleFont(fontFamily: string, weight: number = 400): Promise<FontData> {
  const cacheKey = `${fontFamily}-${weight}`;

  const cached = fontCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const validFamily = validateFontName(fontFamily);
  const actualCacheKey = `${validFamily}-${weight}`;

  // Check again with validated name
  const cachedValid = fontCache.get(actualCacheKey);
  if (cachedValid) {
    return cachedValid;
  }

  console.info(`[Font Cache] Downloading ${validFamily} weight ${weight}...`);

  try {
    // Request CSS from Google Fonts with a User-Agent that triggers TTF response
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(validFamily)}:wght@${weight}&display=swap`;
    const cssResponse = await fetch(cssUrl, {
      headers: {
        // Use a User-Agent that gets TTF format (not WOFF2)
        'User-Agent':
          'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
      },
    });

    if (!cssResponse.ok) {
      throw new Error(`Google Fonts CSS fetch failed: ${cssResponse.status}`);
    }

    const css = await cssResponse.text();

    // Extract the font file URL from the CSS
    const urlMatch = css.match(/url\(([^)]+\.ttf[^)]*)\)/);
    if (!urlMatch?.[1]) {
      throw new Error(`No TTF URL found in Google Fonts CSS for ${validFamily}`);
    }

    // Download the actual TTF file
    const fontResponse = await fetch(urlMatch[1]);
    if (!fontResponse.ok) {
      throw new Error(`Font file download failed: ${fontResponse.status}`);
    }

    const data = await fontResponse.arrayBuffer();

    const fontData: FontData = {
      name: validFamily,
      weight,
      style: 'normal',
      data,
    };

    fontCache.set(actualCacheKey, fontData);
    console.info(
      `[Font Cache] Cached ${validFamily} weight ${weight} (${Math.round(data.byteLength / 1024)}KB)`
    );

    return fontData;
  } catch (error) {
    console.error(`[Font Cache] Failed to download ${validFamily}: ${error}`);

    // Fall back to Inter if the requested font fails
    if (validFamily !== 'Inter') {
      console.info(`[Font Cache] Falling back to Inter weight ${weight}`);
      return getGoogleFont('Inter', weight);
    }

    throw error;
  }
}

/**
 * Preload multiple fonts at once. Used at the start of bulk operations
 * to avoid downloading fonts one at a time during generation.
 */
export async function preloadFonts(
  fontFamilies: string[],
  weights: number[] = [400, 600, 700]
): Promise<void> {
  const unique = [...new Set(fontFamilies.map(validateFontName))];
  console.info(
    `[Font Cache] Preloading ${unique.length} fonts with weights [${weights.join(', ')}]...`
  );

  const results = await Promise.allSettled(
    unique.flatMap((family) => weights.map((weight) => getGoogleFont(family, weight)))
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`[Font Cache] ${failed.length} font downloads failed (will use fallbacks)`);
  }

  console.info(`[Font Cache] Preloaded ${fontCache.size} font variants`);
}

/**
 * Get the current cache size (for diagnostics).
 */
export function getCacheSize(): number {
  return fontCache.size;
}

/**
 * Clear the font cache (for testing).
 */
export function clearCache(): void {
  fontCache.clear();
}
