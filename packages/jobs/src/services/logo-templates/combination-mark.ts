/**
 * Template: Combination Mark (v5 — Brandmark-Style)
 *
 * Large niche-specific icon + two-line wordmark with weight contrast.
 * Inspired by professional logo generators: the icon is prominent and
 * standalone (no container), brand name splits across two lines with
 * the first part bold and the second part lighter.
 *
 * Each brand in the same niche gets a different icon variant from the
 * multi-variant niche icon system, ensuring visual diversity.
 */

import type { LogoTemplate, LogoTemplateParams, TemplateCustomization } from './types.js';
import { prepareDisplayName, getResponsiveFontSize, renderSharedOgImage } from './shared.js';
import { getIconForNiche, buildIconDataUri, buildFaviconIconDataUri } from './niche-icons.js';
import type { SatoriNode } from '../satori-renderer.js';

const ICON_SIZE = 80;

/**
 * Split a brand name into two lines.
 * Strategy: first word on line 1, rest on line 2.
 * Single-word names stay on one line.
 */
function splitIntoLines(brandName: string): [string, string] {
  const words = brandName.trim().split(/\s+/);
  if (words.length <= 1) return [brandName.trim(), ''];
  // For 2-word names: word1 | word2
  // For 3+ words: word1 | word2 word3...
  return [words[0]!, words.slice(1).join(' ')];
}

function renderCombinationMark(
  params: LogoTemplateParams,
  custom: TemplateCustomization,
  iconColor: string,
  line1Color: string,
  line2Color: string
): SatoriNode {
  const displayName = prepareDisplayName(params.brandName, custom);
  const [line1, line2] = splitIntoLines(displayName);
  const iconKey = getIconForNiche(params.niche, params.brandName);
  const iconDataUri = buildIconDataUri(iconKey, iconColor, ICON_SIZE);

  // Font sizing — first line bold and larger, second line lighter and smaller
  const line1FontSize = getResponsiveFontSize(displayName, 48);
  const line2FontSize = Math.round(line1FontSize * 0.75);

  const textChildren: SatoriNode[] = [
    // Line 1 — bold, primary
    {
      type: 'span',
      props: {
        style: {
          fontFamily: params.headingFont,
          fontSize: line1FontSize,
          fontWeight: 800,
          color: line1Color,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          whiteSpace: 'nowrap' as const,
        },
        children: line1,
      },
    },
  ];

  // Line 2 — lighter weight, secondary color or muted
  if (line2) {
    textChildren.push({
      type: 'span',
      props: {
        style: {
          fontFamily: params.headingFont,
          fontSize: line2FontSize,
          fontWeight: 400,
          color: line2Color,
          letterSpacing: '0em',
          lineHeight: 1.1,
          whiteSpace: 'nowrap' as const,
        },
        children: line2,
      },
    });
  }

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        height: '100%',
        padding: '0 32px',
        gap: 20,
      },
      children: [
        // Large standalone icon — no container, just the icon itself
        {
          type: 'img',
          props: {
            src: iconDataUri,
            width: ICON_SIZE,
            height: ICON_SIZE,
          },
        },
        // Two-line text block
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column' as const,
              gap: line2 ? 2 : 0,
            },
            children: textChildren,
          },
        },
      ],
    },
  };
}

/**
 * Render a favicon with the niche icon on a gradient background.
 */
function renderIconFavicon(params: LogoTemplateParams, _custom: TemplateCustomization): SatoriNode {
  const iconKey = getIconForNiche(params.niche, params.brandName);
  const iconDataUri = buildFaviconIconDataUri(iconKey, '#FFFFFF', 112);

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
        type: 'img',
        props: {
          src: iconDataUri,
          width: 112,
          height: 112,
        },
      },
    },
  };
}

export const combinationMark: LogoTemplate = {
  id: 'combination-mark',
  name: 'Combination Mark',
  description:
    'Large niche-specific icon + two-line wordmark with weight contrast. Each brand gets a ' +
    'unique icon variant from the multi-variant system, ensuring no two brands look alike. ' +
    'First line is bold (brand keyword), second line is lighter (descriptor). Professional ' +
    'and distinctive like Brandmark-quality logos.',
  nicheAffinity: ['*'],
  styleTags: ['bold', 'iconic', 'professional', 'distinctive', 'two-line'],

  renderLight(params, custom) {
    // Icon in secondary color, line1 in primary, line2 muted
    return renderCombinationMark(
      params,
      custom,
      params.secondaryColor,
      params.primaryColor,
      '#6B7280'
    );
  },

  renderDark(params, custom) {
    // Icon in secondary/accent, line1 white, line2 muted white
    return renderCombinationMark(
      params,
      custom,
      params.secondaryColor,
      '#FFFFFF',
      'rgba(255,255,255,0.55)'
    );
  },

  renderFavicon: renderIconFavicon,
  renderOgImage: renderSharedOgImage,
};
