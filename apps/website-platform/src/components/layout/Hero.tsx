'use client';

import { useSite, useBrand } from '@/lib/site-context';
import { ProductDiscoverySearch } from '@/components/search/ProductDiscoverySearch';
import { UnsplashAttribution } from '@/components/common/UnsplashAttribution';

interface HeroProps {
  title?: string;
  subtitle?: string;
  backgroundImage?: string;
  backgroundImageAttribution?: {
    photographerName: string;
    photographerUrl: string;
    unsplashUrl: string;
  };
}

export function Hero({ title, subtitle, backgroundImage, backgroundImageAttribution }: HeroProps) {
  const site = useSite();
  const brand = useBrand();

  const heroTitle = title ?? `Discover Unique Experiences`;
  const heroSubtitle =
    subtitle ??
    brand?.tagline ??
    (site.description !== heroTitle ? site.description : null) ??
    'Find and book unforgettable tours, activities, and attractions worldwide';

  return (
    <section className="relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        {backgroundImage ? (
          <img src={backgroundImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `
                linear-gradient(135deg, ${brand?.primaryColor ?? '#1e3a5f'} 0%, ${brand?.secondaryColor ?? '#2d6a9f'} 40%, #0d9488 70%, #065f46 100%)
              `,
              backgroundSize: '400% 400%',
              animation: 'heroGradient 15s ease infinite',
            }}
          />
        )}
        <div className="absolute inset-0 bg-black/50" />
        {/* Decorative travel-themed pattern overlay */}
        {!backgroundImage && (
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        )}
        {/* Unsplash Attribution - REQUIRED by Unsplash API Guidelines */}
        {backgroundImage && backgroundImageAttribution && (
          <UnsplashAttribution
            photographerName={backgroundImageAttribution.photographerName}
            photographerUrl={backgroundImageAttribution.photographerUrl}
            unsplashUrl={backgroundImageAttribution.unsplashUrl}
            variant="overlay-compact"
            className="bottom-20 left-auto right-2"
          />
        )}
      </div>

      {/* Content */}
      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
        <div className="mx-auto max-w-4xl text-center">
          <h1
            className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
          >
            {heroTitle}
          </h1>
          <p
            className="mx-auto mt-6 max-w-xl text-lg leading-8 text-white/90"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            {heroSubtitle}
          </p>

          {/* Product Discovery Search - standardized across the site */}
          <div className="mt-10">
            <ProductDiscoverySearch variant="hero" />
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
