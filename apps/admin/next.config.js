/** @type {import('next').NextConfig} */
const basePath = process.env.NODE_ENV === 'production' ? '/admin' : '';

const nextConfig = {
  // Set basePath for production when served through proxy at /admin
  // In development, runs standalone on port 3001 without basePath
  basePath,

  // Expose basePath to client components via NEXT_PUBLIC_ prefix.
  // process.env.NODE_ENV is not reliably inlined in client bundles,
  // but NEXT_PUBLIC_ variables are guaranteed to be inlined by Next.js.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },

  transpilePackages: [
    '@experience-marketplace/shared',
    '@experience-marketplace/ui-components',
    '@experience-marketplace/holibob-api',
  ],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
};

module.exports = nextConfig;
