import { describe, it, expect } from 'vitest';
import {
  MICROSITE_PARENT_DOMAINS,
  parseMicrositeHostname,
  isMicrositeSubdomain,
  buildMicrositeFullDomain,
} from '@/lib/microsite';

describe('microsite utilities', () => {
  describe('MICROSITE_PARENT_DOMAINS', () => {
    it('should include experiencess.com', () => {
      expect(MICROSITE_PARENT_DOMAINS).toContain('experiencess.com');
    });
  });

  describe('parseMicrositeHostname', () => {
    it('should detect a microsite subdomain on experiencess.com', () => {
      const result = parseMicrositeHostname('adventure-co.experiencess.com');
      expect(result).toEqual({
        isMicrositeSubdomain: true,
        subdomain: 'adventure-co',
        parentDomain: 'experiencess.com',
      });
    });

    it('should return false for the bare parent domain', () => {
      const result = parseMicrositeHostname('experiencess.com');
      expect(result).toEqual({
        isMicrositeSubdomain: false,
        subdomain: null,
        parentDomain: 'experiencess.com',
      });
    });

    it('should treat www as non-microsite subdomain', () => {
      const result = parseMicrositeHostname('www.experiencess.com');
      expect(result.isMicrositeSubdomain).toBe(false);
      expect(result.subdomain).toBeNull();
      // www triggers the "continue" in the subdomain check, skipping the bare-domain
      // match for this parent domain — so parentDomain ends up null
      expect(result.parentDomain).toBeNull();
    });

    it('should return null parentDomain for unrecognized domains', () => {
      const result = parseMicrositeHostname('london-tours.com');
      expect(result).toEqual({
        isMicrositeSubdomain: false,
        subdomain: null,
        parentDomain: null,
      });
    });

    it('should be case insensitive', () => {
      const result = parseMicrositeHostname('ADVENTURE-CO.EXPERIENCESS.COM');
      expect(result).toEqual({
        isMicrositeSubdomain: true,
        subdomain: 'adventure-co',
        parentDomain: 'experiencess.com',
      });
    });

    it('should strip port numbers before parsing', () => {
      const result = parseMicrositeHostname('adventure-co.experiencess.com:3000');
      expect(result).toEqual({
        isMicrositeSubdomain: true,
        subdomain: 'adventure-co',
        parentDomain: 'experiencess.com',
      });
    });
  });

  describe('isMicrositeSubdomain', () => {
    it('should return true for a valid microsite subdomain', () => {
      expect(isMicrositeSubdomain('foo.experiencess.com')).toBe(true);
    });

    it('should return false for the bare parent domain', () => {
      expect(isMicrositeSubdomain('experiencess.com')).toBe(false);
    });

    it('should return false for an unrelated domain', () => {
      expect(isMicrositeSubdomain('example.com')).toBe(false);
    });
  });

  describe('buildMicrositeFullDomain', () => {
    it('should combine subdomain and parent domain', () => {
      expect(buildMicrositeFullDomain('adventure-co', 'experiencess.com')).toBe(
        'adventure-co.experiencess.com'
      );
    });
  });
});
