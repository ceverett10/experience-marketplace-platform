/** @type {import('next').NextConfig} */
const nextConfig = {
  // Set basePath for production when served through proxy at /admin
  // In development, runs standalone on port 3001 without basePath
  basePath: process.env.NODE_ENV === 'production' ? '/admin' : '',

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
