import { describe, it, expect, vi } from 'vitest';
import {
  slugify,
  generateId,
  truncate,
  formatCurrency,
  delay,
  withRetry,
  isDefined,
  safeJsonParse,
  groupBy,
  extractDomain,
} from './index.js';

describe('slugify', () => {
  it('should convert text to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should replace spaces with hyphens', () => {
    expect(slugify('foo bar baz')).toBe('foo-bar-baz');
  });

  it('should remove special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('should handle multiple spaces and hyphens', () => {
    expect(slugify('foo   bar---baz')).toBe('foo-bar-baz');
  });

  it('should trim leading and trailing hyphens', () => {
    expect(slugify('  hello world  ')).toBe('hello-world');
  });
});

describe('generateId', () => {
  it('should generate a valid UUID v4 format', () => {
    const id = generateId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(id).toMatch(uuidRegex);
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('truncate', () => {
  it('should not truncate short text', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should truncate long text with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('should handle exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('formatCurrency', () => {
  it('should format GBP by default', () => {
    expect(formatCurrency(100)).toBe('£100.00');
  });

  it('should format USD when specified', () => {
    expect(formatCurrency(100, 'USD')).toBe('US$100.00');
  });

  it('should handle decimal amounts', () => {
    expect(formatCurrency(99.99)).toBe('£99.99');
  });
});

describe('delay', () => {
  it('should delay execution', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});

describe('withRetry', () => {
  it('should return on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));

    await expect(withRetry(fn, { maxAttempts: 2, initialDelay: 10 })).rejects.toThrow(
      'always fail'
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('isDefined', () => {
  it('should return true for defined values', () => {
    expect(isDefined('hello')).toBe(true);
    expect(isDefined(0)).toBe(true);
    expect(isDefined(false)).toBe(true);
    expect(isDefined([])).toBe(true);
  });

  it('should return false for null and undefined', () => {
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    expect(safeJsonParse('{"foo": "bar"}', {})).toEqual({ foo: 'bar' });
  });

  it('should return fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', { default: true })).toEqual({ default: true });
  });
});

describe('groupBy', () => {
  it('should group items by key', () => {
    const items = [
      { type: 'a', value: 1 },
      { type: 'b', value: 2 },
      { type: 'a', value: 3 },
    ];

    const result = groupBy(items, (item) => item.type);
    expect(result).toEqual({
      a: [
        { type: 'a', value: 1 },
        { type: 'a', value: 3 },
      ],
      b: [{ type: 'b', value: 2 }],
    });
  });
});

describe('extractDomain', () => {
  it('should extract domain from URL', () => {
    expect(extractDomain('https://example.com/path')).toBe('example.com');
  });

  it('should handle subdomains', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('www.example.com');
  });

  it('should return input for invalid URLs', () => {
    expect(extractDomain('not-a-url')).toBe('not-a-url');
  });
});
