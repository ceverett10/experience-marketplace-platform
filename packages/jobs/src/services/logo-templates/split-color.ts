/**
 * Template: Split Color
 *
 * First word in bold primary color, remaining words in secondary color.
 * Creates visual rhythm and emphasis — great for multi-word brand names.
 */

import type { LogoTemplate, LogoTemplateParams, TemplateCustomization } from './types.js';
import {
  prepareDisplayName,
  splitBrandName,
  getResponsiveFontSize,
  wrapWithAttribution,
  renderSharedFavicon,
  renderSharedOgImage,
} from './shared.js';
import type { SatoriNode } from '../satori-renderer.js';

function renderSplit(
  params: LogoTemplateParams,
  custom: TemplateCustomization,
  secondaryTextColor: string,
  attrColor: string
): SatoriNode {
  const displayName = prepareDisplayName(params.brandName, custom);
  const [first, second] = splitBrandName(displayName, custom.splitWord ?? 0);
  const fontSize = getResponsiveFontSize(displayName, 54);
  const weight = custom.fontWeight ?? 800;
  const spacing = `${custom.letterSpacing ?? -0.03}em`;

  const textChildren: SatoriNode[] = [
    {
      type: 'span',
      props: {
        style: {
          fontFamily: params.headingFont,
          fontSize,
          fontWeight: weight,
          color: params.primaryColor,
          letterSpacing: spacing,
        },
        children: first,
      },
    },
  ];

  if (second) {
    textChildren.push({
      type: 'span',
      props: {
        style: {
          fontFamily: params.headingFont,
          fontSize,
          fontWeight: weight,
          color: secondaryTextColor,
          letterSpacing: spacing,
          marginLeft: '0.25em',
        },
        children: second,
      },
    });
  }

  const brandElement: SatoriNode = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        lineHeight: 1.1,
      },
      children: textChildren,
    },
  };

  return wrapWithAttribution(brandElement, attrColor);
}

export const splitColor: LogoTemplate = {
  id: 'split-color',
  name: 'Split Color',
  description:
    'First word in bold primary color, rest in secondary. Dynamic and engaging for multi-word names.',
  nicheAffinity: ['*'],
  styleTags: ['dynamic', 'bold', 'two-tone', 'engaging'],

  renderLight(params, custom) {
    return renderSplit(params, custom, params.secondaryColor, '#9ca3af');
  },

  renderDark(params, custom) {
    return renderSplit(params, custom, 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0.45)');
  },

  renderFavicon: renderSharedFavicon,
  renderOgImage: renderSharedOgImage,
};
