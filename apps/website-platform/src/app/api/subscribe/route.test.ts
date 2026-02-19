import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock next/headers
const mockHeadersGet = vi.fn();
vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: mockHeadersGet,
    })
  ),
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockResolvedValue({
    id: 'test-site',
    name: 'Test Site',
    holibobPartnerId: 'partner-123',
    brand: { primaryColor: '#6366f1' },
    micrositeContext: null,
  }),
}));

const { mockFindUnique, mockCreate, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscriber: {
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

// Import after mocks
import { POST } from './route';

describe('Subscribe Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeadersGet.mockImplementation((key: string) => {
      switch (key) {
        case 'host':
          return 'localhost:3000';
        case 'x-forwarded-host':
          return null;
        case 'x-forwarded-for':
          return '192.168.1.1';
        case 'user-agent':
          return 'Mozilla/5.0 Test';
        default:
          return null;
      }
    });
  });

  it('returns 400 for invalid email', async () => {
    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'not-an-email',
        marketingConsent: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('email');
  });

  it('returns 400 when email is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ marketingConsent: true }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 when marketingConsent is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('creates new subscriber successfully', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sub-1' });

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'John@Example.COM',
        marketingConsent: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.message).toContain('prize draw');

    // Verify email is normalized (lowercased)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: 'john@example.com' },
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'john@example.com',
          marketingConsent: true,
          prizeDrawConsent: true,
          prizeDrawStatus: 'ENTERED',
          marketingStatus: 'PENDING',
        }),
      })
    );
  });

  it('creates subscriber without marketing consent', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sub-2' });

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'nomarketing@example.com',
        marketingConsent: false,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketingConsent: false,
          marketingStatus: 'UNSUBSCRIBED',
        }),
      })
    );
  });

  it('returns already-subscribed for existing subscriber', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'sub-existing',
      email: 'existing@example.com',
      marketingConsent: true,
    });

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'existing@example.com',
        marketingConsent: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.alreadySubscribed).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('updates marketing consent for existing subscriber who upgrades', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'sub-existing',
      email: 'upgrade@example.com',
      marketingConsent: false,
    });
    mockUpdate.mockResolvedValue({ id: 'sub-existing', marketingConsent: true });

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'upgrade@example.com',
        marketingConsent: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alreadySubscribed).toBe(true);
    expect(data.marketingUpdated).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'upgrade@example.com' },
        data: expect.objectContaining({
          marketingConsent: true,
          marketingStatus: 'PENDING',
        }),
      })
    );
  });

  it('handles P2002 unique constraint race condition', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockRejectedValue({ code: 'P2002' });

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'race@example.com',
        marketingConsent: false,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.alreadySubscribed).toBe(true);
  });

  it('stores hashed IP (not raw) and truncated user agent', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sub-ip' });

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'gdpr@example.com',
        marketingConsent: true,
      }),
    });

    await POST(request);

    const createData = mockCreate.mock.calls[0]![0].data;
    // IP should be hashed (16 char hex), not raw
    expect(createData.ipAddress).toHaveLength(16);
    expect(createData.ipAddress).not.toBe('192.168.1.1');
    // User agent should be present
    expect(createData.userAgent).toBe('Mozilla/5.0 Test');
  });

  it('includes prizeDrawId when provided', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sub-prize' });

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'prize@example.com',
        marketingConsent: false,
        prizeDrawId: 'draw-2025-summer',
      }),
    });

    await POST(request);

    const createData = mockCreate.mock.calls[0]![0].data;
    expect(createData.prizeDrawId).toBe('draw-2025-summer');
  });

  it('defaults consentSource to popup', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sub-source' });

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'source@example.com',
        marketingConsent: true,
      }),
    });

    await POST(request);

    const createData = mockCreate.mock.calls[0]![0].data;
    expect(createData.consentSource).toBe('popup');
  });

  it('accepts explicit consentSource', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sub-footer' });

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'footer@example.com',
        marketingConsent: true,
        consentSource: 'footer',
      }),
    });

    await POST(request);

    const createData = mockCreate.mock.calls[0]![0].data;
    expect(createData.consentSource).toBe('footer');
  });

  it('returns 500 on unexpected error', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest('http://localhost:3000/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        email: 'error@example.com',
        marketingConsent: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to process subscription');
  });
});
