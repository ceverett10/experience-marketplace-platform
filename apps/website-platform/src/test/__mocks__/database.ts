// Mock for @experience-marketplace/database
const createModel = () => ({
  findFirst: async () => null,
  findMany: async () => [],
  findUnique: async () => null,
  create: async () => ({}),
  update: async () => ({}),
  upsert: async () => ({}),
  delete: async () => ({}),
  deleteMany: async () => ({ count: 0 }),
  count: async () => 0,
  aggregate: async () => ({}),
  groupBy: async () => [],
});

export const prisma: Record<string, any> = new Proxy(
  {
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    $transaction: async (fn: any) => (typeof fn === 'function' ? fn(prisma) : fn),
  },
  {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      // Auto-create model proxies for any accessed model name
      const model = createModel();
      (target as any)[prop] = model;
      return model;
    },
  }
);
