import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the modules
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({
    get: vi.fn().mockReturnValue('localhost:3000'),
  })),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockResolvedValue({
    id: 'test-site',
    name: 'Test Site',
    holibobPartnerId: 'partner-123',
    brand: { primaryColor: '#6366f1' },
  }),
}));

// Use vi.hoisted to define mocks that can be used in vi.mock factory
const {
  mockGetAvailability,
  mockSetAvailabilityOptions,
  mockGetAvailabilityPricing,
  mockSetAvailabilityPricing,
} = vi.hoisted(() => ({
  mockGetAvailability: vi.fn(),
  mockSetAvailabilityOptions: vi.fn(),
  mockGetAvailabilityPricing: vi.fn(),
  mockSetAvailabilityPricing: vi.fn(),
}));

vi.mock('@/lib/holibob', () => ({
  getHolibobClient: vi.fn().mockReturnValue({
    getAvailability: mockGetAvailability,
    setAvailabilityOptions: mockSetAvailabilityOptions,
    getAvailabilityPricing: mockGetAvailabilityPricing,
    setAvailabilityPricing: mockSetAvailabilityPricing,
  }),
}));

// Import after mocks
import { GET, POST } from './route';

describe('Availability Detail API Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns availability details', async () => {
    const mockAvailability = {
      id: 'avail-123',
      date: '2025-02-01',
      startTime: '10:00',
      optionList: {
        isComplete: true,
        nodes: [
          { id: 'opt-1', label: 'Time slot', value: '10:00' },
        ],
      },
    };
    mockGetAvailability.mockResolvedValue(mockAvailability);

    const request = new NextRequest('http://localhost:3000/api/availability/avail-123');

    const response = await GET(request, { params: Promise.resolve({ id: 'avail-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('avail-123');
    expect(data.data.optionList.isComplete).toBe(true);
  });

  it('returns 404 when availability not found (via error)', async () => {
    mockGetAvailability.mockRejectedValue(new Error('Availability not found'));

    const request = new NextRequest('http://localhost:3000/api/availability/nonexistent');

    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Availability not found');
  });

  it('returns pricing when includePricing=true query param is set', async () => {
    const mockAvailability = {
      id: 'avail-123',
      date: '2025-02-01',
      pricingCategoryList: {
        nodes: [
          {
            id: 'adult',
            label: 'Adult',
            minParticipants: 1,
            maxParticipants: 10,
            unitPrice: { gross: 3500, currency: 'GBP' },
          },
        ],
      },
    };
    mockGetAvailabilityPricing.mockResolvedValue(mockAvailability);

    const request = new NextRequest('http://localhost:3000/api/availability/avail-123?includePricing=true');

    const response = await GET(request, { params: Promise.resolve({ id: 'avail-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.pricingCategoryList.nodes).toHaveLength(1);
    expect(mockGetAvailabilityPricing).toHaveBeenCalled();
  });
});

describe('Availability Detail API Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates availability options', async () => {
    const mockUpdatedAvailability = {
      id: 'avail-123',
      date: '2025-02-01',
      startTime: '14:00',
      optionList: {
        isComplete: true,
        nodes: [
          { id: 'opt-1', label: 'Time slot', value: '14:00' },
        ],
      },
    };
    mockSetAvailabilityOptions.mockResolvedValue(mockUpdatedAvailability);

    const request = new NextRequest('http://localhost:3000/api/availability/avail-123', {
      method: 'POST',
      body: JSON.stringify({
        optionList: [
          { id: 'opt-1', value: '14:00' },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'avail-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.startTime).toBe('14:00');
  });

  it('updates pricing categories', async () => {
    const mockUpdatedAvailability = {
      id: 'avail-123',
      date: '2025-02-01',
      totalPrice: { gross: 7000, currency: 'GBP' },
      pricingCategoryList: {
        nodes: [
          { id: 'adult', label: 'Adult', units: 2 },
        ],
      },
    };
    mockSetAvailabilityPricing.mockResolvedValue(mockUpdatedAvailability);

    const request = new NextRequest('http://localhost:3000/api/availability/avail-123', {
      method: 'POST',
      body: JSON.stringify({
        pricingCategoryList: [
          { id: 'adult', units: 2 },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'avail-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.totalPrice.gross).toBe(7000);
  });

  it('returns 400 when no updates provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/availability/avail-123', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'avail-123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Either optionList or pricingCategoryList must be provided');
  });
});
