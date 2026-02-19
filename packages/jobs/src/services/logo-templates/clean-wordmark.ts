/**
 * Template: Clean Wordmark
 *
 * Bold typographic wordmark in the brand's primary color.
 * Maximum visual impact through heavy weight and tight tracking.
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

function renderWordmark(
  params: LogoTemplateParams,
  custom: TemplateCustomization,
  textColor: string,
  attrColor: string
): SatoriNode {
  const displayName = prepareDisplayName(params.brandName, custom);
  const fontSize = getResponsiveFontSize(displayName, 56);

  const brandElement: SatoriNode = {
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
  };

  return wrapWithAttribution(brandElement, attrColor);
}

export const cleanWordmark: LogoTemplate = {
  id: 'clean-wordmark',
  name: 'Clean Wordmark',
  description:
    'Bold typographic wordmark in the brand primary color. Maximum impact, works for any niche.',
  nicheAffinity: ['*'],
  styleTags: ['bold', 'modern', 'impactful', 'professional'],

  renderLight(params, custom) {
    return renderWordmark(params, custom, params.primaryColor, '#9ca3af');
  },

  renderDark(params, custom) {
    return renderWordmark(params, custom, '#FFFFFF', 'rgba(255,255,255,0.45)');
  },

  renderFavicon: renderSharedFavicon,
  renderOgImage: renderSharedOgImage,
};
