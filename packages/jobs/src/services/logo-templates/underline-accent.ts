/**
 * Template: Underline Accent
 *
 * Bold wordmark in primary color with a thick accent bar below.
 * Conveys energy and premium quality.
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

function renderUnderline(
  params: LogoTemplateParams,
  custom: TemplateCustomization,
  textColor: string,
  barColor: string,
  attrColor: string
): SatoriNode {
  const displayName = prepareDisplayName(params.brandName, custom);
  const fontSize = getResponsiveFontSize(displayName, 54);

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
        // Brand name
        {
          type: 'span',
          props: {
            style: {
              fontFamily: params.headingFont,
              fontSize,
              fontWeight: custom.fontWeight ?? 800,
              color: textColor,
              letterSpacing: `${custom.letterSpacing ?? -0.02}em`,
              whiteSpace: 'nowrap' as const,
              lineHeight: 1.1,
            },
            children: displayName,
          },
        },
        // Accent bar
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              width: 70,
              height: 5,
              backgroundColor: barColor,
              borderRadius: 3,
              marginTop: 8,
            },
            children: [],
          },
        },
        // Powered by
        renderPoweredBy(attrColor),
      ],
    },
  };
}

export const underlineAccent: LogoTemplate = {
  id: 'underline-accent',
  name: 'Underline Accent',
  description:
    'Bold wordmark with a thick colored accent bar. Premium, energetic, and established feel.',
  nicheAffinity: ['food', 'wine', 'luxury', 'culture', 'adventure'],
  styleTags: ['premium', 'energetic', 'established', 'professional'],

  renderLight(params, custom) {
    return renderUnderline(params, custom, params.primaryColor, params.accentColor, '#9ca3af');
  },

  renderDark(params, custom) {
    return renderUnderline(params, custom, '#FFFFFF', params.accentColor, 'rgba(255,255,255,0.45)');
  },

  renderFavicon: renderSharedFavicon,
  renderOgImage: renderSharedOgImage,
};
