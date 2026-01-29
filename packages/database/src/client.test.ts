import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma Client
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    site: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    page: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    booking: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  })),
}));

describe('Database Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset globalThis.prisma for each test
    (globalThis as any).prisma = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('prisma singleton', () => {
    it('should export prisma client', async () => {
      const { prisma } = await import('./client.js');
      expect(prisma).toBeDefined();
    });

    it('should export prisma as default', async () => {
      const module = await import('./client.js');
      expect(module.default).toBeDefined();
      expect(module.default).toBe(module.prisma);
    });
  });

  describe('PrismaClient configuration', () => {
    it('should be configured with logging options', async () => {
      // Reset modules to force fresh import and PrismaClient instantiation
      vi.resetModules();

      // Re-setup the mock after module reset
      vi.doMock('@prisma/client', () => ({
        PrismaClient: vi.fn().mockImplementation(() => ({
          $connect: vi.fn().mockResolvedValue(undefined),
          $disconnect: vi.fn().mockResolvedValue(undefined),
          site: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          },
          page: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          },
          booking: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
        })),
      }));

      const { PrismaClient } = await import('@prisma/client');
      // Clear globalThis to force new instance
      (globalThis as any).prisma = undefined;
      const { prisma } = await import('./client.js');

      expect(PrismaClient).toHaveBeenCalled();
      expect(prisma).toBeDefined();
    });
  });

  describe('client methods', () => {
    it('should have site model methods', async () => {
      const { prisma } = await import('./client.js');

      expect(prisma.site).toBeDefined();
      expect(typeof prisma.site.findUnique).toBe('function');
      expect(typeof prisma.site.findMany).toBe('function');
      expect(typeof prisma.site.create).toBe('function');
      expect(typeof prisma.site.update).toBe('function');
      expect(typeof prisma.site.delete).toBe('function');
    });

    it('should have page model methods', async () => {
      const { prisma } = await import('./client.js');

      expect(prisma.page).toBeDefined();
      expect(typeof prisma.page.findUnique).toBe('function');
      expect(typeof prisma.page.findMany).toBe('function');
      expect(typeof prisma.page.create).toBe('function');
    });

    it('should have booking model methods', async () => {
      const { prisma } = await import('./client.js');

      expect(prisma.booking).toBeDefined();
      expect(typeof prisma.booking.findUnique).toBe('function');
      expect(typeof prisma.booking.create).toBe('function');
    });
  });
});

describe('Database Operations', () => {
  describe('Site operations', () => {
    it('should find site by ID', async () => {
      const { prisma } = await import('./client.js');
      const mockSite = {
        id: 'site-123',
        name: 'Test Site',
        slug: 'test-site',
        status: 'ACTIVE',
      };

      (prisma.site.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockSite);

      const result = await prisma.site.findUnique({
        where: { id: 'site-123' },
      });

      expect(result).toEqual(mockSite);
      expect(prisma.site.findUnique).toHaveBeenCalledWith({
        where: { id: 'site-123' },
      });
    });

    it('should create a new site', async () => {
      const { prisma } = await import('./client.js');
      const newSite = {
        name: 'New Site',
        slug: 'new-site',
        brandId: 'brand-123',
      };
      const createdSite = { id: 'site-456', ...newSite, status: 'DRAFT' };

      (prisma.site.create as ReturnType<typeof vi.fn>).mockResolvedValue(createdSite);

      const result = await prisma.site.create({
        data: newSite,
      });

      expect(result.id).toBe('site-456');
      expect(result.name).toBe('New Site');
    });

    it('should update site status', async () => {
      const { prisma } = await import('./client.js');
      const updatedSite = {
        id: 'site-123',
        status: 'ACTIVE',
      };

      (prisma.site.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedSite);

      const result = await prisma.site.update({
        where: { id: 'site-123' },
        data: { status: 'ACTIVE' },
      });

      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('Page operations', () => {
    it('should find pages by site ID', async () => {
      const { prisma } = await import('./client.js');
      const mockPages = [
        { id: 'page-1', slug: 'home', siteId: 'site-123' },
        { id: 'page-2', slug: 'about', siteId: 'site-123' },
      ];

      (prisma.page.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockPages);

      const result = await prisma.page.findMany({
        where: { siteId: 'site-123' },
      });

      expect(result).toHaveLength(2);
      expect(result[0]?.slug).toBe('home');
    });

    it('should create a page with content', async () => {
      const { prisma } = await import('./client.js');
      const newPage = {
        slug: 'london-tours',
        siteId: 'site-123',
        title: 'London Tours',
        metaDescription: 'Best tours in London',
      };

      const mockResult = {
        id: 'page-new',
        slug: 'london-tours',
        siteId: 'site-123',
        title: 'London Tours',
        status: 'DRAFT',
      };

      (prisma.page.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const result = await prisma.page.create({ data: newPage });

      expect(result.slug).toBe('london-tours');
      expect(result.id).toBe('page-new');
    });
  });

  describe('Booking operations', () => {
    it('should create a booking', async () => {
      const { prisma } = await import('./client.js');
      const bookingData = {
        holibobBookingId: 'hb-booking-123',
        siteId: 'site-123',
        customerEmail: 'customer@example.com',
        totalAmount: 150.0,
        currency: 'GBP',
      };

      (prisma.booking.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'booking-456',
        ...bookingData,
        status: 'PENDING',
        createdAt: new Date(),
      });

      const result = await prisma.booking.create({ data: bookingData });

      expect(result.holibobBookingId).toBe('hb-booking-123');
      expect(result.totalAmount).toBe(150.0);
    });

    it('should find bookings by site', async () => {
      const { prisma } = await import('./client.js');
      const mockBookings = [
        { id: 'b1', status: 'CONFIRMED', totalAmount: 100 },
        { id: 'b2', status: 'PENDING', totalAmount: 200 },
      ];

      (prisma.booking.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockBookings);

      const result = await prisma.booking.findMany({
        where: { siteId: 'site-123' },
      });

      expect(result).toHaveLength(2);
    });
  });
});

describe('Environment-based configuration', () => {
  it('should configure logging based on NODE_ENV', async () => {
    // The client is configured with different logging levels
    // based on NODE_ENV (development vs production)
    const originalEnv = process.env['NODE_ENV'];

    // Test that the module exports correctly regardless of env
    const { prisma } = await import('./client.js');
    expect(prisma).toBeDefined();

    process.env['NODE_ENV'] = originalEnv;
  });

  it('should use different log levels in development mode', async () => {
    vi.resetModules();
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    vi.doMock('@prisma/client', () => ({
      PrismaClient: vi.fn().mockImplementation((config) => {
        // Verify development logging is requested
        expect(config?.log).toEqual(['query', 'error', 'warn']);
        return {
          $connect: vi.fn().mockResolvedValue(undefined),
          $disconnect: vi.fn().mockResolvedValue(undefined),
          site: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          },
          page: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          },
          booking: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
        };
      }),
    }));

    (globalThis as any).prisma = undefined;
    await import('./client.js');

    process.env['NODE_ENV'] = originalEnv;
  });

  it('should use minimal logging in production mode', async () => {
    vi.resetModules();
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    vi.doMock('@prisma/client', () => ({
      PrismaClient: vi.fn().mockImplementation((config) => {
        // Verify production logging is error only
        expect(config?.log).toEqual(['error']);
        return {
          $connect: vi.fn().mockResolvedValue(undefined),
          $disconnect: vi.fn().mockResolvedValue(undefined),
          site: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          },
          page: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          },
          booking: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
        };
      }),
    }));

    (globalThis as any).prisma = undefined;
    await import('./client.js');

    process.env['NODE_ENV'] = originalEnv;
  });

  it('should reuse existing globalThis.prisma in non-production', async () => {
    vi.resetModules();
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    const mockPrisma = {
      $connect: vi.fn(),
      site: { findUnique: vi.fn() },
    };

    (globalThis as any).prisma = mockPrisma;

    vi.doMock('@prisma/client', () => ({
      PrismaClient: vi.fn(),
    }));

    const { prisma } = await import('./client.js');
    expect(prisma).toBe(mockPrisma);

    process.env['NODE_ENV'] = originalEnv;
    (globalThis as any).prisma = undefined;
  });

  it('should not cache in production mode', async () => {
    vi.resetModules();
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    (globalThis as any).prisma = undefined;

    vi.doMock('@prisma/client', () => ({
      PrismaClient: vi.fn().mockImplementation(() => ({
        $connect: vi.fn().mockResolvedValue(undefined),
        site: { findUnique: vi.fn() },
      })),
    }));

    await import('./client.js');

    // In production, globalThis.prisma should not be set
    // The code sets it only when NODE_ENV !== 'production'
    expect((globalThis as any).prisma).toBeUndefined();

    process.env['NODE_ENV'] = originalEnv;
  });
});
