/**
 * Shared rendering utilities for logo templates.
 *
 * Favicon and OG image rendering is consistent across all templates —
 * only the light/dark wordmark variants differ per template.
 */

import type { SatoriNode } from '../satori-renderer.js';
import type { LogoTemplateParams, TemplateCustomization } from './types.js';

/** Attribution text shown on all logos and OG images */
const POWERED_BY_TEXT = 'powered by experiencess.com';

/**
 * Extract 1-2 character initials from a brand name.
 */
export function extractInitials(brandName: string): string {
  const words = brandName
    .trim()
    .split(/[\s\-_]+/)
    .filter(Boolean);
  if (words.length === 0) return 'X';
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

/**
 * Prepare the display name based on customization options.
 */
export function prepareDisplayName(brandName: string, custom: TemplateCustomization): string {
  let name = brandName.trim();
  if (custom.uppercase) {
    name = name.toUpperCase();
  }
  return name;
}

/**
 * Split a brand name into two parts for two-tone/split-color templates.
 * Returns [firstPart, secondPart].
 */
export function splitBrandName(brandName: string, splitWord?: number): [string, string] {
  const words = brandName.trim().split(/\s+/);
  if (words.length <= 1 || splitWord === undefined) {
    return [brandName.trim(), ''];
  }
  const splitIndex = Math.min(splitWord + 1, words.length - 1);
  return [words.slice(0, splitIndex).join(' '), words.slice(splitIndex).join(' ')];
}

/**
 * Compute a responsive font size based on brand name length.
 * Larger text for short names, scaling down for long ones.
 */
export function getResponsiveFontSize(displayName: string, base: number = 54): number {
  const len = displayName.length;
  if (len <= 10) return base;
  if (len <= 16) return base - 4;
  if (len <= 22) return base - 10;
  return base - 16;
}

/**
 * Render the "powered by experiences.com" attribution text.
 */
export function renderPoweredBy(color: string): SatoriNode {
  return {
    type: 'span',
    props: {
      style: {
        fontFamily: 'Inter',
        fontSize: 11,
        fontWeight: 400,
        color,
        letterSpacing: '0.03em',
        marginTop: 6,
        whiteSpace: 'nowrap' as const,
      },
      children: POWERED_BY_TEXT,
    },
  };
}

/**
 * Wrap a brand element with attribution in a standard layout.
 * Creates a column layout: brand element on top, "powered by" below.
 */
export function wrapWithAttribution(
  brandElement: SatoriNode,
  attributionColor: string
): SatoriNode {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'center',
        height: '100%',
        padding: '0 28px',
      },
      children: [brandElement, renderPoweredBy(attributionColor)],
    },
  };
}

/**
 * Render a standard favicon: monogram on a colored rounded-square background.
 * This is shared across all templates.
 */
export function renderSharedFavicon(
  params: LogoTemplateParams,
  _custom: TemplateCustomization
): SatoriNode {
  const initials = extractInitials(params.brandName);
  const fontSize = initials.length === 1 ? 100 : 80;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, ${params.primaryColor}, ${params.secondaryColor})`,
        borderRadius: 32,
      },
      children: {
        type: 'span',
        props: {
          style: {
            fontFamily: params.headingFont,
            fontSize,
            fontWeight: 800,
            color: '#FFFFFF',
            letterSpacing: '-0.03em',
          },
          children: initials,
        },
      },
    },
  };
}

/**
 * Render a standard OG image: brand name + tagline on gradient background
 * with "powered by experiences.com" attribution at the bottom.
 */
export function renderSharedOgImage(
  params: LogoTemplateParams,
  custom: TemplateCustomization
): SatoriNode {
  const displayName = prepareDisplayName(params.brandName, custom);
  const fontSize = displayName.length > 20 ? 64 : 80;

  const children: SatoriNode[] = [
    // Brand name
    {
      type: 'span',
      props: {
        style: {
          fontFamily: params.headingFont,
          fontSize,
          fontWeight: 800,
          color: '#FFFFFF',
          letterSpacing: '-0.03em',
          textAlign: 'center' as const,
        },
        children: displayName,
      },
    },
  ];

  // Tagline
  if (params.tagline) {
    children.push({
      type: 'span',
      props: {
        style: {
          fontFamily: params.bodyFont,
          fontSize: 30,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.85)',
          marginTop: 20,
          textAlign: 'center' as const,
        },
        children: params.tagline,
      },
    });
  }

  // Powered by attribution
  children.push({
    type: 'span',
    props: {
      style: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 400,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 40,
        letterSpacing: '0.05em',
        textAlign: 'center' as const,
      },
      children: POWERED_BY_TEXT,
    },
  });

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, ${params.primaryColor} 0%, ${params.secondaryColor} 100%)`,
        padding: 60,
      },
      children,
    },
  };
}
