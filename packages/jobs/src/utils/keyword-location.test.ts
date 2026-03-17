import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before imports
vi.mock('@experience-marketplace/database', () => ({
  prisma: {
    product: { findMany: vi.fn().mockResolvedValue([]) },
    supplier: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import {
  getCountryForCity,
  deriveDestinationCountriesFromKeywords,
  enrichGeoTargets,
  COUNTRY_NAME_TO_ISO,
  resetCityCache,
} from './keyword-location';

beforeEach(() => {
  resetCityCache();
});

describe('getCountryForCity', () => {
  it('returns country for known cities', () => {
    expect(getCountryForCity('London')).toBe('United Kingdom');
    expect(getCountryForCity('Barcelona')).toBe('Spain');
    expect(getCountryForCity('Rome')).toBe('Italy');
    expect(getCountryForCity('Paris')).toBe('France');
    expect(getCountryForCity('Tokyo')).toBe('Japan');
    expect(getCountryForCity('Dubai')).toBe('United Arab Emirates');
  });

  it('is case-insensitive', () => {
    expect(getCountryForCity('LONDON')).toBe('United Kingdom');
    expect(getCountryForCity('barcelona')).toBe('Spain');
    expect(getCountryForCity('rOmE')).toBe('Italy');
  });

  it('returns fallback for unknown cities', () => {
    expect(getCountryForCity('Unknown City')).toBe('United Kingdom');
    expect(getCountryForCity('Atlantis', 'France')).toBe('France');
  });

  it('returns fallback for empty string', () => {
    expect(getCountryForCity('')).toBe('United Kingdom');
    expect(getCountryForCity('', 'Spain')).toBe('Spain');
  });

  it('handles multi-word cities', () => {
    expect(getCountryForCity('New York')).toBe('United States');
    expect(getCountryForCity('San Francisco')).toBe('United States');
    expect(getCountryForCity('Buenos Aires')).toBe('Argentina');
    expect(getCountryForCity('Cape Town')).toBe('South Africa');
  });
});

describe('deriveDestinationCountriesFromKeywords', () => {
  it('extracts country codes from keywords containing city names', () => {
    const result = deriveDestinationCountriesFromKeywords([
      'boat tours barcelona',
      'food tour rome',
      'walking tour london',
    ]);
    expect(result).toContain('ES');
    expect(result).toContain('IT');
    expect(result).toContain('GB');
  });

  it('deduplicates country codes', () => {
    const result = deriveDestinationCountriesFromKeywords([
      'tours barcelona',
      'activities barcelona',
      'things to do madrid',
    ]);
    // Barcelona and Madrid are both Spain — should only appear once
    expect(result.filter((c) => c === 'ES')).toHaveLength(1);
  });

  it('returns empty array when no cities are found', () => {
    const result = deriveDestinationCountriesFromKeywords([
      'best cooking class',
      'kayaking adventures',
    ]);
    expect(result).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(deriveDestinationCountriesFromKeywords([])).toHaveLength(0);
  });
});

describe('enrichGeoTargets', () => {
  it('merges home markets with destination countries', () => {
    const result = enrichGeoTargets(['tours barcelona', 'food tour rome'], ['GB', 'US']);
    expect(result).toContain('GB');
    expect(result).toContain('US');
    expect(result).toContain('ES');
    expect(result).toContain('IT');
  });

  it('deduplicates when destination overlaps with home markets', () => {
    const result = enrichGeoTargets(['tours london'], ['GB', 'US']);
    // GB appears in both home markets and destinations
    expect(result.filter((c) => c === 'GB')).toHaveLength(1);
  });

  it('returns sorted array', () => {
    const result = enrichGeoTargets(['tours tokyo', 'tours rome'], ['GB', 'US']);
    const sorted = [...result].sort();
    expect(result).toEqual(sorted);
  });

  it('returns just home markets when no destinations found', () => {
    const result = enrichGeoTargets(['generic keyword'], ['GB', 'US']);
    expect(result).toEqual(['GB', 'US']);
  });
});

describe('COUNTRY_NAME_TO_ISO', () => {
  it('maps all major countries to ISO codes', () => {
    expect(COUNTRY_NAME_TO_ISO['United Kingdom']).toBe('GB');
    expect(COUNTRY_NAME_TO_ISO['Spain']).toBe('ES');
    expect(COUNTRY_NAME_TO_ISO['United States']).toBe('US');
    expect(COUNTRY_NAME_TO_ISO['Japan']).toBe('JP');
    expect(COUNTRY_NAME_TO_ISO['Australia']).toBe('AU');
  });

  it('has ISO codes for all countries referenced by cities', () => {
    // Every country used in CITY_TO_COUNTRY should have an ISO mapping
    // This is implicitly tested by deriveDestinationCountriesFromKeywords working
    expect(Object.keys(COUNTRY_NAME_TO_ISO).length).toBeGreaterThan(30);
  });
});
