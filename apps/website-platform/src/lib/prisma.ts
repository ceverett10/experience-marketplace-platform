/**
 * Prisma Client Singleton
 * Re-export from database package with explicit typing
 */

import { PrismaClient } from '@prisma/client';

// Import the singleton from database package but re-export with explicit type
import { prisma as dbPrisma } from '@experience-marketplace/database';

// Re-export with explicit PrismaClient type to ensure TypeScript recognizes all models
// Use double assertion to convert from PrismaClientLike to PrismaClient
export const prisma: PrismaClient = dbPrisma as unknown as PrismaClient;
