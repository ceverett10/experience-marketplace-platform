import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/scripts/**', // CLI scripts — tested manually, not unit-testable
        'src/schedulers/**', // Cron entry points — require full infrastructure
      ],
      thresholds: {
        // Floor thresholds — prevent coverage regression. Raise as tests are added.
        statements: 8,
        branches: 60,
        functions: 27,
        lines: 8,
      },
    },
    testTimeout: 15000,
  },
});
