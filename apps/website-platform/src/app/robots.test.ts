import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => {
        if (key === 'host') return 'test.example.com';
        return null;
      }),
    })
  ),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockResolvedValue({
    id: 'site-1',
    name: 'Test Site',
    primaryDomain: 'test.example.com',
  }),
}));

import robots from './robots';

describe('robots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sitemap URL using primary domain', async () => {
    const result = await robots();
    expect(result.sitemap).toBe('https://test.example.com/sitemap.xml');
  });

  it('allows all crawlers on /', async () => {
    const result = await robots();
    const rules = (Array.isArray(result.rules) ? result.rules : [result.rules]) as Array<{ userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }>;
    const wildcardRule = rules.find(
      (r) => r.userAgent === '*'
    );
    expect(wildcardRule).toBeDefined();
    expect((wildcardRule as any).allow).toBe('/');
  });

  it('disallows /api/ and /admin/ for all crawlers', async () => {
    const result = await robots();
    const rules = (Array.isArray(result.rules) ? result.rules : [result.rules]) as Array<{ userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }>;
    const wildcardRule = rules.find(
      (r) => r.userAgent === '*'
    ) as any;
    expect(wildcardRule.disallow).toContain('/api/');
    expect(wildcardRule.disallow).toContain('/admin/');
  });

  it('disallows checkout and booking for general crawler', async () => {
    const result = await robots();
    const rules = (Array.isArray(result.rules) ? result.rules : [result.rules]) as Array<{ userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }>;
    const wildcardRule = rules.find(
      (r) => r.userAgent === '*'
    ) as any;
    expect(wildcardRule.disallow).toContain('/checkout/');
    expect(wildcardRule.disallow).toContain('/booking/');
  });

  it('allows AI search bots (ChatGPT, Perplexity, Claude)', async () => {
    const result = await robots();
    const rules = (Array.isArray(result.rules) ? result.rules : [result.rules]) as Array<{ userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }>;
    const aiBots = ['ChatGPT-User', 'OAI-SearchBot', 'PerplexityBot', 'Claude-User', 'Claude-SearchBot'];

    for (const bot of aiBots) {
      const rule = rules.find(
        (r) => r.userAgent === bot
      ) as any;
      expect(rule, `Missing rule for ${bot}`).toBeDefined();
      expect(rule.allow).toBe('/');
    }
  });

  it('blocks AI training/scraping bots', async () => {
    const result = await robots();
    const rules = (Array.isArray(result.rules) ? result.rules : [result.rules]) as Array<{ userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }>;
    const blockedBots = ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'CCBot', 'Meta-ExternalAgent', 'Bytespider'];

    for (const bot of blockedBots) {
      const rule = rules.find(
        (r) => r.userAgent === bot
      ) as any;
      expect(rule, `Missing rule for ${bot}`).toBeDefined();
      expect(rule.disallow).toContain('/');
    }
  });

  it('has Googlebot-specific rules', async () => {
    const result = await robots();
    const rules = (Array.isArray(result.rules) ? result.rules : [result.rules]) as Array<{ userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }>;
    const googlebotRule = rules.find(
      (r) => r.userAgent === 'Googlebot'
    ) as any;
    expect(googlebotRule).toBeDefined();
    expect(googlebotRule.allow).toBe('/');
    expect(googlebotRule.disallow).toContain('/api/');
    expect(googlebotRule.disallow).toContain('/admin/');
    // Googlebot should NOT block checkout/booking (for indexing)
    expect(googlebotRule.disallow).not.toContain('/checkout/');
  });
});
