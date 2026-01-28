/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@experience-marketplace/database',
    '@experience-marketplace/shared',
    '@experience-marketplace/ui-components',
    '@experience-marketplace/holibob-api',
  ],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
};

module.exports = nextConfig;
