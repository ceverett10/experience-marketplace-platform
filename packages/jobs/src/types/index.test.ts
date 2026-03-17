import { describe, it, expect } from 'vitest';
import { QUEUE_NAMES, JOB_TYPE_TO_QUEUE } from './index';

describe('QUEUE_NAMES', () => {
  it('defines all expected queues', () => {
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

  it('has 11 queues', () => {
    expect(Object.keys(QUEUE_NAMES)).toHaveLength(11);
  });
});

describe('JOB_TYPE_TO_QUEUE', () => {
  it('every job type maps to a valid queue name', () => {
    const validQueues = new Set(Object.values(QUEUE_NAMES));
    for (const [jobType, queue] of Object.entries(JOB_TYPE_TO_QUEUE)) {
      expect(validQueues.has(queue), `${jobType} maps to invalid queue "${queue}"`).toBe(true);
    }
  });

  it('content jobs map to CONTENT queue', () => {
    expect(JOB_TYPE_TO_QUEUE.CONTENT_GENERATE).toBe('content');
    expect(JOB_TYPE_TO_QUEUE.CONTENT_OPTIMIZE).toBe('content');
    expect(JOB_TYPE_TO_QUEUE.CONTENT_REVIEW).toBe('content');
  });

  it('content fanout jobs map to CONTENT queue', () => {
    expect(JOB_TYPE_TO_QUEUE.CONTENT_BLOG_FANOUT).toBe('content');
    expect(JOB_TYPE_TO_QUEUE.CONTENT_FAQ_FANOUT).toBe('content');
    expect(JOB_TYPE_TO_QUEUE.CONTENT_REFRESH_FANOUT).toBe('content');
    expect(JOB_TYPE_TO_QUEUE.CONTENT_DESTINATION_FANOUT).toBe('content');
    expect(JOB_TYPE_TO_QUEUE.CONTENT_COMPARISON_FANOUT).toBe('content');
    expect(JOB_TYPE_TO_QUEUE.CONTENT_SEASONAL_FANOUT).toBe('content');
    expect(JOB_TYPE_TO_QUEUE.CONTENT_GUIDES_FANOUT).toBe('content');
  });

  it('SEO jobs map to SEO queue', () => {
    expect(JOB_TYPE_TO_QUEUE.SEO_ANALYZE).toBe('seo');
    expect(JOB_TYPE_TO_QUEUE.SEO_AUTO_OPTIMIZE).toBe('seo');
    expect(JOB_TYPE_TO_QUEUE.SEO_OPPORTUNITY_SCAN).toBe('seo');
    expect(JOB_TYPE_TO_QUEUE.SEO_OPPORTUNITY_OPTIMIZE).toBe('seo');
  });

  it('GSC jobs map to GSC queue', () => {
    expect(JOB_TYPE_TO_QUEUE.GSC_SYNC).toBe('gsc');
    expect(JOB_TYPE_TO_QUEUE.GSC_VERIFY).toBe('gsc');
    expect(JOB_TYPE_TO_QUEUE.GSC_SETUP).toBe('gsc');
  });

  it('paid traffic jobs map to ADS queue', () => {
    expect(JOB_TYPE_TO_QUEUE.AD_CAMPAIGN_SYNC).toBe('ads');
    expect(JOB_TYPE_TO_QUEUE.AD_PERFORMANCE_REPORT).toBe('ads');
    expect(JOB_TYPE_TO_QUEUE.AD_BUDGET_OPTIMIZER).toBe('ads');
    expect(JOB_TYPE_TO_QUEUE.AD_CONVERSION_UPLOAD).toBe('ads');
    expect(JOB_TYPE_TO_QUEUE.PAID_KEYWORD_SCAN).toBe('ads');
    expect(JOB_TYPE_TO_QUEUE.BIDDING_ENGINE_RUN).toBe('ads');
  });

  it('KEYWORD_ENRICHMENT maps to SYNC queue (long-running)', () => {
    expect(JOB_TYPE_TO_QUEUE.KEYWORD_ENRICHMENT).toBe('sync');
  });

  it('MICROSITE_CONTENT_GENERATE maps to CONTENT queue (not MICROSITE)', () => {
    expect(JOB_TYPE_TO_QUEUE.MICROSITE_CONTENT_GENERATE).toBe('content');
  });

  it('other microsite jobs map to MICROSITE queue', () => {
    expect(JOB_TYPE_TO_QUEUE.MICROSITE_CREATE).toBe('microsite');
    expect(JOB_TYPE_TO_QUEUE.MICROSITE_BRAND_GENERATE).toBe('microsite');
    expect(JOB_TYPE_TO_QUEUE.MICROSITE_PUBLISH).toBe('microsite');
    expect(JOB_TYPE_TO_QUEUE.MICROSITE_ARCHIVE).toBe('microsite');
    expect(JOB_TYPE_TO_QUEUE.MICROSITE_HEALTH_CHECK).toBe('microsite');
  });

  it('sync jobs map to SYNC queue', () => {
    expect(JOB_TYPE_TO_QUEUE.SUPPLIER_SYNC).toBe('sync');
    expect(JOB_TYPE_TO_QUEUE.PRODUCT_SYNC).toBe('sync');
    expect(JOB_TYPE_TO_QUEUE.BULK_PRODUCT_SYNC).toBe('sync');
    expect(JOB_TYPE_TO_QUEUE.SUPPLIER_ENRICH).toBe('sync');
  });

  it('social jobs map to SOCIAL queue', () => {
    expect(JOB_TYPE_TO_QUEUE.SOCIAL_POST_GENERATE).toBe('social');
    expect(JOB_TYPE_TO_QUEUE.SOCIAL_POST_PUBLISH).toBe('social');
    expect(JOB_TYPE_TO_QUEUE.SOCIAL_DAILY_POSTING).toBe('social');
  });

  it('link building jobs map to SEO queue', () => {
    expect(JOB_TYPE_TO_QUEUE.LINK_OPPORTUNITY_SCAN).toBe('seo');
    expect(JOB_TYPE_TO_QUEUE.LINK_BACKLINK_MONITOR).toBe('seo');
    expect(JOB_TYPE_TO_QUEUE.LINK_OUTREACH_GENERATE).toBe('seo');
    expect(JOB_TYPE_TO_QUEUE.CROSS_SITE_LINK_ENRICHMENT).toBe('seo');
  });
});
