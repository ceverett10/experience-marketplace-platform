import { defineConfig } from 'tsup';
import { resolve } from 'path';

export default defineConfig({
  entry: { 'bin/serve': 'src/bin/serve.ts' },
  format: ['esm'],
  target: 'node20',
  outDir: 'publish-dist',
  clean: true,
  sourcemap: true,
  // Enable CJS require() shim for ESM output
  shims: true,
  // Keep dynamic imports as separate chunks so auth modules
  // (which need @prisma/client) are only loaded in HTTP mode
  splitting: true,
  // Bundle workspace packages and their deps
  noExternal: [
    '@experience-marketplace/holibob-api',
    '@experience-marketplace/shared',
    'graphql',
    'graphql-request',
    'cross-fetch',
    '@graphql-typed-document-node/core',
  ],
  // Keep ESM-native packages external
  external: [
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/ext-apps',
    'zod',
    // Only used in HTTP auth path — never reached in STDIO mode
    '@prisma/client',
    '@experience-marketplace/jobs',
  ],
  esbuildOptions(options) {
    options.platform = 'node';
    // Resolve holibob-api from TypeScript source (not compiled CJS dist)
    // to avoid CJS require() interop issues in ESM output
    options.alias = {
      '@experience-marketplace/holibob-api': resolve(__dirname, '../holibob-api/src/index.ts'),
      '@experience-marketplace/holibob-api/types': resolve(
        __dirname,
        '../holibob-api/src/types/index.ts'
      ),
      'cross-fetch': resolve(__dirname, 'src/shims/cross-fetch.ts'),
    };
  },
  // Don't add shebang via banner — the source file already has #!/usr/bin/env node
});
