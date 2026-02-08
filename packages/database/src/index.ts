// Re-export Prisma Client
export { prisma, default as db } from './client.js';
// Also export PrismaClient type for explicit typing
export { PrismaClient } from '@prisma/client';

// Re-export all Prisma types
export type {
  Site,
  Brand,
  Domain,
  Page,
  Content,
  SEOOpportunity,
  PerformanceMetric,
  ABTest,
  ABTestVariant,
  Booking,
  Job,
} from '@prisma/client';

// Re-export enums as both types and values
export {
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
  MicrositeStatus,
  MicrositeEntityType,
  MicrositeLayoutType,
} from '@prisma/client';

// Re-export Prisma namespace for advanced typing
export { Prisma } from '@prisma/client';
