import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type NextRequest, NextResponse } from 'next/server';

// We test the middleware function directly
// Need to mock NextResponse.next() to return a response-like object
const mockCookiesSet = vi.fn();
const mockHeadersSet = vi.fn();

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    NextResponse: {
      next: vi.fn(() => ({
        cookies: {
          set: mockCookiesSet,
        },
        headers: {
          set: mockHeadersSet,
        },
      })),
    },
  };
});

function createMockRequest(options: {
  host?: string;
  forwardedHost?: string;
  pathname?: string;
  searchParams?: Record<string, string>;
  referer?: string;
  cookies?: Record<string, string>;
}): NextRequest {
  const url = new URL(`http://${options.host || 'localhost'}${options.pathname || '/'}`);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers();
  if (options.host) headers.set('host', options.host);
  if (options.forwardedHost) headers.set('x-forwarded-host', options.forwardedHost);
  if (options.referer) headers.set('referer', options.referer);

  const cookieEntries = options.cookies || {};

  return {
    headers,
    nextUrl: url,
    cookies: {
      get: (name: string) => {
        const value = cookieEntries[name];
        return value ? { value } : undefined;
      },
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Mock crypto.randomUUID
  vi.stubGlobal('crypto', {
    randomUUID: () => 'test-uuid-1234-5678',
  });
});

describe('Middleware', () => {
  describe('Site identification', () => {
    it('sets site ID cookie from hostname', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'london-tours.com' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'x-site-id',
        expect.any(String),
        expect.objectContaining({ httpOnly: true, path: '/' })
      );
    });

    it('sets x-site-id header', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'london-tours.com' });
      middleware(request);
      expect(mockHeadersSet).toHaveBeenCalledWith('x-site-id', expect.any(String));
    });

    it('uses x-forwarded-host over host header', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'internal.herokuapp.com',
        forwardedHost: 'london-tours.com',
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'x-site-id',
        'london-tours.com',
        expect.any(Object)
      );
    });

    it('returns "default" for localhost', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'localhost:3000' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith('x-site-id', 'default', expect.any(Object));
    });

    it('returns "default" for 127.0.0.1', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: '127.0.0.1:3000' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith('x-site-id', 'default', expect.any(Object));
    });

    it('returns "default" for vercel preview without subdomain', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'my-app.vercel.app' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith('x-site-id', 'default', expect.any(Object));
    });

    it('extracts subdomain from vercel preview URL', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'london-tours--preview.vercel.app' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith('x-site-id', 'london-tours', expect.any(Object));
    });

    it('extracts subdomain from base domain', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'london-tours.experience-marketplace.com',
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith('x-site-id', 'london-tours', expect.any(Object));
    });

    it('uses full hostname for custom domains', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'my-brand.com' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith('x-site-id', 'my-brand.com', expect.any(Object));
    });

    it('strips www prefix', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'www.london-tours.com' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'x-site-id',
        'london-tours.com',
        expect.any(Object)
      );
    });
  });

  describe('UTM tracking', () => {
    it('captures utm_source in cookie', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        searchParams: {
          utm_source: 'google',
          utm_medium: 'cpc',
          utm_campaign: 'summer',
        },
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'utm_params',
        expect.stringContaining('google'),
        expect.objectContaining({ maxAge: 1800 })
      );
    });

    it('captures gclid (Google Ads click ID)', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        searchParams: { gclid: 'abc123' },
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'utm_params',
        expect.stringContaining('abc123'),
        expect.any(Object)
      );
    });

    it('captures fbclid (Meta Ads click ID)', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        searchParams: { fbclid: 'fb-click-123' },
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'utm_params',
        expect.stringContaining('fb-click-123'),
        expect.any(Object)
      );
    });

    it('does not set utm cookie when no UTM params present', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'test.com' });
      middleware(request);
      const utmCalls = mockCookiesSet.mock.calls.filter(
        (call: unknown[]) => call[0] === 'utm_params'
      );
      expect(utmCalls).toHaveLength(0);
    });

    it('utm cookie is not httpOnly (readable by checkout)', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        searchParams: { utm_source: 'google' },
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'utm_params',
        expect.any(String),
        expect.objectContaining({ httpOnly: false })
      );
    });

    it('includes landing page path in UTM data', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        pathname: '/experiences',
        searchParams: { utm_source: 'google' },
      });
      middleware(request);
      const utmCall = mockCookiesSet.mock.calls.find((call: unknown[]) => call[0] === 'utm_params');
      const utmData = JSON.parse(utmCall?.[1] || '{}');
      expect(utmData.landingPage).toBe('/experiences');
    });
  });

  describe('AI referral detection', () => {
    it('detects ChatGPT referral', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        referer: 'https://chat.openai.com/c/12345',
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'ai_referral_source',
        'chatgpt',
        expect.any(Object)
      );
      expect(mockHeadersSet).toHaveBeenCalledWith('x-ai-referral', 'chatgpt');
    });

    it('detects chatgpt.com referral', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        referer: 'https://chatgpt.com/share/abc',
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'ai_referral_source',
        'chatgpt',
        expect.any(Object)
      );
    });

    it('detects Perplexity referral', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        referer: 'https://perplexity.ai/search/12345',
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'ai_referral_source',
        'perplexity',
        expect.any(Object)
      );
    });

    it('detects Claude referral', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        referer: 'https://claude.ai/chat/12345',
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'ai_referral_source',
        'claude',
        expect.any(Object)
      );
    });

    it('detects Gemini referral', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        referer: 'https://gemini.google.com/app/12345',
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'ai_referral_source',
        'gemini',
        expect.any(Object)
      );
    });

    it('does not set AI referral for regular referers', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        referer: 'https://www.google.com/search?q=test',
      });
      middleware(request);
      const aiCalls = mockCookiesSet.mock.calls.filter(
        (call: unknown[]) => call[0] === 'ai_referral_source'
      );
      expect(aiCalls).toHaveLength(0);
    });

    it('handles invalid referer URL gracefully', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        referer: 'not-a-valid-url',
      });
      // Should not throw
      expect(() => middleware(request)).not.toThrow();
    });

    it('AI referral cookie is not httpOnly (readable by GA4)', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        referer: 'https://claude.ai/chat/123',
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'ai_referral_source',
        'claude',
        expect.objectContaining({ httpOnly: false })
      );
    });
  });

  describe('Funnel session tracking', () => {
    it('creates new funnel session when none exists', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'test.com' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'funnel_session',
        'test-uuid-1234-5678',
        expect.objectContaining({ maxAge: 1800 })
      );
    });

    it('reuses existing funnel session', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({
        host: 'test.com',
        cookies: { funnel_session: 'existing-session-id' },
      });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'funnel_session',
        'existing-session-id',
        expect.objectContaining({ maxAge: 1800 })
      );
    });

    it('funnel session has 30-minute maxAge', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'test.com' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'funnel_session',
        expect.any(String),
        expect.objectContaining({ maxAge: 60 * 30 })
      );
    });

    it('funnel session cookie is httpOnly', async () => {
      const { middleware } = await import('@/middleware');
      const request = createMockRequest({ host: 'test.com' });
      middleware(request);
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'funnel_session',
        expect.any(String),
        expect.objectContaining({ httpOnly: true })
      );
    });
  });

  describe('Config matcher', () => {
    it('exports config with matcher', async () => {
      const { config } = await import('@/middleware');
      expect(config).toBeDefined();
      expect(config.matcher).toBeDefined();
      expect(Array.isArray(config.matcher)).toBe(true);
    });

    it('matcher excludes _next/static', async () => {
      const { config } = await import('@/middleware');
      const pattern = config.matcher[0];
      expect(pattern).toContain('_next/static');
    });

    it('matcher excludes _next/image', async () => {
      const { config } = await import('@/middleware');
      const pattern = config.matcher[0];
      expect(pattern).toContain('_next/image');
    });

    it('matcher excludes favicon.ico', async () => {
      const { config } = await import('@/middleware');
      const pattern = config.matcher[0];
      expect(pattern).toContain('favicon.ico');
    });

    it('matcher excludes api/health', async () => {
      const { config } = await import('@/middleware');
      const pattern = config.matcher[0];
      expect(pattern).toContain('api/health');
    });
  });
});
