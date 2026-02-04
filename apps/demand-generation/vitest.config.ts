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
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/index.ts', // BullMQ worker entry point - requires Redis/worker mocking
      ],
      thresholds: {
        statements: 20,
        branches: 15,
        functions: 40,
        lines: 20,
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
