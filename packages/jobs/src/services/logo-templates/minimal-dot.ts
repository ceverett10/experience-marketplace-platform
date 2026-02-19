/**
 * Template: Minimal Dot
 *
 * Bold wordmark with a colored dot accent after the name.
 * Clean, modern, confident — the dot adds subtle personality.
 */

import type { LogoTemplate, LogoTemplateParams, TemplateCustomization } from './types.js';
import {
  prepareDisplayName,
  getResponsiveFontSize,
  wrapWithAttribution,
  renderSharedFavicon,
  renderSharedOgImage,
} from './shared.js';
import type { SatoriNode } from '../satori-renderer.js';

function renderDot(
  params: LogoTemplateParams,
  custom: TemplateCustomization,
  textColor: string,
  dotColor: string,
  attrColor: string
): SatoriNode {
  const displayName = prepareDisplayName(params.brandName, custom);
  const fontSize = getResponsiveFontSize(displayName, 54);

  const brandElement: SatoriNode = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'baseline',
      },
      children: [
        {
          type: 'span',
          props: {
            style: {
              fontFamily: params.headingFont,
              fontSize,
              fontWeight: custom.fontWeight ?? 800,
              color: textColor,
              letterSpacing: `${custom.letterSpacing ?? -0.03}em`,
              whiteSpace: 'nowrap' as const,
              lineHeight: 1.1,
            },
            children: displayName,
          },
        },
        {
          type: 'span',
          props: {
            style: {
              fontFamily: params.headingFont,
              fontSize: fontSize + 8,
              fontWeight: 900,
              color: dotColor,
              marginLeft: 2,
              lineHeight: 0.8,
            },
            children: '.',
          },
        },
      ],
    },
  };

  return wrapWithAttribution(brandElement, attrColor);
}

export const minimalDot: LogoTemplate = {
  id: 'minimal-dot',
  name: 'Minimal Dot',
  description: 'Bold wordmark with an oversized colored dot accent. Clean, modern, and confident.',
  nicheAffinity: ['*'],
  styleTags: ['modern', 'confident', 'clean', 'tech'],

  renderLight(params, custom) {
    return renderDot(params, custom, params.primaryColor, params.accentColor, '#9ca3af');
  },

  renderDark(params, custom) {
    return renderDot(params, custom, '#FFFFFF', params.accentColor, 'rgba(255,255,255,0.45)');
  },

  renderFavicon: renderSharedFavicon,
  renderOgImage: renderSharedOgImage,
};
