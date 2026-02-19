import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/test/**',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/error.tsx',
      ],
      thresholds: {
        statements: 65,
        branches: 75,
        functions: 65,
        lines: 65,
      },
    },
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@experience-marketplace/holibob-api': path.resolve(
        __dirname,
        './src/test/__mocks__/holibob-api.ts'
      ),
      '@experience-marketplace/database': path.resolve(
        __dirname,
        './src/test/__mocks__/database.ts'
      ),
      '@experience-marketplace/tickitto-api': path.resolve(
        __dirname,
        './src/test/__mocks__/tickitto-api.ts'
      ),
    },
  },
});
