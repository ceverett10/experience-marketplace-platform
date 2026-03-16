import { describe, it, expect } from 'vitest';
import {
  isLowIntentKeyword,
  hasCommercialIntent,
  getLowIntentPrismaConditions,
} from './keyword-intent';

describe('isLowIntentKeyword', () => {
  it('rejects single-word keywords as too broad', () => {
    expect(isLowIntentKeyword('tours')).toBe(true);
    expect(isLowIntentKeyword('barcelona')).toBe(true);
    expect(isLowIntentKeyword('kayaking')).toBe(true);
  });

  it('rejects "free" keywords (whole word match)', () => {
    expect(isLowIntentKeyword('free walking tour')).toBe(true);
    expect(isLowIntentKeyword('gratis museum entry')).toBe(true);
  });

  it('does NOT reject "freestyle" or similar (no false positives)', () => {
    expect(isLowIntentKeyword('freestyle kayaking tours')).toBe(false);
  });

  it('rejects wrong product types without commercial modifiers', () => {
    expect(isLowIntentKeyword('hotels in barcelona')).toBe(true);
    expect(isLowIntentKeyword('flights to london')).toBe(true);
    expect(isLowIntentKeyword('restaurants in rome')).toBe(true);
    expect(isLowIntentKeyword('parking near colosseum')).toBe(true);
  });

  it('allows wrong product type keywords that also have commercial modifiers', () => {
    // "hotel tours barcelona" has both "hotel" and "tours"
    expect(isLowIntentKeyword('hotel tours barcelona')).toBe(false);
  });

  it('rejects navigational intent', () => {
    expect(isLowIntentKeyword('opening hours colosseum')).toBe(true);
    expect(isLowIntentKeyword('how to get to eiffel tower')).toBe(true);
    expect(isLowIntentKeyword('directions to museum')).toBe(true);
  });

  it('rejects informational intent without commercial modifiers', () => {
    expect(isLowIntentKeyword('what is a fjord')).toBe(true);
    expect(isLowIntentKeyword('history of rome')).toBe(true);
    expect(isLowIntentKeyword('weather in paris')).toBe(true);
    expect(isLowIntentKeyword('visa requirements spain')).toBe(true);
  });

  it('allows informational keywords with commercial modifiers', () => {
    // "what is the best tour" has "what is" but also "tour"
    expect(isLowIntentKeyword('what is the best tour in rome')).toBe(false);
  });

  it('accepts valid multi-word commercial keywords', () => {
    expect(isLowIntentKeyword('boat tours barcelona')).toBe(false);
    expect(isLowIntentKeyword('food tour rome')).toBe(false);
    expect(isLowIntentKeyword('things to do in london')).toBe(false);
    expect(isLowIntentKeyword('skip the line colosseum tickets')).toBe(false);
  });
});

describe('hasCommercialIntent', () => {
  it('returns true for keywords with commercial modifiers', () => {
    expect(hasCommercialIntent('boat tours barcelona')).toBe(true);
    expect(hasCommercialIntent('skip the line tickets rome')).toBe(true);
    expect(hasCommercialIntent('cooking class florence')).toBe(true);
    expect(hasCommercialIntent('things to do in paris')).toBe(true);
    expect(hasCommercialIntent('kayaking tours split')).toBe(true);
  });

  it('returns false for keywords without commercial modifiers', () => {
    expect(hasCommercialIntent('barcelona nightlife')).toBe(false);
    expect(hasCommercialIntent('rome travel blog')).toBe(false);
  });

  it('returns false for low-intent keywords even with modifiers', () => {
    expect(hasCommercialIntent('free walking tour')).toBe(false);
    expect(hasCommercialIntent('opening hours museum tour')).toBe(false);
  });

  it('returns false for single-word keywords', () => {
    expect(hasCommercialIntent('tours')).toBe(false);
    expect(hasCommercialIntent('kayaking')).toBe(false);
  });
});

describe('getLowIntentPrismaConditions', () => {
  it('returns array of Prisma OR conditions', () => {
    const conditions = getLowIntentPrismaConditions();
    expect(conditions.length).toBeGreaterThan(0);
  });

  it('each condition has contains, startsWith, or endsWith pattern', () => {
    const conditions = getLowIntentPrismaConditions();
    for (const condition of conditions) {
      const keyword = condition['keyword'] as Record<string, unknown>;
      expect(keyword).toBeDefined();
      const hasPattern = 'contains' in keyword || 'startsWith' in keyword || 'endsWith' in keyword;
      expect(hasPattern, `Condition missing pattern: ${JSON.stringify(condition)}`).toBe(true);
    }
  });

  it('generates 3 patterns per term (contains, startsWith, endsWith)', () => {
    const conditions = getLowIntentPrismaConditions();
    // Should be divisible by 3
    expect(conditions.length % 3).toBe(0);
  });

  it('includes key low-intent terms', () => {
    const conditions = getLowIntentPrismaConditions();
    const allPatterns = conditions.map((c) => JSON.stringify(c)).join(' ');
    expect(allPatterns).toContain('free');
    expect(allPatterns).toContain('hotel');
    expect(allPatterns).toContain('opening hours');
    expect(allPatterns).toContain('weather');
  });
});
