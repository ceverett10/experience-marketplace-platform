/**
 * Logo Template Registry
 *
 * Central registry of all available logo templates.
 * Templates are selected per-brand by the AI template selector.
 */

import type { LogoTemplate } from './types.js';
import { cleanWordmark } from './clean-wordmark.js';
import { splitColor } from './split-color.js';
import { underlineAccent } from './underline-accent.js';
import { monogramLeft } from './monogram-left.js';
import { stackedTagline } from './stacked-tagline.js';
import { uppercaseTrack } from './uppercase-track.js';
import { minimalDot } from './minimal-dot.js';
import { badgeOutline } from './badge-outline.js';
import { combinationMark } from './combination-mark.js';

export type { LogoTemplate, LogoTemplateParams, TemplateCustomization } from './types.js';

const ALL_TEMPLATES: LogoTemplate[] = [
  cleanWordmark,
  splitColor,
  underlineAccent,
  monogramLeft,
  combinationMark,
  stackedTagline,
  uppercaseTrack,
  minimalDot,
  badgeOutline,
];

export const TEMPLATE_REGISTRY = new Map<string, LogoTemplate>(ALL_TEMPLATES.map((t) => [t.id, t]));

export function getTemplate(id: string): LogoTemplate | undefined {
  return TEMPLATE_REGISTRY.get(id);
}

export function getAllTemplates(): LogoTemplate[] {
  return ALL_TEMPLATES;
}

export function getAllTemplateIds(): string[] {
  return ALL_TEMPLATES.map((t) => t.id);
}

/**
 * Get template descriptions formatted for the AI selector prompt.
 */
export function getTemplateDescriptions(): string {
  return ALL_TEMPLATES.map(
    (t, i) =>
      `${i + 1}. ${t.id}: ${t.description} Best for: ${t.nicheAffinity.join(', ')}. Style: ${t.styleTags.join(', ')}.`
  ).join('\n');
}
