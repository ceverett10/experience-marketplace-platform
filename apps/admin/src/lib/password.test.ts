import { describe, it, expect } from 'vitest';
import { validatePassword } from './password';

describe('validatePassword', () => {
  it('accepts a strong password', () => {
    const result = validatePassword('MyStr0ng!Pass');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects passwords shorter than 12 characters', () => {
    const result = validatePassword('Sh0rt!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Must be at least 12 characters');
  });

  it('rejects passwords without uppercase letters', () => {
    const result = validatePassword('alllowercase1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Must contain at least one uppercase letter');
  });

  it('rejects passwords without lowercase letters', () => {
    const result = validatePassword('ALLUPPERCASE1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Must contain at least one lowercase letter');
  });

  it('rejects passwords without numbers', () => {
    const result = validatePassword('NoNumbersHere!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Must contain at least one number');
  });

  it('rejects passwords without special characters', () => {
    const result = validatePassword('NoSpecials123A');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Must contain at least one special character');
  });

  it('returns multiple errors for very weak passwords', () => {
    const result = validatePassword('abc');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('accepts exactly 12-character passwords meeting all criteria', () => {
    const result = validatePassword('Abcdefgh1!23');
    expect(result.valid).toBe(true);
  });
});
