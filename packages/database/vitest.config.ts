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
        // Raised to match actual coverage (97%+). Prevents regression.
        statements: 90,
        branches: 60,
        functions: 100,
        lines: 90,
      },
    },
    testTimeout: 10000,
  },
});
