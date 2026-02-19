/**
 * Template: Monogram Left
 *
 * Bold monogram circle in primary color gradient + wordmark.
 * Creates a strong "icon + name" identity like real travel brands.
 */

import type { LogoTemplate, LogoTemplateParams, TemplateCustomization } from './types.js';
import {
  extractInitials,
  prepareDisplayName,
  getResponsiveFontSize,
  renderPoweredBy,
  renderSharedFavicon,
  renderSharedOgImage,
} from './shared.js';
import type { SatoriNode } from '../satori-renderer.js';

function renderMonogram(
  params: LogoTemplateParams,
  custom: TemplateCustomization,
  textColor: string,
  attrColor: string
): SatoriNode {
  const displayName = prepareDisplayName(params.brandName, custom);
  const initials = extractInitials(params.brandName);
  const fontSize = getResponsiveFontSize(displayName, 48);

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
        // Icon + brand name row
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            },
            children: [
              // Monogram circle
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    background: `linear-gradient(135deg, ${params.primaryColor}, ${params.secondaryColor})`,
                    flexShrink: 0,
                  },
                  children: {
                    type: 'span',
                    props: {
                      style: {
                        fontFamily: params.headingFont,
                        fontSize: initials.length === 1 ? 28 : 22,
                        fontWeight: 800,
                        color: '#FFFFFF',
                        letterSpacing: '-0.02em',
                      },
                      children: initials,
                    },
                  },
                },
              },
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
            ],
          },
        },
        // Powered by
        renderPoweredBy(attrColor),
      ],
    },
  };
}

export const monogramLeft: LogoTemplate = {
  id: 'monogram-left',
  name: 'Monogram Left',
  description:
    'Gradient monogram circle + bold wordmark. Strong brand icon identity like real travel brands.',
  nicheAffinity: ['*'],
  styleTags: ['bold', 'iconic', 'recognizable', 'trust'],

  renderLight(params, custom) {
    return renderMonogram(params, custom, params.primaryColor, '#9ca3af');
  },

  renderDark(params, custom) {
    return renderMonogram(params, custom, '#FFFFFF', 'rgba(255,255,255,0.45)');
  },

  renderFavicon: renderSharedFavicon,
  renderOgImage: renderSharedOgImage,
};
