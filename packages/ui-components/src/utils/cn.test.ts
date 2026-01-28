import { describe, it, expect } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  describe('basic functionality', () => {
    it('should return empty string for no arguments', () => {
      expect(cn()).toBe('');
    });

    it('should return single class unchanged', () => {
      expect(cn('foo')).toBe('foo');
    });

    it('should merge multiple classes', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle undefined values', () => {
      expect(cn('foo', undefined, 'bar')).toBe('foo bar');
    });

    it('should handle null values', () => {
      expect(cn('foo', null, 'bar')).toBe('foo bar');
    });

    it('should handle false values', () => {
      expect(cn('foo', false, 'bar')).toBe('foo bar');
    });

    it('should handle empty strings', () => {
      expect(cn('foo', '', 'bar')).toBe('foo bar');
    });
  });

  describe('conditional classes', () => {
    it('should handle conditional object syntax', () => {
      expect(cn({ foo: true, bar: false })).toBe('foo');
    });

    it('should handle mixed string and object syntax', () => {
      expect(cn('base', { active: true, disabled: false })).toBe('base active');
    });

    it('should handle array syntax', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar');
    });

    it('should handle nested arrays', () => {
      expect(cn(['foo', ['bar', 'baz']])).toBe('foo bar baz');
    });
  });

  describe('Tailwind class merging', () => {
    it('should merge conflicting padding classes', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
    });

    it('should merge conflicting margin classes', () => {
      expect(cn('m-4', 'm-2')).toBe('m-2');
    });

    it('should merge conflicting text size classes', () => {
      expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    });

    it('should merge conflicting background classes', () => {
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    });

    it('should merge conflicting width classes', () => {
      expect(cn('w-full', 'w-1/2')).toBe('w-1/2');
    });

    it('should merge conflicting height classes', () => {
      expect(cn('h-10', 'h-20')).toBe('h-20');
    });

    it('should preserve non-conflicting classes', () => {
      expect(cn('p-4', 'm-2', 'text-red-500')).toBe('p-4 m-2 text-red-500');
    });

    it('should handle responsive prefixes', () => {
      expect(cn('md:p-4', 'md:p-6')).toBe('md:p-6');
    });

    it('should keep different responsive breakpoints', () => {
      expect(cn('sm:p-2', 'md:p-4', 'lg:p-6')).toBe('sm:p-2 md:p-4 lg:p-6');
    });

    it('should handle hover states', () => {
      expect(cn('hover:bg-red-500', 'hover:bg-blue-500')).toBe('hover:bg-blue-500');
    });

    it('should handle focus states', () => {
      expect(cn('focus:ring-2', 'focus:ring-4')).toBe('focus:ring-4');
    });
  });

  describe('real-world usage patterns', () => {
    it('should handle button variant pattern', () => {
      const baseClasses = 'px-4 py-2 rounded font-medium';
      const variant = 'bg-blue-500 text-white';
      const override = 'px-6';

      expect(cn(baseClasses, variant, override)).toBe(
        'py-2 rounded font-medium bg-blue-500 text-white px-6'
      );
    });

    it('should handle conditional disabled state', () => {
      const isDisabled = true;
      const classes = cn('btn', isDisabled && 'opacity-50 cursor-not-allowed');

      expect(classes).toBe('btn opacity-50 cursor-not-allowed');
    });

    it('should handle conditional active state', () => {
      const isActive = false;
      const classes = cn('nav-item', isActive && 'bg-primary text-white');

      expect(classes).toBe('nav-item');
    });

    it('should handle card component pattern', () => {
      const classes = cn('rounded-lg border bg-card text-card-foreground shadow-sm', 'p-6', {
        'border-red-500': false,
        'border-green-500': true,
      });

      expect(classes).toBe(
        'rounded-lg border bg-card text-card-foreground shadow-sm p-6 border-green-500'
      );
    });
  });
});
