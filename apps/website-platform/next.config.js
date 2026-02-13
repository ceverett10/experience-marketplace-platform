/** @type {import('next').NextConfig} */
const nextConfig = {
  // URL normalization - enforce no trailing slashes for consistent canonicals
  trailingSlash: false,

  // ESLint - allow build to pass with warnings
  eslint: {
    ignoreDuringBuilds: true,
  },

  transpilePackages: [
    '@experience-marketplace/database',
    '@experience-marketplace/shared',
    '@experience-marketplace/ui-components',
    '@experience-marketplace/holibob-api',
    '@experience-marketplace/tickitto-api',
  ],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },

  // Image Optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.holibob.tech',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: '**.r2.dev',
      },
      {
        protocol: 'https',
        hostname: '**.tickitto.tech',
      },
      {
        protocol: 'https',
        hostname: '**.tickitto.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 31536000, // 1 year cache for better performance
  },

  // Performance optimizations
  compress: true,
  poweredByHeader: false,

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-src 'self' https://*.tickitto.tech https://*.tickitto.com",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
