'use client';

import Image from 'next/image';
import { useSite, useBrand } from '@/lib/site-context';
import { ProductDiscoverySearch } from '@/components/search/ProductDiscoverySearch';
import { UnsplashAttribution } from '@/components/common/UnsplashAttribution';
import { BLUR_PLACEHOLDER, optimizeUnsplashUrl, shouldSkipOptimization } from '@/lib/image-utils';

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
    <section className="relative">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        {backgroundImage ? (
          <Image
            src={
              shouldSkipOptimization(backgroundImage)
                ? backgroundImage
                : optimizeUnsplashUrl(backgroundImage, 1280, 40)
            }
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-ken-burns object-cover"
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            unoptimized={shouldSkipOptimization(backgroundImage)}
          />
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
            className="bottom-24 left-auto right-2"
          />
        )}
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 md:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <h1
            className="hero-animate-title font-display text-2xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
          >
            {heroTitle}
          </h1>
          <p
            className="hero-animate-subtitle mx-auto mt-6 max-w-xl text-base leading-7 text-white/90 sm:text-lg sm:leading-8"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            {heroSubtitle}
          </p>

          {/* Product Discovery Search */}
          <div className="hero-animate-search mt-10">
            <div className="search-glow rounded-2xl md:rounded-full">
              <ProductDiscoverySearch variant="hero" />
            </div>
          </div>
        </div>
      </div>

      {/* Decorative wave transition */}
      <div className="absolute -bottom-1 left-0 right-0">
        <svg
          viewBox="0 0 1440 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="block w-full"
          preserveAspectRatio="none"
        >
          <path d="M0 40C240 70 480 80 720 60C960 40 1200 10 1440 30V80H0V40Z" fill="white" />
        </svg>
      </div>
    </section>
  );
}
