// Re-export Prisma Client
export { prisma, default as db } from './client.js';

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
} from '@prisma/client';

// Re-export Prisma namespace for advanced typing
export { Prisma } from '@prisma/client';
