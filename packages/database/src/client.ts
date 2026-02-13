import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = (): PrismaClient => {
  // Ensure connection pool fits within Heroku Postgres essential-1 limit (20 connections).
  // With web + worker dynos + BullMQ, each Prisma pool should use at most 4 connections.
  let datasourceUrl = process.env['DATABASE_URL'];
  if (datasourceUrl && !datasourceUrl.includes('connection_limit')) {
    datasourceUrl += (datasourceUrl.includes('?') ? '&' : '?') + 'connection_limit=4';
  }

  return new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });
};

export const prisma: PrismaClient = (globalThis.prisma ?? prismaClientSingleton()) as PrismaClient;

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.prisma = prisma;
}

export default prisma;
