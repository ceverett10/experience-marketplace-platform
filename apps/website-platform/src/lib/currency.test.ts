import { describe, it, expect } from 'vitest';
import {
  countryToCurrency,
  isSupportedCurrency,
  currencyToLocale,
  getEffectiveCurrency,
  SUPPORTED_CURRENCIES,
  CURRENCY_COOKIE,
} from './currency';

describe('currency utilities', () => {
  describe('CURRENCY_COOKIE', () => {
    it('has the expected cookie name', () => {
      expect(CURRENCY_COOKIE).toBe('preferred_currency');
    });
  });

  describe('SUPPORTED_CURRENCIES', () => {
    it('includes GBP, EUR, and USD', () => {
      expect(SUPPORTED_CURRENCIES).toContain('GBP');
      expect(SUPPORTED_CURRENCIES).toContain('EUR');
      expect(SUPPORTED_CURRENCIES).toContain('USD');
    });
  });

  describe('countryToCurrency', () => {
    it('returns GBP for UK countries', () => {
      expect(countryToCurrency('GB')).toBe('GBP');
      expect(countryToCurrency('IM')).toBe('GBP');
      expect(countryToCurrency('JE')).toBe('GBP');
      expect(countryToCurrency('GG')).toBe('GBP');
      expect(countryToCurrency('GI')).toBe('GBP');
    });

    it('returns USD for US territories', () => {
      expect(countryToCurrency('US')).toBe('USD');
      expect(countryToCurrency('PR')).toBe('USD');
      expect(countryToCurrency('GU')).toBe('USD');
      expect(countryToCurrency('VI')).toBe('USD');
    });

    it('returns EUR for Eurozone countries', () => {
      expect(countryToCurrency('DE')).toBe('EUR');
      expect(countryToCurrency('FR')).toBe('EUR');
      expect(countryToCurrency('ES')).toBe('EUR');
      expect(countryToCurrency('IT')).toBe('EUR');
      expect(countryToCurrency('NL')).toBe('EUR');
      expect(countryToCurrency('HR')).toBe('EUR');
    });

    it('returns GBP for unmapped countries', () => {
      expect(countryToCurrency('JP')).toBe('GBP');
      expect(countryToCurrency('AU')).toBe('GBP');
      expect(countryToCurrency('BR')).toBe('GBP');
    });

    it('returns GBP for null', () => {
      expect(countryToCurrency(null)).toBe('GBP');
    });

    it('is case-insensitive', () => {
      expect(countryToCurrency('gb')).toBe('GBP');
      expect(countryToCurrency('us')).toBe('USD');
      expect(countryToCurrency('de')).toBe('EUR');
    });
  });

  describe('isSupportedCurrency', () => {
    it('returns true for supported currencies', () => {
      expect(isSupportedCurrency('GBP')).toBe(true);
      expect(isSupportedCurrency('EUR')).toBe(true);
      expect(isSupportedCurrency('USD')).toBe(true);
    });

    it('returns false for unsupported currencies', () => {
      expect(isSupportedCurrency('JPY')).toBe(false);
      expect(isSupportedCurrency('AUD')).toBe(false);
      expect(isSupportedCurrency('')).toBe(false);
      expect(isSupportedCurrency('gbp')).toBe(false);
    });
  });

  describe('currencyToLocale', () => {
    it('maps GBP to en-GB', () => {
      expect(currencyToLocale('GBP')).toBe('en-GB');
    });

    it('maps EUR to en-IE', () => {
      expect(currencyToLocale('EUR')).toBe('en-IE');
    });

    it('maps USD to en-US', () => {
      expect(currencyToLocale('USD')).toBe('en-US');
    });

    it('falls back to en-GB for unknown currencies', () => {
      expect(currencyToLocale('JPY')).toBe('en-GB');
      expect(currencyToLocale('AUD')).toBe('en-GB');
    });
  });

  describe('getEffectiveCurrency', () => {
    it('returns cookie value when it is a valid supported currency', () => {
      expect(getEffectiveCurrency('GBP', 'EUR')).toBe('EUR');
      expect(getEffectiveCurrency('GBP', 'USD')).toBe('USD');
    });

    it('returns site primary currency when cookie is undefined', () => {
      expect(getEffectiveCurrency('EUR', undefined)).toBe('EUR');
    });

    it('returns site primary currency when cookie is invalid', () => {
      expect(getEffectiveCurrency('EUR', 'JPY')).toBe('EUR');
      expect(getEffectiveCurrency('EUR', '')).toBe('EUR');
      expect(getEffectiveCurrency('EUR', 'invalid')).toBe('EUR');
    });

    it('returns GBP when both site currency and cookie are empty', () => {
      expect(getEffectiveCurrency('', undefined)).toBe('GBP');
    });
  });
});
