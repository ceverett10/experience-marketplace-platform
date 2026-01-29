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
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        statements: 50,
        branches: 30,
        functions: 50,
        lines: 50,
      },
    },
    testTimeout: 15000,
    // Mock environment variables
    env: {
      REDIS_URL: 'redis://test:6379',
      PORT: '3002',
    },
  },
});
