/**
 * Logo Template Types
 *
 * Each template produces Satori-compatible element trees for rendering
 * branded logos, favicons, and OG images.
 */

import type { SatoriNode } from '../satori-renderer.js';

/**
 * Input parameters for logo template rendering.
 * These come from the Brand + Site database records.
 */
export interface LogoTemplateParams {
  brandName: string;
  tagline?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  niche: string;
  location?: string;
}

/**
 * Customization options selected by AI or hash-based fallback.
 */
export interface TemplateCustomization {
  /** Index of word to split after (for split-color, two-tone, etc.) */
  splitWord?: number;
  /** Whether to show the tagline in the logo */
  showTagline: boolean;
  /** Letter-spacing adjustment (-0.05 to 0.1 em) */
  letterSpacing?: number;
  /** Font weight override (400-900) */
  fontWeight?: number;
  /** Whether brand name should be uppercase */
  uppercase: boolean;
}

/**
 * A logo template that can render branded visuals in multiple variants.
 */
export interface LogoTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description for AI selection */
  description: string;
  /** Niche affinities — which niches this template works best for. Use ['*'] for universal. */
  nicheAffinity: string[];
  /** Style tags for AI template matching */
  styleTags: string[];

  /**
   * Render the primary (light) logo variant.
   * Dark text on transparent background.
   */
  renderLight(params: LogoTemplateParams, custom: TemplateCustomization): SatoriNode;

  /**
   * Render the dark logo variant.
   * White text on transparent background — for dark hero images and footers.
   */
  renderDark(params: LogoTemplateParams, custom: TemplateCustomization): SatoriNode;

  /**
   * Render a compact favicon variant.
   * Typically a monogram on a colored background.
   */
  renderFavicon(params: LogoTemplateParams, custom: TemplateCustomization): SatoriNode;

  /**
   * Render an OG image (1200x630).
   * Brand name + tagline on a colored background for social sharing.
   */
  renderOgImage(params: LogoTemplateParams, custom: TemplateCustomization): SatoriNode;
}
