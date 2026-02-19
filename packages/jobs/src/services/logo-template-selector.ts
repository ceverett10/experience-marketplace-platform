/**
 * AI-Driven Logo Template Selector
 *
 * Uses Claude Haiku to select the best logo template and customization
 * for a given brand identity. Falls back to a deterministic hash-based
 * selector if AI is unavailable.
 */

import { createClaudeClient } from '@experience-marketplace/content-engine';
import {
  getTemplateDescriptions,
  getAllTemplateIds,
  type LogoTemplateParams,
  type TemplateCustomization,
} from './logo-templates/index.js';

export interface TemplateSelectionResult {
  templateId: string;
  customization: TemplateCustomization;
}

/**
 * Use Claude Haiku to select the best template for a brand.
 * Cost: ~$0.0005 per call (~200 input tokens, ~100 output tokens).
 */
export async function selectTemplate(params: LogoTemplateParams): Promise<TemplateSelectionResult> {
  const apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'];

  if (!apiKey) {
    console.info('[Template Selector] No API key, using hash-based selection');
    return selectTemplateByHash(params);
  }

  try {
    const client = createClaudeClient({ apiKey });
    const templateDescriptions = getTemplateDescriptions();
    const wordCount = params.brandName.trim().split(/\s+/).length;

    const prompt = `You are a brand designer selecting a logo template for a travel experience website.

Brand: "${params.brandName}"
Tagline: "${params.tagline ?? 'none'}"
Niche: ${params.niche}
Location: ${params.location ?? 'multiple locations'}
Colors: primary=${params.primaryColor}, secondary=${params.secondaryColor}
Heading font: ${params.headingFont}
Word count: ${wordCount}

Available templates:
${templateDescriptions}

Select ONE template and provide customization. Consider:
- Brand name length and word count
- Niche appropriateness
- Whether to show tagline (only if it adds value and isn't too long)
- splitWord: for split-color template, which word to split after (0-based index)

Return ONLY valid JSON:
{
  "templateId": "template-id",
  "customization": {
    "splitWord": ${wordCount > 1 ? '0' : 'null'},
    "showTagline": false,
    "letterSpacing": -0.03,
    "fontWeight": 800,
    "uppercase": false
  }
}`;

    const response = await client.generate({
      model: client.getModelId('haiku'),
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
      temperature: 0.3, // Low temperature for consistent selection
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        templateId: string;
        customization: Partial<TemplateCustomization>;
      };

      // Validate template ID
      const validIds = getAllTemplateIds();
      if (!validIds.includes(parsed.templateId)) {
        console.warn(
          `[Template Selector] AI returned invalid template "${parsed.templateId}", falling back`
        );
        return selectTemplateByHash(params);
      }

      return {
        templateId: parsed.templateId,
        customization: {
          splitWord: parsed.customization.splitWord ?? undefined,
          showTagline: parsed.customization.showTagline ?? false,
          letterSpacing: clamp(parsed.customization.letterSpacing ?? -0.03, -0.05, 0.2),
          fontWeight: clamp(parsed.customization.fontWeight ?? 800, 400, 900),
          uppercase: parsed.customization.uppercase ?? false,
        },
      };
    }

    throw new Error('No JSON in AI response');
  } catch (error) {
    console.warn(`[Template Selector] AI selection failed: ${error}. Using hash fallback.`);
    return selectTemplateByHash(params);
  }
}

/**
 * Deterministic hash-based template selection.
 * Used as fallback when AI is unavailable.
 */
function selectTemplateByHash(params: LogoTemplateParams): TemplateSelectionResult {
  const templateIds = getAllTemplateIds();
  const hash = simpleHash(params.brandName + params.niche);
  const index = Math.abs(hash) % templateIds.length;
  const templateId = templateIds[index]!;

  const wordCount = params.brandName.trim().split(/\s+/).length;

  return {
    templateId,
    customization: {
      splitWord: wordCount > 1 ? 0 : undefined,
      showTagline: templateId === 'stacked-tagline' && !!params.tagline,
      letterSpacing: templateId === 'uppercase-track' ? 0.15 : -0.03,
      fontWeight: 800,
      uppercase: false,
    },
  };
}

/**
 * Simple string hash (djb2 algorithm).
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return hash;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
