import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma, resetMockPrisma } from '@/test/mocks/prisma';

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { PATCH } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/contact-messages/cm_1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const params = Promise.resolve({ id: 'cm_1' });

describe('PATCH /api/contact-messages/[id]', () => {
  beforeEach(() => {
    resetMockPrisma();
  });

  it('updates status when valid', async () => {
    mockPrisma.contactMessage.findUnique.mockResolvedValue({ id: 'cm_1' });
    mockPrisma.contactMessage.update.mockResolvedValue({ id: 'cm_1', status: 'REPLIED' });

    const response = await PATCH(makeRequest({ status: 'REPLIED' }), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message.status).toBe('REPLIED');
    expect(mockPrisma.contactMessage.update).toHaveBeenCalledWith({
      where: { id: 'cm_1' },
      data: { status: 'REPLIED' },
    });
  });

  it('returns 400 when status is missing', async () => {
    const response = await PATCH(makeRequest({}), { params });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid status');
  });

  it('returns 400 when status is not a valid enum value', async () => {
    const response = await PATCH(makeRequest({ status: 'BOGUS' }), { params });
    expect(response.status).toBe(400);
  });

  it('returns 404 when message does not exist', async () => {
    mockPrisma.contactMessage.findUnique.mockResolvedValue(null);
    const response = await PATCH(makeRequest({ status: 'READ' }), { params });
    expect(response.status).toBe(404);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.contactMessage.findUnique.mockRejectedValue(new Error('db down'));
    const response = await PATCH(makeRequest({ status: 'READ' }), { params });
    expect(response.status).toBe(500);
  });
});
