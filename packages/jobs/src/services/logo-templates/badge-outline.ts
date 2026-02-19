/**
 * Template: Badge Outline
 *
 * Bold brand name inside a rounded border in the brand's primary color.
 * Conveys heritage, quality, and trust — like a premium quality stamp.
 */

import type { LogoTemplate, LogoTemplateParams, TemplateCustomization } from './types.js';
import {
  prepareDisplayName,
  getResponsiveFontSize,
  renderPoweredBy,
  renderSharedFavicon,
  renderSharedOgImage,
} from './shared.js';
import type { SatoriNode } from '../satori-renderer.js';

function renderBadge(
  params: LogoTemplateParams,
  custom: TemplateCustomization,
  textColor: string,
  borderColor: string,
  attrColor: string
): SatoriNode {
  const displayName = prepareDisplayName(params.brandName, custom);
  const fontSize = getResponsiveFontSize(displayName, 42);

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
      children: [
        // Badge container
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `3px solid ${borderColor}`,
              borderRadius: 12,
              padding: '12px 28px',
            },
            children: {
              type: 'span',
              props: {
                style: {
                  fontFamily: params.headingFont,
                  fontSize,
                  fontWeight: custom.fontWeight ?? 800,
                  color: textColor,
                  letterSpacing: `${custom.letterSpacing ?? 0.02}em`,
                  whiteSpace: 'nowrap' as const,
                  lineHeight: 1.1,
                },
                children: displayName,
              },
            },
          },
        },
        // Powered by
        renderPoweredBy(attrColor),
      ],
    },
  };
}

export const badgeOutline: LogoTemplate = {
  id: 'badge-outline',
  name: 'Badge Outline',
  description:
    'Bold brand name in a colored border badge. Heritage, trust, and premium quality stamp.',
  nicheAffinity: ['culture', 'heritage', 'history', 'food', 'wine'],
  styleTags: ['heritage', 'trust', 'quality', 'premium', 'stamp'],

  renderLight(params, custom) {
    return renderBadge(params, custom, params.primaryColor, params.primaryColor, '#9ca3af');
  },

  renderDark(params, custom) {
    return renderBadge(
      params,
      custom,
      '#FFFFFF',
      'rgba(255,255,255,0.7)',
      'rgba(255,255,255,0.45)'
    );
  },

  renderFavicon: renderSharedFavicon,
  renderOgImage: renderSharedOgImage,
};
