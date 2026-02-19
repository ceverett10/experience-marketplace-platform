import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, config } from './middleware';

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure NODE_ENV is not 'production' so secure flag stays false in tests
    vi.stubEnv('NODE_ENV', 'test');
  });

  function createRequest(
    url: string,
    options: {
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
    } = {}
  ): NextRequest {
    const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
      headers: new Headers(options.headers || {}),
    });
    if (options.cookies) {
      for (const [name, value] of Object.entries(options.cookies)) {
        req.cookies.set(name, value);
      }
    }
    return req;
  }

  // --- Site identification ---

  describe('site identification', () => {
    it('extracts hostname from x-forwarded-host header', () => {
      const req = createRequest('/', {
        headers: {
          'x-forwarded-host': 'london-tours.example.com',
          host: 'internal-host.herokuapp.com',
        },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('london-tours.example.com');
    });

    it('falls back to host header when x-forwarded-host is missing', () => {
      const req = createRequest('/', {
        headers: { host: 'my-site.example.com' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('my-site.example.com');
    });

    it('strips port from hostname', () => {
      const req = createRequest('/', {
        headers: { host: 'localhost:3000' },
      });
      const res = middleware(req);
      // localhost -> 'default'
      expect(res.headers.get('x-site-id')).toBe('default');
    });

    it('strips www prefix from hostname', () => {
      const req = createRequest('/', {
        headers: { host: 'www.london-tours.com' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('london-tours.com');
    });

    it('strips both www and port', () => {
      const req = createRequest('/', {
        headers: { host: 'www.london-tours.com:443' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('london-tours.com');
    });

    it('returns "default" for localhost', () => {
      const req = createRequest('/', {
        headers: { host: 'localhost' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('default');
    });

    it('returns "default" for 127.0.0.1', () => {
      const req = createRequest('/', {
        headers: { host: '127.0.0.1:3000' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('default');
    });

    it('returns "default" for Vercel preview URLs', () => {
      const req = createRequest('/', {
        headers: { host: 'my-app.vercel.app' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('default');
    });

    it('extracts subdomain from Vercel preview URL with double-dash', () => {
      const req = createRequest('/', {
        headers: { host: 'london-tours--preview.vercel.app' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('london-tours');
    });

    it('returns "default" for Heroku URLs', () => {
      const req = createRequest('/', {
        headers: { host: 'my-app.herokuapp.com' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('default');
    });

    it('extracts subdomain from base domain', () => {
      const req = createRequest('/', {
        headers: { host: 'london-tours.experience-marketplace.com' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('london-tours');
    });

    it('extracts subdomain from holibob base domain', () => {
      const req = createRequest('/', {
        headers: { host: 'rome-food.marketplace.holibob.com' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('rome-food');
    });

    it('uses full hostname for custom domains', () => {
      const req = createRequest('/', {
        headers: { host: 'london-tours.com' },
      });
      const res = middleware(req);
      expect(res.headers.get('x-site-id')).toBe('london-tours.com');
    });
  });

  // --- Site ID cookie ---

  describe('site ID cookie', () => {
    it('sets x-site-id cookie', () => {
      const req = createRequest('/', {
        headers: { host: 'london-tours.com' },
      });
      const res = middleware(req);
      const cookie = res.cookies.get('x-site-id');
      expect(cookie?.value).toBe('london-tours.com');
    });

    it('sets cookie with httpOnly and lax sameSite', () => {
      const req = createRequest('/', {
        headers: { host: 'london-tours.com' },
      });
      const res = middleware(req);
      const cookie = res.cookies.get('x-site-id');
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('lax');
    });
  });

  // --- UTM parameter tracking ---

  describe('UTM parameter tracking', () => {
    it('sets utm_params cookie when utm_source is present', () => {
      const req = createRequest('/?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      const cookie = res.cookies.get('utm_params');
      expect(cookie).toBeDefined();
      const parsed = JSON.parse(cookie!.value);
      expect(parsed.source).toBe('google');
      expect(parsed.medium).toBe('cpc');
      expect(parsed.campaign).toBe('spring_sale');
    });

    it('sets utm_params cookie when gclid is present without utm_source', () => {
      const req = createRequest('/?gclid=abc123', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      const cookie = res.cookies.get('utm_params');
      expect(cookie).toBeDefined();
      const parsed = JSON.parse(cookie!.value);
      expect(parsed.source).toBe('google');
      expect(parsed.medium).toBe('cpc');
      expect(parsed.gclid).toBe('abc123');
    });

    it('sets utm_params cookie when fbclid is present without utm_source', () => {
      const req = createRequest('/?fbclid=fb456', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      const cookie = res.cookies.get('utm_params');
      expect(cookie).toBeDefined();
      const parsed = JSON.parse(cookie!.value);
      expect(parsed.source).toBe('facebook');
      expect(parsed.medium).toBe('cpc');
      expect(parsed.fbclid).toBe('fb456');
    });

    it('captures utm_term and utm_content', () => {
      const req = createRequest('/?utm_source=google&utm_term=travel&utm_content=banner_ad', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      const parsed = JSON.parse(res.cookies.get('utm_params')!.value);
      expect(parsed.term).toBe('travel');
      expect(parsed.content).toBe('banner_ad');
    });

    it('captures the landing page path', () => {
      const req = createRequest('/experiences/rome-tour?utm_source=google', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      const parsed = JSON.parse(res.cookies.get('utm_params')!.value);
      expect(parsed.landingPage).toBe('/experiences/rome-tour');
    });

    it('does not set utm_params cookie when no UTM params or click IDs present', () => {
      const req = createRequest('/', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      const cookie = res.cookies.get('utm_params');
      expect(cookie).toBeUndefined();
    });

    it('sets utm_params cookie as non-httpOnly (readable by checkout)', () => {
      const req = createRequest('/?utm_source=google', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      const cookie = res.cookies.get('utm_params');
      expect(cookie?.httpOnly).toBe(false);
    });
  });

  // --- AI referral detection ---

  describe('AI referral detection', () => {
    it('detects ChatGPT referral from chat.openai.com', () => {
      const req = createRequest('/', {
        headers: {
          host: 'test.example.com',
          referer: 'https://chat.openai.com/some-chat',
        },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')?.value).toBe('chatgpt');
      expect(res.headers.get('x-ai-referral')).toBe('chatgpt');
    });

    it('detects ChatGPT referral from chatgpt.com', () => {
      const req = createRequest('/', {
        headers: {
          host: 'test.example.com',
          referer: 'https://chatgpt.com/c/123',
        },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')?.value).toBe('chatgpt');
    });

    it('detects Perplexity referral', () => {
      const req = createRequest('/', {
        headers: {
          host: 'test.example.com',
          referer: 'https://perplexity.ai/search/best-tours',
        },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')?.value).toBe('perplexity');
    });

    it('detects Claude referral', () => {
      const req = createRequest('/', {
        headers: {
          host: 'test.example.com',
          referer: 'https://claude.ai/chat/abc',
        },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')?.value).toBe('claude');
    });

    it('detects Gemini referral', () => {
      const req = createRequest('/', {
        headers: {
          host: 'test.example.com',
          referer: 'https://gemini.google.com/app',
        },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')?.value).toBe('gemini');
    });

    it('detects Copilot referral', () => {
      const req = createRequest('/', {
        headers: {
          host: 'test.example.com',
          referer: 'https://copilot.microsoft.com/sl/abc',
        },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')?.value).toBe('copilot');
    });

    it('sets ai_referral_source cookie as non-httpOnly (for GA4)', () => {
      const req = createRequest('/', {
        headers: {
          host: 'test.example.com',
          referer: 'https://claude.ai/chat/abc',
        },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')?.httpOnly).toBe(false);
    });

    it('does not set ai_referral_source when referer is non-AI domain', () => {
      const req = createRequest('/', {
        headers: {
          host: 'test.example.com',
          referer: 'https://www.google.com/search?q=tours',
        },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')).toBeUndefined();
      expect(res.headers.get('x-ai-referral')).toBeNull();
    });

    it('handles invalid referer URLs gracefully', () => {
      const req = createRequest('/', {
        headers: {
          host: 'test.example.com',
          referer: 'not-a-valid-url',
        },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')).toBeUndefined();
    });

    it('does not set ai_referral_source when no referer header', () => {
      const req = createRequest('/', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      expect(res.cookies.get('ai_referral_source')).toBeUndefined();
    });
  });

  // --- Funnel session tracking ---

  describe('funnel session tracking', () => {
    it('creates a new funnel session when none exists', () => {
      const req = createRequest('/', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      const cookie = res.cookies.get('funnel_session');
      expect(cookie).toBeDefined();
      expect(cookie!.value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('reuses existing funnel session cookie value', () => {
      const existingSessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const req = createRequest('/', {
        headers: { host: 'test.example.com' },
        cookies: { funnel_session: existingSessionId },
      });
      const res = middleware(req);
      expect(res.cookies.get('funnel_session')?.value).toBe(existingSessionId);
    });

    it('sets funnel session cookie as httpOnly', () => {
      const req = createRequest('/', {
        headers: { host: 'test.example.com' },
      });
      const res = middleware(req);
      expect(res.cookies.get('funnel_session')?.httpOnly).toBe(true);
    });
  });

  // --- Config matcher ---

  describe('config', () => {
    it('exports a matcher config', () => {
      expect(config.matcher).toBeDefined();
      expect(Array.isArray(config.matcher)).toBe(true);
    });

    it('matches general paths but excludes static files and health API', () => {
      const pattern = config.matcher[0];
      expect(pattern).toContain('_next/static');
      expect(pattern).toContain('_next/image');
      expect(pattern).toContain('favicon.ico');
      expect(pattern).toContain('api/health');
    });
  });
});
