import { describe, it, expect } from 'vitest';
import { QUEUE_NAMES } from './types';

describe('Jobs Package', () => {
  describe('Queue Names', () => {
    it('should have correct queue names defined', () => {
      expect(QUEUE_NAMES.CONTENT).toBe('content');
      expect(QUEUE_NAMES.SEO).toBe('seo');
      expect(QUEUE_NAMES.GSC).toBe('gsc');
      expect(QUEUE_NAMES.SITE).toBe('site');
      expect(QUEUE_NAMES.DOMAIN).toBe('domain');
      expect(QUEUE_NAMES.ANALYTICS).toBe('analytics');
      expect(QUEUE_NAMES.ABTEST).toBe('abtest');
      expect(QUEUE_NAMES.SYNC).toBe('sync');
      expect(QUEUE_NAMES.MICROSITE).toBe('microsite');
      expect(QUEUE_NAMES.SOCIAL).toBe('social');
      expect(QUEUE_NAMES.ADS).toBe('ads');
    });

    it('should have 11 queue names', () => {
      const queueNames = Object.keys(QUEUE_NAMES);
      expect(queueNames).toHaveLength(11);
    });
  });
});
