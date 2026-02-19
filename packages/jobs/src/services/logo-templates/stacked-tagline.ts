/**
 * Template: Stacked Tagline
 *
 * Bold brand name in primary color on top, tagline below in a lighter weight.
 * Great for brands with strong taglines — creates depth and personality.
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

function renderStacked(
  params: LogoTemplateParams,
  custom: TemplateCustomization,
  textColor: string,
  taglineColor: string,
  attrColor: string
): SatoriNode {
  const displayName = prepareDisplayName(params.brandName, custom);
  const fontSize = getResponsiveFontSize(displayName, 50);

  const children: SatoriNode[] = [
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
          lineHeight: 1,
        },
        children: displayName,
      },
    },
  ];

  // Tagline
  if (params.tagline && custom.showTagline) {
    const tagline =
      params.tagline.length > 45 ? params.tagline.slice(0, 45) + '...' : params.tagline;
    children.push({
      type: 'span',
      props: {
        style: {
          fontFamily: params.bodyFont,
          fontSize: 15,
          fontWeight: 500,
          color: taglineColor,
          letterSpacing: '0.04em',
          textTransform: 'uppercase' as const,
          marginTop: 8,
          whiteSpace: 'nowrap' as const,
        },
        children: tagline,
      },
    });
  }

  // Powered by
  children.push(renderPoweredBy(attrColor));

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
      children,
    },
  };
}

export const stackedTagline: LogoTemplate = {
  id: 'stacked-tagline',
  name: 'Stacked Tagline',
  description:
    'Bold brand name with tagline below. Perfect for brands with strong taglines and two-line presence.',
  nicheAffinity: ['*'],
  styleTags: ['informative', 'descriptive', 'bold', 'engaging'],

  renderLight(params, custom) {
    return renderStacked(params, custom, params.primaryColor, params.secondaryColor, '#9ca3af');
  },

  renderDark(params, custom) {
    return renderStacked(
      params,
      custom,
      '#FFFFFF',
      'rgba(255,255,255,0.65)',
      'rgba(255,255,255,0.45)'
    );
  },

  renderFavicon: renderSharedFavicon,
  renderOgImage: renderSharedOgImage,
};
