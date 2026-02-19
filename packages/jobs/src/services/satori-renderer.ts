/**
 * Satori Renderer Service
 *
 * Wraps Vercel's Satori library to convert JSX-like element trees + font data
 * into SVG strings, then rasterize to PNG via sharp.
 *
 * Satori converts text to SVG <path> elements using the actual font data,
 * so sharp doesn't need to handle any font rendering — the SVG is fully
 * self-contained with path outlines.
 */

import satori from 'satori';
import sharp from 'sharp';
import type { FontData } from './google-font-cache.js';

/**
 * Satori element node type.
 *
 * Satori accepts plain objects with { type, props } structure at runtime,
 * but its TypeScript types expect React.ReactNode. We use a permissive type
 * here and cast when passing to satori() to avoid requiring React as a dependency.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SatoriNode = any;

export interface RenderOptions {
  /** Width of the output SVG/PNG */
  width: number;
  /** Height of the output SVG/PNG */
  height: number;
  /** Font data for text rendering */
  fonts: FontData[];
  /** The element tree to render */
  element: SatoriNode;
}

/**
 * Render a Satori element tree to an SVG string.
 *
 * The output SVG contains <path> elements for all text — no <text> tags,
 * no font dependencies. This is the key advantage over raw SVG generation.
 */
export async function renderToSvg(options: RenderOptions): Promise<string> {
  const svg = await satori(options.element, {
    width: options.width,
    height: options.height,
    fonts: options.fonts.map((f) => ({
      name: f.name,
      data: f.data,
      weight: f.weight as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900,
      style: f.style as 'normal' | 'italic',
    })),
  });

  return svg;
}

/**
 * Render a Satori element tree to a PNG buffer.
 *
 * Pipeline: Element → Satori → SVG (with paths) → sharp (2x density) → PNG
 *
 * Renders at 2x resolution by default for crisp output on retina displays.
 * Satori generates the SVG at logical dimensions, then sharp rasterizes
 * at higher density to produce a pixel-dense PNG.
 */
export async function renderToPng(options: RenderOptions, scale: number = 2): Promise<Buffer> {
  const svg = await renderToSvg(options);
  const svgBuffer = Buffer.from(svg);

  const outputWidth = options.width * scale;
  const outputHeight = options.height * scale;

  return sharp(svgBuffer, { density: 72 * scale })
    .resize(outputWidth, outputHeight)
    .png()
    .toBuffer();
}
