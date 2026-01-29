import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'prisma/**'],
      thresholds: {
        // Lower thresholds for database package as it's Prisma infrastructure
        // that requires mocking - actual code paths are tested via integration
        statements: 35,
        branches: 30,
        functions: 45,
        lines: 35,
      },
    },
    testTimeout: 10000,
  },
});
