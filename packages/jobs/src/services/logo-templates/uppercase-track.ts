/**
 * Template: Uppercase Track
 *
 * All-caps with wide letter-spacing in the brand's primary color.
 * Creates an upscale, editorial, fashion-forward feel.
 */

import type { LogoTemplate, LogoTemplateParams, TemplateCustomization } from './types.js';
import { wrapWithAttribution, renderSharedFavicon, renderSharedOgImage } from './shared.js';
import type { SatoriNode } from '../satori-renderer.js';

function renderUppercase(
  params: LogoTemplateParams,
  custom: TemplateCustomization,
  textColor: string,
  attrColor: string
): SatoriNode {
  const displayName = params.brandName.trim().toUpperCase();
  const len = displayName.length;
  const fontSize = len <= 10 ? 48 : len <= 16 ? 42 : len <= 22 ? 36 : 30;

  const brandElement: SatoriNode = {
    type: 'span',
    props: {
      style: {
        fontFamily: params.headingFont,
        fontSize,
        fontWeight: custom.fontWeight ?? 700,
        color: textColor,
        letterSpacing: `${custom.letterSpacing ?? 0.15}em`,
        whiteSpace: 'nowrap' as const,
        lineHeight: 1.1,
      },
      children: displayName,
    },
  };

  return wrapWithAttribution(brandElement, attrColor);
}

export const uppercaseTrack: LogoTemplate = {
  id: 'uppercase-track',
  name: 'Uppercase Track',
  description:
    'All-caps with wide letter-spacing. Upscale editorial feel like fashion and luxury brands.',
  nicheAffinity: ['luxury', 'spa', 'wellness', 'wine', 'fashion'],
  styleTags: ['upscale', 'editorial', 'luxury', 'fashion'],

  renderLight(params, custom) {
    return renderUppercase(params, custom, params.primaryColor, '#9ca3af');
  },

  renderDark(params, custom) {
    return renderUppercase(params, custom, '#FFFFFF', 'rgba(255,255,255,0.45)');
  },

  renderFavicon: renderSharedFavicon,
  renderOgImage: renderSharedOgImage,
};
