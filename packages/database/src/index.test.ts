import { describe, it, expect, vi } from 'vitest';

// Mock Prisma Client before importing
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
  Prisma: {},
  SiteStatus: {},
  DomainStatus: {},
  PageType: {},
  PageStatus: {},
  ContentFormat: {},
  SearchIntent: {},
  OpportunityStatus: {},
  ABTestType: {},
  ABTestStatus: {},
  BookingStatus: {},
  JobType: {},
  JobStatus: {},
}));

describe('Database Package Exports', () => {
  it('should export prisma client instance', async () => {
    const { prisma } = await import('./index.js');
    expect(prisma).toBeDefined();
  });

  it('should export PrismaClient constructor', async () => {
    const { PrismaClient } = await import('./index.js');
    expect(PrismaClient).toBeDefined();
    expect(typeof PrismaClient).toBe('function');
  });

  it('should export Prisma namespace', async () => {
    const { Prisma } = await import('./index.js');
    expect(Prisma).toBeDefined();
  });

  it('should export all enum values', async () => {
    const {
      SiteStatus,
      DomainStatus,
      PageType,
      PageStatus,
      ContentFormat,
      SearchIntent,
      OpportunityStatus,
      ABTestType,
      ABTestStatus,
      BookingStatus,
      JobType,
      JobStatus,
    } = await import('./index.js');

    // Check that all enums are exported
    expect(SiteStatus).toBeDefined();
    expect(DomainStatus).toBeDefined();
    expect(PageType).toBeDefined();
    expect(PageStatus).toBeDefined();
    expect(ContentFormat).toBeDefined();
    expect(SearchIntent).toBeDefined();
    expect(OpportunityStatus).toBeDefined();
    expect(ABTestType).toBeDefined();
    expect(ABTestStatus).toBeDefined();
    expect(BookingStatus).toBeDefined();
    expect(JobType).toBeDefined();
    expect(JobStatus).toBeDefined();
  });

  it('should re-export db as named export', async () => {
    const { db } = await import('./index.js');
    expect(db).toBeDefined();
  });
});
