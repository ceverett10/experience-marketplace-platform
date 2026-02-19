import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindUnique, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscriber: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

// Import after mocks
import { GET } from './route';

describe('Unsubscribe Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects with error=invalid when token is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/unsubscribe');

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('/unsubscribed');
    expect(location).toContain('error=invalid');
  });

  it('redirects with error=not_found when token does not match', async () => {
    mockFindUnique.mockResolvedValue(null);

    const request = new NextRequest(
      'http://localhost:3000/api/unsubscribe?token=invalid-token-xyz'
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('/unsubscribed');
    expect(location).toContain('error=not_found');
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { unsubscribeToken: 'invalid-token-xyz' },
    });
  });

  it('unsubscribes and redirects to confirmation on valid token', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'sub-123',
      email: 'test@example.com',
      marketingConsent: true,
    });
    mockUpdate.mockResolvedValue({ id: 'sub-123', marketingConsent: false });

    const request = new NextRequest('http://localhost:3000/api/unsubscribe?token=valid-token-abc');

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('/unsubscribed');
    expect(location).not.toContain('error=');

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sub-123' },
      data: expect.objectContaining({
        marketingConsent: false,
        marketingStatus: 'UNSUBSCRIBED',
      }),
    });
  });

  it('sets unsubscribedAt date on unsubscribe', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'sub-456',
      email: 'date@example.com',
    });
    mockUpdate.mockResolvedValue({ id: 'sub-456' });

    const request = new NextRequest('http://localhost:3000/api/unsubscribe?token=token-with-date');

    await GET(request);

    const updateData = mockUpdate.mock.calls[0]![0].data;
    expect(updateData.unsubscribedAt).toBeInstanceOf(Date);
  });

  it('redirects with error=failed on database error', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB connection lost'));

    const request = new NextRequest('http://localhost:3000/api/unsubscribe?token=error-token');

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain('/unsubscribed');
    expect(location).toContain('error=failed');
  });
});
